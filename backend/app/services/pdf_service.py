import os
import fitz
from fastapi import HTTPException
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from app.models.case_document import CaseDocument

def extract_pdf_text(file_path: str):
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        raise HTTPException(422, f"Failed to read PDF: {e}")
    pages = []
    for i, page in enumerate(doc):
        pages.append({"page": i + 1, "text": page.get_text("text") or ""})
    doc.close()
    merged = "\n\n".join([f"[Page {p['page']}]\n{p['text']}" for p in pages])
    return merged, pages

def generate_pdf(case: CaseDocument) -> str:
    reports_dir = "reports"
    os.makedirs(reports_dir, exist_ok=True)
    file_path = f"{reports_dir}/case_{case.id}_report.pdf"
    
    doc = SimpleDocTemplate(file_path)
    styles = getSampleStyleSheet()
    content = []
    
    ex = case.extracted_json or {}
    
    # Extract Summary
    summary_data = ex.get("summary", {})
    summary_text = summary_data.get("court_decision", "No summary available.") if isinstance(summary_data, dict) else str(summary_data)
    
    content.append(Paragraph("Court Case Action Report", styles["Title"]))
    content.append(Spacer(1, 10))

    content.append(Paragraph(f"<b>Case ID:</b> {case.id}", styles["Normal"]))
    content.append(Paragraph(f"<b>Date:</b> {ex.get('date_of_order', 'N/A')}", styles["Normal"]))
    content.append(Paragraph(f"<b>Department:</b> {ex.get('department', 'N/A')}", styles["Normal"]))
    content.append(Paragraph(f"<b>Priority:</b> {ex.get('priority', 'N/A')}", styles["Normal"]))
    content.append(Spacer(1, 10))

    content.append(Paragraph("Key Directives:", styles["Heading2"]))
    directives = ex.get("directives", [])
    if directives:
        for d in directives:
            content.append(Paragraph(f"• {d}", styles["Normal"]))
    else:
        content.append(Paragraph("No directives extracted.", styles["Normal"]))
    content.append(Spacer(1, 10))

    content.append(Paragraph("Action Plan:", styles["Heading2"]))
    content.append(Paragraph(ex.get("action_required", "None specified"), styles["Normal"]))
    
    # Add detailed action plan if exists
    plan_steps = (case.action_plan or {}).get("plan", {}).get("steps", [])
    if plan_steps:
        content.append(Spacer(1, 5))
        content.append(Paragraph("Execution Steps:", styles["Heading3"]))
        for step in plan_steps:
            content.append(Paragraph(f"- {step.get('step')} (Owner: {step.get('owner')}, Due: {step.get('due_date')})", styles["Normal"]))

    content.append(Spacer(1, 10))
    content.append(Paragraph("Deadline:", styles["Heading2"]))
    content.append(Paragraph(ex.get("deadline_date", "Not specified"), styles["Normal"]))

    content.append(Spacer(1, 10))
    content.append(Paragraph("Summary:", styles["Heading2"]))
    if summary_data and isinstance(summary_data, dict):
        content.append(Paragraph(f"<b>Key Facts:</b> {summary_data.get('key_facts', '')}", styles["Normal"]))
        content.append(Paragraph(f"<b>Court Decision:</b> {summary_data.get('court_decision', '')}", styles["Normal"]))
        content.append(Paragraph(f"<b>Required Action:</b> {summary_data.get('required_action', '')}", styles["Normal"]))
    else:
        content.append(Paragraph(summary_text, styles["Normal"]))

    content.append(Spacer(1, 10))
    content.append(Paragraph("Verification Status:", styles["Heading2"]))
    content.append(Paragraph(case.status.upper(), styles["Normal"]))

    doc.build(content)
    return file_path
