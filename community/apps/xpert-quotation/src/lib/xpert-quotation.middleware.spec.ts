jest.mock('@xpert-ai/contracts', () => ({
  WorkflowNodeTypeEnum: { MIDDLEWARE: 'middleware' }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: unknown) => target,
  KnowledgebaseRuntimeCapability: { id: 'platform.knowledgebase' },
  RequestContext: { getOrganizationId: jest.fn() },
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`
}))

import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import {
  XPERT_QUOTATION_CONSUMPTION_TOOL_NAMES,
  XPERT_QUOTATION_COORDINATOR_TOOL_NAMES,
  XPERT_QUOTATION_LINE_WORKER_TOOL_NAMES,
  XPERT_QUOTATION_PRICE_TOOL_NAMES,
  XPERT_QUOTATION_TOOL_NAMES
} from './constants.js'
import {
  XpertQuotationConsumptionMiddleware,
  XpertQuotationCoordinatorMiddleware,
  XpertQuotationLineWorkerMiddleware,
  XpertQuotationMiddleware,
  XpertQuotationMiddlewareFactory,
  XpertQuotationPriceMiddleware
} from './xpert-quotation.middleware.js'
import { XpertQuotationService } from './xpert-quotation.service.js'
import { XpertQuotationWebFallbackService } from './xpert-quotation-web-fallback.service.js'

function createContext(provider: string): IAgentMiddlewareContext {
  return {
    tenantId: 'tenant-test',
    organizationId: 'organization-test',
    userId: 'user-test',
    workspaceId: 'workspace-test',
    xpertId: 'assistant-test',
    agentKey: 'agent-test',
    knowledgebaseIds: [],
    node: {
      id: `node-${provider}`,
      key: `node-${provider}`,
      type: WorkflowNodeTypeEnum.MIDDLEWARE,
      provider
    },
    tools: new Map(),
    runtime: Object.create(null) as IAgentMiddlewareContext['runtime']
  }
}

describe('Xpert Quotation middleware responsibility boundaries', () => {
  const service = Object.create(XpertQuotationService.prototype) as XpertQuotationService
  const webFallback = Object.create(XpertQuotationWebFallbackService.prototype) as XpertQuotationWebFallbackService
  const factory = new XpertQuotationMiddlewareFactory(service, webFallback)

  const cases: Array<{
    strategy: IAgentMiddlewareStrategy<Record<string, never>>
    expectedTools: readonly string[]
    hasWorkbenchContext: boolean
  }> = [
    {
      strategy: new XpertQuotationCoordinatorMiddleware(factory),
      expectedTools: XPERT_QUOTATION_COORDINATOR_TOOL_NAMES,
      hasWorkbenchContext: true
    },
    {
      strategy: new XpertQuotationLineWorkerMiddleware(factory),
      expectedTools: XPERT_QUOTATION_LINE_WORKER_TOOL_NAMES,
      hasWorkbenchContext: false
    },
    {
      strategy: new XpertQuotationConsumptionMiddleware(factory),
      expectedTools: XPERT_QUOTATION_CONSUMPTION_TOOL_NAMES,
      hasWorkbenchContext: false
    },
    {
      strategy: new XpertQuotationPriceMiddleware(factory),
      expectedTools: XPERT_QUOTATION_PRICE_TOOL_NAMES,
      hasWorkbenchContext: false
    },
    {
      strategy: new XpertQuotationMiddleware(factory),
      expectedTools: XPERT_QUOTATION_TOOL_NAMES,
      hasWorkbenchContext: true
    }
  ]

  it.each(cases)('exposes exactly the allowlisted tools for $strategy.meta.name', async ({
    strategy,
    expectedTools,
    hasWorkbenchContext
  }) => {
    const middleware = await strategy.createMiddleware({}, createContext(strategy.meta.name))

    expect(middleware.name).toBe(strategy.meta.name)
    expect(middleware.tools?.map((item) => item.name)).toEqual(expectedTools)
    expect(Boolean(middleware.contextSchema)).toBe(hasWorkbenchContext)
  })

  it('partitions every current tool across the four role-specific providers exactly once', () => {
    const roleTools = [
      ...XPERT_QUOTATION_COORDINATOR_TOOL_NAMES,
      ...XPERT_QUOTATION_LINE_WORKER_TOOL_NAMES,
      ...XPERT_QUOTATION_CONSUMPTION_TOOL_NAMES,
      ...XPERT_QUOTATION_PRICE_TOOL_NAMES
    ]

    expect(new Set(roleTools).size).toBe(roleTools.length)
    expect([...roleTools].sort()).toEqual([...XPERT_QUOTATION_TOOL_NAMES].sort())
  })

  it('marks only the compatibility provider as deprecated', () => {
    expect(cases.slice(0, 4).every(({ strategy }) => strategy.meta.deprecated !== true)).toBe(true)
    expect(cases[4].strategy.meta.deprecated).toBe(true)
  })

  it('accepts publisher-specific quota codes for web-backed breakdowns', async () => {
    const strategy = new XpertQuotationLineWorkerMiddleware(factory)
    const middleware = await strategy.createMiddleware({}, createContext(strategy.meta.name))
    const webTool = middleware.tools?.find((item) => item.name === 'xpert_quotation_recommend_web_quota_breakdown')

    expect(webTool).toBeDefined()
    expect(() => webTool?.schema.parse({
      quotationId: '9a6b0f96-0017-4494-91fc-839e0ffc0cda',
      lineId: '7d3a5a13-0a49-4cc3-83d0-946af07de146',
      components: [{
        quotaCode: '鄂修缮装饰-2020-拆除-金属门窗',
        quotaName: '金属门窗拆除',
        quotaUnit: '10m2',
        coveredWorkScopes: ['铝合金门窗拆除'],
        confidence: 0.75,
        rationale: '来源与工作内容一致。',
        differences: [],
        resources: [{
          category: '人工',
          code: '综合工日',
          name: '综合工日',
          unit: '工日',
          consumption: '1.167'
        }],
        sources: [{
          title: '湖北省房屋修缮工程消耗量定额及全费用基价表宣贯资料',
          url: 'http://www.czqz.org.cn/upload_fck/20241023/17296512151887622430.pdf',
          quote: '计量单位：10m2；综合工日 工日 1.167。'
        }]
      }],
      uncoveredWorkScopes: [],
      rationale: '没有知识库时使用可复核的网页证据。',
      changeSummary: '新增联网定额拆解提案'
    })).not.toThrow()
  })
})
