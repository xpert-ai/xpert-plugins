---
'@xpert-ai/plugin-tongyi': patch
---

Enable explicit context cache control for supported Tongyi-compatible chat models.

- Apply ephemeral cache control to stable system prompts for supported models.
- Keep model parameter schemas unchanged.
- Avoid duplicate cache markers when a request already contains cache control.
