jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  RequestContext: {
    currentToken: jest.fn(() => 'token')
  }
}))

import { SalesOntologyService } from './sales-ontology.service.js'

function repository<T>(items: T[]) {
  return {
    find: jest.fn(async () => items),
    save: jest.fn(async (value) => value),
    create: jest.fn((value) => value),
    findOne: jest.fn()
  }
}

function createService(overrides: Partial<{ ontologyConfigured: boolean }> = {}) {
  const runs = repository([
    {
      id: 'run-1',
      runType: 'reasoning',
      status: 'completed',
      confidence: 0.8,
      output: { reasoningType: 'multi_step', hypothesis: 'Risk is concentrated.' },
      createdAt: new Date('2026-01-03T00:00:00.000Z')
    }
  ])
  const perceptions = repository([
    {
      id: 'perception-1',
      entityTypeCode: 'sales_ontology_object',
      entityExternalKey: 'doctor-1',
      entityName: 'Doctor One',
      entityObjectType: 'Doctor',
      riskScore: 0.82,
      alerts: [{ message: 'High risk' }],
      createdAt: new Date('2026-01-02T00:00:00.000Z')
    }
  ])
  const suggestions = repository([
    {
      id: 'suggestion-1',
      type: 'next_best_action',
      title: 'Create follow-up plan',
      description: 'Opportunity to recover volume.',
      priority: 'medium',
      confidence: 0.72,
      createdAt: new Date('2026-01-02T00:00:00.000Z')
    }
  ])
  const proposals = repository([
    { id: 'proposal-1', title: 'First proposal', status: 'pending', createdAt: new Date('2026-01-03T00:00:00.000Z') },
    { id: 'proposal-2', title: 'Second proposal', status: 'approved', createdAt: new Date('2026-01-02T00:00:00.000Z') },
    { id: 'proposal-3', title: 'Third proposal', status: 'executed', createdAt: new Date('2026-01-01T00:00:00.000Z') }
  ])
  const logs = repository([{ id: 'log-1', toolName: 'sales_ontology_run_perception', status: 'success' }])
  const effects = repository([{ id: 'effect-1', metricName: 'sales_growth', status: 'on_track', actualValue: 10, expectedValue: 8 }])
  const notifications = repository([{ id: 'notice-1', title: 'Notice', read: false }])
  const reminders = repository([{ id: 'reminder-1', title: 'Reminder', status: 'active' }])
  const scenarios = repository([{ id: 'scenario-1', name: 'Scenario A', category: 'sales_strategy', achievementRate: 90 }])
  const memories = repository([{ id: 'memory-1', memoryType: 'semantic', contentText: 'Learned pattern' }])
  const ontologyClient = {
    isConfigured: jest.fn(() => overrides.ontologyConfigured ?? false),
    defaultResourceId: jest.fn(() => 'sales-ontology'),
    publish: jest.fn(async () => ({ ok: true })),
    queryEntities: jest.fn(),
    queryRelations: jest.fn(async () => ({ items: [] })),
    getNeighborhood: jest.fn()
  }

  const service = new SalesOntologyService(
    runs as any,
    perceptions as any,
    suggestions as any,
    proposals as any,
    logs as any,
    effects as any,
    notifications as any,
    reminders as any,
    scenarios as any,
    memories as any,
    ontologyClient as any
  )

  return { service, ontologyClient }
}

