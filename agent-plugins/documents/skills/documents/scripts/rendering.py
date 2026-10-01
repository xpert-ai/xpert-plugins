"""Independent DOCX -> PDF -> PNG pipeline with fresh output and bounded work."""
import hashlib
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from xml.sax.saxutils import escape

import pypdfium2 as pdfium


def workspace_path(path):
    try:
        return Path(path).resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return str(Path(path).resolve())


def render_document(source, output, executable, dpi=120):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source.suffix.lower() != '.docx' or not source.is_file():
        raise ValueError('Input must be an existing DOCX file')
    if output.exists():
        raise ValueError('Render output must be a new directory to avoid stale QA evidence')
    if not 72 <= dpi <= 200:
        raise ValueError('DPI must be between 72 and 200')
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    # Conversion uses a unique profile and workspace; concurrent renders cannot
    # reuse another LibreOffice process/profile or overwrite the user's source.
    with tempfile.TemporaryDirectory(prefix='xpert-documents-', dir=output.parent) as temp:
        temp = Path(temp)
        copied = temp / 'input.docx'
        shutil.copyfile(source, copied)
        profile = temp / 'profile'
        profile.mkdir()
        (profile / 'user').mkdir()
        (profile / 'user/registrymodifications.xcu').write_text(
            '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry">'
            '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
            '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop>'
            '</item></oor:items>', encoding='utf-8')
        command = [executable, '-env:UserInstallation=' + profile.as_uri(), '--headless',
                   '--nologo', '--nodefault', '--norestore', '--convert-to',
                   'pdf:writer_pdf_Export', '--outdir', str(temp), str(copied)]
        environment = {**os.environ, 'TMPDIR': tempfile.gettempdir()}
        if sys.platform == 'darwin' and not environment.get('FONTCONFIG_FILE'):
            # Headless macOS LibreOffice can use Fontconfig without the desktop
            # font directories. An explicit per-render config prevents blank CJK.
            fonts = temp / 'fonts.conf'
            roots = ['/System/Library/Fonts', '/Library/Fonts', str(Path.home() / 'Library/Fonts')]
            fonts.write_text('<?xml version="1.0"?><fontconfig>' +
                             ''.join('<dir>' + escape(root) + '</dir>' for root in roots) +
                             '<cachedir>' + escape(str(temp / 'font-cache')) + '</cachedir></fontconfig>',
                             encoding='utf-8')
            environment['FONTCONFIG_FILE'] = str(fonts)
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=180,
                                    env=environment)
        except subprocess.TimeoutExpired as error:
            raise RuntimeError('LibreOffice conversion timed out after 180 seconds') from error
        pdf_path = temp / 'input.pdf'
        if result.returncode or not pdf_path.is_file() or not pdf_path.stat().st_size:
            raise RuntimeError('LibreOffice conversion failed: ' + (result.stderr + result.stdout)[-3000:])
        stage = temp / 'result'
        stage.mkdir()
        shutil.copyfile(pdf_path, stage / 'document.pdf')
        pages = []
        with closing(pdfium.PdfDocument(str(pdf_path))) as pdf:
            if not 1 <= len(pdf) <= 100:
                raise ValueError('Review supports 1 to 100 pages; split a larger document explicitly')
            for index in range(len(pdf)):
                page = pdf[index]
                try:
                    width, height = page.get_size()
                    if width * height * (dpi / 72) ** 2 > 25_000_000:
                        raise ValueError('Page exceeds the 25 megapixel rendering limit')
                    bitmap = page.render(scale=dpi / 72)
                    try:
                        picture = bitmap.to_pil()
                        name = 'page-%03d.png' % (index + 1)
                        picture.save(stage / name)
                        pages.append({'page': index + 1, 'path': workspace_path(output / name),
                                      'width': picture.width, 'height': picture.height})
                        picture.close()
                    finally:
                        bitmap.close()
                finally:
                    page.close()
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise RuntimeError('Source changed during rendering; rerun against the final document')
        receipt = {'input': workspace_path(source), 'sha256': digest, 'pageCount': len(pages),
                   'pdf': workspace_path(output / 'document.pdf'), 'pages': pages,
                   'visualReview': 'pending'}
        (stage / 'render.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
        stage.rename(output)
    return receipt
