jest.mock('@xpert-ai/contracts', () => ({
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND: 'assistant.chat.send_message',
  WORKBENCH_NAVIGATION_OPEN_COMMAND: 'workbench.navigation.open'
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`,
  ViewExtensionProvider: () => (target: unknown) => target,
  renderRemoteReactIframeHtml: jest.fn(),
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES',
  KnowledgebaseRuntimeCapability: { id: 'platform.knowledgebase' }
}))

import { XpertQuotationViewProvider } from './xpert-quotation-view.provider.js'

describe('XpertQuotationViewProvider knowledgebase workflow', () => {
  const context = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    hostType: 'agent' as const,
    hostId: 'assistant-1',
    slots: [{ key: 'agent.workbench.fixed', mode: 'sections' as const }],
    hostState: {
      agent: {
        connections: [
          { type: 'knowledgebase', id: 'kb-price' },
          { type: 'toolset', id: 'ignored-toolset' },
          { type: 'knowledgebase', id: 'kb-price' }
        ]
      }
    }
  }

  it('removes every price-list import and delete action from the manifest', () => {
    const provider = new XpertQuotationViewProvider({} as never)
    const [manifest] = provider.getViewManifests(context, 'agent.workbench.fixed')
    const actionKeys = manifest.actions?.map((action) => action.key) ?? []

    expect(actionKeys).toContain('import_source_xlsx')
    expect(manifest.actions?.find((action) => action.key === 'import_source_xlsx')?.label).toEqual(expect.objectContaining({
      en_US: expect.stringContaining('.xls/.xlsx'),
      zh_Hans: expect.stringContaining('.xls/.xlsx')
    }))
    expect(actionKeys).toContain('accept_all_ai_knowledge_recommendations')
    expect(actionKeys).toContain('review_quota_breakdown')
    expect(actionKeys).toContain('search_quota_components')
    expect(actionKeys).toContain('select_quota_candidate')
    expect(actionKeys).toContain('recommend_resource_price')
    expect(actionKeys).toEqual(expect.arrayContaining([
      'accept_resource_price', 'calculate_comprehensive_rate'
    ]))
    expect(actionKeys).not.toContain('set_uncovered_work_skipped')
    expect(actionKeys).not.toContain('update_pricing_formula_rule')
    expect(actionKeys).not.toContain('import_price_list')
    expect(actionKeys).not.toContain('delete_price_book')
    expect(actionKeys).not.toContain('accept_all_ai_price_book_recommendations')
    expect(manifest.dataSource.querySchema).toEqual(expect.objectContaining({ supportsSearch: true, supportsParameters: true }))
  })

  it('accepts a labor price with an explicitly confirmed quota workday basis', async () => {
    const service = { acceptResourcePrice: jest.fn().mockResolvedValue({ persisted: true, status: 'approved' }) }
    const provider = new XpertQuotationViewProvider(service as never)
    const result = await provider.executeViewAction(context, 'xpert_quotation', 'accept_resource_price', {
      input: {
        quotationId: 'quotation-1', lineId: 'line-1', resourceId: 'resource-1', candidateId: 'candidate-1',
        priceItemId: 'price-1', quotaWorkdayHours: 10, confidence: 0.9, differences: [], userConfirmed: true
      }
    })

    expect(service.acceptResourcePrice).toHaveBeenCalledWith(expect.any(Object), 'quotation-1', 'line-1', expect.objectContaining({ quotaWorkdayHours: 10 }))
    expect(result).toEqual(expect.objectContaining({ success: true, data: { persisted: true, status: 'approved' } }))
  })

  it('requires confirmation before persisting a resource price choice', async () => {
    const service = { recommendResourcePrice: jest.fn().mockResolvedValue({ persisted: true }) }
    const provider = new XpertQuotationViewProvider(service as never)
    const input = {
      quotationId: 'quotation-1', lineId: 'line-1', resourceId: 'resource-1',
      candidateId: 'candidate-1', priceItemId: 'price-1', confidence: 0.8,
      rationale: '名称与单位一致。', differences: []
    }
    const denied = await provider.executeViewAction(context, 'xpert_quotation', 'recommend_resource_price', { input })
    const accepted = await provider.executeViewAction(context, 'xpert_quotation', 'recommend_resource_price', {
      input: { ...input, userConfirmed: true }
    })
    expect(denied.success).toBe(false)
    expect(service.recommendResourcePrice).toHaveBeenCalledTimes(1)
    expect(accepted).toEqual(expect.objectContaining({ success: true, data: { persisted: true } }))
  })

  it('returns a child-agent delegation hint when the host has no price knowledgebase', async () => {
    const provider = new XpertQuotationViewProvider({} as never)
    const result = await provider.executeViewAction({
      ...context,
      hostState: { agent: { connections: [] } }
    }, 'xpert_quotation', 'search_resource_prices', {
      input: { quotationId: 'quotation-1', lineId: 'line-1', resourceId: 'resource-1', topK: 5 }
    })

    expect(result.success).toBe(false)
    expect(result.message).toEqual(expect.objectContaining({ zh_Hans: expect.stringContaining('价格检索子 Agent') }))
  })

  it('requires an explicit confirmation before recording a quota-breakdown decision', async () => {
    const service = { reviewQuotaBreakdown: jest.fn().mockResolvedValue({ mappingStatus: 'approved' }) }
    const provider = new XpertQuotationViewProvider(service as never)

    const withoutConfirmation = await provider.executeViewAction(context, 'xpert_quotation', 'review_quota_breakdown', {
      input: { quotationId: 'quotation-1', lineId: 'line-1', decision: 'approve' }
    })
    const approved = await provider.executeViewAction(context, 'xpert_quotation', 'review_quota_breakdown', {
      input: { quotationId: 'quotation-1', lineId: 'line-1', decision: 'approve', userConfirmed: true, comment: '确认映射。' }
    })

    expect(withoutConfirmation.success).toBe(false)
    expect(service.reviewQuotaBreakdown).toHaveBeenCalledTimes(1)
    expect(service.reviewQuotaBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      'quotation-1', 'line-1', 'approve', '确认映射。'
    )
    expect(approved).toEqual(expect.objectContaining({ success: true, data: { mappingStatus: 'approved' } }))
  })

  it('requires confirmation before selecting a quota consumption candidate', async () => {
    const service = { selectQuotaCandidate: jest.fn().mockResolvedValue({ persisted: true, candidateId: 'quota-2' }) }
    const provider = new XpertQuotationViewProvider(service as never)
    const input = { quotationId: 'quotation-1', lineId: 'line-1', candidateId: 'quota-2' }

    const denied = await provider.executeViewAction(context, 'xpert_quotation', 'select_quota_candidate', { input })
    const selected = await provider.executeViewAction(context, 'xpert_quotation', 'select_quota_candidate', {
      input: { ...input, userConfirmed: true }
    })

    expect(denied.success).toBe(false)
    expect(service.selectQuotaCandidate).toHaveBeenCalledWith(expect.any(Object), 'quotation-1', 'line-1', 'quota-2')
    expect(selected).toEqual(expect.objectContaining({ success: true, data: { persisted: true, candidateId: 'quota-2' } }))
  })

  it('returns overwrite-required data and forwards the confirmed workbook version', async () => {
    const service = {
      applyQuotation: jest.fn()
        .mockResolvedValueOnce({
          status: 'overwrite_required', expectedVersionNumber: 3, occupiedCellCount: 1,
          occupiedCells: [{ sheetName: '报价表', address: 'I8' }], occupiedCellsTruncated: false
        })
        .mockResolvedValueOnce({ status: 'applied', patchCount: 2 })
    }
    const provider = new XpertQuotationViewProvider(service as never)

    const preflight = await provider.executeViewAction(context, 'xpert_quotation', 'apply_patch', {
      input: { quotationId: 'quotation-1', lineId: 'line-1', changeSummary: '写入当前行', userConfirmed: true }
    })
    const overwritten = await provider.executeViewAction(context, 'xpert_quotation', 'apply_patch', {
      input: {
        quotationId: 'quotation-1', lineId: 'line-1', changeSummary: '写入当前行', userConfirmed: true,
        overwriteExisting: true, expectedVersionNumber: 3
      }
    })

    expect(preflight).toEqual(expect.objectContaining({ success: true, refresh: false, data: expect.objectContaining({ status: 'overwrite_required' }) }))
    expect(service.applyQuotation).toHaveBeenLastCalledWith(
      expect.any(Object), 'quotation-1', '写入当前行', 'line-1',
      { overwriteExisting: true, expectedVersionNumber: 3 }
    )
    expect(overwritten).toEqual(expect.objectContaining({ success: true, data: { status: 'applied', patchCount: 2 } }))
  })

  it('returns connected knowledgebase summaries and semantic price chunks', async () => {
    const search = jest.fn().mockResolvedValue([{
      id: 'chunk-12',
      pageContent: '镀锌钢管 DN50，单位m，材料价36.80元/m。',
      metadata: { knowledgebaseId: 'kb-price', documentId: 'doc-1', chunkId: 'chunk-12', score: 0.93 }
    }])
    const api = {
      list: jest.fn().mockResolvedValue([
        { id: 'kb-price', name: '南京价格', chunkNum: 200 },
        { id: 'kb-secret', name: '不应显示' }
      ]),
      search
    }
    const registry = { get: jest.fn().mockReturnValue(api) }
    const provider = new XpertQuotationViewProvider({} as never, registry as never)

    const result = await provider.getViewData(context, 'xpert_quotation', {
      page: 1,
      pageSize: 10,
      search: '镀锌钢管 DN50 m',
      parameters: { table: 'knowledgeSearch', knowledgebaseId: 'kb-price' }
    })

    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-1', limit: 100 }))
    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      knowledgebaseIds: ['kb-price'],
      query: '镀锌钢管 DN50 m',
      k: 10,
      source: 'xpert-quotation-workbench'
    }))
    expect(result.items).toEqual([
      expect.objectContaining({ knowledgebaseId: 'kb-price', documentId: 'doc-1', chunkId: 'chunk-12' })
    ])
    expect(result.summary).toEqual(expect.objectContaining({
      knowledgebases: [expect.objectContaining({ id: 'kb-price', name: '南京价格' })],
      queryRequired: false,
      resultMode: 'semantic_top_k'
    }))
  })

  it('loads platform knowledgebase names even when the host has no workspace id', async () => {
    const api = {
      list: jest.fn().mockResolvedValue([{ id: 'kb-price', name: '官网价格库', chunkNum: 24 }]),
      search: jest.fn()
    }
    const provider = new XpertQuotationViewProvider(
      {} as never,
      { get: jest.fn().mockReturnValue(api) } as never
    )

    const result = await provider.getViewData(
      { ...context, workspaceId: null },
      'xpert_quotation',
      { parameters: { table: 'knowledgeSearch' } }
    )

    expect(api.list).toHaveBeenCalledWith({ workspaceId: undefined, published: true, limit: 100 })
    expect(result.summary).toEqual(expect.objectContaining({
      knowledgebases: [expect.objectContaining({ id: 'kb-price', name: '官网价格库' })]
    }))
  })

  it('does not expose a raw UUID as the knowledgebase display name when metadata loading fails', async () => {
    const provider = new XpertQuotationViewProvider(
      {} as never,
      { get: jest.fn().mockReturnValue({ list: jest.fn().mockRejectedValue(new Error('unavailable')), search: jest.fn() }) } as never
    )

    const result = await provider.getViewData(context, 'xpert_quotation', {
      parameters: { table: 'knowledgeSearch' }
    })

    expect(result.summary).toEqual(expect.objectContaining({
      knowledgebases: [{ id: 'kb-price', name: '未命名知识库' }]
    }))
  })

  it('never searches a knowledgebase that is not connected to the current Agent', async () => {
    const search = jest.fn()
    const registry = { get: jest.fn().mockReturnValue({ list: jest.fn().mockResolvedValue([]), search }) }
    const provider = new XpertQuotationViewProvider({} as never, registry as never)

    const result = await provider.getViewData(context, 'xpert_quotation', {
      search: 'secret',
      parameters: { table: 'knowledgeSearch', knowledgebaseId: 'kb-secret' }
    })

    expect(search).not.toHaveBeenCalled()
    expect(result.summary).toEqual(expect.objectContaining({
      activeKnowledgebaseId: 'kb-price',
      errorCode: 'knowledgebase_not_connected'
    }))
  })

  it('returns the same queryRequired contract before a query and after a search failure', async () => {
    const api = {
      list: jest.fn().mockResolvedValue([{ id: 'kb-price', name: '南京价格' }]),
      search: jest.fn().mockRejectedValue(new Error('retrieval unavailable'))
    }
    const provider = new XpertQuotationViewProvider({} as never, { get: jest.fn().mockReturnValue(api) } as never)

    const beforeSearch = await provider.getViewData(context, 'xpert_quotation', {
      parameters: { table: 'knowledgeSearch', knowledgebaseId: 'kb-price' }
    })
    const failedSearch = await provider.getViewData(context, 'xpert_quotation', {
      search: '镀锌钢管 DN50',
      parameters: { table: 'knowledgeSearch', knowledgebaseId: 'kb-price' }
    })

    expect(beforeSearch.summary).toEqual(expect.objectContaining({ queryRequired: true }))
    expect(failedSearch.summary).toEqual(expect.objectContaining({
      queryRequired: false,
      errorCode: 'knowledgebase_search_failed'
    }))
  })

  it('returns an honest empty state when no knowledgebase is connected', async () => {
    const disconnectedContext = {
      ...context,
      hostState: { agent: { connections: [] } }
    }
    const api = { list: jest.fn().mockResolvedValue([]), search: jest.fn() }
    const provider = new XpertQuotationViewProvider({} as never, { get: jest.fn().mockReturnValue(api) } as never)

    const result = await provider.getViewData(disconnectedContext, 'xpert_quotation', {
      parameters: { table: 'knowledgeSearch' }
    })

    expect(api.search).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({
      items: [],
      summary: expect.objectContaining({
        knowledgebases: [],
        activeKnowledgebaseId: null,
        queryRequired: true,
        errorCode: 'knowledgebase_not_connected'
      })
    }))
  })

  it('uses the published workspace catalog for the page when retrieval knowledgebases belong to child Agents', async () => {
    const childKnowledgebaseSearch = jest.fn().mockResolvedValue([{
      id: 'chunk-quota',
      pageContent: '1-46 回填砂石，单位 m3。',
      metadata: { knowledgebaseId: 'kb-quota', score: 0.91 }
    }])
    const api = {
      list: jest.fn().mockResolvedValue([
        { id: 'kb-quota', name: '消耗量定额库', chunkNum: 100 },
        { id: 'kb-price', name: '价格信息库', chunkNum: 200 }
      ]),
      search: childKnowledgebaseSearch
    }
    const provider = new XpertQuotationViewProvider({} as never, { get: jest.fn().mockReturnValue(api) } as never)
    const childAgentContext = { ...context, hostState: { agent: { connections: [] } } }

    const result = await provider.getViewData(childAgentContext, 'xpert_quotation', {
      search: '回填砂石 m3',
      parameters: { table: 'knowledgeSearch', knowledgebaseId: 'kb-quota' }
    })

    expect(result.summary).toEqual(expect.objectContaining({
      knowledgebases: [
        expect.objectContaining({ id: 'kb-quota', name: '消耗量定额库' }),
        expect.objectContaining({ id: 'kb-price', name: '价格信息库' })
      ],
      activeKnowledgebaseId: 'kb-quota'
    }))
    expect(childKnowledgebaseSearch).toHaveBeenCalledWith(expect.objectContaining({
      knowledgebaseIds: ['kb-quota'],
      query: '回填砂石 m3',
      source: 'xpert-quotation-workbench'
    }))
    expect(result.items).toEqual([expect.objectContaining({
      knowledgebaseId: 'kb-quota',
      pageContent: '1-46 回填砂石，单位 m3。'
    })])
  })

  it('uses persisted child-agent candidates when the workspace catalog is unavailable', async () => {
    const api = {
      list: jest.fn().mockResolvedValue([]),
      search: jest.fn().mockResolvedValue([{ pageContent: '普工 工日 254 元', metadata: { score: 0.88 } }])
    }
    const service = {
      getWorkbenchData: jest.fn().mockResolvedValue({
        detail: { lines: [{ quotaCandidates: [{ knowledgebaseId: 'kb-child-price' }] }] }
      })
    }
    const repository = {
      find: jest.fn().mockResolvedValue([{ id: 'kb-child-price', name: '子智能体价格库', description: '已连接价格知识库' }])
    }
    const dataSource = { isInitialized: true, getRepository: jest.fn().mockReturnValue(repository) }
    const provider = new XpertQuotationViewProvider(
      service as never,
      { get: jest.fn().mockReturnValue(api) } as never,
      undefined,
      undefined,
      undefined,
      dataSource as never
    )

    const result = await provider.getViewData(
      { ...context, workspaceId: null, hostState: { agent: { connections: [] } } },
      'xpert_quotation',
      { search: '普工 工日', parameters: { table: 'knowledgeSearch' } }
    )

    expect(result.summary).toEqual(expect.objectContaining({
      knowledgebases: [expect.objectContaining({ id: 'kb-child-price', name: '子智能体价格库' })],
      activeKnowledgebaseId: 'kb-child-price'
    }))
    expect(api.search).toHaveBeenCalledWith(expect.objectContaining({ knowledgebaseIds: ['kb-child-price'] }))
  })

  it('rejects the removed price-list file action without calling the service', async () => {
    const service = { importSourceXlsx: jest.fn() }
    const provider = new XpertQuotationViewProvider(service as never)

    const result = await provider.executeViewFileAction(
      context,
      'xpert_quotation',
      'import_price_list',
      { input: {} },
      { buffer: Buffer.from('xlsx'), originalname: 'prices.xlsx', mimetype: 'application/octet-stream', size: 4 } as never
    )

    expect(result.success).toBe(false)
    expect(service.importSourceXlsx).not.toHaveBeenCalled()
  })

  it('passes a legacy XLS quotation upload through the supported import action', async () => {
    const service = {
      importSourceXlsx: jest.fn().mockResolvedValue({
        quotation: { id: 'quotation-xls' },
        convertedFromLegacyXls: true
      })
    }
    const provider = new XpertQuotationViewProvider(service as never)

    const result = await provider.executeViewFileAction(
      context,
      'xpert_quotation',
      'import_source_xlsx',
      { input: {} },
      { buffer: Buffer.from('xls'), originalname: '旧格式报价.xls', mimetype: 'application/vnd.ms-excel', size: 3 } as never
    )

    expect(service.importSourceXlsx).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      fileName: '旧格式报价.xls', mimeType: 'application/vnd.ms-excel'
    }))
    expect(result).toEqual(expect.objectContaining({ success: true }))
  })
})
