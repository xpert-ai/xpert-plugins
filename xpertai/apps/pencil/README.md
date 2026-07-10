# Pencil Agentic App

Pencil is packaged here as an Xpert Agentic App plugin. It provides:

- Pencil design documents with tenant and organization scoped persistence
- Reviewable working copies, saved versions, action logs, and failure reports
- Agent middleware tools for creating, reading, editing, importing, exporting, and versioning documents
- A Workbench remote component for human review and operational actions
- A generated revenue dashboard data case with nested auto-layout, grid, wrapping cards, charts, and tables
- An Assistant template and skill for one-step setup

## Development

```bash
pnpm --filter @xpert-ai/plugin-pencil test
pnpm --filter @xpert-ai/plugin-pencil build
pnpm --filter @xpert-ai/plugin-pencil prepack
```
