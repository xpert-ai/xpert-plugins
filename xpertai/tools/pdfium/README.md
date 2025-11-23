# Xpert Plugin: Pdfium

`@xpert-ai/plugin-pdfium` is a PDF conversion toolset plugin for the [Xpert AI](https://github.com/xpert-ai/xpert) agent platform. It equips agents with the ability to convert PDF files into Markdown format, extracting both text and images for easier processing within workflows.

## Installation

```bash
pnpm add @xpert-ai/plugin-pdfium
# or
npm install @xpert-ai/plugin-pdfium
```

> **Note**: This plugin depends on `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `@hyzyla/pdfium`, `pngjs`, and `zod` as peer dependencies. Install these in the host project before enabling the plugin.

## Quick Start

1. **Register the Plugin**  
   Include the package in your plugin list (environment variable or configuration):

   ```sh .env
   PLUGINS=@xpert-ai/plugin-pdfium
   ```

   The plugin bootstraps the `PdfiumModule` NestJS module, registers the toolset, and emits lifecycle logs.

2. **Provision Toolsets for Agents**

   - Xpert Console: add a Built-in Toolset instance and choose `PDF to Markdown`.
   - API: request toolset `pdfium`.

   No credentials or secrets are required, so any authorized agent can immediately create instances.

## Pdfium Toolset

| Field        | Value                                                              |
| ------------ | ------------------------------------------------------------------ |
| Name         | `pdfium`                                                           |
| Display Name | PDF to Markdown / PDF 转 Markdown                                  |
| Category     | `tools`                                                            |
| Description  | Convert PDF files to markdown with extracted text and page images. |
| Config       | No configuration or external integrations are needed.              |

The toolset uses `@hyzyla/pdfium` to render PDF pages and extract text. Images are saved as PNG files.

## Tools

| Tool              | Purpose                                                                               | Input Highlights                                                                                    | Output                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pdf_to_markdown` | Convert a PDF file into a markdown file with extracted text and rendered page images. | `fileUrl`, `filePath`, or `content` (base64/buffer). Optional `fileName` and `scale` (default 2.0). | JSON object containing `group`, `pageCount`, `content` (markdown string), and `files` list. |

### Example Payloads

```json
// PDF to Markdown
{
  "tool": "pdf_to_markdown",
  "input": {
    "fileUrl": "https://example.com/document.pdf",
    "scale": 2.0
  }
}
```

The tool returns a JSON object. Agents typically use the `content` field for the markdown text and `files` for accessing generated images.

## Permissions & Security

- **Network Calls**: Fetches PDF from URL if `fileUrl` is provided.
- **Filesystem**: Writes generated markdown and image files to the workspace volume.
- **Logging**: Only lightweight lifecycle logs are emitted.

## Development & Testing

```bash
npm install
npx nx build @xpert-ai/plugin-pdfium
npx nx test @xpert-ai/plugin-pdfium
```

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
