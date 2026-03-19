# Supported Formats — Detailed Guide

## PDF (.pdf)

MarkItDown extracts text from PDF files while preserving the document structure.

```bash
markitdown report.pdf
markitdown report.pdf > report.md
```

**Notes:**
- Scanned PDFs (image-based) require OCR support. Install with `markitdown[ocr]` extras or use Azure Document Intelligence with `--use-docintel`.
- Multi-column layouts are processed left-to-right, top-to-bottom.
- Tables in PDFs are extracted as Markdown tables when possible.
- Headers and footers are typically included in the output.

---

## Word Documents (.docx)

Full support for Microsoft Word documents including:
- Headings (H1–H6 mapping)
- Paragraphs with formatting (bold, italic)
- Tables (converted to Markdown tables)
- Bulleted and numbered lists
- Embedded images (described with LLM if `OPENAI_API_KEY` is set)
- Hyperlinks

```bash
markitdown contract.docx
```

---

## PowerPoint (.pptx)

Converts presentations to Markdown with one section per slide:
- Slide titles become headings
- Bullet points preserved as lists
- Speaker notes included (when present)
- Embedded images described (with LLM support)
- Tables converted to Markdown tables

```bash
markitdown presentation.pptx
```

---

## Excel (.xlsx)

Each worksheet is converted to a Markdown table:
- Sheet names become section headings
- Cell values preserved
- Formulas are evaluated (showing results, not formulas)
- Multiple sheets are separated by headings

```bash
markitdown financials.xlsx
```

---

## HTML (.html, .htm)

Converts web pages to clean Markdown:
- Strips scripts, styles, and navigation elements
- Preserves semantic structure (headings, lists, tables, links)
- Inline images referenced

```bash
markitdown page.html
markitdown https://example.com/article
```

---

## CSV (.csv)

Converts CSV data directly to Markdown tables:
- First row treated as table header
- All subsequent rows as table body

```bash
markitdown data.csv
```

---

## Images (.jpg, .jpeg, .png)

For images, markitdown can:
1. **Extract EXIF metadata** (camera model, date, GPS coordinates, etc.)
2. **OCR** (when `markitdown[ocr]` extras are installed)
3. **LLM description** (when `OPENAI_API_KEY` is set)

```bash
markitdown photo.jpg
```

---

## Audio (.mp3, .wav)

Speech-to-text transcription using available backends:
- Produces a Markdown document with the transcribed text
- Requires audio processing dependencies (`markitdown[all]`)

```bash
markitdown recording.mp3
```

---

## ZIP Archives (.zip)

Recursively extracts and converts all supported files within the archive:
- Each file gets its own section
- Nested directories are preserved in the heading structure

```bash
markitdown documents.zip
```

---

## RSS/Atom Feeds

Extracts feed entries as a structured Markdown document:
- Feed title as main heading
- Each entry with title, date, summary/content

```bash
markitdown https://example.com/feed.xml
```

---

## EPUB (.epub)

Converts e-book content to Markdown:
- Chapters become sections
- Rich formatting preserved
- Images referenced

```bash
markitdown book.epub
```
