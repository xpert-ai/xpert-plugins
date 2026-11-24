# Sources and reuse

- New application implementation: Yu Kai, 2026. License: AGPL-3.0-only; LICENSE is included.
- Existing user-owned A-share project: behavior and data-boundary design from `shadow.py`, `docs/shadow-agents.md` and its tests. Reimplemented the bounded workflow in TypeScript; no original runtime, credentials, private scoring strategy or databases are packaged. The historical report exporter only reads user-selected local files at runtime.
- Xpert plugin contracts and patterns: `xpert-ai/xpert-plugins` main commit `dfad5423205811b3251628ee9bf59a79a4bcbd87`, especially `community/apps/dockyard`. License AGPL-3.0. Used as reference for metadata, Nest registration, scope, TypeORM revision writes, template and View Provider.
- `src/remote/bridge.ts`: adapted from Dockyard remote bridge at that commit, with locale update callback added. License AGPL-3.0.
- `vendor/shadcn-ui/src/`: unmodified selected files from the official `packages/shadcn-ui` at that commit (Button/Input/Textarea/Table/Badge, i18n, theme and utility/style sources). `vendor/shadcn-ui/index.ts` is a build-only export facade; components are not reimplemented. These sources are vendored because the shared package is private/unpublished. Retain upstream notices. Root shared package declares AGPL-3.0; upstream shadcn/Radix dependencies retain their respective licenses.
- Independent delivery root's `tools/remote-view-preview` and `plugin-dev-harness`: copied official verification utilities at the same commit. They are validation tooling, not replacement production host code; do not re-add unchanged upstream utilities in the eventual PR.
- React, TypeORM, Zod, LangChain and build dependencies: installed from their declared public packages, with their package licenses retained in dependencies. Generated browser bundle retains inline legal comments.

No npm publication was performed. Live runtime compatibility was verified on Xpert main 3ddc380ca20373f9113a77411090de3c3da75e37 with SDK/contracts 3.30.2; see docs/validation.md for scope and limitations.
