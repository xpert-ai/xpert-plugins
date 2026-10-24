# Markdown editor

Independent Project Workbench editor using React, Tiptap 3.31.4, Yjs, shared shadcn/ui and Tailwind.

The plugin registers `markdown.tiptap` (schema 4) and `markdown.views` / `markdown.editor`. It depends on the platform `platform.content.documents` runtime capability. Spaces enables the entry and registers file resources; all authorization, publication, history and review data remain platform-owned. Assistant handles comments, AI requests and human decisions.

Supported Markdown: paragraphs, headings, emphasis, links, nested ordered/unordered/task lists, quotes, code blocks, rules, GFM tables, inline/display LaTeX formulas and authorized Project images. Tables have one header row, at most 30 columns/200 rows and one single-line paragraph per cell; merged cells, nested blocks, inconsistent column alignment and column widths are rejected. Raw HTML and arbitrary external image URLs remain unsupported; original files are preserved on import failure.

Schema 4 requires the platform's explicit model upgrade support. A writer opening a schema 1, 2 or 3 document publishes a new epoch and retires the old room only after checking its accepted sequence and file hash. The upgrade retains exact file bytes and Yjs state; readers of an unupgraded document must wait for a writer to open it. Clients declare their schema in `document.session`, so an old iframe cannot open an incompatible document after restart. Deploy platform and plugin together, then reload editor tabs; keep any unsaved local drafts.

## Insert menu extension points

`remote/insert-menu.tsx` owns grouped menu entries; `remote/insert-content.ts` owns pure node factories and stable-anchor insertion. Insertions follow the entire selected top-level block without replacing selected text. Add persisted node types in the **shared** `src/schema.ts`, serialization/validation in `src/model.ts`, and round-trip/CRDT tests together. Bump the schema for new node families and explicitly declare supported migrations. The UI must not promise a capability that cannot survive Markdown export.

Hints and callouts use portable blockquote templates. Images, attachments and pages use stable `xpert-resource://v1/{kind}/{providerKey}/{resourceId}` references, resolved with authorization in the same Project. Page navigation uses resolve → navigation in the current Workbench. Shareable document/block URLs use the authorized, side-effect-free `workbench.content.link` command. External links open separately. The Assistant entry appends a quote reference after saving and never sends a message or replaces a draft. Chat references and embedded visualizations remain planned in `../spaces/docs/insert-menu-plan.mdx`.

## Formulas and child pages

`src/math.ts` provides shared math nodes, stable `mathId` values, parsing and bounded KaTeX validation. `remote/math-dialog.tsx` previews/edits formulas and compares the original value before saving. Independent formulas also have `blockId` for Assistant proposals. `src/serialize.ts` preserves literal dollars outside code so ordinary text never becomes a formula on re-import. Fonts ship in the plugin; no CDN is needed.

`remote/subpages.tsx` uses the generic `document.hierarchy` / `document.createChild` platform actions. Optional source-provider hooks own hierarchy semantics; Markdown does not import Spaces or own permissions. Each child is an independent file/resource/document. The creation dialog reuses its request UUID after a failure and navigation stays inside the current Workbench. See [formula and subpage design](../spaces/docs/math-subpages.mdx) for file layout, depth limits, deletion and deployment.

Build and check from `xpertai`:

```sh
corepack pnpm exec nx run @xpert-ai/plugin-markdown-editor:typecheck
corepack pnpm exec nx run @xpert-ai/plugin-markdown-editor:test
corepack pnpm exec nx run @xpert-ai/plugin-markdown-editor:build
```

The platform contracts/SDK in this change must be built and deployed together. A plugin installation alone does not add the required server capability or database schema. Follow the repository lifecycle harness instructions before deployment.

## Editor surface

The editor occupies its own Workbench View without Spaces navigation. The title menu uses a searchable, paginated resource picker to switch between accessible Markdown pages in the current Project. The six-dot control beside text blocks offers type conversion, insertion below, anchored links and deletion. Formatting, insertion and local undo/redo are grouped at the top left; history, Assistant review, Project-protected sharing and close sit at the right.

Root typography consumes `--xui-font-size`; spacing derives from `--xui-density-root-font-size`, and control heights/text use host control/button tokens. Layout references do not override host typography or density. Block links use stable anchors; they never grant access or embed the sender's private conversation ID.
## 文档切换约定

文档下拉菜单先等待当前编辑写入成功，再使用 `workbench.content.resolve` → `workbench.navigation.open` 两阶段协议切换。资源权限和编辑器选择由平台负责，标签页由承载插件的 Workbench 负责。ChatKit 内的 View 导航不会调用外层宿主导航；导航失败时保留当前界面并显示错误。返回 Spaces 使用标准 `workbench.view` target，不使用旧 `extension_view`。见 `remote/bridge.ts`、`remote/document-actions.tsx` 和平台 `docs/content-editor-navigation.md`。


## Live collaboration verification

`tests/collaboration.live.mjs` uses two normal accounts and two Assistants against real APIs and WebSockets. It verifies concurrent same-position edits, remote presence/cursors, task/formula merges, reconnect repair, denied outsiders, fresh sessions and file hashes. Supply `SPACES_TEST_DIRECTORY` pointing to private fixtures; it creates a disposable acceptance document. See [collaboration behavior and validation](../spaces/docs/collaboration.mdx).
