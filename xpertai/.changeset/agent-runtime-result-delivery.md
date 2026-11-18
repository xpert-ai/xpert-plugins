---
'@xpert-ai/plugin-agent-runtimes': patch
---

Clarify optional report and artifact delivery for agent runtimes. Export an explicitly selected report even when no additional paths are supplied, advertise report transfer only when the runner supports it, and preserve execution completion when report or file delivery fails. Bound ordinary replies by UTF-8 bytes and mark oversized output as truncated instead of returning partial evidence.
