---
'@xpert-ai/plugin-agent-runtimes': patch
---

Report a confirmed runner exit without a verifiable CLI result as failed, carrying matching descendant-completion evidence so Project tasks can recover. Preserve unknown when process ownership or completion cannot be proven; never infer successful work or replay a task from a missing result.
