---
'@xpert-ai/plugin-agent-runtimes': patch
---

Support explicit xpert-task-result-file references after verified CLI completion. Resolve the report through the host runner's optional readTaskResultFile operation, checkpoint before cleanup and fail invalid submissions without exposing rejected contents. Advertise file submission only when the SDK validator and host reader are available; retain the inline protocol without changing artifact export or business acceptance.
