# Procurement Quote Comparison

AI 采购比价助手 Agentic App 插件。

## What It Provides

- Agent and Project view extensions for procurement quote comparison workflows.
- React iframe remote component workbench for procurement cases, uploaded documents, comparison results, risks, and recommendations.
- Middleware tools for requirement parsing, supplier quote parsing, item matching, risk saving, and recommendation saving.
- TypeORM entities for procurement comparison cases, source documents, parse jobs, requirement items, supplier quotes, quote items, item matches, risks, and recommendations.
- Manual parse entry points that prepare BOM-style `assistant.chat.send_message` commands with source file references.
- Demo Excel files under `examples/demo-files`.

See [docs/requirements.md](docs/requirements.md) for the demo requirements and design.

## Building

From `community/`:

```sh
pnpm --filter @xpert-ai/plugin-procurement-quote-comparison build
```

## Testing

From `community/`:

```sh
pnpm --filter @xpert-ai/plugin-procurement-quote-comparison test
```

For plugin lifecycle validation from the repository root:

```sh
pnpm -C plugin-dev-harness build
node plugin-dev-harness/dist/index.js \
  --workspace ./community/apps/procurement-quote-comparison \
  --plugin @xpert-ai/plugin-procurement-quote-comparison
```
