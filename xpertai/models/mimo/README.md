# Xpert Plugin: Xiaomi MiMo

`@xpert-ai/plugin-mimo` adds the Xiaomi MiMo model provider to XpertAI.

The provider schema, model catalog, ordering, capability metadata, parameters,
pricing metadata, and icons are synchronized from the current Dify
`langgenius/mimo` plugin. The provider supports Xiaomi's pay-per-use endpoint
and the China, Singapore, and Europe Token Plan endpoints exposed by Dify.

## Models

- `mimo-v2.5-pro`
- `mimo-v2.5`
- `mimo-v2-flash`

## Development

```bash
pnpm -C xpertai exec nx test @xpert-ai/plugin-mimo
pnpm -C xpertai exec nx build @xpert-ai/plugin-mimo
pnpm -C xpertai --filter @xpert-ai/plugin-mimo prepack
```
