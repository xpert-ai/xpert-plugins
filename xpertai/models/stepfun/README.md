# Xpert Plugin: StepFun

`@xpert-ai/plugin-stepfun` adds the StepFun model provider to XpertAI.

The provider schema, model catalog, ordering, capability metadata, parameters,
pricing metadata, and icons are synchronized from the current Dify
`langgenius/stepfun` plugin. The runtime uses StepFun's OpenAI-compatible
`https://api.stepfun.com/v1` endpoint.

## Models

- `step-3.7-flash`

## Development

```bash
pnpm -C xpertai exec nx test @xpert-ai/plugin-stepfun
pnpm -C xpertai exec nx build @xpert-ai/plugin-stepfun
pnpm -C xpertai --filter @xpert-ai/plugin-stepfun prepack
```
