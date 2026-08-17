import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

type DslNode = {
  type: string
  key: string
  entity: {
    key: string
    leaderKey?: string
    provider?: string
    prompt?: string
    tools?: Record<string, boolean>
    knowledgebaseIds?: string[]
    options?: { disableMessageHistory?: boolean }
  }
}

type DslConnection = {
  type: string
  key: string
  from: string
  to: string
  required?: boolean
}

type TemplateDsl = {
  team: {
    version: string
    agent: { key: string }
    agentConfig?: { mute?: string[][] }
    knowledgebases?: unknown[]
  }
  nodes: DslNode[]
  connections: DslConnection[]
}

const coordinatorTools = [
  'xpert_quotation_get_current_workbench_context',
  'xpert_quotation_get_summary',
  'xpert_quotation_inspect_workbook',
  'xpert_quotation_start_matching',
  'xpert_quotation_list_issues',
  'xpert_quotation_review_quota_breakdown',
  'xpert_quotation_review_resource_price',
  'xpert_quotation_calculate_comprehensive_rate',
  'xpert_quotation_apply_patch'
]

const lineWorkerTools = [
  'xpert_quotation_propose_quota_breakdown',
  'xpert_quotation_recommend_web_quota_breakdown'
]
const consumptionTools = ['xpert_quotation_search_quota_components']
const priceTools = [
  'xpert_quotation_search_resource_prices',
  'xpert_quotation_recommend_resource_price',
  'xpert_quotation_recommend_web_resource_price',
  'xpert_quotation_search_knowledge_prices',
  'xpert_quotation_recommend_knowledge_price',
  'xpert_quotation_mark_knowledge_no_match',
  'xpert_quotation_recommend_web_price'
]

