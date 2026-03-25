---
name: mineru
description: "Convert documents (PDF, Word, PPT, images, HTML) to Markdown using the MinerU cloud API. Use this skill whenever the user wants to parse, extract, or convert a document into Markdown or other text formats, whether from a local file or a URL. Also trigger when the user mentions MinerU, asks to read or extract a PDF/doc/ppt, wants OCR on a scanned document, or needs structured text from any supported file type."
---

# MinerU Document Converter

Convert documents to Markdown (and optionally Docx/HTML/LaTeX) via the MinerU cloud API. This skill wraps a Python CLI script that handles the full workflow: submit, poll, and download results.

## Supported file types

PDF, Doc, Docx, PPT, PPTx, PNG, JPG, JPEG, WebP, GIF, BMP, HTML

## How to use

Run the CLI script through `sandbox_shell` with Python. The script path inside the sandbox is:

```bash
python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py
```

### Converting a URL

```bash
python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --url "https://example.com/paper.pdf"
```

### Converting a local file

```bash
python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file /path/to/document.pdf
```

### Choosing the right model

The `--model` flag selects the parsing engine (only applies to the precise API):

| Model | Best for | Notes |
|-------|----------|-------|
| `pipeline` | General documents (default) | Fast, good baseline |
| `vlm` | Complex layouts, mixed content | Recommended for best quality |
| `MinerU-HTML` | HTML-heavy documents | Specialized for web content |

For best results, default to `--model vlm` unless the user has a reason to prefer speed over quality.

### Common options

| Flag | Purpose | Example |
|------|---------|---------|
| `--url URL` | Parse a document from a URL | `--url "https://..."` |
| `--file PATH` | Parse a local file | `--file ./report.pdf` |
| `--model MODEL` | Select model (`pipeline`, `vlm`, `MinerU-HTML`) | `--model vlm` |
| `--ocr` | Enable OCR for scanned documents | `--ocr` |
| `--pages RANGE` | Parse specific pages only | `--pages 1-10` |
| `--language LANG` | Document language (default: `ch`) | `--language en` |
| `--formats FMT...` | Additional output formats (precise API only) | `--formats docx html` |
| `--agent` | Force using the lightweight API | `--agent` |

### Examples

```bash
# Best quality conversion of a local PDF
python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./report.pdf --model vlm

# OCR a scanned document
python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./scan.pdf --ocr --model vlm

# Convert first 5 pages only, also produce a docx
python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./book.pdf --pages 1-5 --formats docx

# Parse from URL with English language hint
python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --url "https://arxiv.org/pdf/xxx" --language en --model vlm

# Force lightweight API (no token needed, but 10MB / 20 page limit)
python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./small.pdf --agent
```

## API selection logic

The script uses two MinerU APIs with automatic fallback:

1. Precise Parsing API (primary). Uses a MinerU token. The script checks `MINERU_TOKEN`, then `MINERU_TOKEN_FILE`, then the middleware-managed secret file. Supports files up to 200MB / 600 pages, formula and table detection, multiple output formats, and the VLM model.
2. Agent Lightweight API (fallback). No token needed, but limited to 10MB / 20 pages, Markdown-only output, and no formula or table detection.

If this middleware has an API token configured, it securely provisions the token inside the sandbox and the script reads it automatically. Do not hardcode secrets in the command. If no token is configured, let the user know the script will fall back to the lightweight API and its limits.

## Output location

All results are saved under a per-run directory in the current working directory:

- Local files use `mineru_{原文件名去扩展名}` such as `mineru_report/`
- URL inputs use the URL file name when available
- If a URL has no usable file name, the script falls back to `mineru_{task_id}/`
- If the directory already exists, the script appends `_2`, `_3`, and so on

After conversion completes, the script prints the actual saved directory and file paths.

## After conversion

1. Check the script output for the actual `mineru_*` output directory and saved file paths
2. Read the resulting `.md` file and present the content to the user
3. If the result is a `.zip` file from the precise API, mention where it was saved
4. If extra formats were requested, mention those files too

## Troubleshooting

- `MINERU_TOKEN not set`: the precise API needs a token, otherwise the script falls back to the lightweight API
- `Warning: unable to read MINERU_TOKEN_FILE`: the explicit token file path is unreadable, so the script continues without a token
- Timeout: large documents can take several minutes; the script polls for up to 10 minutes
- File too large for lightweight API: ask the user to configure `MINERU_TOKEN` or narrow `--pages`
