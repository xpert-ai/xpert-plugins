"""Validate canonical fields against page widgets before and after filling."""
from io import BytesIO
import json
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

from pdf_common import read_pdf, write_pdf


def identity(obj):
    ref = getattr(obj, 'indirect_reference', None)
    return (ref.idnum, ref.generation) if ref else id(obj)


def inherited(obj, key):
    seen = set()
    while obj is not None:
        obj = obj.get_object()
        marker = identity(obj)
        if marker in seen or len(seen) >= 32:
            raise ValueError('Cyclic or excessively nested form hierarchy')
        seen.add(marker)
        if key in obj:
            return obj[key]
        obj = obj.get('/Parent')
    return None


def inventory(reader):
    form = reader.trailer['/Root'].get('/AcroForm')
    form = form.get_object() if form else {}
    if '/XFA' in form:
        raise ValueError('XFA forms require a dedicated authoring workflow')
    fields, by_id, seen = {}, {}, set()

    def walk(reference, prefix='', depth=0):
        obj = reference.get_object()
        marker = identity(obj)
        if marker in seen or depth > 32:
            raise ValueError('Repeated or cyclic field-tree entry')
        seen.add(marker)
        part = obj.get('/T')
        if part is None:
            raise ValueError('Unnamed canonical field; repair must be reviewed explicitly')
        name = (prefix + '.' if prefix else '') + str(part)
        children = [child for child in obj.get('/Kids', []) if '/T' in child.get_object()]
        if children:
            for child in children:
                walk(child, name, depth + 1)
        else:
            if name in fields:
                raise ValueError('Ambiguous duplicate field name: ' + name)
            fields[name] = {'object': obj, 'type': str(inherited(obj, '/FT') or ''),
                            'value': inherited(obj, '/V'), 'widgets': []}
            by_id[marker] = name

    for reference in form.get('/Fields', []):
        walk(reference)
    for index, page in enumerate(reader.pages):
        for reference in page.get('/Annots', []):
            widget = reference.get_object()
            if widget.get('/Subtype') != '/Widget':
                continue
            current, visited = widget, set()
            while identity(current) not in by_id:
                marker = identity(current)
                if marker in visited or len(visited) >= 32 or not current.get('/Parent'):
                    raise ValueError('Orphan or ambiguous page widget; automatic field repair is disabled')
                visited.add(marker)
                parent = current['/Parent'].get_object()
                if marker not in {identity(child.get_object()) for child in parent.get('/Kids', [])}:
                    raise ValueError('Widget Parent/Kids relationship is inconsistent')
                current = parent
            record = fields[by_id[identity(current)]]
            if inherited(widget, '/V') != record['value']:
                raise ValueError('Widget value disagrees with canonical field value')
            record['widgets'].append({'page': index + 1, 'object': widget})
    return fields


def normal_appearance(widget):
    appearance = widget.get('/AP')
    appearance = appearance.get_object() if appearance is not None else {}
    normal = appearance.get('/N')
    return normal.get_object() if normal is not None else None


def summary(fields):
    result = {}
    for name, item in fields.items():
        result[name] = {'type': item['type'], 'value': str(item['value']) if item['value'] is not None else None,
                        'pages': [widget['page'] for widget in item['widgets']]}
        if item['type'] == '/Btn':
            states = [set(normal_appearance(widget['object']) or {}) for widget in item['widgets']]
            result[name]['states'] = sorted(set.intersection(*states)) if states else []
    return result


def values_for(fields, values):
    if not isinstance(values, dict) or not values:
        raise ValueError('Values JSON must be a non-empty object keyed by exact field name')
    result = {}
    for name, value in values.items():
        if name not in fields:
            raise ValueError('Unknown form field: ' + name)
        field = fields[name]
        if not field['widgets'] or int(inherited(field['object'], '/Ff') or 0) & 1:
            raise ValueError('Field is hidden or read-only: ' + name)
        if any(int(widget['object'].get('/F', 0)) & (1 | 2 | 32) for widget in field['widgets']):
            raise ValueError('Field has invisible, hidden or NoView widgets: ' + name)
        if not isinstance(value, str):
            raise ValueError('Field values must be strings; checkbox states use names such as /Yes or /Off')
        if field['type'] == '/Tx':
            if not value.isascii() or any(ord(char) < 32 and char not in '\n\r' for char in value):
                raise ValueError('This form helper supports ASCII text; other scripts require font-aware form authoring')
            limit = inherited(field['object'], '/MaxLen')
            if limit and len(value) > int(limit):
                raise ValueError('Text exceeds the form field maximum length')
        elif field['type'] == '/Btn':
            if int(inherited(field['object'], '/Ff') or 0) & ((1 << 15) | (1 << 16)):
                raise ValueError('Radio and push buttons require explicit group handling')
            for widget in field['widgets']:
                appearance = normal_appearance(widget['object']) or {}
                if value not in appearance:
                    raise ValueError('Invalid checkbox appearance state: ' + value)
        else:
            raise ValueError('Only ordinary text fields and checkboxes are supported by this helper')
        result[name] = value
    return result


def verify_values(reader, values):
    fields = inventory(reader)
    canonical = reader.get_fields() or {}
    for name, expected in values.items():
        if name not in fields or str(fields[name]['value']) != expected or str(canonical.get(name, {}).get('/V')) != expected:
            raise ValueError('Written canonical form value failed verification: ' + name)
        for item in fields[name]['widgets']:
            widget = item['object']
            normal = normal_appearance(widget)
            if fields[name]['type'] == '/Btn':
                if str(widget.get('/AS')) != expected:
                    raise ValueError('Checkbox appearance state is stale: ' + name)
                normal = normal.get(expected) if normal else None
                normal = normal.get_object() if normal is not None else None
            if normal is None or not hasattr(normal, 'get_data') or not normal.get_data():
                raise ValueError('Missing field appearance stream: ' + name)
    return summary(fields)


def fill_form(source, values_file, output, flatten=False):
    reader = read_pdf(source)
    fields = inventory(reader)
    if reader.trailer['/Root'].get('/Perms') or any(item['type'] == '/Sig' for item in fields.values()):
        raise ValueError('Signed PDFs and signature fields are not edited by this helper')
    supplied = json.loads(Path(values_file).read_text(encoding='utf-8'))
    values = values_for(fields, supplied)
    if flatten:
        existing = {name: str(item['value'] or ('/Off' if item['type'] == '/Btn' else '')) for name, item in fields.items()}
        values = values_for(fields, {**existing, **values})
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.update_page_form_field_values(None, values, auto_regenerate=False, flatten=flatten)
    if flatten:
        writer.remove_annotations(subtypes='/Widget')
        writer.root_object.pop(NameObject('/AcroForm'), None)
    buffer = BytesIO()
    writer.write(buffer)
    reopened = PdfReader(BytesIO(buffer.getvalue()))
    if flatten:
        if reopened.trailer['/Root'].get('/AcroForm') or any(
                annot.get_object().get('/Subtype') == '/Widget' for page in reopened.pages for annot in page.get('/Annots', [])):
            raise ValueError('Flattened output retained interactive fields')
        verified = {}
    else:
        verified = verify_values(reopened, values)
    return {**write_pdf(writer, output), 'flattened': flatten, 'fields': verified}
