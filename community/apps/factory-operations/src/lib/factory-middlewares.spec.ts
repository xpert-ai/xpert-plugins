import { readFile } from 'node:fs/promises'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { IXpertToolset } from '@xpert-ai/contracts'
import {
  DecoratedAgentMiddlewareStrategy,
  DecoratedToolsetStrategy,
  describeXpertToolProvider,
  type IAgentMiddlewareContext,
  type ToolExecutionContext
} from '@xpert-ai/plugin-sdk'
import { describe, expect, it, vi } from 'vitest'
import plugin from '../index.js'
import {
  FACTORY_MCP_CAPABILITY,
  FACTORY_INSIGHTS_MCP_CAPABILITY,
  FACTORY_INSIGHTS_TOOLSET_COMPONENT_KEY,
  FACTORY_INSIGHTS_TOOLSET_PROVIDER_KEY,
  FACTORY_MIDDLEWARE,
  FACTORY_MUTATION_TOOL_NAMES,
  FACTORY_READ_TOOL_NAMES,
  FACTORY_TOOL,
  FACTORY_TOOLSET_COMPONENT_KEY,
  FACTORY_TOOLSET_PROVIDER_KEY
} from './constants.js'
import { FactoryOperationsInsightsTools, FactoryOperationsTools } from './factory-middlewares.js'
import type { FactoryOperationsService } from './factory-operations.service.js'
import type { FactoryToolEventService } from './factory-tool-events.js'

const CASE_ID = '11111111-1111-4111-8111-111111111111'
const READ_NAMES = new Set<string>(FACTORY_READ_TOOL_NAMES)

