# Xpert Plugin: ECharts MCP App

`@xpert-ai/plugin-echarts-mcp-app` is a small MCP Apps test plugin for Xpert and ChatKit. It installs a plugin-managed stdio MCP server with an interactive ECharts dashboard resource and an app-only drilldown tool.

## What it tests

- MCP tool metadata with `_meta.ui.resourceUri`.
- `ui://` resource rendering as `text/html;profile=mcp-app`.
- ChatKit inline MCP App iframe rendering.
- MCP Apps bridge calls from the iframe to `tools/call`.
- App-only tool visibility for drilldown interactions.

## MCP tools

- `echarts_sales_overview`: model-visible tool that returns a sales summary and opens the ECharts MCP App.
- `echarts_sales_drilldown`: app-only tool that returns the next aggregation level for clicks inside the iframe.

## Development

```bash
pnpm --dir examples/echarts-mcp-app run build:app
pnpm nx build @xpert-ai/plugin-echarts-mcp-app
pnpm nx test @xpert-ai/plugin-echarts-mcp-app
```

The MCP App UI is developed as Vanilla TypeScript under `src/app`:

- `src/app/index.html` owns the static HTML shell.
- `src/app/styles.css` owns the view styles.
- `src/app/main.ts` owns the MCP Apps bridge and ECharts interactions.
- `scripts/build-app.mjs` bundles the app with esbuild into `dist/app/index.html`.
- `src/lib/app-html.ts` only reads the built HTML asset for the MCP resource.

In production Xpert runtimes, enable the host feature flag before testing:

```bash
XPERT_MCP_APPS_ENABLED=true
```
