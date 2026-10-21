---
"@xpert-ai/plugin-code-review": patch
---

Preserve the trusted View host identity and resolve Agent execution identity from each tool invocation when accessing the GitHub connector. This fixes authenticated repository access and source reads when a conversation has not started or the execution is assigned after middleware construction.

Keep View authorization separate from Agent execution context and exclude untrusted runtime scope fields from business inputs.
