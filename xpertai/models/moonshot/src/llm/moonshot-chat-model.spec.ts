import { tool } from '@langchain/core/tools'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import { createMoonshotChatModel } from './moonshot-chat-model.js'

describe('createMoonshotChatModel', () => {
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
