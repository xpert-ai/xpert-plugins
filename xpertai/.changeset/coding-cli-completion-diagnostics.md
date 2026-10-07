---
"@xpert-ai/plugin-agent-runtimes": patch
---

Preserve concrete Qwen/Codex completion failure diagnostics before Computer
cleanup and return them through invocation errors. Keep recovered intermediate
permission failures as diagnostic facts instead of overriding a successful final
CLI receipt. Continue requiring verified protocol completion and process exit 0.
