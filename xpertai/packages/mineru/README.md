# Xpert Plugin: MinerU

`@xpert-ai/plugin-mineru` is a MinerU document converter plugin for the Xpert plugin platform, providing extraction capabilities from PDF to Markdown and structured JSON. The plugin includes built-in MinerU integration strategies, document conversion strategies, and result parsing services, enabling secure access to the MinerU API in automated workflows, polling task status, and writing parsed content and attachment resources to the platform file system.

## Installation

```bash
pnpm add @xpert-ai/plugin-mineru
# or
npm install @xpert-ai/plugin-mineru
```

> **Note**: This plugin depends on `@xpert-ai/plugin-sdk@^3.6.0`, `@nestjs/common@^11`, `@nestjs/config@^4`, `@metad/contracts@^3.6.0`, `axios@1`, `chalk@4`, `@langchain/core@^0.3.72`, and `uuid@8` as peerDependencies. Please ensure these packages are installed in your host project.

## Quick Start

1. **Prepare MinerU Credentials**  
    Obtain a valid API Key from the MinerU dashboard and confirm the service address (default: `https://mineru.net/api/v4`).

2. **Configure Integration in Xpert**  
    - Via Xpert Console: Create a MinerU integration and fill in the following fields.  
    - Or set environment variables in your deployment environment:
      - `MINERU_API_BASE_URL`: Optional, defaults to `https://mineru.net/api/v4`.
      - `MINERU_API_TOKEN`: Required, used as a fallback credential if no integration is configured.

    Example integration configuration (JSON):

    ```json
    {
      "provider": "mineru",
      "options": {
         "apiUrl": "https://mineru.net/api/v4",
         "apiKey": "your-mineru-api-key"
      }
    }
    ```

3. **Register the Plugin**  
    Configure the plugin in your host service's plugin registration process:

    ```sh .env
    PLUGINS=@xpert-ai/plugin-mineru
    ```

    The plugin returns the NestJS module `MinerUPlugin` in the `register` hook and logs messages during the `onStart`/`onStop` lifecycle.

## MinerU Integration Options

| Field    | Type   | Description                           | Required | Default                      |
| -------- | ------ | ------------------------------------- | -------- | ---------------------------- |
| apiUrl   | string | MinerU API base URL                   | No       | `https://mineru.net/api/v4`  |
| apiKey   | string | MinerU service API Key (keep secret)  | Yes      | —                            |

> If both integration configuration and environment variables are provided, options from the integration configuration take precedence.

## Document Conversion Parameters

`MinerUTransformerStrategy` supports the following configuration options (passed to the MinerU API when starting a workflow):

| Field            | Type    | Default      | Description                                         |
| ---------------- | ------- | ------------ | --------------------------------------------------- |
| `isOcr`          | boolean | `true`       | Enable OCR for image-based PDFs.                    |
| `enableFormula`  | boolean | `true`       | Recognize mathematical formulas and output tags.    |
| `enableTable`    | boolean | `true`       | Recognize tables and output structured tags.        |
| `language`       | string  | `"ch"`       | Main document language, per MinerU API (`en`/`ch`). |
| `modelVersion`   | string  | `"pipeline"` | MinerU model version (`pipeline`, `vlm`, etc.).     |

By default, the plugin creates MinerU tasks for each file to be processed, polls until `full_zip_url` is returned, then downloads and parses the zip package in memory.

## Permissions

- **Integration**: Access MinerU integration configuration to read API address and credentials.
- **File System**: Perform `read/write/list` on `XpFileSystem` to store image resources from MinerU results.

Ensure the plugin is granted these permissions in your authorization policy, or it will not be able to retrieve results or write attachments.

## Output Content

The parser generates:

- Full Markdown: Resource links are automatically replaced to point to actual URLs written via `XpFileSystem`.
- Structured metadata: Includes MinerU task ID, layout JSON (`layout.json`), content list (`content_list.json`), original PDF filename, etc.
- Attachment asset list: Records written image resources for easy association by callers.

The returned `Document<ChunkMetadata>` array currently defaults to a single chunk containing the full Markdown; you can split it as needed.

## Development & Debugging

Run the following commands in the repository root to build and test locally:

```bash
pnpm install
pnpm exec tsc -p xpertai/packages/mineru/tsconfig.lib.json
pnpm exec jest --config xpertai/packages/mineru/jest.config.ts
```

TypeScript build artifacts are output to `xpertai/packages/mineru/dist`. Before publishing, ensure `package.json`, type declarations, and runtime files are in sync.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) in the repository root.
