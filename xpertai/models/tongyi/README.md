# Tongyi for Xpert AI

**Bring Qwen chat, knowledge retrieval, visual understanding, and voice capabilities to your Xpert AI applications.**

`@xpert-ai/plugin-tongyi` connects Xpert AI to Alibaba Cloud Model Studio (DashScope). It makes Tongyi models available to Assistants, Agents, and workflows through Xpert AI's model provider settings, so teams can combine model capabilities with their own knowledge and business tools.

Use it to build an employee assistant, answer questions from a knowledge base, interpret screenshots, turn recordings into summaries, or create an assistant that users can talk to.

## What you can build

### Business and customer service assistants

Use Qwen chat models to answer questions, draft replies, summarize information, and extract structured data. On models that support tool calling, an Agent can use the tools you configure in Xpert AI to look up business records or carry out a workflow.

For example, a support assistant can retrieve a product guide, check an order through a connected tool, and draft a response. An internal assistant can help employees find procedures and prepare reports.

### Knowledge assistants and enterprise search

Combine text embeddings, reranking, and chat generation in a retrieval-augmented generation (RAG) application:

1. Use an embedding model to index text from your knowledge sources in Xpert AI.
2. Retrieve candidate passages for a user's question.
3. Use a reranking model to reorder those passages by relevance.
4. Pass the selected context to a chat model to generate an answer.

This pattern suits product documentation, operating procedures, technical manuals, and internal support. Xpert AI provides the knowledge workflow; this plugin supplies the models used at each stage.

### Visual and document assistance

Choose a vision-capable Qwen model to work with images supplied to an Assistant or workflow. Applications include explaining charts, interpreting screenshots, reviewing product images, and extracting information from document page images.

For example, a user can share a screenshot of an application error and ask for troubleshooting guidance. A document workflow can provide scanned pages as images and ask the model to return key fields in a structured response.

### Recorded audio and spoken content

Use speech recognition to turn recordings into text, then pass the transcript to a chat model for summaries, action items, or classification. Use text-to-speech to turn written responses into spoken output with a selected voice.

Example workflows include:

- **Meeting notes:** recording → transcription → summary and action items.
- **Service call review:** recording → transcription → issue classification and follow-up draft.
- **Spoken briefings:** report text → concise briefing → synthesized speech.

The transcription adapter accepts audio file URLs that the provider can access. The text-to-speech adapter delivers output in streaming mode.

### Realtime voice assistants

The realtime model integration supports live audio conversations, user and assistant transcripts, interruptions, and tool calls through Xpert AI's realtime runtime. It can power a spoken assistant that answers questions and works with the business tools made available to it.

The current realtime adapter targets `qwen3.8-omni-flash-realtime`. It requires a compatible Xpert AI realtime experience and a supported Model Studio workspace endpoint; see the setup notes below.

## Capabilities at a glance

| Capability | Examples in the plugin catalog | Application |
| --- | --- | --- |
| Chat and reasoning | Qwen Plus, Max, Flash, and reasoning variants | Conversation, analysis, writing, and Agent workflows |
| Coding assistance | Qwen Coder models | Code explanation, generation, and technical assistance |
| Visual understanding | Qwen VL models | Image questions, charts, screenshots, and document images |
| Text embeddings | `text-embedding-v3`, `text-embedding-v4` | Semantic retrieval and knowledge indexing |
| Reranking | `gte-rerank-v2`, `qwen3-rerank` | Relevance ordering for retrieved passages |
| Speech recognition | `paraformer-v1`, `paraformer-v2` | Transcription of recorded audio |
| Speech synthesis | `qwen3-tts-flash` | Spoken answers, narration, and briefings |
| Realtime conversation | `qwen3.8-omni-flash-realtime` | Live voice interaction with tool support |

The plugin includes predefined models and supports custom model configuration. Its catalog also contains selected third-party models served through Model Studio. Model availability and features depend on the endpoint, account access, and selected model; a catalog entry alone does not grant access to that model.

## Getting started

1. Have your Xpert AI administrator install and enable `@xpert-ai/plugin-tongyi`.
2. Obtain a Model Studio API key and its corresponding API Host using the [Alibaba Cloud API key guide](https://www.alibabacloud.com/help/en/model-studio/get-api-key).
3. In Xpert AI's model provider settings, select **Tongyi** and enter the credentials below.
4. Select a model for your Assistant or workflow. Configure embedding and reranking models separately when building a knowledge application.
5. Try a representative task, then adjust the model and its available parameters to suit your application.

| Setting | Purpose |
| --- | --- |
| **API Key** (`dashscope_api_key`) | Authenticates requests to Model Studio. |
| **API Host** (`api_host`) | Uses the host supplied for your account or workspace. Enter the host only, optionally prefixed with `https://`, without an API path. An explicit host takes precedence over the international endpoint setting. |
| **Use International Endpoint** (`use_international_endpoint`) | When API Host is empty, selects the plugin's international DashScope endpoint instead of its default China endpoint. |

Use credentials for the region and workspace that serve your chosen model. Alibaba Cloud documents the regional API key requirements in its [API key guide](https://www.alibabacloud.com/help/en/model-studio/get-api-key).

### Realtime setup

Set **API Host** to your actual Model Studio workspace host in Beijing or Singapore, such as `YOUR_WORKSPACE.cn-beijing.maas.aliyuncs.com` or `YOUR_WORKSPACE.ap-southeast-1.maas.aliyuncs.com`. Replace `YOUR_WORKSPACE` with the value supplied by Model Studio, then select `qwen3.8-omni-flash-realtime` in a realtime-enabled Xpert AI experience.

The international endpoint switch by itself does not configure realtime access. The current realtime adapter specifically accepts workspace hosts in these two regions.

## Model controls

Depending on the selected model, Xpert AI exposes controls for response length, sampling, thinking mode, thinking budget, web search, and structured output. Chat responses support streaming, and compatible models can stream tool calls.

Start with the model's defaults and evaluate it on examples from your application. Enable vision, tool calling, reasoning, or structured output only on models that support the capability. For custom models, configure the actual model identifier, context size, output limits, and tool-calling support offered by your endpoint.

## Learn more

- [Alibaba Cloud Model Studio overview](https://www.alibabacloud.com/help/en/model-studio/what-is-model-studio)
- [Obtain a Model Studio API key](https://www.alibabacloud.com/help/en/model-studio/get-api-key)
- [Plugin model catalog](./src/)

## License

AGPL-3.0.
