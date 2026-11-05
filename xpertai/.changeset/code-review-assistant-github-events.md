---
'@xpert-ai/plugin-code-review': minor
---

Add a composable Code review Assistant capability with private pull request reviews and server-side GitHub event automation. Repository rules can use the current Assistant or retain the existing Project pipeline mode.

Diagnose failed or timed-out workflow runs with bounded job logs, evidence-backed findings and private results in the Code Review workbench. Add scoped event subscriptions, duplicate-delivery protection, task recovery and pause/revocation checks. Give Code Review tools a shared icon, including historical tool calls.

Requires the companion platform/SDK release providing trusted trigger scope, supplementary run instructions and Assistant trigger status. Release that platform/SDK first and update this plugin's SDK dependency and lockfile before publishing. When schema synchronization is externally managed, apply `migrations/20261102-assistant-events.sql` after the existing migrations. Existing repository rules retain Project pipeline mode; existing Assistants are not automatically subscribed to GitHub events.
