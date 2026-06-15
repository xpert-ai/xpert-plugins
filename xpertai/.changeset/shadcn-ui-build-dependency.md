---
"@xpert-ai/plugin-drawio": patch
"@xpert-ai/plugin-excalidraw": patch
"@xpert-ai/plugin-lucidchart": patch
---

Treat the shared shadcn UI package as a build-time workspace dependency so published drawing plugins do not depend on the private UI helper package at runtime.
