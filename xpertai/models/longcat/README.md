# Xpert Plugin: LongCat

`@xpert-ai/plugin-longcat` adds the LongCat model provider to XpertAI.

The provider schema, model catalog, ordering, capability metadata, parameters,
pricing metadata, and icons are synchronized from the current Dify
`langgenius/longcat` plugin. This intentionally follows Dify's current
`longcat-flash-*` catalog and does not add LongCat 2.0 ahead of Dify.

## Models

- `longcat-flash-chat`
- `longcat-flash-thinking`
- `longcat-flash-thinking-2601`

## Development

```bash
pnpm -C xpertai exec nx test @xpert-ai/plugin-longcat
pnpm -C xpertai exec nx build @xpert-ai/plugin-longcat
pnpm -C xpertai --filter @xpert-ai/plugin-longcat prepack
```
