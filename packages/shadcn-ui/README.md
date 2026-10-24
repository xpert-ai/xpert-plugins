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

Use the provided primitives in remote views, including `Select` with `SelectTrigger`,
`SelectValue`, `SelectContent` and `SelectItem`, `Checkbox`, `Tabs`, and the complete
`DialogHeader` / `DialogContent` / `DialogFooter` composition. Native controls and
browser confirmation dialogs are not substitutes. Keep semantic HTML for layout
and editor document content.

Preserve upstream component styling. Configure colors, radius, typography and
density through host theme variables; do not override component selectors in a
plugin stylesheet. Layout classes can constrain dialog width and scrolling or
arrange controls, but must not restyle their surfaces, focus states or title sizes.
The current registry preset is `radix-nova`; the Base UI documentation demonstrates
a different primitive implementation. Do not mix implementations within a view.

An empty Select value means “show the placeholder”. For a selectable root/none
option, use a nonempty UI value and explicitly map it to the domain's empty/null
value. Use `Label htmlFor` with the trigger/checkbox id, and handle Checkbox's
`onCheckedChange` with `value === true` (its other possible state is indeterminate).

## Remote View localization

The `@xpert-ai/plugin-shadcn-ui/i18n` entry provides an isolated i18next instance
per view, host-locale normalization (`zh-Hans` / `zh_CN`, `en` / `en-US`), English
fallback, named interpolation, plurals, and locale-aware `Intl` formatting.
Translations are bundled with the view and do not require a network request.

Keep product copy in `remote/locales/en.json` and `remote/locales/zh-Hans.json`.
Use semantic keys, not source text. Catalog keys must match across languages.

```tsx
import { createRemoteI18n, RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'

export const i18n = createRemoteI18n({ en, 'zh-Hans': zh satisfies Record<keyof typeof en, string> })
export const t = i18n.t

function Actions() {
  useRemoteLocale(i18n)
  return <Button>{t('document.save')}</Button>
}
// Wrap the view root so shared Dialog/Command accessibility text uses the same locale.
const view = <RemoteI18nProvider i18n={i18n}><Actions /></RemoteI18nProvider>
```

Call `i18n.setLocale(message.locale)` inside the bridge's validated parent `init`
handler, independently of query/scope changes. Do not key the React root or
reload document data on locale changes. Menus should store `labelKey` and translate
at render/search time; translating at module evaluation freezes the initial language.
Use `i18n.message` with `useLocalizedMessage` for alerts/toasts, and `i18n.error`
for errors with stable keys. Use `i18n.date`, `i18n.number`, and `i18n.label` for
dates, numbers, and provider-supplied localized labels. Separate editor NodeView
roots must subscribe and unsubscribe explicitly.

Translate complete sentences with named values, not fragments around numbers or
names. Keep generated templates localized when created; never translate or rewrite
existing user documents, titles, code, paths, formulas, or external source content.
Language switching must preserve drafts, selections, pending requests, and sessions.

## Updating From shadcn

Use the shadcn CLI from this package when adding upstream components:

```bash
pnpm --dir packages/shadcn-ui shadcn:preset-b0
pnpm --dir packages/shadcn-ui shadcn:add dialog dropdown-menu tabs tooltip
```

The CLI writes directly to the single source-owned component tree at `src/components/ui`. Review CLI overwrites before committing local component customizations.

Run `pnpm build` after adding components. The package compiles Tailwind utilities to `dist/style.css`, which consuming remote components must import explicitly.
