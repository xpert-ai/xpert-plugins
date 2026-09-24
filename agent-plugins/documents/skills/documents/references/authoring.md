# Authoring

Create a builder file in the workspace and run it through `documents.py run`.
This example is a starting point, not a replacement for the requested layout:

```python
from pathlib import Path
from docx import Document
from docx.shared import Cm, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

doc = Document()
section = doc.sections[0]
section.page_width, section.page_height = Cm(21), Cm(29.7)
section.top_margin = section.bottom_margin = Cm(2)
section.left_margin = section.right_margin = Cm(2.2)
for name in ['Normal', 'Title', 'Heading 1', 'Heading 2']:
    style = doc.styles[name]
    style.font.name = 'Noto Sans CJK SC'
    style.element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), 'Noto Sans CJK SC')
doc.styles['Normal'].font.size = Pt(11)
doc.add_heading('Project report', 0)
doc.add_paragraph('State the purpose, findings and next action.')
table = doc.add_table(rows=1, cols=2)
table.style = 'Table Grid'
for cell, text in zip(table.rows[0].cells, ['Item', 'Status']):
    cell.text = text
header = OxmlElement('w:tblHeader')
table.rows[0]._tr.get_or_add_trPr().append(header)
for values in [('Delivery', 'Ready'), ('Review', 'Pending')]:
    for cell, text in zip(table.add_row().cells, values):
        cell.text = text
Path('documents').mkdir(exist_ok=True)
doc.save('documents/report.docx')
```

On macOS use an installed CJK font (for example PingFang SC) if Noto is absent;
the PRO image includes Noto CJK. Keep text in native paragraphs and tables so
Word remains editable. Size images to the usable page width. Preserve section
orientation and source styles when editing. Do not silently flatten fields,
charts, revisions, content controls or other unsupported objects.

The launcher `inspect` command reports body paragraphs, tables, comments and
revision counts. Check header/footer and advanced objects separately when they
are within scope. It is a bounded inspection helper, not a complete Word parser.
