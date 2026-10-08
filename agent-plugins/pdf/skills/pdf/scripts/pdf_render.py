"""Render fresh PDF page images and bind the receipt to the source bytes."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import tempfile

import pypdfium2 as pdfium

from pdf_common import page_indexes, read_pdf, workspace_path


def render_pdf(source, output, selection=None, dpi=120):
    source, output = Path(source).resolve(), Path(output).resolve()
    indexes = page_indexes(selection, len(read_pdf(source).pages))
    if output.exists():
        raise ValueError('Render output must be a new directory')
    if not 72 <= dpi <= 200:
        raise ValueError('DPI must be between 72 and 200')
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='xpert-pdf-', dir=output.parent) as temp:
        stage = Path(temp) / 'pages'
        stage.mkdir()
        pages = []
        with closing(pdfium.PdfDocument(str(source))) as document:
            document.init_forms()
            for index in indexes:
                with closing(document[index]) as page:
                    width, height = page.get_size()
                    if width * height * (dpi / 72) ** 2 > 25_000_000:
                        raise ValueError('Page exceeds the 25 megapixel rendering limit')
                    with closing(page.render(scale=dpi / 72, draw_annots=True)) as bitmap:
                        with bitmap.to_pil() as image:
                            name = 'page-%03d.png' % (index + 1)
                            image.save(stage / name)
                            pages.append({'page': index + 1, 'path': workspace_path(output / name),
                                          'width': image.width, 'height': image.height})
            count = len(document)
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise RuntimeError('Source changed during rendering; render the final file again')
        result = {'input': workspace_path(source), 'sha256': digest, 'pageCount': count,
                  'renderedPageCount': len(pages), 'pages': pages, 'visualReview': 'pending'}
        (stage / 'render.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        stage.rename(output)
    return result
