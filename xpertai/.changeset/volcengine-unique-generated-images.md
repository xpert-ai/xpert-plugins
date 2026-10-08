---
"@xpert-ai/plugin-volcengine": patch
---

Give every Seedream image-generation invocation unique, readable output filenames. Concurrent calls in one Project and retries with repeated tool-call IDs preserve each returned artifact instead of overwriting another generated image.