describe('Factory Operations decorated business tools', () => {
  it('declares all 12 tools exactly once and preserves all 10 Middleware keys', () => {
    const { provider, insightsProvider } = createProvider()
    const operations = describeXpertToolProvider(provider)
    const insights = describeXpertToolProvider(insightsProvider)
    const descriptors = [operations, insights]
    const names = descriptors.flatMap((descriptor) => descriptor.tools.map((tool) => tool.options.name))
    const middlewareProviders = descriptors.flatMap(
      (descriptor) => descriptor.options.middlewares?.map(({ provider }) => provider) ?? []
    )

    expect(operations.options.provider).toBe(FACTORY_TOOLSET_PROVIDER_KEY)
    expect(operations.options.componentKey).toBe(FACTORY_TOOLSET_COMPONENT_KEY)
    expect(operations.options.slug).toBe('factory-operations-mcp')
    expect(insights.options.provider).toBe(FACTORY_INSIGHTS_TOOLSET_PROVIDER_KEY)
    expect(insights.options.componentKey).toBe(FACTORY_INSIGHTS_TOOLSET_COMPONENT_KEY)
    expect(insights.options.slug).toBe('factory-operations-insights-mcp')
    expect(names).toHaveLength(12)
    expect(new Set(names)).toEqual(new Set(Object.values(FACTORY_TOOL)))
    expect(new Set(middlewareProviders)).toEqual(new Set(Object.values(FACTORY_MIDDLEWARE)))
  })

  it('derives two governed MCP providers and empty legacy BuiltinToolset surfaces', async () => {
    const { provider, insightsProvider } = createProvider()
    const toolsets = await Promise.all(
      [provider, insightsProvider].map((candidate) =>
        new DecoratedToolsetStrategy(candidate, '@xpert-ai/plugin-factory-operations', '0.4.0').create({
          name: 'Factory Operations'
        } as IXpertToolset)
      )
    )
    const definitions = toolsets.flatMap((toolset) => toolset.getMcpCapabilityDefinitions()?.tools ?? [])

    for (const toolset of toolsets) {
      expect(await toolset.initTools()).toEqual([])
      expect(toolset.getMcpCapabilityDefinitions()?.resources).toBeUndefined()
      expect(toolset.getMcpCapabilityDefinitions()?.prompts).toBeUndefined()
      expect(toolset.getMcpCapabilitySource()).toEqual({
        pluginName: '@xpert-ai/plugin-factory-operations',
        pluginVersion: '0.4.0'
      })
    }
    expect(definitions).toHaveLength(12)
    expect(toolsets[0].getMcpCapabilityDefinitions()?.tools).toHaveLength(7)
    expect(toolsets[1].getMcpCapabilityDefinitions()?.tools).toHaveLength(5)
    for (const definition of definitions) {
      expect(definition.requiredContext).toEqual(['tenant', 'organization', 'principal', 'execution'])
      expect(definition.visibility).toEqual(['model'])
      expect(definition.behavior).toEqual(
        READ_NAMES.has(definition.name)
          ? { risk: 'read', sideEffect: 'none', idempotency: 'safe' }
          : {
              risk: 'write',
              sideEffect: 'irreversible',
              idempotency: 'idempotent'
            }
      )
    }
    expect(definitions.filter(({ name }) => FACTORY_MUTATION_TOOL_NAMES.includes(name as never))).toHaveLength(7)
  })

  it('uses invocation scope, validates strict input, and returns compact MCP structuredContent', async () => {
    const { insightsProvider, listCases, wrap } = createProvider()
    const toolset = await new DecoratedToolsetStrategy(insightsProvider).create({
      name: 'Factory Operations'
    } as IXpertToolset)
    const search = toolset.getMcpCapabilityDefinitions()?.tools?.find(({ name }) => name === FACTORY_TOOL.casesSearch)

    await expect(search?.execute({ organizationId: 'model-controlled' }, executionContext())).rejects.toThrow()
    const missingOrganization = executionContext()
    delete missingOrganization.organizationId
    await expect(search?.execute({ search: 'M-07', page: 1, pageSize: 1 }, missingOrganization)).rejects.toThrow(
      'require an organization-scoped invocation context'
    )
    const result = await search?.execute({ search: ' M-07 ', page: 1, pageSize: 1 }, executionContext())

    expect(listCases).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-runtime',
        organizationId: 'organization-runtime',
        workspaceId: 'workspace-runtime',
        projectId: 'project-runtime',
        userId: 'user-runtime',
        assistantId: 'xpert-runtime',
        conversationId: 'conversation-runtime',
        threadId: 'thread-runtime',
        executionId: 'execution-runtime',
        agentKey: 'agent-runtime',
        actorType: 'agent'
      },
      { search: 'M-07', page: 1, pageSize: 1 }
    )
    expect(result?.structuredContent).toMatchObject({
      items: [{ caseId: CASE_ID, caseKey: 'FAC-260902-ABC123' }],
      total: 3,
      hasMore: true
    })
    expect(JSON.stringify(result)).not.toMatch(/internalPath|analysisFacts|timeline|tenant-runtime/)
    expect(wrap).not.toHaveBeenCalled()
  })

  it('derives Agent tools that return JSON text and adds mutation hooks only to Middleware', async () => {
    const { provider, insightsProvider, wrap } = createProvider()
    const insightsDescriptor = describeXpertToolProvider(insightsProvider)
    const coordination = new DecoratedAgentMiddlewareStrategy(
      insightsProvider,
      insightsDescriptor,
      FACTORY_MIDDLEWARE.coordination
    )
    const middleware = await coordination.createMiddleware({}, middlewareContext())
    const search = middleware.tools?.find(
      (candidate) => Reflect.get(candidate, 'name') === FACTORY_TOOL.casesSearch
    ) as StructuredToolInterface
    const output = JSON.parse(String(await search.invoke({ search: 'M-07', page: 1, pageSize: 1 })))

    expect(output.items[0].caseId).toBe(CASE_ID)
    expect(wrap).not.toHaveBeenCalled()

    const descriptor = describeXpertToolProvider(provider)
    const mutation = new DecoratedAgentMiddlewareStrategy(provider, descriptor, FACTORY_MIDDLEWARE.triage)
    const mutationMiddleware = await mutation.createMiddleware({}, middlewareContext())
    expect(mutationMiddleware.wrapToolCall).toBeTypeOf('function')
    expect(wrap).toHaveBeenCalledWith([FACTORY_TOOL.triage], FACTORY_MIDDLEWARE.triage)
  })

  it('discovers MCP from runtime decorators without a manifest toolsets declaration', async () => {
    const manifest = JSON.parse(await readFile(new URL('../../.xpertai-plugin/plugin.json', import.meta.url), 'utf8'))
    const runtimeMcp = plugin.meta.targetAppMeta?.xpert?.marketplace?.contents.filter((item) => item.type === 'mcp')
    const manifestMcp = manifest.targetAppMeta.xpert.marketplace.contents.filter(
      (item: { type?: string }) => item.type === 'mcp'
    )

    expect(manifest.toolsets).toBeUndefined()
    expect(plugin.meta.targetAppMeta?.xpert?.capabilities).toContain(FACTORY_MCP_CAPABILITY)
    expect(plugin.meta.targetAppMeta?.xpert?.capabilities).toContain(FACTORY_INSIGHTS_MCP_CAPABILITY)
    expect(runtimeMcp?.map((item) => [item.name, item.metadata])).toEqual([
      [FACTORY_TOOLSET_COMPONENT_KEY, { protocol: 'native', provider: FACTORY_TOOLSET_PROVIDER_KEY }],
      [FACTORY_INSIGHTS_TOOLSET_COMPONENT_KEY, { protocol: 'native', provider: FACTORY_INSIGHTS_TOOLSET_PROVIDER_KEY }]
    ])
    expect(manifestMcp.map((item: { name: string; metadata: object }) => [item.name, item.metadata])).toEqual(
      runtimeMcp?.map((item) => [item.name, item.metadata])
    )
  })
})

