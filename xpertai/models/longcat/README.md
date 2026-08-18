# Xpert Plugin: LongCat

`@xpert-ai/plugin-longcat` adds the LongCat model provider to XpertAI.

The provider schema, model catalog, capability metadata, parameters, and
pricing metadata are synchronized from Dify's current
`langgenius/longcat` plugin. The retired `longcat-flash-*` models are not
available from LongCat's current API.

## Models

- `LongCat-2.0`

## Development

```bash
pnpm -C xpertai exec nx test @xpert-ai/plugin-longcat
pnpm -C xpertai exec nx build @xpert-ai/plugin-longcat
pnpm -C xpertai --filter @xpert-ai/plugin-longcat prepack
```
