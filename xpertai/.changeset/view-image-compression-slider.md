---
'@xpert-ai/plugin-view-image': patch
---

Add middleware-level image compression scaling for `view_image`.

- Expose a `compressionPercent` slider on the middleware node.
- Scale image width and height before model attachment, with `100%` preserving original dimensions.
- Clarify that the slider controls dimensions, not the final file size in KB/MB.
- Keep plugin-level configuration empty.