describe('SalesOntologyService.getViewData', () => {
  const scope = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    assistantId: 'assistant-1',
    userId: 'user-1'
  }

  it('paginates current tab items', async () => {
    const { service } = createService()

    const result = await service.getViewData(scope, {
      viewTab: 'actions',
      page: 2,
      pageSize: 1
    })

    expect(result.total).toBe(3)
    expect(result.items).toEqual([expect.objectContaining({ id: 'proposal-2' })])
    expect(result.meta.pagination).toEqual({ page: 2, pageSize: 1, total: 3 })
  })

  it('returns filtered insight items for the insights tab', async () => {
    const { service } = createService()

    const result = await service.getViewData(scope, {
      viewTab: 'insights',
      insightType: 'risk',
      page: 1,
      pageSize: 10
    })

    expect(result.items).toEqual([expect.objectContaining({ category: 'risk', kind: 'perception' })])
    expect(result.total).toBe(1)
  })

  it('returns an empty graph state when data-xpert ontology is not configured', async () => {
    const { service, ontologyClient } = createService({ ontologyConfigured: false })

    const result = await service.getViewData(scope, {
      viewTab: 'graph',
      page: 1,
      pageSize: 10,
      selectionId: 'sales_ontology_object:doctor-1'
    })

    expect(ontologyClient.queryEntities).not.toHaveBeenCalled()
    expect(result.meta.graph.configured).toBe(false)
    expect(result.meta.graph.nodes).toEqual([])
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('includes data-xpert ontology relations in graph edges', async () => {
    const { service, ontologyClient } = createService({ ontologyConfigured: true })
    ontologyClient.queryEntities.mockResolvedValue({
      items: [
        {
          externalKey: 'doctor-1',
          displayName: 'Doctor One',
          attributes: { object_type: 'Doctor', domain: 'CustomerManagement' }
        },
        {
          externalKey: 'hospital-1',
          displayName: 'Hospital One',
          attributes: { object_type: 'Hospital', domain: 'CustomerManagement' }
        }
      ]
    })
    ontologyClient.queryRelations.mockResolvedValue({
      items: [
        {
          relationTypeCode: 'sales_ontology_object_link',
          source: { entityTypeCode: 'sales_ontology_object', externalKey: 'doctor-1' },
          target: { entityTypeCode: 'sales_ontology_object', externalKey: 'hospital-1' },
          attributes: { link_type: 'WORKS_AT', confidence: 0.9 }
        }
      ]
    })

    const result = await service.getViewData(scope, {
      viewTab: 'graph',
      page: 1,
      pageSize: 10
    })

    expect(ontologyClient.queryRelations).toHaveBeenCalledWith('sales-ontology', expect.objectContaining({ limit: 300 }))
    expect(result.meta.graph.edges).toEqual([
      expect.objectContaining({
        source: 'sales_ontology_object:doctor-1',
        target: 'sales_ontology_object:hospital-1',
        relationType: 'WORKS_AT',
        confidence: 0.9
      })
    ])
    expect(result.meta.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sales_ontology_object:doctor-1' }),
        expect.objectContaining({ id: 'sales_ontology_object:hospital-1' })
      ])
    )
  })

  it('seeds demo workbench records and skips ontology when data-xpert is not configured', async () => {
    const { service, ontologyClient } = createService({ ontologyConfigured: false })

    const result = await service.seedDatabase(scope, {
      publishOntology: true,
      includeInternalRecords: true
    })

    expect(ontologyClient.publish).not.toHaveBeenCalled()
    expect(result.ontology.skipped).toBe(true)
    expect(result.ontology.reason).toContain('not configured')
    expect(result.internalRecords.proposals).toBe(3)
    expect(result.internalRecords.scenarios).toBe(10)
    expect(result.internalRecords.reminders).toBe(5)
    expect(result.internalRecords.memories).toBeGreaterThan(0)
  })

  it('publishes Sales Ontology demo ontology snapshot when data-xpert is configured', async () => {
    const { service, ontologyClient } = createService({ ontologyConfigured: true })

    const result = await service.seedDatabase(scope, {
      resourceId: 'sales-ontology-demo',
      includeInternalRecords: false
    })

    expect(ontologyClient.publish).toHaveBeenCalledWith(
      'sales-ontology-demo',
      expect.objectContaining({
        syncMode: 'merge',
        sourcePlugin: 'sales-ontology',
        domainKey: 'sales-ontology',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entityTypeCode: 'sales_ontology_object',
            externalKey: 'd1',
            displayName: '张主任'
          })
        ]),
        relations: expect.arrayContaining([
          expect.objectContaining({
            relationTypeCode: 'sales_ontology_object_link',
            source: { entityTypeCode: 'sales_ontology_object', externalKey: 'd1' },
            target: { entityTypeCode: 'sales_ontology_object', externalKey: 'h1' }
          })
        ])
      })
    )
    expect(result.ontology.published).toBe(true)
    expect(result.internalRecords.skipped).toBe(true)
  })
})
