---
'@xpert-ai/plugin-tongyi': patch
---

Add an opt-in context cache parameter for supported Tongyi-compatible chat models.

- Expose a `Context Cache` toggle in supported model parameter panels.
- Apply explicit ephemeral cache control only when the toggle is enabled.
- Keep existing model behavior unchanged by default.
