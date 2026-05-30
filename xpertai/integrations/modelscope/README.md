# @xpert-ai/plugin-modelscope

`@xpert-ai/plugin-modelscope` adds ModelScope Skills as a skill repository source provider for XpertAI.

Once installed, the plugin registers a `modelscope` skill source provider so ModelScope can be selected when registering a skill repository. The provider scans ModelScope skill repositories and collections for directories containing `SKILL.md`, creates skill repository indexes, and installs selected skill packages into the workspace skill directory.

## Repository Options

| Field | Required | Description |
| --- | --- | --- |
| `url` | yes | ModelScope skill or collection URL, for example `https://www.modelscope.cn/skills/@inference-sh/web-search` or `https://www.modelscope.cn/collections/MiniMax/MiniMax-Office-skills`. |
| `path` | no | Directory inside the repository where skills are stored. Defaults to the repository root. |
| `branch` | no | Branch, tag, or commit ref. Defaults to `master`. |

## Credentials

| Field | Required | Description |
| --- | --- | --- |
| `token` | no | ModelScope access token. It is sent as a Bearer token to ModelScope APIs. |

## Development

```bash
pnpm -C xpertai exec nx build @xpert-ai/plugin-modelscope
pnpm -C xpertai exec nx test @xpert-ai/plugin-modelscope
NODE_PATH="$PWD/xpertai/node_modules/.pnpm/node_modules" node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-modelscope
```
