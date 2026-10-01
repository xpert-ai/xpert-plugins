import base64
import io
import json
import sys
from pathlib import Path

import pdfplumber
import pypdfium2
from markitdown import MarkItDown, StreamInfo
from markitdown.converters import DocxConverter, HtmlConverter, PlainTextConverter, PptxConverter


class ConversionError(Exception):
    pass


def inside(obj, box):
    x = (obj["x0"] + obj["x1"]) / 2
    y = (obj["top"] + obj["bottom"]) / 2
    return box[0] <= x <= box[2] and box[1] <= y <= box[3]


def table_markdown(table):
    # A missing slot is filled only when a physical cell spans that slot.
    # Ordinary empty cells remain empty. This preserves actual merged-cell relations.
    xs = sorted({x for cell in table.cells for x in (cell[0], cell[2])})
    ys = sorted({y for cell in table.cells for y in (cell[1], cell[3])})
    values = {
        cell: value or ""
        for row, values in zip(table.rows, table.extract())
        for cell, value in zip(row.cells, values) if cell is not None
    }
    rows = []
    for top, bottom in zip(ys, ys[1:]):
        row = []
        for left, right in zip(xs, xs[1:]):
            x, y = (left + right) / 2, (top + bottom) / 2
            cell = next((c for c in table.cells if c[0] < x < c[2] and c[1] < y < c[3]), None)
            row.append(values.get(cell, "").replace("|", "\\|").replace("\n", "<br>"))
        rows.append("| " + " | ".join(row) + " |")
    if rows:
        rows.insert(1, "| " + " | ".join(["---"] * (len(xs) - 1)) + " |")
    return "\n".join(rows)


def page_text(page):
    tables = page.find_tables()
    if not tables:
        return page.extract_text() or ""
    # Interleave text and ruled tables in page order; never flatten table cells into prose.
    remaining = page.filter(lambda obj: obj.get("object_type") != "char" or
                            not any(inside(obj, table.bbox) for table in tables))
    items = [(line["top"], line["x0"], line["text"], False) for line in remaining.extract_text_lines(return_chars=False)]
    items.extend((table.bbox[1], table.bbox[0], table_markdown(table), True) for table in tables)
    parts = []
    previous_table = False
    for _, _, text, is_table in sorted(items, key=lambda item: (item[0], item[1])):
        if parts: parts.append("\n\n" if is_table or previous_table else "\n")
        parts.append(text)
        previous_table = is_table
    return "".join(parts)


def convert_pdf(content):
    pages = []
    image_bytes = 0
    with pdfplumber.open(io.BytesIO(content)) as pdf, pypdfium2.PdfDocument(content) as render_pdf:
        for index, page in enumerate(pdf.pages):
            text = page_text(page)
            # A text layer may cover only a header or watermark. It is not proof that the image was recognized.
            boxes = [
                (img["x0"], img["top"], img["x1"], img["bottom"])
                for img in page.images
            ]
            blank = not text.strip() and not (page.images or page.curves or page.lines or page.rects)
            if not text.strip() and not blank:
                boxes = [page.bbox]
            images = []
            if boxes:
                render_page = render_pdf[index]
                try:
                    width, height = render_page.get_size()
                    bitmap = render_page.render(scale=min(2.5, 2200 / max(width, height)))
                    try:
                        rendered = bitmap.to_pil()
                        for box in dict.fromkeys(boxes):
                            bounds = (max(0, box[0]), max(0, box[1]), min(page.width, box[2]), min(page.height, box[3]))
                            if bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
                                continue
                            crop = rendered.crop(tuple(round(v * rendered.size[i % 2] / (page.width if i % 2 == 0 else page.height)) for i, v in enumerate(bounds)))
                            output = io.BytesIO()
                            crop.save(output, format="PNG")
                            crop.close()
                            image_bytes += output.tell()
                            if image_bytes > 80 * 1024 * 1024:
                                raise ConversionError("OUTPUT_TOO_LARGE")
                            images.append("![PDF page %d](data:image/png;base64,%s)" % (index + 1, base64.b64encode(output.getvalue()).decode()))
                        rendered.close()
                    finally:
                        bitmap.close()
                finally:
                    render_page.close()
            markdown = "\n\n".join([part for part in [text, *images] if part.strip()])
            pages.append({"page": index + 1, "markdown": markdown, "needsOcr": bool(images), "blank": blank})
            page.close()  # Release pdfplumber object caches before rendering the next page.
    return {"markdown": "\n\n".join(page["markdown"] for page in pages), "pages": pages}


try:
    source = Path(sys.argv[1])
    if not source.stat().st_size:
        raise ConversionError("EMPTY_FILE")
    if source.stat().st_size > 100 * 1024 * 1024:
        raise ConversionError("INPUT_TOO_LARGE")
    content = source.read_bytes()
    extension = sys.argv[3]
    if extension == "pdf":
        converted = convert_pdf(content)
    else:
        converters = {"docx": DocxConverter, "pptx": PptxConverter, "html": HtmlConverter,
                      "htm": HtmlConverter, "txt": PlainTextConverter, "md": PlainTextConverter, "markdown": PlainTextConverter}
        parser = MarkItDown(enable_builtins=False, enable_plugins=False)
        parser.register_converter(converters[extension]())
        result = parser.convert_stream(io.BytesIO(content), stream_info=StreamInfo(extension="." + extension), keep_data_uris=True)
        converted = {"markdown": result.markdown, "title": result.title}
    if not converted["markdown"].strip():
        raise ConversionError("EMPTY_TEXT")
    output = json.dumps(converted).encode()
    if len(output) > 128 * 1024 * 1024:
        raise ConversionError("OUTPUT_TOO_LARGE")
    Path(sys.argv[2]).write_bytes(output)
except Exception as error:
    # A bounded code crosses the Job boundary. No document text, paths or traceback.
    code = str(error) if isinstance(error, ConversionError) else "INVALID_DOCUMENT"
    sys.stderr.write("EXPORT_OUTPUT_INVALID: MARKITDOWN_" + code + "\n")
    sys.exit(3)
