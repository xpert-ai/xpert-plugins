# @xpert-ai/plugin-gitcode

`@xpert-ai/plugin-gitcode` adds GitCode as a skill repository source provider for XpertAI.

Once installed, the plugin registers a `gitcode` skill source provider so GitCode can be selected when registering a skill repository. The provider scans GitCode repositories for directories containing `SKILL.md`, creates skill repository indexes, and installs selected skill packages into the workspace skill directory.

## Repository Options

| Field | Required | Description |
| --- | --- | --- |
| `url` | yes | GitCode repository URL, for example `https://gitcode.com/acme/skills-repo`. |
| `path` | no | Directory inside the repository where skills are stored. Defaults to the repository root. |
| `branch` | no | Branch, tag, or commit ref. Defaults to `main`. |

## Credentials

| Field | Required | Description |
| --- | --- | --- |
| `token` | no | GitCode personal access token. It is sent as `access_token` to GitCode APIs. |

## Development

```bash
pnpm -C xpertai exec nx build @xpert-ai/plugin-gitcode
pnpm -C xpertai exec nx test @xpert-ai/plugin-gitcode
NODE_PATH="$PWD/xpertai/node_modules/.pnpm/node_modules" node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-gitcode
```
