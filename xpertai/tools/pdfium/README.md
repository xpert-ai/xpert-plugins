# pdfium

## Tools

### pdf_to_markdown
Convert a PDF file into a markdown file with rendered page images and extracted text.

Input schema fields:
- fileName (optional)
- filePath (optional)
- fileUrl (optional)
- content (optional, base64 string or Buffer/Uint8Array)
- scale (optional render scale, default 2.0)

Output JSON:
```
{
  "pages": <number>,
  "group": "<base name>",
  "markdown": { fileName, filePath, fileUrl?, mimeType },
  "images": [ { fileName, filePath, fileUrl?, mimeType, page } ]
}
```
