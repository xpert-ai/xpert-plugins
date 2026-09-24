# PDF authoring

Write a Python builder in the task directory and execute it through `pdf.py run`.
The runtime installs a checksum-pinned Noto Sans SC TrueType font and its OFL
license. `pdf_fonts.register_font()` makes ReportLab embed a subset in the PDF;
the result does not depend on the reader having a Chinese font installed.
Do not pass the Documents plugin's CFF/OTF font to ReportLab's TrueType loader.

```python
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from pdf_fonts import register_font

font = register_font()
body = ParagraphStyle('Body', fontName=font, fontSize=11, leading=17,
                      wordWrap='CJK', spaceAfter=10)
heading = ParagraphStyle('Heading', parent=body, fontSize=22, leading=30)
output = Path('pdfs/my-task/report.pdf')
output.parent.mkdir(parents=True, exist_ok=True)
if output.exists():
    raise ValueError('Choose a new output file')
document = SimpleDocTemplate(str(output), pagesize=A4,
                            leftMargin=48, rightMargin=48, topMargin=48, bottomMargin=48)
story = [Paragraph('Project review', heading),
         Paragraph('Describe the purpose, findings and next action.', body), Spacer(1, 12)]
rows = [[Paragraph(value, body) for value in row] for row in
        [['Item', 'Status'], ['Delivery', 'Ready'], ['Review', 'Pending']]]
table = Table(rows, colWidths=[250, 240], repeatRows=1)
table.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
                          ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E2E8F0')),
                          ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                          ('LEFTPADDING', (0, 0), (-1, -1), 10)]))
story.append(table)
document.build(story)
```

Adjust the task directory, language, content, typography and layout to the request.
Use `Paragraph` for wrapping text and table cells, repeating headers for long tables,
and explicit `PageBreak` only when the requested structure needs it. Never draw long
lines with `drawString` and assume they wrap. Escape untrusted strings before placing
them into ReportLab paragraph markup. Use Unicode text directly; do not replace
Chinese characters with pictures or use unsupported CID font substitution.

To modify a supplied PDF, first determine whether page operations or form filling
can preserve it. PDF is not a Word processing format: arbitrary content replacement
may require a carefully reviewed rewrite or the original editable source.
