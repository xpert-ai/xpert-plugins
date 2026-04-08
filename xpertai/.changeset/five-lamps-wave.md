---
'@xpert-ai/plugin-file-memory': minor
---

Migrate the file memory system into the xpert-plugins workspace as a tracked middleware package.

This release brings over the new file-memory runtime behavior, including:
- first-answer local summary digest injection
- post-first-answer async recall with model-backed selection
- exact recall reads via canonical memory id or relative path
- zero-wait interactive after-agent writeback enqueue
- English writeback prompts with Chinese-on-disk memory formatting rules
