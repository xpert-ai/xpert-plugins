# Xpert shadcn-vue primitives

Shared Vue UI primitives for Xpert remote component bundles. The package follows the shadcn-vue source-ownership model: generated Vue SFC sources stay in this package, and consuming plugins import the compiled package entry.

```ts
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from '@xpert-ai/plugin-shadcn-vue'
import '@xpert-ai/plugin-shadcn-vue/style.css'
```

The package was initialized with the official `shadcn-vue` CLI. Run `pnpm shadcn:add <component>` from this directory to add additional registry components, then export the generated component from `src/index.ts`.

Remote bundles that already provide app-specific theme CSS may import only the component entry and style the emitted `data-slot` nodes locally.
