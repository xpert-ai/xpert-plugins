jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  ViewExtensionProvider: () => (target: unknown) => target,
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES',
  renderRemoteReactIframeHtml: jest.fn(({ appScript }) => `<!doctype html><html><body><script>${appScript}</script></body></html>`)
}))

import { SalesOntologyViewProvider } from './sales-ontology-view.provider.js'
import { AGENT_WORKBENCH_FIXED_SLOT, SALES_ONTOLOGY_VIEW_KEY } from './constants.js'

describe('SalesOntologyViewProvider', () => {
  const service = {
    getViewData: jest.fn(async () => ({ items: [], total: 0 })),
    seedDatabase: jest.fn(async () => ({ resourceId: 'sales-ontology', internalRecords: { proposals: 3 } })),
    runPerception: jest.fn(),
    generateSuggestions: jest.fn(),
    runReasoning: jest.fn(async () => ({ reasoningType: 'multi_step' })),
    simulateScenario: jest.fn(async () => ({ id: 'scenario-1' })),
    approveProposal: jest.fn(),
    rejectProposal: jest.fn(),
    executeProposal: jest.fn()
  }

  const context = {
    hostType: 'agent',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    hostId: 'assistant-1'
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('declares pagination, selection, seed/reasoning/scenario actions, and assistant chat command', () => {
    const provider = new SalesOntologyViewProvider(service as any)
    const [manifest] = provider.getViewManifests(context, AGENT_WORKBENCH_FIXED_SLOT)

    expect(manifest.key).toBe(SALES_ONTOLOGY_VIEW_KEY)
    expect(manifest.icon).toEqual({ type: 'font', value: 'ri-line-chart-line' })
    expect(manifest.workbench?.menu?.icon).toEqual({ type: 'font', value: 'ri-line-chart-line' })
    expect(manifest.dataSource.querySchema?.supportsPagination).toBe(true)
    expect(manifest.dataSource.querySchema?.supportsSelection).toBe(true)
    expect(manifest.actions?.map((action) => action.key)).toEqual(
      expect.arrayContaining(['seed_database', 'run_reasoning', 'simulate_scenario'])
    )
    expect(manifest.clientCommands?.map((command) => command.key)).toContain('assistant.chat.send_message')
  })

  it('passes tab, pagination, and selection query into Sales Ontology view data', async () => {
    const provider = new SalesOntologyViewProvider(service as any)

    await provider.getViewData(context, SALES_ONTOLOGY_VIEW_KEY, {
      page: 2,
      pageSize: 10,
      search: 'doctor',
      selectionId: 'sales_ontology_object:d1',
      parameters: {
        resourceId: 'sales-ontology',
        viewTab: 'graph',
        insightType: 'risk',
        graphObjectType: 'Doctor'
      }
    })

    expect(service.getViewData).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: 'assistant-1' }),
      expect.objectContaining({
        resourceId: 'sales-ontology',
        viewTab: 'graph',
        insightType: 'risk',
        graphObjectType: 'Doctor',
        search: 'doctor',
        selectionId: 'sales_ontology_object:d1',
        page: 2,
        pageSize: 10,
        limit: 10
      })
    )
  })

  it('executes reasoning and scenario actions through existing service methods', async () => {
    const provider = new SalesOntologyViewProvider(service as any)

    await provider.executeViewAction(context, SALES_ONTOLOGY_VIEW_KEY, 'run_reasoning', {
      input: { reasoningType: 'causal' },
      parameters: { resourceId: 'sales-ontology' }
    })
    await provider.executeViewAction(context, SALES_ONTOLOGY_VIEW_KEY, 'simulate_scenario', {
      input: { name: 'Q2 simulation' },
      parameters: { resourceId: 'sales-ontology' }
    })

    expect(service.runReasoning).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: 'assistant-1' }),
      expect.objectContaining({ reasoningType: 'causal', resourceId: 'sales-ontology' })
    )
    expect(service.simulateScenario).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: 'assistant-1' }),
      expect.objectContaining({ name: 'Q2 simulation', resourceId: 'sales-ontology' })
    )
  })

  it('executes seed database action through Sales Ontology service', async () => {
    const provider = new SalesOntologyViewProvider(service as any)

    const result = await provider.executeViewAction(context, SALES_ONTOLOGY_VIEW_KEY, 'seed_database', {
      input: { publishOntology: false },
      parameters: { resourceId: 'sales-ontology-demo' }
    })

    expect(result.success).toBe(true)
    expect(service.seedDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: 'assistant-1' }),
      expect.objectContaining({ publishOntology: false, resourceId: 'sales-ontology-demo' })
    )
  })
})
