# Office Editor

Xpert system plugin for editing Univer-native spreadsheets, documents, and presentations with humans and Agents.

This plugin provides:

- A React remote component Workbench powered by Univer OSS.
- A plugin-owned Yjs/Socket.IO collaboration gateway for real-time rooms and update persistence.
- Best-effort OSS import for XLSX, DOCX, and experimental PPTX into Univer-native snapshots.
- Agent middleware tools for creating, reading, queueing, reviewing, and reporting Office document work.
- Tenant-scoped persistence for documents, snapshots, Yjs updates, and operations.
- An Assistant template and plugin-scoped skill.

Version 1 stores Univer snapshots and Yjs updates. XLSX, DOCX, and PPTX import creates new Univer-native documents and does not keep the original binary file. Import is best-effort: advanced Office formatting, charts, macros, tracked changes, masters, animations, and production-grade PPTX compatibility are not guaranteed. Export to XLSX, DOCX, or PPTX is not supported.

## Validation

```bash
pnpm -C xpertai/apps/office-editor test
pnpm -C xpertai/apps/office-editor build
pnpm -C plugin-dev-harness build
npx -y node@20 plugin-dev-harness/dist/index.js --workspace ./xpertai/apps/office-editor --plugin @xpert-ai/plugin-office-editor --verbose
```
