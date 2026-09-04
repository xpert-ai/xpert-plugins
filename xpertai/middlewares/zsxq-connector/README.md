# Xpert Knowledge Planet connector

Organization-level Xpert plugin that connects Agents to Knowledge Planet (知识星球) through the official `zsxq-cli` device OAuth flow. It provides bounded account, group, topic, comment, hashtag, footprint, and note tools. Publishing and management tools are disabled by default and require explicit Xpert HITL approval when enabled.

## Development

```bash
pnpm nx run @xpert-ai/plugin-zsxq-connector:typecheck
pnpm nx test @xpert-ai/plugin-zsxq-connector --runInBand
pnpm nx build @xpert-ai/plugin-zsxq-connector
```

The plugin pins `zsxq-cli` to `0.5.1` and verifies the installed CLI version at runtime. See [`docs/index.mdx`](docs/index.mdx) for deployment, security, tool contracts, and operations.
