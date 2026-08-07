jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  CredentialsValidateFailedError: class extends Error {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  LargeLanguageModel: class {
    createHandleUsageCallbacks() {
      return []
    }

    createHandleLLMErrorCallbacks() {
      return {}
    }
  },
  mergeCredentials: (credentials: Record<string, unknown>, modelProperties?: Record<string, unknown>) => ({
    ...credentials,
    ...modelProperties
  }),
  ModelProvider: class {}
}))

import { AiProviderRole, ICopilotModel } from '@xpert-ai/contracts'
import { HumanMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import { MoonshotProviderStrategy } from '../provider.strategy.js'
import { MoonshotLargeLanguageModel } from './llm.js'
import { createMoonshotChatModel } from './moonshot-chat-model.js'

describe('createMoonshotChatModel', () => {
  it('requests token usage for streaming responses', () => {
    const copilotModel: ICopilotModel = {
      model: 'kimi-k3',
      options: {
        streaming: true
      },
      copilot: {
        role: AiProviderRole.Primary,
        modelProvider: {
          credentials: {
            api_key: 'test-key'
          }
        }
      }
    }
    const llm = new MoonshotLargeLanguageModel(new MoonshotProviderStrategy())
    const model = llm.getChatModel(copilotModel)

    expect(model.invocationParams()).toMatchObject({
      stream_options: {
        include_usage: true
      }
    })
  })

  it('maps final streaming usage to canonical message metadata', async () => {
    const fetchMock = jest.fn(
      async (): Promise<Response> =>
        new Response(
          [
            'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"kimi-k3","choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"},"finish_reason":null}]}',
            '',
            'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"kimi-k3","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
            '',
            'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"kimi-k3","choices":[],"usage":{"prompt_tokens":7264,"completion_tokens":174,"total_tokens":7438,"completion_tokens_details":{"reasoning_tokens":41}}}',
            '',
            'data: [DONE]',
            ''
          ].join('\n'),
          {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream'
            }
          }
        )
    )
    const model = createMoonshotChatModel({
      apiKey: 'test-key',
      model: 'kimi-k3',
      streaming: true,
      streamUsage: true,
      maxRetries: 0,
      configuration: {
        baseURL: 'https://api.moonshot.cn/v1',
        fetch: fetchMock
      }
    })

    const chunks = []
    for await (const chunk of model._streamResponseChunks([new HumanMessage('hi')], {})) {
      chunks.push(chunk)
    }
    const message = chunks.find((chunk) => chunk.message.usage_metadata)?.message

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(message?.usage_metadata).toMatchObject({
      input_tokens: 7264,
      output_tokens: 174,
      total_tokens: 7438,
      output_token_details: {
        reasoning: 41
      }
    })
    expect(message?.response_metadata['usage']).toMatchObject({
      prompt_tokens: 7264,
      completion_tokens: 174,
      total_tokens: 7438
    })
  })

  it('normalizes every JSON schema surface in the final request parameters', () => {
    const model = createMoonshotChatModel({
      apiKey: 'test-key',
      model: 'kimi-k3',
      configuration: {
        baseURL: 'https://api.moonshot.cn/v1'
      }
    })
    const parameters = {
      type: 'object',
      properties: {
        audience: {
          type: 'string',
          enum: ['admins_only', 'workspace_all', 'custom', 'public_link']
        },
        accessMode: {
          $ref: '#/properties/audience'
        }
      }
    }

    const invocationParams = model.invocationParams({
      tools: [
        {
          type: 'function',
          function: {
            name: 'sites_create_and_deploy',
            parameters
          }
        }
      ],
      functions: [
        {
          name: 'sites_create_and_deploy_legacy',
          parameters
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'sites_deployment',
          schema: parameters
        }
      }
    })

    expect(invocationParams).toMatchObject({
      tools: [
        {
          type: 'function',
          function: {
            parameters: {
              properties: {
                accessMode: {
                  $ref: '#/$defs/moonshot_ref_1'
                }
              }
            }
          }
        }
      ],
      functions: [
        {
          parameters: {
            properties: {
              accessMode: {
                $ref: '#/$defs/moonshot_ref_1'
              }
            }
          }
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          schema: {
            properties: {
              accessMode: {
                $ref: '#/$defs/moonshot_ref_1'
              }
            }
          }
        }
      }
    })
  })

  it('normalizes reused Zod schemas through bindTools', () => {
    const model = createMoonshotChatModel({
      apiKey: 'test-key',
      model: 'kimi-k3',
      configuration: {
        baseURL: 'https://api.moonshot.cn/v1'
      }
    })
    const audience = z.enum(['admins_only', 'workspace_all', 'custom', 'public_link'])
    const deployTool = tool(async () => 'deployed', {
      name: 'sites_create_and_deploy',
      description: 'Create and deploy a site',
      schema: z.object({
        audience,
        accessMode: audience
      })
    })

    const boundModel = model.bindTools([deployTool])

    expect(boundModel).toBeInstanceOf(ChatOpenAI)
    if (!(boundModel instanceof ChatOpenAI)) {
      throw new Error('Expected bindTools to return a ChatOpenAI model')
    }
    expect(boundModel.invocationParams()).toMatchObject({
      tools: [
        {
          type: 'function',
          function: {
            name: 'sites_create_and_deploy',
            parameters: {
              properties: {
                accessMode: {
                  $ref: '#/$defs/moonshot_ref_1'
                }
              }
            }
          }
        }
      ]
    })
  })
})
