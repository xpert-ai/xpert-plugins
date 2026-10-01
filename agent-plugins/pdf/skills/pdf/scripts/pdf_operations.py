"""Text/table extraction and conservative page operations."""
import pdfplumber
from pypdf import PdfWriter

from pdf_common import page_indexes, read_pdf, require_plain_pages, write_pdf


def operate(args):
    if args.action == 'inspect':
        from pdf_forms import inventory, summary
        reader = read_pdf(args.input)
        indexes = page_indexes(args.pages, len(reader.pages))
        pages = []
        with pdfplumber.open(args.input) as document:
            for index in indexes:
                page = document.pages[index]
                text = page.extract_text() or ''
                row = {'page': index + 1, 'text': text[:20000], 'textTruncated': len(text) > 20000,
                       'hasText': bool(text.strip()), 'width': page.width, 'height': page.height}
                if args.tables:
                    tables = page.extract_tables()
                    row['tables'] = [[[str(cell or '')[:2000] for cell in record[:50]]
                                      for record in table[:200]] for table in tables[:20]]
                    row['tablesTruncated'] = len(tables) > 20 or any(len(t) > 200 or any(len(r) > 50 or any(len(str(c or '')) > 2000 for c in r) for r in t) for t in tables)
                pages.append(row)
        try:
            forms = summary(inventory(reader))
            warning = None
        except ValueError as error:
            forms, warning = None, str(error)
        return {'pageCount': len(reader.pages), 'pages': pages, 'fields': forms, 'formWarning': warning}
    writer = PdfWriter()
    if args.action == 'merge':
        if len(args.inputs) < 2:
            raise ValueError('Merge requires at least two PDFs')
        readers = [read_pdf(source) for source in args.inputs]
        if sum(len(reader.pages) for reader in readers) > 100:
            raise ValueError('Merged PDF exceeds the 100 page limit')
        for reader in readers:
            require_plain_pages(reader)
            writer.append(reader)
    else:
        reader = read_pdf(args.input)
        require_plain_pages(reader)
        writer.append(reader, pages=page_indexes(args.pages, len(reader.pages)))
    return write_pdf(writer, args.output)
