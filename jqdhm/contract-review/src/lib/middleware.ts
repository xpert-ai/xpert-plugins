import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { ContractServiceClient } from './client.js'
import { FEATURE, MIDDLEWARE_NAME, TOOL_NAMES } from './constants.js'
import { candidatesSchema, emptyInputSchema, idInputSchema, publicError } from './contracts.js'
import { scopeFromAgent } from './scope.js'

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class ContractReviewMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Contract information', zh_Hans: '合同资料整理' },
    description: { en_US: 'Extract quoted candidate fields for human review.', zh_Hans: '提取有原文依据的候选字段，交由人工核对。' },
    icon: { type: 'font', value: 'ri-file-text-line' }, features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
  constructor(private readonly client: ContractServiceClient) {}
  getToolNames() { return [...TOOL_NAMES] }
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope = scopeFromAgent(context)
    const respond = async (operation: () => Promise<unknown>) => {
      try { return JSON.stringify(await operation()) }
      catch (error) { return JSON.stringify({ success: false, ...publicError(error) }) }
    }
    return {
      name: MIDDLEWARE_NAME,
      tools: [
        tool((input) => respond(() => this.client.candidates(scope, input)), {
          name: TOOL_NAMES[0], schema: candidatesSchema,
          description: 'Submit candidate fields for an already saved contractId. Read original text with contract_review_get first. Every non-null value must be an exact substring of its evidence, and evidence must quote the stored original text verbatim. All six field keys are required; missing information is null. Cannot replace original text, human edits or confirmed records. This does not approve or confirm a contract.'
        }),
        tool((input) => respond(() => { emptyInputSchema.parse(input); return this.client.list(scope) }), {
          name: TOOL_NAMES[1], schema: emptyInputSchema, description: 'List the latest 50 contract summaries accessible to the current trusted assistant and user.'
        }),
        tool((input) => respond(() => this.client.get(scope, input)), {
          name: TOOL_NAMES[2], schema: idInputSchema, description: 'Read one accessible contract with original text, candidate fields, warnings and audit history.'
        }),
        tool((input) => respond(() => this.client.summary(scope, input)), {
          name: TOOL_NAMES[3], schema: idInputSchema, description: 'Read a copyable contract information summary. DRAFT means pending human review. CONFIRMED means the human confirmed extracted information, not legal approval.'
        })
      ]
    }
  }
}
