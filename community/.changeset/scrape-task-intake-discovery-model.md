---
'@xpert-ai/plugin-scrape-task-intake': patch
---

fix(community): point the scrape-task-intake assistant at a real Discovery model and drop the unused sandbox

The assistant template pinned `copilotModel.model: deepseek-v3`, which InternAI
Discovery does not serve (its DeepSeek models are `deepseek-v4-flash-0731`,
`deepseek-v4-flash-vision` and `deepseek-v4-pro-0813`). It is now
`deepseek-v4-flash-0731`, and the agent node hash is bumped so the change is
picked up on import.

The template also declared `features.sandbox.provider: docker-sandbox`, which
the plugin never uses -- it has no sandbox code. On a platform without a sandbox
plugin that made every assistant execution fail with
`No strategy found for type 'docker-sandbox' for strategy
'SANDBOX_WORKSPACE_MAPPER'`, so the declaration is removed.

Also documents how to configure the org-scoped OpenAI-compatible model provider
for Discovery in `community/env.example` and the plugin README, including that
the base URL must include the `/v1` segment.