function createProvider() {
  const listCases = vi.fn(async () => ({
    items: [
      {
        id: CASE_ID,
        caseKey: 'FAC-260902-ABC123',
        title: 'M-07 · Spindle anomaly',
        revision: 4,
        status: 'planning',
        currentStage: 'specialist-analysis',
        event: {
          deviceId: 'M-07',
          deviceName: 'Grinding center M-07',
          lineId: 'Line-A',
          severity: 'critical',
          occurredAt: '2026-09-02T01:02:03.000Z'
        },
        progress: { completedSteps: 4, totalSteps: 10, percent: 40 },
        nextAction: 'Generate a recovery plan',
        analysisFacts: { internalPath: '/not-for-mcp' },
        timeline: [{ summary: 'sensitive full history' }]
      }
    ],
    total: 3,
    page: 1,
    pageSize: 1
  }))
  const wrap = vi.fn(() => async (request: unknown, handler: (value: unknown) => unknown) => handler(request))
  const service = { listCases } as unknown as FactoryOperationsService
  const events = { wrap } as unknown as FactoryToolEventService
  return {
    provider: new FactoryOperationsTools(service, events),
    insightsProvider: new FactoryOperationsInsightsTools(service),
    listCases,
    wrap
  }
}

function executionContext(): ToolExecutionContext {
  return Object.assign(
    {
      source: 'mcp' as const,
      tenantId: 'tenant-runtime',
      organizationId: 'organization-runtime',
      workspaceId: 'workspace-runtime',
      projectId: 'project-runtime',
      principal: {
        type: 'user' as const,
        id: 'principal-runtime',
        userId: 'user-runtime'
      },
      executionId: 'execution-runtime',
      requestId: 'request-runtime',
      conversationId: 'conversation-runtime',
      xpertId: 'xpert-runtime',
      agentKey: 'agent-runtime',
      host: {}
    },
    { threadId: 'thread-runtime' }
  )
}

function middlewareContext(): IAgentMiddlewareContext {
  return {
    tenantId: 'tenant-runtime',
    organizationId: 'organization-runtime',
    userId: 'user-runtime',
    workspaceId: 'workspace-runtime',
    projectId: 'project-runtime',
    conversationId: 'conversation-runtime',
    threadId: 'thread-runtime',
    xpertId: 'xpert-runtime',
    agentKey: 'agent-runtime',
    node: {} as IAgentMiddlewareContext['node'],
    tools: new Map(),
    runtime: {
      createModelClient: vi.fn(),
      getModelProvider: vi.fn()
    } as unknown as IAgentMiddlewareContext['runtime']
  }
}
