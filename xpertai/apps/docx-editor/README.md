# DOCX Editor

Xpert plugin for browser-based `.docx` editing, AI-assisted review, comments, tracked changes, versioning, and Workbench review.

This plugin wraps the upstream Apache-2.0 `@eigenpal/docx-editor` packages and exposes the experience as a Xpert system plugin with:

- A React remote component Workbench built with the shared shadcn UI primitives.
- Agent middleware tools for DOCX reading, comments, tracked changes, formatting, and navigation.
- Tenant-scoped persistence for documents, versions, snapshots, and operations.
- An installable Assistant template and plugin-scoped skill.

## Validation

```bash
pnpm -C xpertai/apps/docx-editor test
pnpm -C xpertai/apps/docx-editor build
pnpm -C plugin-dev-harness build
npx -y node@20 plugin-dev-harness/dist/index.js --workspace ./xpertai/apps/docx-editor --plugin @xpert-ai/plugin-docx-editor --verbose
```
