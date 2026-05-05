import os
import logging
import fitz
from datetime import datetime
from fastapi import HTTPException
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from app.models.case_document import CaseDocument
from app.services.extraction_service import translate_structured_data

logger = logging.getLogger(__name__)

def extract_pdf_text(file_path: str) -> tuple[str, list[dict]]:
    """
    Extract text from PDF using PyMuPDF (fitz).
    Returns (merged_text, pages) where pages is a list of {page, text} dicts.
    """
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        raise HTTPException(422, f"Failed to read PDF: {e}")

    pages: list[dict] = []
    for i, page in enumerate(doc):
        text = page.get_text("text") or ""
        pages.append({"page": i + 1, "text": text})
    doc.close()

    if not any(p["text"].strip() for p in pages):
        logger.warning("extract_pdf_text: all pages appear empty — possible scanned PDF")

    merged = "\n\n".join([f"[Page {p['page']}]\n{p['text']}" for p in pages])
    logger.info(
        "extract_pdf_text: %d pages, %d total chars from %s",
        len(pages), len(merged), file_path,
    )
    return merged, pages

def generate_pdf(case: CaseDocument, language: str = "en") -> str:
    """Generate a professional, court-quality PDF analysis report."""
    reports_dir = "reports"
    os.makedirs(reports_dir, exist_ok=True)
    file_path = f"{reports_dir}/case_{case.id}_report.pdf"

    # Normalize language
    target_language = {
        "en": "English", "english": "English",
        "hi": "Hindi", "hindi": "Hindi",
        "kn": "Kannada", "kannada": "Kannada",
    }.get(language.strip().lower(), "English")

    ex = case.extracted_json or {}
    plan_data = case.action_plan or {}
    
    if target_language != "English":
        combined_payload = {"extraction": ex, "plan": plan_data}
        translated = translate_structured_data(combined_payload, target_language)
        ex = translated.get("extraction", ex)
        plan_data = translated.get("plan", plan_data)

    # Professional Document Setup
    doc = SimpleDocTemplate(
        file_path,
        pagesize=A4,
        rightMargin=72, leftMargin=72,
        topMargin=72, bottomMargin=72
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'CourtTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        alignment=1, # Center
        spaceAfter=20,
        textColor=colors.HexColor("#1e3a8a"), # Deep Blue
        fontName='Helvetica-Bold'
    )
    
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=13,
        leading=16,
        spaceBefore=15,
        spaceAfter=8,
        textColor=colors.HexColor("#0f172a"),
        fontName='Helvetica-Bold',
        borderPadding=(2, 0, 2, 0),
        borderWidth=0,
        borderColor=colors.HexColor("#cbd5e1")
    )

    label_style = ParagraphStyle(
        'Label',
        parent=styles['Normal'],
        fontSize=10,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor("#475569")
    )

    value_style = ParagraphStyle(
        'Value',
        parent=styles['Normal'],
        fontSize=10,
        fontName='Helvetica',
        textColor=colors.HexColor("#1e293b")
    )

    body_style = ParagraphStyle(
        'BodyText',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        alignment=4, # Justify
        spaceAfter=10
    )

    story = []

    # 1. HEADER SECTION
    story.append(Paragraph("LEGAL CASE ANALYSIS REPORT", title_style))
    story.append(Spacer(1, 10))

    header_data = [
        [Paragraph("CASE IDENTIFIER", label_style), Paragraph(f"CASE-{case.id:04d}", value_style)],
        [Paragraph("DATE OF REPORT", label_style), Paragraph(datetime.utcnow().strftime("%d %B %Y"), value_style)],
        [Paragraph("ORDER DATE", label_style), Paragraph(ex.get('date_of_order', 'N/A'), value_style)],
        [Paragraph("DEPARTMENT", label_style), Paragraph(ex.get('department', 'General Administration'), value_style)],
    ]
    
    header_table = Table(header_data, colWidths=[1.5*inch, 4*inch])
    header_table.setStyle(TableStyle([
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor("#f8fafc")),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 20))

    # 2. CASE SUMMARY
    story.append(Paragraph("1. CASE SUMMARY", section_style))
    summary_text = ex.get('case_details', 'No summary provided in the document.')
    story.append(Paragraph(summary_text, body_style))

    # 3. KEY FACTS
    story.append(Paragraph("2. KEY FACTS", section_style))
    facts = []
    if ex.get('borrower'):
        facts.append(f"<b>Primary Party:</b> {ex['borrower']}")
    if ex.get('loan_amount'):
        facts.append(f"<b>Value/Amount:</b> {ex['loan_amount']}")
    if ex.get('co_borrowers'):
        cos = ex['co_borrowers']
        if isinstance(cos, list): cos = ", ".join(cos)
        facts.append(f"<b>Associated Parties:</b> {cos}")
    
    if not facts:
        facts.append("No specific entities or facts identified.")
    
    for fact in facts:
        story.append(Paragraph(f"• {fact}", body_style))

    # 4. LEGAL ANALYSIS
    story.append(Paragraph("3. LEGAL ANALYSIS", section_style))
    analysis_text = ex.get('action_required', "Based on the court order, immediate compliance or procedural response is mandated as per the directives listed below. The document outlines specific legal requirements that must be addressed by the concerned department.")
    story.append(Paragraph(analysis_text, body_style))

    # 5. KEY DIRECTIVES
    story.append(Paragraph("4. MANDATORY DIRECTIVES", section_style))
    directives = ex.get('directives', [])
    if directives:
        for d in directives:
            story.append(Paragraph(f"• {d}", body_style))
    else:
        story.append(Paragraph("No specific directives identified.", body_style))

    # 6. COMPLIANCE TIMELINE
    story.append(Paragraph("5. TIMELINE & DEADLINES", section_style))
    timeline_data = [
        [Paragraph("Compliance Window", label_style), Paragraph(ex.get('timeline', 'Immediate'), value_style)],
        [Paragraph("FINAL DEADLINE", label_style), Paragraph(f"<b>{ex.get('deadline_date', 'N/A')}</b>", ParagraphStyle('Urgent', parent=value_style, textColor=colors.red))],
    ]
    t_table = Table(timeline_data, colWidths=[1.5*inch, 4*inch])
    t_table.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#f1f5f9")),
        ('LINEBELOW', (0,0), (-1,0), 0.5, colors.HexColor("#f1f5f9")),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_table)

    # 7. RISK ASSESSMENT
    story.append(Paragraph("6. RISK & PRIORITY", section_style))
    priority = (ex.get('priority') or 'Medium').upper()
    p_color = colors.green
    if priority == 'HIGH': p_color = colors.red
    elif priority == 'MEDIUM': p_color = colors.orange
    
    story.append(Paragraph(f"<b>Priority Level:</b> <font color='{p_color}'>{priority}</font>", body_style))
    story.append(Paragraph("<b>Risk Implications:</b> Failure to comply within the stipulated time may lead to contempt of court proceedings or administrative penalties.", body_style))

    # 8. RECOMMENDED ACTIONS
    story.append(Paragraph("7. RECOMMENDED ACTIONS", section_style))
    plan_steps = plan_data.get('steps', [])
    if plan_steps:
        for i, step in enumerate(plan_steps):
            step_text = f"<b>Step {i+1}:</b> {step.get('step')} <br/>" \
                        f"<font size='8'>Owner: {step.get('owner')} | Deadline: {step.get('due_date')}</font>"
            story.append(Paragraph(step_text, body_style))
    else:
        story.append(Paragraph("Action plan pending detailed review.", body_style))

    # 9. CONCLUSION
    story.append(Paragraph("8. CONCLUSION", section_style))
    conclusion = plan_data.get('compliance_notes', "The case requires immediate administrative attention to ensure all court directives are fulfilled. Regular monitoring of the implementation steps is advised.")
    story.append(Paragraph(conclusion, body_style))

    # Footer/Signatory
    story.append(Spacer(1, 40))
    story.append(Paragraph("Generated by GovOS Court Intelligence System", 
                         ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=1, textColor=colors.gray)))
    story.append(Paragraph(f"Verification Status: {case.status.upper()}", 
                         ParagraphStyle('FooterStatus', parent=styles['Normal'], fontSize=8, alignment=1, textColor=colors.gray)))

    doc.build(story)
    logger.info("generate_pdf: written professional report to %s", file_path)
    return file_path

