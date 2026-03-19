---
name: markitdown
description: Converts files and URLs to Markdown. Use when the user needs to extract text from PDF, DOCX, PPTX, XLSX, HTML, images, audio, or other documents and convert them to clean Markdown format.
allowed-tools: Bash(markitdown:*)
---

# File-to-Markdown Conversion with markitdown

## Quick start

```bash
# Convert a local file to Markdown (output to stdout)
markitdown document.pdf

# Save output to a file
markitdown document.pdf > document.md

# Convert from a URL
markitdown https://example.com/page.html

# Pipe input
cat report.docx | markitdown

# Convert with explicit output flag
markitdown document.pptx -o output.md
```

## Supported File Formats

| Format | Extensions | Notes |
|--------|-----------|-------|
| PDF | `.pdf` | Text extraction, layout preservation |
| Word | `.docx` | Full document structure, tables, images |
| PowerPoint | `.pptx` | Slides, speaker notes, embedded content |
| Excel | `.xlsx` | Sheets as Markdown tables |
| HTML | `.html`, `.htm` | Web page content extraction |
| CSV | `.csv` | Converted to Markdown tables |
| JSON | `.json` | Structured representation |
| XML | `.xml` | Structured representation |
| Plain Text | `.txt`, `.md`, `.rst` | Pass-through with minimal processing |
| Images | `.jpg`, `.jpeg`, `.png` | EXIF metadata extraction, OCR if available |
| Audio | `.mp3`, `.wav` | Speech-to-text transcription |
| ZIP | `.zip` | Recursively converts contained files |
| RSS/Atom | `.xml` (feeds) | Feed entry extraction |
| EPUB | `.epub` | Book content extraction |

## CLI Usage

### Basic conversion

```bash
# Convert any supported file
markitdown <input-file>

# Convert from URL
markitdown <url>
```

### Output options

```bash
# Redirect to file
markitdown input.pdf > output.md

# Use -o flag
markitdown input.pdf -o output.md
```

### Piped input

```bash
# Pipe from another command
cat document.html | markitdown
curl -s https://example.com | markitdown
```

### Batch conversion

```bash
# Convert all PDFs in a directory
for f in *.pdf; do markitdown "$f" > "${f%.pdf}.md"; done

# Convert multiple specific files
for f in report.docx slides.pptx data.xlsx; do
  markitdown "$f" > "${f%.*}.md"
done
```

## Advanced Features

### Image description with LLM

If `OPENAI_API_KEY` is set in the environment, markitdown can use an LLM to generate descriptions for images:

```bash
export OPENAI_API_KEY="your-key"
markitdown photo.jpg
```

### Document Intelligence (Azure)

For enhanced PDF/image processing with Azure Document Intelligence:

```bash
export AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT="https://your-endpoint.cognitiveservices.azure.com/"
export AZURE_DOCUMENT_INTELLIGENCE_KEY="your-key"
markitdown --use-docintel complex-document.pdf
```

## Tips

- **Large files**: For very large documents, conversion may take longer. Be patient and let it complete.
- **Tables**: Excel files and HTML tables are converted to proper Markdown table syntax.
- **Images in documents**: Images embedded in DOCX/PPTX are described if LLM support is configured.
- **Error handling**: If a file format is not supported, markitdown will output an informative error message.
- **Chaining**: Combine markitdown output with other tools for further processing:
  ```bash
  markitdown report.pdf | grep "revenue"
  markitdown data.xlsx | head -50
  ```
