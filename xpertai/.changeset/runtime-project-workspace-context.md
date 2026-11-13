---
'@xpert-ai/plugin-agent-runtimes': patch
---

Compose implementation workspace instructions in the Runtime plugin using the host task context and runner receipt, independent of Computer/provider metadata. Preserve review prompts and existing task input. Requires a host/SDK exposing AgentRuntimeContext.projectTask; absence leaves prompts unchanged.
