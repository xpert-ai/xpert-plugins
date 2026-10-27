# Xpert Spaces

An **Assistant capability**, delivered by `@xpert-ai/plugin-spaces`. When creating an Assistant, enable **Collaborative space** under Assistant capabilities, then publish. Existing Assistants can enable it in **Settings → Capabilities**; Studio can still connect the `spaces` middleware manually. Its members then open **协作空间** in **Workbench → Views** and share documents, files and Artifacts. The remote view uses React, the repository's shared shadcn/Radix components, and Tailwind CSS.

- Project membership and roles govern shared content. Entry points also verify the Assistant binding and published Spaces capability; resource access and broadcasts recheck the current Project permissions.
- One idempotently provisioned Space metadata record per Project. Multiple bound Assistants share the same Project files; an Assistant's personal file isolation setting does not create a private copy of the Project.
- Pages use platform Yjs collaboration, comments, checkpoints and human-reviewed AI proposals. Assistant tools can create documents, read, search and propose changes in their bound workspace.
- Platform Workspace Files stores immutable versions; Artifacts keeps resource-bound exports and fixed source versions.
- Optional XLSX editing comes from `@xpert-ai/plugin-office-editor` through the public content editor provider contract.

Requires the **accompanying platform and SDK changes**; the currently published SDK alone does not contain these new capabilities. There is no standalone Cloud Spaces application or separate space sharing ACL. Every Space must bind a Project. Files and snapshots use the projects catalog and projectId; there is no independent Space volume or migration entry point.

Documentation: [overview](docs/index.mdx), [quickstart](docs/quickstart.mdx), [architecture and validation](docs/architecture.mdx), [formulas and child pages](docs/math-subpages.mdx), [live collaboration](docs/collaboration.mdx).

```sh
corepack pnpm exec nx run @xpert-ai/plugin-spaces:build
corepack pnpm exec nx run @xpert-ai/plugin-spaces:typecheck
corepack pnpm exec nx run @xpert-ai/plugin-spaces:test
```

Build bundles the shared UI; run the repository lifecycle harness and metadata check before deployment. No credentials or installed instance ids belong in this package.

The Project can bind an internal knowledge base for keyword indexing and authorized search. Feishu imports create text copies with provenance; source changes do not synchronize automatically. Semantic search configuration, scheduled upkeep, rich DOCX/PPTX editing, cross-node acceptance and broad Office fidelity require separate work.
## 文档导航约定

点击页面先执行 `document.open` 准备资源，再调用 `workbench.content.resolve` 获取注册编辑器，最后通过 `workbench.navigation.open`（`target: workbench.view`）在当前容器打开。两条客户端命令均须在 manifest 声明。不要硬编码 Markdown viewKey、修改宿主 URL，或回退到会打开外层工作区的旧 `workbench.content.open`。`remote/bridge.ts` 保留了响应校验与过期 scope 保护；对应回归见 `tests/content-navigation.test.ts`。
