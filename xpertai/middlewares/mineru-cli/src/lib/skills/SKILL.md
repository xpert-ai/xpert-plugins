---
name: mineru
description: "Parse PDFs, Word docs, PPTs, and images into clean Markdown using MinerU's VLM engine. Use when: (1) Converting PDF/Word/PPT/image to Markdown, (2) Extracting text/tables/formulas from documents, (3) Batch processing multiple files, (4) Saving parsed content to Obsidian or knowledge bases. Supports LaTeX formulas, tables, images, multilingual OCR, and async parallel processing."
homepage: https://mineru.net
metadata:
  openclaw:
    emoji: "📄"
    requires:
      bins: ["python3"]
      env:
        - name: MINERU_TOKEN
          description: "MinerU API key — get free token at https://mineru.net/user-center/api-token (2000 pages/day, 200MB/file)"
    install:
      - id: pip
        kind: pip
        packages: ["requests", "aiohttp"]
        label: "Install Python dependencies (pip)"
---

# MinerU Document Parser

Convert PDF, Word, PPT, and images to clean Markdown using MinerU's VLM engine — LaTeX formulas, tables, and images all preserved.

## Setup

The middleware injects `MINERU_TOKEN` automatically. Do not pass API keys on the command line or export them manually during normal use.

**Preferred command via middleware wrapper:**

```bash
mineru --file ./document.pdf --output ./output/
```

If you need to inspect the original upstream scripts, they are available under `scripts/`. In this middleware package they still rely on the injected `MINERU_TOKEN`, so invoke them without passing secrets in CLI flags.

**Limits:** 2000 pages/day · 200 MB per file · 600 pages per file

## Supported File Types

| Type | Formats |
|------|---------|
| PDF | `.pdf` — papers, textbooks, scanned docs |
| Word | `.doc`, `.docx` — reports, manuscripts |
| PPT | `.pptx` — slides, presentations |
| Image | `.jpg`, `.jpeg`, `.png` — OCR extraction |
| HTML | `.html` — web pages |

## Commands

### Single File

```bash
mineru --file ./document.pdf --output ./output/
```

### Batch Directory with Resume

```bash
mineru --dir ./docs/ --output ./output/ --workers 10 --resume
```

### Direct to Obsidian

```bash
mineru --dir ./pdfs/ --output "~/Library/Mobile Documents/com~apple~CloudDocs/Obsidian/VaultName/" --resume
```

### Chinese Documents

```bash
mineru --dir ./papers/ --output ./output/ --language ch
```

### Complex Layouts

```bash
mineru --file ./paper.pdf --output ./output/ --model-version vlm
```

## CLI Options

```
--dir PATH          Input directory
--file PATH         Single file
--output PATH       Output directory
--workers N         Concurrent workers
--resume            Skip already processed files
--model-version M   Model version: pipeline | vlm | MinerU-HTML
--language LANG     Document language
--ocr               Enable OCR for scanned documents
```

The upstream scripts under `scripts/` expose additional parsing options such as `--page-ranges` and `--extra-formats`. Prefer the managed `mineru` wrapper unless you explicitly need those script-level flows.

## Model Version Guide

| Model | Speed | Accuracy | Best For |
|-------|-------|----------|----------|
| `pipeline` | Fast | High | Standard docs, most use cases |
| `vlm` | Slow | Highest | Complex layouts, multi-column, mixed text+figures |
| `MinerU-HTML` | Fast | High | Web-style output, HTML-ready content |

## Script Selection

| Script | Use When |
|--------|----------|
| `mineru_runner.py` | Default middleware entrypoint, no extra Python packages |
| `mineru_v2.py` | Original async parallel variant |
| `mineru_async.py` | Fast network, maximum throughput |
| `mineru_stable.py` | Unstable network, sequential retry-heavy flow |
| `mineru_batch.py` | Batch-oriented script with retry logic |
| `mineru_parallel.py` | Threaded parallel processing |
| `mineru_obsidian.py` | Direct output to Obsidian vault |
| `mineru_api.py` | Mixed URL/file API helper |

## Output Structure

The managed wrapper writes one directory per input file plus a root `manifest.json`:

```text
output/
├── manifest.json
└── document-name-<stable-id>/
    ├── full.md
    ├── result.zip
    └── extracted/
```

The stable suffix prevents collisions when different source folders contain files with the same name. Some upstream scripts may emit a slightly different layout.

## Error Handling

- Use `--resume` to continue interrupted batches
- Failed files are recorded in `manifest.json`
- Repeated `waiting-file` usually means upload did not complete
- `failed` task state means inspect `err_msg` before retrying

## API Reference

For detailed API documentation, see [references/api_reference.md](references/api_reference.md).
