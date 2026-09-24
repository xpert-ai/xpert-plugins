"""Render a disposable copy with LibreOffice Calc; retain the authoritative XLSX bytes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from xml.sax.saxutils import escape


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', nargs='?')
    parser.add_argument('--output')
    parser.add_argument('--doctor', action='store_true')
    args = parser.parse_args()
    import pypdfium2 as pdfium
    office = os.environ.get('XPERT_SPREADSHEETS_SOFFICE')
    if not office:
        for candidate in [Path.home()/'Applications/LibreOffice.app/Contents/MacOS/soffice',
                          Path('/Applications/LibreOffice.app/Contents/MacOS/soffice')]:
            if candidate.is_file():
                office = str(candidate)
                break
    office = office or shutil.which('soffice')
    if office and 'codex-runtimes' in Path(office).parts:
        raise RuntimeError('Configure an administrator-installed LibreOffice; Codex bundled runtimes are not supported')
    if not office:
        raise RuntimeError('Install LibreOffice Calc and Noto Sans CJK fonts')
    if args.doctor:
        version = subprocess.run([office, '--version'], capture_output=True, text=True, check=True, timeout=20)
        print(json.dumps({'libreoffice': version.stdout.strip(), 'pdfium': True}))
        return
    source = Path(args.input).resolve()
    if source.suffix.lower() != '.xlsx' or source.stat().st_size > 20 * 1024 * 1024:
        raise ValueError('Expected an XLSX file of at most 20 MiB')
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix='xpert-sheets-') as temporary:
        root = Path(temporary)
        copy = root/'preview.xlsx'
        shutil.copyfile(source, copy)
        profile = root/'profile'
        (profile/'user').mkdir(parents=True)
        (profile/'user/registrymodifications.xcu').write_text(
            '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry">'
            '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
            '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>')
        environment = dict(os.environ)
        if sys.platform == 'darwin' and not environment.get('FONTCONFIG_FILE'):
            fonts = root/'fonts.conf'
            directories = ['/System/Library/Fonts', '/Library/Fonts', str(Path.home()/'Library/Fonts')]
            fonts.write_text('<?xml version="1.0"?><fontconfig>' +
                ''.join('<dir>'+escape(path)+'</dir>' for path in directories) +
                '<cachedir>'+escape(str(root/'font-cache'))+'</cachedir></fontconfig>')
            environment['FONTCONFIG_FILE'] = str(fonts)
        result = subprocess.run([office, '-env:UserInstallation='+(root/'profile').as_uri(),
            '--headless', '--convert-to', 'pdf:calc_pdf_Export', '--outdir', str(output), str(copy)],
            capture_output=True, text=True, timeout=180, env=environment)
        pdf = output/'preview.pdf'
        if result.returncode or not pdf.is_file():
            raise RuntimeError('LibreOffice Calc rendering failed: '+result.stderr[-2000:])
    images = []
    document = pdfium.PdfDocument(pdf)
    try:
        if not 0 < len(document) <= 80:
            raise ValueError('Preview exceeds the 80-page limit; narrow the workbook print ranges')
        for index in range(len(document)):
            page = document[index]
            try:
                width, height = page.get_size()
                if width * height * 1.5**2 > 25000000:
                    raise ValueError('Preview page exceeds 25 megapixels')
                bitmap = page.render(scale=1.5)
                try:
                    image = output/f'page-{index+1:03}.png'
                    bitmap.to_pil().save(image)
                    images.append(str(image))
                finally:
                    bitmap.close()
            finally:
                page.close()
    finally:
        document.close()
    if digest != hashlib.sha256(source.read_bytes()).hexdigest():
        raise RuntimeError('Source changed during rendering')
    receipt = {'sha256': digest, 'pdf': str(pdf), 'pages': len(images), 'images': images,
               'renderer': 'LibreOffice Calc / PDFium', 'visuallyReviewed': False}
    (output/'render.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
