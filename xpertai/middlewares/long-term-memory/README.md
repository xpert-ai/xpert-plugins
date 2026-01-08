# Xpert Plugin: Long-term Memory Middleware

`@xpert-ai/plugin-long-term-memory` retrieves relevant long-term memories from a vector store and injects them into the system prompt for [Xpert AI](https://github.com/xpert-ai/xpert) agents. The middleware searches for both profile memories (user preferences, facts) and Q&A memories (historical questions and answers) to provide context-aware responses.

## Key Features

- Retrieves relevant long-term memories using semantic search from LangGraph's BaseStore.
- Supports two memory types: **Profile** (user attributes, preferences) and **Q&A** (question-answer pairs).
- Configurable relevance thresholds and result limits per memory type.
- Optional score display for debugging and transparency.
- Built-in security: adds instruction hints to prevent prompt injection via stored memories.
- Character truncation to control prompt size.
- XML-style formatting for clean memory injection.
- Deduplication and score-based sorting of search results.
- Optional debug logging for monitoring memory retrieval statistics.

## Installation

```bash
pnpm add @xpert-ai/plugin-long-term-memory
# or
npm install @xpert-ai/plugin-long-term-memory
```

> **Note**: Ensure the host service already provides `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `@nestjs/cqrs@^11`, `@langchain/core@^0.3`, `@langchain/langgraph@^0.4`, `@metad/contracts`, `zod`, and `chalk`. These are treated as peer/runtime dependencies.

## Quick Start

1. **Register the Plugin**  
   Start Xpert with the package in your plugin list:
   ```sh
   PLUGINS=@xpert-ai/plugin-long-term-memory
   ```
   The plugin registers the `LongTermMemoryPlugin` module (non-global).
2. **Enable the Middleware on an Agent**  
   In the Xpert console (or agent definition), add a middleware entry with strategy `LongTermMemoryMiddleware` and provide options as needed.
3. **Configure Memory Types**  
   Example middleware block:
   ```json
   {
     "type": "LongTermMemoryMiddleware",
     "options": {
       "profile": {
         "enabled": true,
         "limit": 5,
         "scoreThreshold": 0.7
       },
       "qa": {
         "enabled": true,
         "limit": 3,
         "scoreThreshold": 0.6
       },
       "wrapperTag": "long_term_memories",
       "includeScore": false,
       "maxChars": 5000,
       "instructionHint": true,
       "enableLogging": false
     }
   }
   ```

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `profile` | object | Configuration for profile memory retrieval. | `{ "enabled": true, "limit": 5, "scoreThreshold": 0 }` |
| `profile.enabled` | boolean | Whether to retrieve profile memories. | `true` |
| `profile.limit` | number | Maximum number of profile memories to retrieve (1-50). | `5` |
| `profile.scoreThreshold` | number | Minimum similarity score (0-1) for profile memories. | `0` |
| `qa` | object | Configuration for Q&A memory retrieval. | `{ "enabled": false, "limit": 3, "scoreThreshold": 0 }` |
| `qa.enabled` | boolean | Whether to retrieve Q&A memories. | `false` |
| `qa.limit` | number | Maximum number of Q&A memories to retrieve (1-50). | `3` |
| `qa.scoreThreshold` | number | Minimum similarity score (0-1) for Q&A memories. | `0` |
| `wrapperTag` | string | XML-like tag name used to wrap injected memories (1-64 chars). | `"long_term_memories"` |
| `includeScore` | boolean | Include similarity scores in the injected memory block. | `false` |
| `maxChars` | number | Truncate the total injected memory text to this many characters. 0 means no truncation. | `0` |
| `instructionHint` | boolean | Add a hint clarifying that memories are data, not instructions. Helps prevent prompt injection. | `true` |
| `customHint` | string | Custom hint text to use instead of the default (max 500 chars). Leave empty to use default. | `""` |
| `enableLogging` | boolean | Log memory retrieval statistics for debugging and monitoring. | `false` |

> Tips  
> - Use `scoreThreshold` to filter out low-relevance memories and reduce noise.  
> - Enable `includeScore` during development to understand retrieval quality.  
> - Set `maxChars` to control prompt size when dealing with large memory collections.  
> - Keep `instructionHint` enabled in production to mitigate prompt injection risks.

## Memory Format

### Profile Memory
Profile memories represent user attributes, preferences, and facts:
```xml
<memory>
  <memoryId>user-123-pref-1</memoryId>
  <profile>User prefers dark mode and technical language.</profile>
</memory>
```

### Q&A Memory
Q&A memories capture historical question-answer pairs:
```xml
<memory>
  <memoryId>qa-456</memoryId>
  <question>What is the company's return policy?</question>
  <answer>Items can be returned within 30 days with receipt.</answer>
</memory>
```

## Middleware Behavior

- **Memory Retrieval**: The middleware searches the LangGraph store using the user's input query. Memories are retrieved from namespaces based on `xpertId` (or `projectId` as fallback).
- **Deduplication**: Results are deduplicated by memory key to avoid redundant information.
- **Sorting**: Memories are sorted by similarity score (highest first) after deduplication.
- **Injection**: Retrieved memories are formatted and injected into the system prompt before model invocation.
- **Security**: An instruction hint is added by default to clarify that memories are read-only data, not executable instructions.

## Store Requirements

This middleware requires a LangGraph `BaseStore` to be available in the runtime. The store can be accessed via:
- `runtime.store` (direct property)
- `runtime.configurable.store` (via configurable)

Memory namespaces follow this structure:
- Profile memories: `[xpertId, "profile"]`
- Q&A memories: `[xpertId, "qa"]`

## Example Usage

### Basic Configuration
Enable profile memories only:
```json
{
  "type": "LongTermMemoryMiddleware",
  "options": {
    "profile": { "enabled": true, "limit": 5 }
  }
}
```

### Advanced Configuration
Use both memory types with quality filtering:
```json
{
  "type": "LongTermMemoryMiddleware",
  "options": {
    "profile": {
      "enabled": true,
      "limit": 10,
      "scoreThreshold": 0.75
    },
    "qa": {
      "enabled": true,
      "limit": 5,
      "scoreThreshold": 0.7
    },
    "includeScore": true,
    "maxChars": 8000,
    "enableLogging": true
  }
}
```

## Development & Testing

```bash
npm install
npx nx build @xpert-ai/plugin-long-term-memory
npx nx test @xpert-ai/plugin-long-term-memory
```

TypeScript artifacts emit to `middlewares/long-term-memory/dist`. Validate middleware behavior against a staging agent run before publishing.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
