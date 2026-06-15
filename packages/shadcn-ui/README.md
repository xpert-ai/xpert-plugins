# @xpert-ai/plugin-shadcn-ui

Root shared shadcn/Radix React primitives for Xpert plugin remote component views.

This package lives under `xpert-plugins/packages` so both `community/*` and `xpertai/*` workspaces can depend on the same UI primitives through `@xpert-ai/plugin-shadcn-ui`.

## Usage

Install the theme variables once in the iframe entry before rendering the view:

```ts
import { Button, Input, installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui'

installShadcnThemeVars()
```

The injected `--xps-*` variables prefer host-provided `--xui-*` values and only fall back to local defaults when the host does not provide them.

## Updating From shadcn

Use the shadcn CLI from this package when adding upstream components:

```bash
pnpm --dir packages/shadcn-ui shadcn:preset-b0
pnpm --dir packages/shadcn-ui shadcn:add dialog dropdown-menu tabs tooltip
```

The CLI writes upstream reference files to `src/generated`. `shadcn apply b0` requires an app framework and is not run directly in this library package; the b0 preset is tracked through `components.json`, the `shadcn:preset-b0` decode command, and the host-theme-aware `--xps-*` fallbacks in `src/theme.ts`.

Components exported by this package should remain host-theme-aware wrappers that use `--xps-*` variables, because plugin remote components run inside isolated iframes and cannot rely on the host app's Tailwind build output.
