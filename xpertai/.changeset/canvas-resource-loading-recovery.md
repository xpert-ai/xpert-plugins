---
'@xpert-ai/plugin-canvas': patch
---

Upgrade tldraw and its schema to 5.6.0, which fixes late font loads after an editor is closed. Bundle the matching official translation catalogs through the public assetUrls API so opening a canvas and switching languages no longer fetch translations from a CDN. Remove the Canvas dependency patches and align AI-created geometry and notes with the new schema. Requires Node.js 22.12 or later.
