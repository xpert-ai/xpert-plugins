# @xpert-ai/plugin-shadcn-ui

Root shared shadcn/Radix React primitives for Xpert plugin remote component views.

This package lives under `xpert-plugins/packages` so both `community/*` and `xpertai/*` workspaces can depend on the same UI primitives through `@xpert-ai/plugin-shadcn-ui`.

It is a private build-time workspace package. Published plugins should bundle the remote component output and must not depend on this package at runtime.

## Usage

Import the compiled stylesheet once in the iframe entry before rendering the view:

```ts
import { Button, Input } from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
```

The stylesheet maps official shadcn theme variables to host-provided `--xui-*` values and only falls back to local defaults when the host does not provide them.

## Updating From shadcn

Use the shadcn CLI from this package when adding upstream components:

```bash
pnpm --dir packages/shadcn-ui shadcn:preset-b0
pnpm --dir packages/shadcn-ui shadcn:add dialog dropdown-menu tabs tooltip
```

The CLI writes directly to the single source-owned component tree at `src/components/ui`. Review CLI overwrites before committing local component customizations.

Run `pnpm build` after adding components. The package compiles Tailwind utilities to `dist/style.css`, which consuming remote components must import explicitly.
