# Inspection, pages and forms

All commands use `python3 <skill>/scripts/pdf.py`. Paths are workspace-relative.
Page arguments are 1-based, for example `1-3,5`. Outputs must be new files or
directories; source overwriting is refused. The helpers cap inputs/outputs at
100 MiB and 100 pages, rendering at 72-200 DPI and 25 megapixels per page.

```sh
python3 <skill>/scripts/pdf.py inspect pdfs/input.pdf --pages 1-3 --tables
python3 <skill>/scripts/pdf.py render pdfs/input.pdf --output pdfs/qa-new
python3 <skill>/scripts/pdf.py merge pdfs/first.pdf pdfs/second.pdf --output pdfs/combined.pdf
python3 <skill>/scripts/pdf.py select pdfs/input.pdf --pages 2-3 --output pdfs/part.pdf
```

`select` can split or reorder ordinary pages; run it with separate outputs for
multiple parts. Merge/select refuse forms and signed inputs because removing
pages can invalidate field relationships or signatures. Inspection exposes
truncation flags for long extracted text/tables and reports form inconsistencies.
No-text pages need visual reading or a separately provided OCR workflow.

## Ordinary AcroForms

Inspect first. Use exact field names from `fields`; do not guess from visible
labels. `formWarning` identifies inconsistent field trees or orphan widgets.
This helper deliberately requires those problems to be reviewed, not auto-repaired.

Write a JSON object of values, for example:

```json
{"customer_name": "Ada Lovelace", "confirmed": "/Yes"}
```

Then fill and verify:

```sh
python3 <skill>/scripts/pdf.py fill pdfs/form.pdf --values pdfs/values.json --output pdfs/filled.pdf
python3 <skill>/scripts/pdf.py inspect pdfs/filled.pdf
python3 <skill>/scripts/pdf.py render pdfs/filled.pdf --output pdfs/form-qa-new
```

The CLI preserves interactivity. It verifies canonical `/V` values, associated
page widgets, checkbox states and non-empty appearance streams after reopening.
Visually inspect all filled pages for stale, clipped or tiny text.

Supported automated filling: ordinary ASCII text fields and checkbox appearance
names such as `/Yes` or `/Off`. Unicode text inside existing form fields, radio
groups, choice fields, hidden/read-only fields, XFA and signatures require a
separate deliberate authoring workflow. Chinese body text in newly generated PDFs
is supported independently of these form-field limits.

Only if explicitly requested, add `--flatten` to paint existing values and remove
the widgets and form tree. The source remains unchanged. Do not describe a
flattened PDF as editable, or assume the operation preserves a digital signature.
