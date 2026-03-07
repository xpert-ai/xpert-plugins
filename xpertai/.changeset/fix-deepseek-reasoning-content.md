---
"@xpert-ai/plugin-deepseek": patch
"@xpert-ai/plugin-tool-call-limit": patch
---

Fix streaming reasoning_content loss in deepseek-reasoner tool-call turns.

- Manually accumulate `reasoning_content` across stream chunks to prevent null-overwrite during `AIMessageChunk.concat()`
- Add `reasoning_content` field to `ChatCompletionChoice.delta` type
- Move `messagesMapped` computation into non-streaming branch only
- Simplify non-streaming `AIMessage` reconstruction (remove dead else-if)
- Remove deprecated marker from `DeepSeekChatOAICompatReasoningModel`
- Remove `deepseek-coder` model (no longer available on official API)
- Update `deepseek-reasoner` max_tokens to 65536 (default 32768) per R1-0528 limits
