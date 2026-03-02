# Xpert Plugin: Web Tools Middleware

`@xpert-ai/plugin-web-tools` adds web fetching and internet search capabilities to [Xpert AI](https://github.com/xpert-ai/xpert) agents. The middleware provides two LangChain tools — `web_fetch` for retrieving web page content and `web_search` for searching the internet via Exa MCP.

## Key Features

- **web_fetch**: Fetches any publicly accessible URL and returns content as Markdown (default), plain text, or raw HTML.
- **web_search**: Searches the internet via [Exa](https://exa.ai) MCP endpoint with configurable result count and search depth (auto/fast/deep).
- HTML-to-Markdown conversion via TurndownService; HTML-to-text extraction via Cheerio.
- Configurable timeouts (default 30s fetch, 25s search, max 120s) and 5MB response size limit.
- Dual MCP transport support: StreamableHTTP (preferred) with SSE fallback.
- Ships as a global NestJS module that plugs directly into the Xpert agent middleware pipeline.

## Installation

```bash
pnpm add @xpert-ai/plugin-web-tools
# or
npm install @xpert-ai/plugin-web-tools
```

> **Note**: Ensure the host service already provides `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `@langchain/core@^0.3`, `@modelcontextprotocol/sdk`, `cheerio`, `turndown`, `zod`, and `chalk`. These are treated as peer/runtime dependencies.

## Quick Start

1. **Register the Plugin**
   Start Xpert with the package in your plugin list:
   ```sh
   PLUGINS=@xpert-ai/plugin-web-tools
   ```
   The plugin registers the global `WebToolsPlugin` module.
2. **Enable the Middleware on an Agent**
   In the Xpert console (or agent definition), add a middleware entry with strategy `WebTools`.

## Tools Provided

### web_fetch

Fetches and reads the contents of a web page.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | — | The URL to fetch content from |
| `format` | `"markdown"` \| `"text"` \| `"html"` | No | `"markdown"` | Output format |
| `timeout` | number | No | `30000` | Request timeout in milliseconds (max 120000) |

### web_search

Searches the internet for information via Exa MCP.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | The search query |
| `numResults` | number | No | `5` | Number of results to return |
| `type` | `"auto"` \| `"fast"` \| `"deep"` | No | `"auto"` | Search depth |

## Development & Testing

```bash
npm install
npx nx build @xpert-ai/plugin-web-tools
npx nx test @xpert-ai/plugin-web-tools
```

TypeScript artifacts emit to `middlewares/web-tools/dist`. Validate middleware behavior against a staging agent run before publishing.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
