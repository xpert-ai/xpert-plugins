"""Exercise real PDF content, embedded CJK, page operations and AcroForm integrity."""
import argparse
from contextlib import closing
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image
import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, NumberObject
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, PageBreak, Spacer, Table, TableStyle


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--skill', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    script = args.skill.resolve() / 'scripts/pdf.py'
    args.output.mkdir(parents=True, exist_ok=False)
    root = args.output.resolve()

    def invoke(*arguments, success=True):
        result = subprocess.run([sys.executable, '-B', str(script), *map(str, arguments)],
                                cwd=root, text=True, capture_output=True, timeout=240)
        assert (result.returncode == 0) == success, result.stderr + result.stdout
        return json.loads(result.stdout) if success else result.stderr

    doctor = invoke('doctor')
    sys.path.insert(0, str(script.parent))
    from pdf_fonts import register_font
    font = register_font()
    body = ParagraphStyle('Body', fontName=font, fontSize=11, leading=18, wordWrap='CJK', spaceAfter=12)
    title = ParagraphStyle('Title', parent=body, fontSize=23, leading=31, textColor=colors.HexColor('#17365D'))
    rows = [['Item', 'Owner', 'Status'], ['Extraction', 'Team A', 'Ready'], ['Rendering', 'Team B', 'Ready']]
    table = Table(rows, colWidths=[170, 140, 160], repeatRows=1)
    table.setStyle(TableStyle([('FONTNAME', (0, 0), (-1, -1), font), ('FONTSIZE', (0, 0), (-1, -1), 11),
                              ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#64748B')),
                              ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E2E8F0')),
                              ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 9)]))
    source = root/'source.pdf'
    SimpleDocTemplate(str(source), pagesize=A4, leftMargin=48, rightMargin=48, topMargin=48, bottomMargin=48).build([
        Paragraph('PDF acceptance', title), Paragraph('\u4e2d\u6587\u6587\u6863\u751f\u6210\u4e0e\u5ba1\u9605\u9a8c\u6536', body),
        Spacer(1, 10), table, PageBreak(), Paragraph('Review checklist', title),
        Paragraph('1. Embedded Chinese font: \u6587\u6863\u5ba1\u9605', body),
        Paragraph('2. Text and tables can be extracted.', body), Paragraph('3. Both pages are rendered and visually reviewed.', body)])
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    reader = PdfReader(source)
    assert any('/FontFile2' in f.get_object().get('/FontDescriptor', {}) for f in reader.pages[0]['/Resources']['/Font'].values())
    extracted = invoke('inspect', source, '--tables')
    assert extracted['pageCount'] == 2 and '\u4e2d\u6587' in extracted['pages'][0]['text']
    assert extracted['pages'][0]['tables'][0][1] == rows[1]
    assert invoke('merge', source, source, '--output', root/'merged.pdf')['pageCount'] == 4
    assert invoke('select', root/'merged.pdf', '--pages', '2,1', '--output', root/'selected.pdf')['pageCount'] == 2
    assert 'Review checklist' in PdfReader(root/'selected.pdf').pages[0].extract_text()
    assert 'outside' in invoke('select', source, '--pages', '0', '--output', root/'invalid.pdf', success=False)
    assert 'Duplicate' in invoke('select', source, '--pages', '1,1', '--output', root/'invalid.pdf', success=False)
    assert 'new PDF' in invoke('select', source, '--pages', '1', '--output', source, success=False)

    form = root/'form.pdf'
    drawing = canvas.Canvas(str(form), pagesize=A4)
    drawing.setFont('Helvetica-Bold', 20)
    drawing.drawString(48, 790, 'PDF form acceptance')
    drawing.setFont('Helvetica', 12)
    drawing.drawString(48, 745, 'Customer name')
    drawing.acroForm.textfield(name='customer_name', value='Before', x=48, y=705, width=350, height=26)
    drawing.acroForm.checkbox(name='confirmed', x=48, y=660, checked=False, buttonStyle='check')
    drawing.drawString(80, 665, 'Confirm review')
    drawing.acroForm.textfield(name='keep_me', value='Preserved', x=48, y=610, width=350, height=26)
    drawing.showPage()
    drawing.save()
    form_hash = hashlib.sha256(form.read_bytes()).hexdigest()
    values = root/'values.json'
    values.write_text(json.dumps({'customer_name': 'Ada Lovelace', 'confirmed': '/Yes'}))
    filled = invoke('fill', form, '--values', values, '--output', root/'filled.pdf')
    assert filled['fields']['customer_name']['value'] == 'Ada Lovelace'
    assert filled['fields']['confirmed']['value'] == '/Yes'
    assert filled['fields']['keep_me']['value'] == 'Preserved'
    assert invoke('fill', form, '--values', values, '--output', root/'flat.pdf', '--flatten')['flattened']
    assert not PdfReader(root/'flat.pdf').get_fields()
    assert 'Ada Lovelace' in PdfReader(root/'flat.pdf').pages[0].extract_text()

    # Two widgets share one canonical field via Parent/Kids across different pages.
    writer = PdfWriter()
    writer.clone_document_from_reader(PdfReader(form))
    field = writer.root_object['/AcroForm']['/Fields'][0].get_object()
    widget_data = {NameObject(k): field[k] for k in ['/Type', '/Subtype', '/Rect', '/AP', '/F'] if k in field}
    widgets = [DictionaryObject(widget_data), DictionaryObject(widget_data)]
    refs = [writer._add_object(widget) for widget in widgets]
    for widget in widgets:
        widget[NameObject('/Parent')] = field.indirect_reference
    for key in ['/Subtype', '/Rect', '/AP', '/F', '/P']:
        field.pop(NameObject(key), None)
    field[NameObject('/Kids')] = ArrayObject(refs)
    writer.pages[0]['/Annots'][0] = refs[0]
    second = writer.add_blank_page(width=A4[0], height=A4[1])
    second[NameObject('/Annots')] = ArrayObject([refs[1]])
    writer.write(root/'hierarchical.pdf')
    hierarchical = invoke('fill', root/'hierarchical.pdf', '--values', values, '--output', root/'hierarchical-filled.pdf')
    assert hierarchical['fields']['customer_name']['pages'] == [1, 2]

    orphan = PdfWriter()
    orphan.clone_document_from_reader(PdfReader(form))
    del orphan.root_object['/AcroForm']['/Fields'][0]
    orphan.write(root/'orphan.pdf')
    assert 'Orphan' in invoke('fill', root/'orphan.pdf', '--values', values, '--output', root/'orphan-out.pdf', success=False)
    duplicate = PdfWriter()
    duplicate.clone_document_from_reader(PdfReader(form))
    duplicate.root_object['/AcroForm']['/Fields'][2].get_object()[NameObject('/T')] = duplicate.root_object['/AcroForm']['/Fields'][0].get_object()['/T']
    duplicate.write(root/'duplicate.pdf')
    assert 'duplicate' in invoke('fill', root/'duplicate.pdf', '--values', values, '--output', root/'duplicate-out.pdf', success=False)
    assert 'forms or signed' in invoke('merge', form, source, '--output', root/'invalid.pdf', success=False)
    for flag in [1, 2, 32]:
        hidden = PdfWriter()
        hidden.clone_document_from_reader(PdfReader(form))
        hidden.pages[0]['/Annots'][0].get_object()[NameObject('/F')] = NumberObject(flag)
        hidden.write(root/('hidden-%s.pdf' % flag))
        assert 'widgets' in invoke('fill', root/('hidden-%s.pdf' % flag), '--values', values,
                                   '--output', root/'hidden-out.pdf', success=False)
    readonly = PdfWriter()
    readonly.clone_document_from_reader(PdfReader(form))
    readonly.root_object['/AcroForm']['/Fields'][0].get_object()[NameObject('/Ff')] = NumberObject(1)
    readonly.write(root/'readonly.pdf')
    assert 'read-only' in invoke('fill', root/'readonly.pdf', '--values', values,
                                '--output', root/'readonly-out.pdf', success=False)

    receipts = []
    for filename in ['source', 'filled', 'flat', 'hierarchical-filled']:
        receipt = invoke('render', root/(filename+'.pdf'), '--output', root/(filename+'-qa'))
        receipts.append(receipt)
        for page in receipt['pages']:
            with Image.open(root/page['path']) as image:
                assert image.width > 800 and image.convert('L').getextrema()[0] < 240
    assert 'new directory' in invoke('render', source, '--output', root/'source-qa', success=False)
    with closing(pdfium.PdfDocument(str(source))) as pdf:
        with closing(pdf[0]) as page:
            with closing(page.get_textpage()) as text:
                assert '\u4e2d\u6587' in text.get_text_bounded()
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
    assert hashlib.sha256(form.read_bytes()).hexdigest() == form_hash
    result = {'status': 'passed', 'checks': ['embedded-CJK-font', 'text-and-table-extraction',
              'merge-and-page-order', 'source-preserved', 'form-values-and-appearances',
              'multi-page-parent-kids', 'flattened-content', 'orphan-and-duplicate-rejected',
              'hidden-and-readonly-rejected', 'fresh-render'],
              'python': doctor['python'], 'renders': receipts, 'visualReview': 'pending'}
    (root/'smoke.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({key: value for key, value in result.items() if key != 'renders'}))


if __name__ == '__main__':
    main()
