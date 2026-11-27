---
'@xpert-ai/plugin-pptx-editor': patch
---

Fix overlapping text when entering slide text editing by reusing the authored text layout instead of overlaying a generic textarea. Keep browser selection stable during input and preserve paragraph breaks when saving. Reduce the slide navigation width and thumbnail spacing for a more compact presentation workspace.
