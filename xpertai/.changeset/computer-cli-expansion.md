---
"@xpert-ai/plugin-agent-runtimes": minor
---

Add managed Computer runtimes for CodeBuddy 2.161.1, Kimi Code 2.1.1 and
Claude Code 2.1.63. Reuse checkpointed single-prompt execution, scoped recovery,
cancellation, explicit file delivery and public coding activity. Verify native
terminal receipts instead of treating a completion sentence as success.
Kimi tool outcomes remain unknown when the protocol omits them.

Requires the accompanying host CLI profiles and SDK prompt-argument transport;
release together with the contracts/plugin-sdk 3.20.0 host update.
