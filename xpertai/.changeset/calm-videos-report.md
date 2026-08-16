---
'@xpert-ai/plugin-zhipuai': patch
'@xpert-ai/plugin-siliconflow': patch
'@xpert-ai/plugin-kling': patch
'@xpert-ai/plugin-veo': patch
'@xpert-ai/plugin-volcengine': patch
---

Report asynchronous video generation usage and status to the host runtime for CogVideo, SiliconFlow, Kling, Veo, and Seedance. Reuse host model provider credentials and the SDK's shared Provider HTTP transport, Provider Toolset, and Workspace media contracts for all five toolsets, register Kling and Google Veo as model providers, and publish versioned per-generation, per-second, or output-token pricing rules with explicit free and unpriced behavior.
