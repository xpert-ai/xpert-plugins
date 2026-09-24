"""Real XLSX/formula/OPC/Chinese-preview checks through the portable launcher."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--skill', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=False)
    script = args.skill.resolve()/'scripts/spreadsheets.py'

    def run(*argv, ok=True):
        result = subprocess.run([sys.executable, str(script), *map(str, argv)], capture_output=True, text=True, timeout=240)
        if ok:
            assert result.returncode == 0, result.stderr
            return json.loads(result.stdout)
        assert result.returncode != 0, 'Expected the command to fail'
        return result.stderr

    doctor = run('doctor')
    spec = {'version': 1, 'sheets': [
        {'name': 'Sales', 'rows': [['Quarter', '\u8425\u6536', '\u6210\u672c', '\u5229\u6da6'],
            ['Q1', 120, 80, {'formula': '=B2-C2'}], ['Q2', 180, 100, {'formula': '=B3-C3'}],
            ['Q3', 240, 130, {'formula': '=B4-C4'}]], 'columnWidths': [20, 18, 18, 18],
         'numberFormats': [{'range': 'B2:D4', 'format': '#,##0.00'}],
         'tables': [{'name': 'SalesTable', 'range': 'A1:D4'}],
         'charts': [{'type': 'bar', 'title': '\u5b63\u5ea6\u5229\u6da6', 'anchor': 'A7', 'series': [
             {'name': '\u5229\u6da6', 'categories': 'A2:A4', 'values': 'D2:D4'}]}]},
        {'name': 'Summary', 'rows': [['Metric', 'Value'], ['Revenue', {'formula': '=SUM(Sales!B2:B4)'}],
            ['Profit', {'formula': '=SUM(Sales!D2:D4)'}], ['Margin', {'formula': '=IFERROR(B3/B2,0)'}]],
         'numberFormats': [{'range': 'B4:B4', 'format': '0.00%'}]},
        {'name': 'Hidden', 'hidden': True, 'rows': [['Keep original'], [42]]}]}
    (root/'spec.json').write_text(json.dumps(spec, ensure_ascii=False))
    created = run('build', root/'spec.json', '--output', root/'original.xlsx')
    assert created['charts'] == 1 and created['tables'] == 1
    digest = hashlib.sha256((root/'original.xlsx').read_bytes()).hexdigest()
    patch = {'version': 1, 'sha256': digest, 'edits': [{'sheet': 'Sales', 'cell': 'B2', 'value': 150}]}
    (root/'patch.json').write_text(json.dumps(patch))
    edited = run('edit', root/'original.xlsx', root/'patch.json', '--output', root/'edited.xlsx')
    assert any(c['sheet'] == 'Summary' and c['cell'] == 'B2' and c['value'] == 570 for c in edited['cells'])
    assert any(c['sheet'] == 'Summary' and c['cell'] == 'B3' and c['value'] == 260 for c in edited['cells'])
    assert hashlib.sha256((root/'original.xlsx').read_bytes()).hexdigest() == digest
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
          'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart'}
    with zipfile.ZipFile(root/'original.xlsx') as a, zipfile.ZipFile(root/'edited.xlsx') as b:
        assert set(a.namelist()) == set(b.namelist())
        for path in a.namelist():
            if path not in ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/workbook.xml', 'xl/charts/chart1.xml']:
                assert a.read(path) == b.read(path), path
        summary = ET.fromstring(b.read('xl/worksheets/sheet2.xml'))
        assert summary.find('.//s:c[@r="B2"]/s:f', ns).text == 'SUM(Sales!B2:B4)'
        assert summary.find('.//s:c[@r="B2"]/s:v', ns).text == '570'
        chart = ET.fromstring(b.read('xl/charts/chart1.xml'))
        assert [v.text for v in chart.findall('.//c:numCache/c:pt/c:v', ns)] == ['70', '80', '110']
        book = ET.fromstring(b.read('xl/workbook.xml'))
        assert book.find('.//s:sheet[@name="Hidden"]', ns).attrib['state'] == 'hidden'
    assert 'revision' in run('edit', root/'edited.xlsx', root/'patch.json', '--output', root/'stale.xlsx', ok=False)
    assert not (root/'stale.xlsx').exists()
    assert 'EEXIST' in run('build', root/'spec.json', '--output', root/'original.xlsx', ok=False)
    bounded = run('inspect', root/'edited.xlsx', '--limit', 2)
    assert bounded['truncated'] and len(bounded['cells']) == 2
    run('validate', root/'edited.xlsx')
    render = run('render', root/'edited.xlsx', '--output', root/'qa')
    assert render['sha256'] == edited['sha256'] and render['pages'] == 2
    import pypdfium2 as pdfium
    document = pdfium.PdfDocument(render['pdf'])
    text = ''
    for page in document:
        text_page = page.get_textpage()
        text += text_page.get_text_range()
        text_page.close()
        page.close()
    document.close()
    assert '\u8425\u6536' in text and '\u5229\u6da6' in text and '\u5b63\u5ea6\u5229\u6da6' in text
    checks = ['doctor', 'native-chart-table', 'cross-sheet-formulas', 'persisted-formula-and-chart-caches',
        'unchanged-unrelated-zip-parts', 'hidden-sheet', 'stale-revision-rejected', 'no-overwrite',
        'bounded-inspection', 'cached-error-validation', 'two-page-chinese-render', 'input-hash-preserved']
    (root/'smoke.json').write_text(json.dumps({'status': 'passed', 'checks': checks, 'doctor': doctor,
        'render': render, 'visuallyReviewed': False}, indent=2))
    print(json.dumps({'status': 'passed', 'checks': checks, 'output': str(root)}))


if __name__ == '__main__':
    main()
