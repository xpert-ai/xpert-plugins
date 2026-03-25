---
name: markitdown-cli
description: Use this skill when the user wants to convert documents, URLs, or typed stdin content to Markdown with the markitdown CLI. It covers local files, URLs, format hints for stdin, batch conversion, third-party plugins, and Azure Document Intelligence workflows.
---

# MarkItDown CLI Usage Guide

MarkItDown is a command-line tool for converting many file and URL inputs into Markdown. It works well for PDFs, Office documents, HTML, feeds, archives, and several optional plugin-backed workflows.

## Basic Usage

```bash
# Convert a file to stdout
markitdown document.pdf

# Save Markdown to a file
markitdown document.pdf > document.md
markitdown document.pdf -o document.md

# Convert a URL
markitdown https://example.com/report.pdf
markitdown https://example.com/article -o article.md

# Read from stdin with an explicit type hint
cat page.html | markitdown -x html
cat payload | markitdown -m text/html
```

## Common CLI Flags

| Flag | Description |
|------|-------------|
| `-o, --output FILE` | Write output to `FILE` instead of stdout |
| `-x, --extension EXT` | Hint the file extension, especially when using stdin |
| `-m, --mime-type MIME` | Hint the MIME type |
| `-c, --charset CHARSET` | Hint the character encoding |
| `-d, --use-docintel` | Use Azure Document Intelligence |
| `-e, --endpoint URL` | Azure Document Intelligence endpoint |
| `-p, --use-plugins` | Enable installed third-party plugins |
| `--list-plugins` | List installed plugins and exit |
| `-v, --version` | Show the installed version |

## Supported Inputs

Typical direct inputs include:

- PDF, DOCX, PPTX, XLSX, XLS, EPUB, MSG
- HTML pages, feed URLs, and some specialized web handlers
- CSV, JSON, XML, plain text, and Markdown
- ZIP archives
- Images and audio when the required optional dependencies are installed

## High-Frequency Patterns

### Batch conversion

```bash
# Convert all DOCX files in the current directory
for f in *.docx; do
  markitdown "$f" -o "${f%.docx}.md"
done

# Convert all XLSX files recursively
find . -name "*.xlsx" -exec sh -c 'markitdown "$1" -o "${1%.xlsx}.md"' _ {} \;
```

### Piping and chaining

```bash
markitdown report.pdf | grep "revenue"
markitdown data.xlsx | head -50
curl -s https://example.com/page.html | markitdown -x html
```

### Stdin hints

When the input comes from stdin, MarkItDown cannot reliably infer the format on its own. Add `-x` or `-m`:

```bash
cat mystery_file | markitdown -x pdf
cat spreadsheet.bin | markitdown -m application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
cat text_payload | markitdown -x csv -c UTF-8
```

## Plugins, OCR, and Azure

- OCR should be treated as a plugin-backed capability rather than an official built-in extra documented here.
- If an OCR plugin is installed, discover it with `--list-plugins` and enable it with `--use-plugins`.
- Azure Document Intelligence is a first-class path for complex scanned documents. Use `-d -e`.
- In Xpert's MarkItDown middleware, the relevant official extras are values such as `all`, `pdf`, `docx`, `pptx`, `xlsx`, `xls`, `outlook`, `az-doc-intel`, `audio-transcription`, and `youtube-transcription`.

```bash
# Discover installed plugins
markitdown --list-plugins

# Use installed plugins, for example an OCR plugin
markitdown --use-plugins scanned.pdf -o scanned.md

# Use Azure Document Intelligence
markitdown -d -e "https://your-resource.cognitiveservices.azure.com/" complex.pdf -o complex.md
```

## Format-Specific Notes

- **PDF**: Text PDFs usually work directly. For scanned PDFs, prefer Azure Document Intelligence or an installed OCR plugin.
- **DOCX / PPTX / XLSX**: Good defaults for headings, lists, slides, and tables, but review the output for complex layouts.
- **HTML / URL**: Works best when the content is either a file path or a fetchable URL. For stdin, add `-x html` or `-m text/html`.
- **Images**: Core behavior is often metadata-oriented. OCR or richer extraction usually depends on installed plugins or additional services.
- **Audio**: Requires optional dependencies such as `audio-transcription` or `all`.

## Troubleshooting

- **Empty output from stdin**: add `-x` or `-m` so MarkItDown knows the input type.
- **Scanned PDF is missing text**: use `-d -e` for Azure Document Intelligence, or enable the installed OCR plugin with `--use-plugins`.
- **A format is unsupported**: verify the input really matches the hinted type and that the relevant optional dependencies are installed.
- **Output is very large**: save it with `-o` or `>` first, then inspect the result with other shell tools.
