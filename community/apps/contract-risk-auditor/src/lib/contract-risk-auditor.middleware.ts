import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  CONTRACT_RISK_AUDITOR_FEATURE,
  CONTRACT_RISK_AUDITOR_MIDDLEWARE_NAME,
  CONTRACT_RISK_ICON
} from './constants.js'
import { ContractRiskAuditorService } from './contract-risk-auditor.service.js'
import type { ContractAuditorScope } from './types.js'

function scopeFromContext(context?: IAgentMiddlewareContext): ContractAuditorScope {
  return {
    userId: context?.userId,
    tenantId: context?.tenantId,
    organizationId: context?.organizationId
  }
}

const auditContractSchema = z.object({
  id: z.string().optional().describe('合同审查单唯一ID（可选，缺省则自动生成）'),
  title: z.string().optional().describe('合同标题或采购项目名称'),
  content: z.string().min(1).describe('需要进行法务合规排查的合同条款完整文本')
})

const acceptRevisionSchema = z.object({
  recordId: z.string().min(1).describe('合同审查单ID'),
  riskId: z.string().min(1).describe('需要采纳修订建议的风险条款ID')
})

const ignoreRiskSchema = z.object({
  recordId: z.string().min(1).describe('合同审查单ID'),
  riskId: z.string().min(1).describe('需要忽略的风险条款ID')
})

@Injectable()
@AgentMiddlewareStrategy(CONTRACT_RISK_AUDITOR_MIDDLEWARE_NAME)
export class ContractRiskAuditorMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: CONTRACT_RISK_AUDITOR_MIDDLEWARE_NAME,
    label: {
      en_US: 'Contract Risk Auditor Tools',
      zh_Hans: '合同风险排查工具'
    },
    icon: {
      type: 'svg',
      value: CONTRACT_RISK_ICON
    },
    description: {
      en_US: 'Scan contract clauses for legal risks and provide anti-breach revision recommendations.',
      zh_Hans: '扫描合同条款中的法律风险与霸王条款，并提供防违约修订建议。'
    },
    features: [CONTRACT_RISK_AUDITOR_FEATURE],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: ContractRiskAuditorService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: CONTRACT_RISK_AUDITOR_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => {
            const result = await this.service.auditContract(scope, input.id || '', input.content, input.title)
            return JSON.stringify(result, null, 2)
          },
          {
            name: 'contract_audit_text',
            description: '扫描合同条款文本，识别违约金过高、单方解约、管辖不利等法律风险并生成修订建议',
            schema: auditContractSchema
          }
        ),
        tool(
          async (input) => {
            const result = await this.service.acceptRevision(scope, input.recordId, input.riskId)
            return JSON.stringify(result, null, 2)
          },
          {
            name: 'contract_accept_revision',
            description: '采纳某项条款的修订建议，自动替换涉险原文语句',
            schema: acceptRevisionSchema
          }
        ),
        tool(
          async (input) => {
            const result = await this.service.ignoreRisk(scope, input.recordId, input.riskId)
            return JSON.stringify(result, null, 2)
          },
          {
            name: 'contract_ignore_risk',
            description: '忽略某项风险条款标记',
            schema: ignoreRiskSchema
          }
        )
      ]
    }
  }
}
