"""Bounded input, explicit page selections and non-overwriting PDF output."""
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader


def read_pdf(source):
    path = Path(source)
    if path.suffix.lower() != '.pdf' or not path.is_file():
        raise ValueError('Input must be an existing PDF')
    if path.stat().st_size > 100 * 1024 * 1024:
        raise ValueError('Input exceeds the 100 MiB limit')
    reader = PdfReader(BytesIO(path.read_bytes()))
    if reader.is_encrypted:
        raise ValueError('Encrypted PDFs require a separate authorized decryption workflow')
    if not 1 <= len(reader.pages) <= 100:
        raise ValueError('Helper supports 1 to 100 pages; split larger inputs explicitly')
    return reader


def page_indexes(selection, count):
    if not selection:
        return list(range(count))
    result = []
    for part in selection.split(','):
        bounds = part.strip().split('-')
        if len(bounds) > 2 or not all(value.isdigit() for value in bounds):
            raise ValueError('Pages must use 1-based numbers/ranges, for example 1-3,5')
        start, end = int(bounds[0]), int(bounds[-1])
        if not 1 <= start <= end <= count:
            raise ValueError('Page selection is outside the document')
        result.extend(range(start - 1, end))
    if len(set(result)) != len(result):
        raise ValueError('Duplicate pages in selection')
    return result


def workspace_path(path):
    try:
        return Path(path).resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return str(Path(path).resolve())


def write_pdf(writer, output):
    output = Path(output)
    if output.exists() or output.suffix.lower() != '.pdf':
        raise ValueError('Output must be a new PDF file; source files are preserved')
    data = BytesIO()
    writer.write(data)
    if len(data.getbuffer()) > 100 * 1024 * 1024:
        raise ValueError('Output exceeds the 100 MiB limit')
    reopened = PdfReader(BytesIO(data.getvalue()))
    if not 1 <= len(reopened.pages) <= 100:
        raise ValueError('Output must contain 1 to 100 pages')
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('xb') as stream:
        stream.write(data.getvalue())
    return {'output': workspace_path(output), 'pageCount': len(reopened.pages)}


def require_plain_pages(reader):
    if reader.trailer['/Root'].get('/AcroForm') or reader.trailer['/Root'].get('/Perms'):
        raise ValueError('Page operations on forms or signed PDFs require an explicit preservation workflow')
    if any(annot.get_object().get('/Subtype') == '/Widget'
           for page in reader.pages for annot in page.get('/Annots', [])):
        raise ValueError('Page operations cannot discard orphan form widgets')
