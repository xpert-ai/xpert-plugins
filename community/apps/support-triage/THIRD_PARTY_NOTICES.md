# Reuse and licenses

- Xpert plugin SDK and contracts, Xpert plugin repository examples, and the shared `packages/shadcn-ui` package: AGPL-3.0. The module/entity/View/middleware/template integration follows the Dockyard example. `src/remote/bridge.ts` adapts its channel, source/instance validation and request timeout handling, adding typed host theme and locale handling. No Dockyard business logic or UI is included.
- Shared shadcn/Radix primitives: reused from this repository; bundled for the iframe without modifying their component source. Radix and React are MIT; Tailwind CSS and esbuild are MIT.
- TypeORM: MIT. Zod: MIT. Node.js test runner: Node.js license. SQL.js (development preview and tests only): MIT.
- The business schemas, ticket workflow, compare-and-swap persistence, model adapter, Workbench UI, tests and documentation were authored for this plugin with Codex assistance.

The plugin is licensed AGPL-3.0 to match the repository. This list describes the main reused components; dependency lockfiles identify exact installed versions and upstream package licenses remain applicable.