describe('Xpert Quotation Assistant template', () => {
  const templatePath = join(__dirname, '..', 'xpert-quotation-assistant.yaml')
  const template = readFileSync(templatePath, 'utf8')
  const dsl = parse(template) as TemplateDsl
  const templateSource = readFileSync(join(__dirname, 'xpert-quotation.templates.ts'), 'utf8')
  const indexSource = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8')
  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string }
  const pluginManifest = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '.xpertai-plugin', 'plugin.json'), 'utf8')
  ) as { version: string }

  const getNode = (key: string) => {
    const node = dsl.nodes.find((item) => item.key === key)
    if (!node) throw new Error(`Missing template node: ${key}`)
    return node
  }

  const enabledTools = (key: string) => Object.entries(getNode(key).entity.tools ?? {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)

  it('uses DSL version 18 and declares the exact four-Agent hierarchy', () => {
    expect(dsl.team.version).toBe('18')
    expect(dsl.team.agent.key).toBe('Agent_XpertQuotation')

    const agents = dsl.nodes.filter((node) => node.type === 'agent')
    expect(agents.map((node) => node.key).sort()).toEqual([
      'Agent_XpertQuotation',
      'Agent_XpertQuotationConsumptionRetriever',
      'Agent_XpertQuotationLineWorker',
      'Agent_XpertQuotationPriceRetriever'
    ].sort())

    expect(getNode('Agent_XpertQuotation').entity.leaderKey).toBeUndefined()
    expect(getNode('Agent_XpertQuotationLineWorker').entity.leaderKey).toBe('Agent_XpertQuotation')
    expect(getNode('Agent_XpertQuotationConsumptionRetriever').entity.leaderKey).toBe('Agent_XpertQuotationLineWorker')
    expect(getNode('Agent_XpertQuotationPriceRetriever').entity.leaderKey).toBe('Agent_XpertQuotationLineWorker')

    expect(dsl.connections.filter((connection) => connection.type === 'agent')).toEqual([
      expect.objectContaining({
        from: 'Agent_XpertQuotation',
        to: 'Agent_XpertQuotationLineWorker',
        required: true
      }),
      expect.objectContaining({
        from: 'Agent_XpertQuotationLineWorker',
        to: 'Agent_XpertQuotationConsumptionRetriever',
        required: true
      }),
      expect.objectContaining({
        from: 'Agent_XpertQuotationLineWorker',
        to: 'Agent_XpertQuotationPriceRetriever',
        required: true
      })
    ])

    expect(getNode('Agent_XpertQuotationLineWorker').entity.options?.disableMessageHistory).toBe(true)
    expect(getNode('Agent_XpertQuotationConsumptionRetriever').entity.options?.disableMessageHistory).toBe(true)
    expect(getNode('Agent_XpertQuotationPriceRetriever').entity.options?.disableMessageHistory).toBe(true)
    expect(dsl.team.agentConfig?.mute).toEqual([
      ['Agent_XpertQuotationConsumptionRetriever'],
      ['Agent_XpertQuotationPriceRetriever']
    ])
  })

  it('connects each Agent to one role-specific quotation provider with an exact tool allowlist', () => {
    const middlewareContracts = [
      {
        agent: 'Agent_XpertQuotation',
        middleware: 'Middleware_XpertQuotationCoordinator',
        provider: 'XpertQuotationCoordinatorMiddleware',
        tools: coordinatorTools
      },
      {
        agent: 'Agent_XpertQuotationLineWorker',
        middleware: 'Middleware_XpertQuotationLineWorker',
        provider: 'XpertQuotationLineWorkerMiddleware',
        tools: lineWorkerTools
      },
      {
        agent: 'Agent_XpertQuotationConsumptionRetriever',
        middleware: 'Middleware_XpertQuotationConsumption',
        provider: 'XpertQuotationConsumptionMiddleware',
        tools: consumptionTools
      },
      {
        agent: 'Agent_XpertQuotationPriceRetriever',
        middleware: 'Middleware_XpertQuotationPrice',
        provider: 'XpertQuotationPriceMiddleware',
        tools: priceTools
      }
    ]

    for (const contract of middlewareContracts) {
      expect(getNode(contract.middleware).entity.provider).toBe(contract.provider)
      expect(enabledTools(contract.middleware)).toEqual(contract.tools)
      expect(dsl.connections).toContainEqual(expect.objectContaining({
        type: 'workflow',
        from: contract.agent,
        to: contract.middleware
      }))
    }

    const enabledQuotationTools = middlewareContracts.flatMap((contract) => enabledTools(contract.middleware))
    expect(new Set(enabledQuotationTools).size).toBe(enabledQuotationTools.length)
    expect(enabledQuotationTools).toHaveLength(19)
    expect(dsl.nodes.some((node) => node.entity.provider === 'XpertQuotationMiddleware')).toBe(false)
  })

  it('keeps knowledgebases isolated to organization-bound leaf Agent configuration', () => {
    expect(dsl.team.knowledgebases ?? []).toEqual([])
    expect(dsl.nodes.filter((node) => node.type === 'knowledge')).toEqual([])
    for (const agentKey of [
      'Agent_XpertQuotation',
      'Agent_XpertQuotationLineWorker',
      'Agent_XpertQuotationConsumptionRetriever',
      'Agent_XpertQuotationPriceRetriever'
    ]) {
      expect(getNode(agentKey).entity.knowledgebaseIds).toEqual([])
    }
    expect(template).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })

  it('connects WebTools only to the two retrieval Agents for evidence fallback', () => {
    const webToolEdges = dsl.connections
      .filter((connection) => connection.to === 'Middleware_WebTools')
      .map((connection) => connection.from)
      .sort()

    expect(webToolEdges).toEqual([
      'Agent_XpertQuotationConsumptionRetriever',
      'Agent_XpertQuotationPriceRetriever'
    ])
    expect(getNode('Agent_XpertQuotationConsumptionRetriever').entity.prompt).toContain('fallbackKind=web')
    expect(getNode('Agent_XpertQuotationPriceRetriever').entity.prompt).toContain('xpert_quotation_recommend_web_resource_price')
  })

  it('has no dangling graph endpoints or Agent cycles', () => {
    const nodeKeys = new Set(dsl.nodes.map((node) => node.key))
    for (const connection of dsl.connections) {
      expect(nodeKeys.has(connection.from)).toBe(true)
      expect(nodeKeys.has(connection.to)).toBe(true)
    }

    const agentEdges = dsl.connections.filter((connection) => connection.type === 'agent')
    const visit = (key: string, path: Set<string>) => {
      expect(path.has(key)).toBe(false)
      const nextPath = new Set(path).add(key)
      for (const edge of agentEdges.filter((item) => item.from === key)) visit(edge.to, nextPath)
    }
    visit(dsl.team.agent.key, new Set())
  })

  it('documents the same permission and delegation boundaries in all four prompts', () => {
    expect(getNode('Agent_XpertQuotation').entity.prompt).toContain('XpertQuotationCoordinatorMiddleware')
    expect(getNode('Agent_XpertQuotationLineWorker').entity.prompt).toContain('XpertQuotationLineWorkerMiddleware')
    expect(getNode('Agent_XpertQuotationConsumptionRetriever').entity.prompt).toContain('XpertQuotationConsumptionMiddleware')
    expect(getNode('Agent_XpertQuotationPriceRetriever').entity.prompt).toContain('XpertQuotationPriceMiddleware')
    expect(getNode('Agent_XpertQuotation').entity.prompt).toContain('explicit user approval')
    expect(getNode('Agent_XpertQuotationLineWorker').entity.prompt).toContain('Never call any retrieval tool directly')
    expect(getNode('Agent_XpertQuotationConsumptionRetriever').entity.prompt).toContain('do not call any price tool')
    expect(getNode('Agent_XpertQuotationPriceRetriever').entity.prompt).toContain('Never review, calculate, or write')
  })

  it('declares cross-plugin Skill ownership and aligned 1.1.0 release metadata', () => {
    expect(templateSource).toContain('pluginName: OFFICE_CLI_PLUGIN_NAME')
    expect(templateSource).toContain("componentKey: 'officecli'")
    expect(templateSource).toContain("targetAgentKey: 'Agent_XpertQuotation'")
    expect(indexSource).toContain('middlewareProviders: [...XPERT_QUOTATION_MIDDLEWARE_PROVIDER_NAMES]')
    expect(packageJson.version).toBe('1.1.0')
    expect(pluginManifest.version).toBe('1.1.0')
  })
})
