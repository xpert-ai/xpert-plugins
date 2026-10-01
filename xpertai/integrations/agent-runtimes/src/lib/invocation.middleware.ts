import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  AgentMiddlewareStrategy,
  AgentInvocationRuntimeCapability,
  type IAgentMiddlewareStrategy,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'

const Options = z
  .object({
    bindings: z
      .array(
        z.object({
          id: z.string().uuid(),
          name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
          description: z.string().min(1).max(2000),
          mode: z.enum(['wait', 'background']).default('wait')
        })
      )
      .min(1)
      .max(32)
  })
  .strict()
  .refine(
    (value) => new Set(value.bindings.map((item) => item.name)).size === value.bindings.length,
    'Tool names must be unique'
  )
type Options = z.infer<typeof Options>

/** Presentation adapter only: identity, resolution, execution and waiting belong to the host. */
@Injectable()
@AgentMiddlewareStrategy('AgentInvocation')
export class AgentInvocationMiddleware implements IAgentMiddlewareStrategy<Options> {
  readonly meta: TAgentMiddlewareMeta = {
    name: 'AgentInvocation',
    label: { en_US: 'Agent invocation', zh_Hans: '智能体调用' },
    description: { en_US: 'Invoke administrator-approved Agent runtime bindings.' },
    configSchema: {
      type: 'object',
      properties: {
        bindings: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_]{0,63}$' },
              description: { type: 'string' },
              mode: { type: 'string', enum: ['wait', 'background'], default: 'wait' }
            },
            required: ['id', 'name', 'description'],
            additionalProperties: false
          }
        }
      },
      required: ['bindings'],
      additionalProperties: false
    }
  }
  createMiddleware(options: Options, context: IAgentMiddlewareContext) {
    const configuration = Options.parse(options)
    const api = context.runtime.capabilities.require(AgentInvocationRuntimeCapability)
    return {
      name: 'AgentInvocation',
      tools: configuration.bindings.map((binding) =>
        tool(
          async ({ prompt }, config) => {
            const callId = config.toolCall?.id ?? config.configurable?.tool_call_id
            if (typeof callId !== 'string' || !callId || !api.resolve)
              throw new Error('Agent invocation requires a host tool call scope')
            const target = await api.resolve(binding.id)
            let invocation = await api.start({ target, callId, input: { prompt } })
            if (binding.mode === 'wait') {
              if (!api.awaitResult) throw new Error('This host does not support checkpoint waiting')
              invocation = await api.awaitResult(invocation.id)
            }
            return JSON.stringify({
              invocationId: invocation.id,
              status: invocation.status,
              result: invocation.result,
              error: invocation.error
            })
          },
          {
            name: binding.name,
            description: binding.description,
            schema: z.object({ prompt: z.string().min(1).max(100000) })
          }
        )
      )
    }
  }
}
