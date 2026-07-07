# PDF

PDF is a document workflow skill for Xpert workspaces. It helps agents read, create, extract, render, and verify PDF files used in business processes such as contracts, reports, bids, audits, research, and knowledge management.

The skill is designed for work where PDF output must be both useful and reliable. Agents can extract key information, generate formal PDF documents, and render pages for visual checks before delivery.

## Business Scenarios

- Review contracts, policies, and legal documents for key parties, dates, amounts, clauses, and missing information.
- Extract text, tables, and facts from financial reports, invoices, statements, disclosures, and audit materials.
- Create polished PDF reports, proposals, summaries, checklists, and customer-facing deliverables.
- Verify final PDF layout by checking rendered pages for clipped text, broken tables, blurry images, bad pagination, or unreadable content.
- Prepare PDF content for downstream analysis, knowledge base ingestion, or structured business review.

## Core Capabilities

- Read PDF metadata, page structure, and extractable text.
- Extract text and tables with `pdfplumber` or `pypdf`.
- Generate PDF documents with `reportlab`.
- Render PDF pages with Poppler tools such as `pdftoppm` and `pdfinfo`.
- Support delivery checks for layout, readability, spacing, tables, images, headers, footers, and page numbering.

## Example Prompts

- `Review this contract PDF and summarize the parties, dates, amounts, and risk clauses.`
- `Extract all tables from this PDF report for further analysis.`
- `Create a polished PDF report from this project summary and verify the layout.`
- `Render each page of this PDF and check for formatting defects.`

## Boundaries

PDF extraction quality depends on the source file. Scanned, image-only, encrypted, or damaged PDFs may require OCR, access credentials, or manual review. Text extraction is not a replacement for visual verification when the PDF is a final business deliverable.

This plugin focuses on PDF document workflows. It does not provide e-signature, approval routing, long-term file storage, or standalone PDFium conversion features.

## Admin Notes

- Package: `@xpert-ai/plugin-pdf`
- Skill key: `pdf`
- Skill root: `skills/pdf`
- Source: converted from `/examples/pdf/26.630.12135`

Runtime requirements include a writable workspace, shell access, Python, `reportlab`, `pdfplumber`, `pypdf`, and Poppler tools `pdftoppm` and `pdfinfo`.
