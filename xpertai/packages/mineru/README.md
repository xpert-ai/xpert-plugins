# MinerU Plugin for XpertAI

A powerful PDF to Markdown conversion plugin for the [XpertAI](https://github.com/xpert-ai/xpert) platform, powered by [MinerU](https://mineru.net). This plugin provides seamless integration with MinerU services to extract and convert PDF documents into structured Markdown format with support for OCR, formula recognition, and table extraction.

## Features

- 📄 **PDF to Markdown Conversion**: Convert PDF documents to clean, structured Markdown format
- 🔍 **OCR Support**: Extract text from image-based PDFs using OCR technology
- 📐 **Formula Recognition**: Automatically recognize and preserve mathematical formulas
- 📊 **Table Extraction**: Extract and structure tables from PDF documents
- 🤖 **Agent Toolset Integration**: Use as a built-in toolset in XpertAI agent workflows
- 🔄 **Document Transformer**: Transform documents in knowledge base pipelines
- 🌐 **Multi-language Support**: Support for English and Chinese documents
- 🏢 **Self-hosted Support**: Works with both official MinerU API and self-hosted deployments

## Installation

```bash
pnpm add @xpert-ai/plugin-mineru
# or
npm install @xpert-ai/plugin-mineru
```

### Peer Dependencies

This plugin requires the following peer dependencies to be installed in your host project:

- `@xpert-ai/plugin-sdk`: ^3.6.2
- `@nestjs/common`: ^11.1.6
- `@nestjs/config`: ^4.0.2
- `@metad/contracts`: ^3.6.2
- `@langchain/core`: 0.3.72
- `axios`: 1.12.2
- `zod`: 3.25.67
- `uuid`: 8.3.2

## Quick Start

### 1. Get MinerU API Credentials

1. Sign up for a MinerU account at [mineru.net](https://mineru.net)
2. Obtain your API Key from the MinerU dashboard
3. Note the API base URL (default: `https://mineru.net/api/v4`)

### 2. Configure the Plugin

#### Option A: Via XpertAI Console (Recommended)

1. Navigate to the Built-in Tools section in XpertAI Console
2. Find "MinerU PDF Parser" in the toolset list
3. Click "Authorize" and fill in the configuration:
   - **Base URL**: MinerU API base URL (default: `https://mineru.net/api/v4`)
   - **API Key**: Your MinerU API Key (required)
   - **Enable OCR**: Enable/disable OCR for image-based PDFs (default: Enabled)
   - **Enable Formula Recognition**: Enable/disable formula recognition (default: Enabled)
   - **Enable Table Recognition**: Enable/disable table recognition (default: Enabled)
   - **Document Language**: Select document language - "en" for English, "ch" for Chinese (default: "ch")
   - **Model Version**: Select model version - "pipeline" or "vlm" (default: "pipeline")

#### Option B: Environment Variables

Set the following environment variables in your deployment:

```bash
MINERU_API_BASE_URL=https://mineru.net/api/v4  # Optional, defaults to official URL
MINERU_API_TOKEN=your-api-key-here              # Required
MINERU_SERVER_TYPE=official                     # Optional: 'official' or 'self-hosted'
```

### 3. Register the Plugin

Add the plugin to your XpertAI host service configuration:

```bash
# .env
PLUGINS=@xpert-ai/plugin-mineru
```

The plugin will automatically register the `MinerUPlugin` NestJS module and be available for use in agent workflows.

## Usage

### As a Toolset in Agent Workflows

Once configured, the MinerU toolset is available in your agent workflows. The tool accepts a PDF document URL and returns the converted Markdown content.

**Tool Input:**
```json
{
  "doc_url": "https://example.com/document.pdf"
}
```

**Tool Output:**
- Markdown content with extracted text, formulas, and tables
- Structured metadata including task ID and document information
- Image assets extracted from the PDF

### Configuration Options

#### Toolset Configuration (Authorization Page)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiUrl` | string | `https://mineru.net/api/v4` | MinerU API base URL |
| `apiKey` | string | - | MinerU API Key (required) |
| `isOcr` | string enum | `"true"` | Enable OCR for image-based PDFs (`"true"` or `"false"`) |
| `enableFormula` | string enum | `"true"` | Enable formula recognition (`"true"` or `"false"`) |
| `enableTable` | string enum | `"true"` | Enable table recognition (`"true"` or `"false"`) |
| `language` | string enum | `"ch"` | Document language (`"en"` or `"ch"`) |
| `modelVersion` | string enum | `"pipeline"` | Model version (`"pipeline"` or `"vlm"`) |

> **Note**: Configuration values set in the authorization page serve as defaults. They can be overridden when calling the tool programmatically.

## Architecture

### Components

- **MinerUToolsetStrategy**: Implements `IToolsetStrategy` to register MinerU as a built-in toolset
- **MinerUToolset**: Extends `BuiltinToolset` to provide the PDF parser tool
- **MinerUClient**: Handles communication with MinerU API (both official and self-hosted)
- **MinerUResultParserService**: Parses MinerU response and extracts Markdown content
- **MinerUTransformerStrategy**: Implements document transformation for knowledge base pipelines

### Server Types

The plugin supports two MinerU deployment types:

1. **Official Server** (`https://mineru.net/api/v4`)
   - Requires API Key authentication
   - Uses async task-based workflow
   - Polls for task completion

2. **Self-hosted Server**
   - Can work without authentication (depending on your setup)
   - Supports direct file upload and immediate parsing
   - Caches results locally

The plugin automatically detects the server type based on the API URL.

## Permissions

The plugin requires the following permissions:

- **File System**: `read`, `write`, `list` operations for storing extracted images and assets
- **Integration** (for transformer): Access to MinerU integration configuration

Ensure these permissions are granted in your XpertAI authorization policy.

## Output Format

The plugin returns structured documents with:

- **Markdown Content**: Full document text in Markdown format with proper formatting
- **Metadata**: Includes MinerU task ID, backend version, document language, etc.
- **Assets**: List of extracted images and files with their storage locations
- **Structured Data**: Layout JSON and content list for advanced processing

## Development

### Build

```bash
# Build the plugin
npx nx build @xpert-ai/plugin-mineru

# Build with cache skip
npx nx build @xpert-ai/plugin-mineru --skip-nx-cache
```

### Test

```bash
# Run all tests
npx nx test @xpert-ai/plugin-mineru

# Run specific test file
npx nx test @xpert-ai/plugin-mineru --testFile=mineru.client.spec.ts
```

### Project Structure

```
packages/mineru/
├── src/
│   ├── lib/
│   │   ├── mineru-toolset.strategy.ts    # Toolset strategy implementation
│   │   ├── mineru.toolset.ts             # Toolset class
│   │   ├── mineru.tool.ts                # Tool builder
│   │   ├── mineru.client.ts              # MinerU API client
│   │   ├── result-parser.service.ts      # Result parsing service
│   │   ├── transformer-mineru.strategy.ts # Document transformer
│   │   └── types.ts                      # Type definitions
│   ├── index.ts                          # Plugin entry point
│   └── mineru.plugin.ts                  # NestJS module
├── package.json
└── README.md
```

## Troubleshooting

### Common Issues

1. **"MinerU apiKey is required"**
   - Ensure you've configured the API Key in the authorization page
   - Check that the credentials are properly saved

2. **"MinerU official API requires an access token"**
   - Official MinerU servers require a valid API Key
   - Verify your API Key is correct and has not expired

3. **Connection Refused (Self-hosted)**
   - Verify your self-hosted MinerU server is running
   - Check the API URL is correct
   - Ensure network connectivity

4. **Task Timeout**
   - Large PDFs may take longer to process
   - Check MinerU server logs for processing status
   - Consider using the VLM model for faster processing

## API Reference

### MinerUToolsetConfig

```typescript
interface MinerUToolsetConfig {
  apiUrl?: string;
  apiKey?: string;
  isOcr?: boolean | string;
  enableFormula?: boolean | string;
  enableTable?: boolean | string;
  language?: 'en' | 'ch';
  modelVersion?: 'pipeline' | 'vlm';
}
```

### Tool Input Schema

```typescript
{
  doc_url: string;  // Required: URL of the PDF document to convert
}
```

## License

This project is licensed under the [AGPL-3.0 License](../../../LICENSE).

## Support

- **Documentation**: [MinerU API Docs](https://mineru.net/apiManage/docs)
- **Issues**: [GitHub Issues](https://github.com/xpert-ai/xpert-plugins/issues)
- **Homepage**: [MinerU Website](https://mineru.net)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and updates.
