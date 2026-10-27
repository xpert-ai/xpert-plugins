---
'@xpert-ai/plugin-xirang': patch
---

Omit unset LLM generation parameters so Tianyi can use its server defaults. Preserve saved assistant overrides, output limits and streaming usage reporting, and stop injecting generation defaults through model parameter schemas or credential validation.

Preserve the exact account API model ID during discovery while reusing matching built-in configuration metadata.
