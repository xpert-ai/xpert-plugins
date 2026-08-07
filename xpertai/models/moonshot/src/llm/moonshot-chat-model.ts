import { ChatOpenAI, ChatOpenAICompletions, ChatOpenAIFields } from '@langchain/openai'
import { normalizeMoonshotJsonSchema } from './moonshot-json-schema.js'

type MoonshotInvocationParams = ReturnType<ChatOpenAICompletions['invocationParams']>

export class MoonshotChatOpenAICompletions extends ChatOpenAICompletions {
  override invocationParams(
    options?: this['ParsedCallOptions'],
    extra?: {
      streaming?: boolean
    }
  ): MoonshotInvocationParams {
    const params = super.invocationParams(options, extra)
    const responseFormat =
      params.response_format?.type === 'json_schema' && params.response_format.json_schema.schema
        ? {
            ...params.response_format,
            json_schema: {
              ...params.response_format.json_schema,
              schema: normalizeMoonshotJsonSchema(params.response_format.json_schema.schema)
            }
          }
        : params.response_format

    return {
      ...params,
      functions: params.functions?.map((definition) =>
        definition.parameters
          ? {
              ...definition,
              parameters: normalizeMoonshotJsonSchema(definition.parameters)
            }
          : definition
      ),
      tools: params.tools?.map((tool) =>
        tool.type === 'function' && tool.function.parameters
          ? {
              ...tool,
              function: {
                ...tool.function,
                parameters: normalizeMoonshotJsonSchema(tool.function.parameters)
              }
            }
          : tool
      ),
      response_format: responseFormat
    }
  }
}

export function createMoonshotChatModel(fields: ChatOpenAIFields): ChatOpenAI {
  return new ChatOpenAI({
    ...fields,
    completions: new MoonshotChatOpenAICompletions(fields)
  })
}
