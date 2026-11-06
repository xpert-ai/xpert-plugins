---
'@xpert-ai/plugin-code-review': patch
---

Read plugin configuration on demand through the host's installation-bound readConfig method before resolving GitHub App credentials. Keep status errors tied to the same configuration read and propagate database failures rather than using a stale reference. Older hosts retain snapshot compatibility.
