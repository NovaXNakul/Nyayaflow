# app/services/pdf_service.py
#
# PDF ingestion (text extraction) and PDF report generation.
# text extraction is now delegated to rag_service.load_pdf_text() which uses
# PyMuPDF (fitz) for better Indian legal document extraction.

import os
import logging
import fitz
from fastapi import HTTPException
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from app.models.case_document import CaseDocument

logger = logging.getLogger(__name__)


def extract_pdf_text(file_path: str) -> tuple[str, list[dict]]:
    """
    Extract text from PDF using PyMuPDF (fitz).
    Returns (merged_text, pages) where pages is a list of {page, text} dicts.
    """
    try:
        doc   = fitz.open(file_path)
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


def generate_pdf(case: CaseDocument) -> str:
    """Generate a formatted PDF action report for a processed case."""
    reports_dir = "reports"
    os.makedirs(reports_dir, exist_ok=True)
    file_path = f"{reports_dir}/case_{case.id}_report.pdf"

    doc    = SimpleDocTemplate(file_path)
    styles = getSampleStyleSheet()
    body   = []

    ex           = case.extracted_json or {}
    summary_data = ex.get("summary", {})
    summary_text = (
        summary_data.get("court_decision", "No summary available.")
        if isinstance(summary_data, dict)
        else str(summary_data)
    )

    body.append(Paragraph("Court Case Action Report", styles["Title"]))
    body.append(Spacer(1, 10))

    body.append(Paragraph(f"<b>Case ID:</b> {case.id}",                   styles["Normal"]))
    body.append(Paragraph(f"<b>Date:</b> {ex.get('date_of_order', 'N/A')}", styles["Normal"]))
    body.append(Paragraph(f"<b>Department:</b> {ex.get('department', 'N/A')}", styles["Normal"]))
    body.append(Paragraph(f"<b>Priority:</b> {ex.get('priority', 'N/A')}",  styles["Normal"]))

    # ── Parties ────────────────────────────────────────────────────────────────
    if ex.get("borrower"):
        body.append(Spacer(1, 6))
        body.append(Paragraph("Parties:", styles["Heading2"]))
        body.append(Paragraph(f"<b>Borrower:</b> {ex['borrower']}", styles["Normal"]))
        if ex.get("co_borrowers"):
            cos = ex["co_borrowers"]
            if isinstance(cos, list):
                cos = ", ".join(cos)
            body.append(Paragraph(f"<b>Co-Borrowers / Guarantors:</b> {cos}", styles["Normal"]))
        if ex.get("loan_amount"):
            body.append(Paragraph(f"<b>Loan Amount:</b> {ex['loan_amount']}", styles["Normal"]))

    body.append(Spacer(1, 10))
    body.append(Paragraph("Key Directives:", styles["Heading2"]))
    directives = ex.get("directives", [])
    if directives:
        for d in directives:
            body.append(Paragraph(f"• {d}", styles["Normal"]))
    else:
        body.append(Paragraph("No directives extracted.", styles["Normal"]))

    body.append(Spacer(1, 10))
    body.append(Paragraph("Action Plan:", styles["Heading2"]))
    body.append(Paragraph(ex.get("action_required", "None specified"), styles["Normal"]))

    plan_steps = (case.action_plan or {}).get("plan", {}).get("steps", [])
    if plan_steps:
        body.append(Spacer(1, 5))
        body.append(Paragraph("Execution Steps:", styles["Heading3"]))
        for step in plan_steps:
            body.append(Paragraph(
                f"- {step.get('step')} "
                f"(Owner: {step.get('owner')}, Due: {step.get('due_date')})",
                styles["Normal"],
            ))

    body.append(Spacer(1, 10))
    body.append(Paragraph("Deadline:", styles["Heading2"]))
    body.append(Paragraph(ex.get("deadline_date", "Not specified"), styles["Normal"]))

    body.append(Spacer(1, 10))
    body.append(Paragraph("Summary:", styles["Heading2"]))
    if isinstance(summary_data, dict):
        body.append(Paragraph(f"<b>Key Facts:</b> {summary_data.get('key_facts', '')}",       styles["Normal"]))
        body.append(Paragraph(f"<b>Court Decision:</b> {summary_data.get('court_decision', '')}", styles["Normal"]))
        body.append(Paragraph(f"<b>Required Action:</b> {summary_data.get('required_action', '')}", styles["Normal"]))
    else:
        body.append(Paragraph(summary_text, styles["Normal"]))

    body.append(Spacer(1, 10))
    body.append(Paragraph("Verification Status:", styles["Heading2"]))
    body.append(Paragraph(case.status.upper(), styles["Normal"]))

    doc.build(body)
    logger.info("generate_pdf: written to %s", file_path)
    return file_path