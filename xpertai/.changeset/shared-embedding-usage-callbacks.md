---
'@xpert-ai/plugin-tongyi': patch
---

Use the Plugin SDK's OpenAICompatibleEmbeddings adapter for authoritative text-embedding usage callbacks instead of a Tongyi-specific metering subclass. Keep native multimodal routing unchanged. Build and deploy with the SDK release introducing OpenAICompatibleEmbeddings; older installed SDKs do not export this adapter.
