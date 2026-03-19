# Xpert Plugin: MarkItDown Middleware

`@xpert-ai/plugin-markitdown` adds document-to-Markdown conversion support to Xpert agents by bootstrapping Microsoft's [MarkItDown](https://github.com/microsoft/markitdown) inside the agent sandbox and teaching the agent how to use it through `sandbox_shell`. The middleware prepares the sandbox runtime, injects MarkItDown usage guidance into the system prompt, and keeps the tool ready for on-demand file conversion.

## Key Features

- Bootstraps `markitdown` via pip inside the sandbox on first use.
- Supports a wide range of file formats: **PDF, DOCX, PPTX, XLSX, HTML, CSV, JSON, XML, ZIP, images (JPEG/PNG), audio (MP3/WAV), EPUB, RSS**, and more.
- Writes embedded skill assets (`SKILL.md` plus reference docs) into the sandbox for agent self-guidance.
- Appends a MarkItDown-specific system prompt so the agent uses `sandbox_shell` with `markitdown` for file conversion.
- Re-checks bootstrap state before MarkItDown shell commands and re-installs automatically if the sandbox container was reset.
- Validates agent drafts and warns when sandbox support or `SandboxShell` is missing.
- Configurable pip extras (`all`, `ocr`, `az-doc-intel`) to control which optional dependencies are installed.

## Quick Start

1. **Register the Plugin**  
   Start Xpert with the package in your plugin list:
   ```sh
   PLUGINS=@xpert-ai/plugin-markitdown
   ```
   The plugin registers the global `MarkItDownPluginModule`.

2. **Enable Sandbox Support**  
   Turn on the agent sandbox feature for the team/agent that will perform file conversion.

3. **Add `SandboxShell` on the Same Agent**  
   This middleware relies on the `sandbox_shell` tool exposed by the `SandboxShell` middleware.

4. **Add the MarkItDown Middleware**  
   In the Xpert console (or agent definition), add a middleware entry with strategy `MarkItDownSkill`.

5. **Optionally Configure the Bootstrap Behavior**  
   Example middleware block:
   ```json
   {
     "type": "MarkItDownSkill",
     "options": {
       "version": "latest",
       "extras": "all",
       "skillsDir": "/workspace/.xpert/skills/markitdown"
     }
   }
   ```

6. **Ask the Agent to Convert Files**  
   Once configured, the agent can convert documents to Markdown:
   ```
   User: Please convert the uploaded report.pdf to Markdown.
   Agent: (runs `markitdown report.pdf > report.md` via sandbox_shell)
   ```

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `version` | string | Version of `markitdown` to install via pip in the sandbox. | `"latest"` |
| `extras` | string | Python extras to install (e.g. `"all"`, `"ocr"`, `"az-doc-intel"`). Use `"all"` for full functionality. | `"all"` |
| `skillsDir` | string | Path inside the sandbox where `SKILL.md` and reference files are written. | `"/workspace/.xpert/skills/markitdown"` |

## Supported File Formats

| Format | Extensions | Notes |
|--------|-----------|-------|
| PDF | `.pdf` | Text extraction, layout preservation |
| Word | `.docx` | Full structure: headings, tables, lists, images |
| PowerPoint | `.pptx` | Slides, speaker notes, embedded content |
| Excel | `.xlsx` | Sheets as Markdown tables |
| HTML | `.html`, `.htm` | Web page content extraction |
| CSV | `.csv` | Converted to Markdown tables |
| JSON | `.json` | Structured representation |
| XML | `.xml` | Structured representation |
| Images | `.jpg`, `.jpeg`, `.png` | EXIF metadata, OCR (with extras) |
| Audio | `.mp3`, `.wav` | Speech-to-text transcription |
| ZIP | `.zip` | Recursively converts contained files |
| EPUB | `.epub` | Book content extraction |
| RSS/Atom | feeds | Feed entry extraction |

## Runtime Behavior

- On first use, the middleware checks `/workspace/.xpert/.markitdown-bootstrap.json` to determine whether the sandbox is already bootstrapped.
- If bootstrap is missing or outdated, it verifies Python/pip availability, installs `markitdown[<extras>]` via pip, writes skill assets, and refreshes the stamp file.
- The middleware appends a system prompt that tells the agent to:
  - use `markitdown` for file-to-Markdown conversion
  - read the sandbox skill file before first use
  - redirect output to a file with `>` for saving results
  - inspect output carefully and summarize results
- When the agent calls `sandbox_shell` with a `markitdown` command, the middleware ensures bootstrap has completed before the command runs.
- Non-MarkItDown `sandbox_shell` commands are passed through unchanged.

## Validation Rules

The plugin contributes draft validation warnings in Xpert when:

- the agent uses `MarkItDownSkill` but sandbox support is disabled
- the agent uses `MarkItDownSkill` without `SandboxShell` on the same agent

## Sandbox Assets

During bootstrap, the plugin writes the following assets into the sandbox:

- `SKILL.md` — comprehensive command reference with quick start, CLI usage, batch patterns, and advanced features
- `references/supported-formats.md` — detailed per-format conversion guidance
- a bootstrap stamp file used to avoid unnecessary reinstallation

## Configuration Precedence

Configuration is resolved in this order, from lowest to highest priority:

1. Built-in defaults
2. Environment variables:
   - `MARKITDOWN_VERSION`
   - `MARKITDOWN_SKILLS_DIR`
   - `MARKITDOWN_EXTRAS`
3. Plugin-level config resolved by the host plugin config resolver
4. Middleware `options`

## Advanced Features

### LLM-based Image Description

If `OPENAI_API_KEY` is set in the sandbox environment, MarkItDown can use an LLM to generate descriptions for images embedded in documents:

```bash
export OPENAI_API_KEY="your-key"
markitdown photo.jpg
```

### Azure Document Intelligence

For enhanced PDF/image processing with Azure Document Intelligence:

```bash
export AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT="https://your-endpoint.cognitiveservices.azure.com/"
export AZURE_DOCUMENT_INTELLIGENCE_KEY="your-key"
markitdown --use-docintel complex-document.pdf
```

To use this feature, set `extras` to `"az-doc-intel"` or `"all"` in the middleware configuration.

## Development & Testing

```bash
pnpm nx build @xpert-ai/plugin-markitdown
pnpm nx test @xpert-ai/plugin-markitdown
```

TypeScript output is emitted to `middlewares/markitdown/dist`.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
