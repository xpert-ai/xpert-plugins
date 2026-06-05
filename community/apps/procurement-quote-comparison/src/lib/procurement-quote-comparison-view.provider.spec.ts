import { ProcurementQuoteComparisonViewProvider } from './procurement-quote-comparison-view.provider.js'
import {
  PROCUREMENT_QUOTE_COMPARISON_FEATURE,
  PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY,
  PROCUREMENT_QUOTE_COMPARISON_REMOTE_ENTRY_KEY,
  PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY
} from './constants.js'

describe('ProcurementQuoteComparisonViewProvider', () => {
  const createService = () => ({
    getWorkbenchData: jest.fn(),
    createComparisonCase: jest.fn(),
    createCaseFromRequirementDocument: jest.fn(),
    registerSourceDocument: jest.fn(),
    startRequirementParse: jest.fn(),
    startSupplierQuoteParseBatch: jest.fn(),
    prepareRequirementParseChatMessage: jest.fn(),
    prepareSupplierQuoteParseMessages: jest.fn(),
    markParseMessageDispatched: jest.fn(),
    deleteComparisonCase: jest.fn()
  })

  it('registers a remote workbench view on project detail sections', () => {
    const provider = new ProcurementQuoteComparisonViewProvider(createService())

    const manifests = provider.getViewManifests(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        hostType: 'project',
        hostId: 'project-1',
        slots: [{ key: 'detail.sections', mode: 'sections' }]
      },
      'detail.sections'
    )

    expect(provider.supports({ tenantId: 'tenant-1', userId: 'user-1', hostType: 'project', hostId: 'project-1', slots: [] })).toBe(true)
    expect(manifests).toHaveLength(1)
    expect(manifests[0].key).toBe(PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY)
    expect(manifests[0].key).not.toContain('__')
    expect(manifests[0].source.provider).toBe(PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY)
    expect(manifests[0].activation?.requiredFeatures).toEqual([PROCUREMENT_QUOTE_COMPARISON_FEATURE])
    expect(manifests[0].view.type).toBe('remote_component')
  })

  it('registers a fixed workbench view on agent workbench slots', () => {
    const provider = new ProcurementQuoteComparisonViewProvider(createService())

    const manifests = provider.getViewManifests(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      'agent.workbench.fixed'
    )

    expect(provider.supports({ tenantId: 'tenant-1', userId: 'user-1', hostType: 'agent', hostId: 'xpert-1', slots: [] })).toBe(true)
    expect(manifests).toHaveLength(1)
    expect(manifests[0].hostType).toBe('agent')
    expect(manifests[0].slot).toBe('agent.workbench.fixed')
    expect(manifests[0].workbench?.fixed).toBe(true)
    expect(manifests[0].workbench?.menu?.enabled).toBe(true)
  })

  it('serves a remote component that auto-refreshes while parsing results are being saved', async () => {
    const provider = new ProcurementQuoteComparisonViewProvider(createService())

    const entry = await provider.getRemoteComponentEntry(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      {
        isolation: 'iframe',
        entry: PROCUREMENT_QUOTE_COMPARISON_REMOTE_ENTRY_KEY
      }
    )

    expect(entry.html).toContain('startAutoRefresh')
    expect(entry.html).toContain('解析结果会自动刷新')
  })

  it('uses the current agent host as default procurement Xpert for new cases', async () => {
    const service = createService()
    service.createComparisonCase.mockResolvedValue({ id: 'case-1' })
    const provider = new ProcurementQuoteComparisonViewProvider(service)

    await provider.executeViewAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      'create_comparison_case',
      {
        input: {
          title: '办公电脑采购',
          purchaseNo: 'PR-001'
        }
      }
    )

    expect(service.createComparisonCase).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        projectId: null,
        userId: 'user-1'
      },
      expect.objectContaining({
        title: '办公电脑采购',
        purchaseNo: 'PR-001',
        xpertId: 'xpert-1'
      })
    )
  })

  it('deletes a procurement project through a scoped view action', async () => {
    const service = createService()
    service.deleteComparisonCase.mockResolvedValue({ deleted: true, caseId: 'case-1' })
    const provider = new ProcurementQuoteComparisonViewProvider(service)

    const result = await provider.executeViewAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      'delete_comparison_case',
      {
        targetId: 'case-1',
        input: {
          caseId: 'case-1'
        }
      }
    )

    expect(result.success).toBe(true)
    expect(result.refresh).toBe(true)
    expect(result.data).toEqual({ deleted: true, caseId: 'case-1' })
    expect(service.deleteComparisonCase).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        projectId: null,
        userId: 'user-1'
      },
      'case-1'
    )
  })

  it('creates a project from an uploaded requirement document in the agent workbench', async () => {
    const service = createService()
    service.createCaseFromRequirementDocument.mockResolvedValue({
      case: { id: 'case-1', title: '办公电脑采购需求单' },
      document: { id: 'document-1', caseId: 'case-1', role: 'requirement' }
    })
    const provider = new ProcurementQuoteComparisonViewProvider(service)

    const result = await provider.executeViewFileAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      'create_case_from_requirement_file',
      { input: null },
      {
        originalname: '办公电脑采购需求单.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('demo'),
        fileAssetId: 'file-asset-1',
        fileId: 'file-asset-1',
        storageFileId: 'storage-file-1'
      }
    )

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      case: { id: 'case-1', title: '办公电脑采购需求单' },
      document: { id: 'document-1', caseId: 'case-1', role: 'requirement' }
    })
    expect(service.createCaseFromRequirementDocument).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        projectId: null,
        userId: 'user-1'
      },
      expect.objectContaining({
        name: '办公电脑采购需求单.pdf',
        fileAssetId: 'file-asset-1',
        fileId: 'file-asset-1',
        storageFileId: 'storage-file-1',
        mimeType: 'application/pdf',
        size: 1024,
        xpertId: 'xpert-1'
      })
    )
  })

  it('passes uploaded file asset handles when creating a project from a requirement document', async () => {
    const service = createService()
    service.createCaseFromRequirementDocument.mockResolvedValue({
      case: { id: 'case-1', title: '研发中心办公电脑更新采购' },
      document: { id: 'document-1', caseId: 'case-1', role: 'requirement' }
    })
    const provider = new ProcurementQuoteComparisonViewProvider(service)

    await provider.executeViewFileAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      'create_case_from_requirement_file',
      {
        input: {
          name: '采购需求单-研发中心办公电脑更新采购.xlsx'
        }
      },
      {
        originalname: '采购需求单-研发中心办公电脑更新采购.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 4096,
        buffer: Buffer.from('excel'),
        fileAssetId: 'file-asset-1',
        fileId: 'file-asset-1',
        storageFileId: 'storage-file-1'
      }
    )

    expect(service.createCaseFromRequirementDocument).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fileAssetId: 'file-asset-1',
        fileId: 'file-asset-1',
        storageFileId: 'storage-file-1'
      })
    )
  })

  it('creates a procurement project from extracted CSV content when the uploaded file has no platform handle', async () => {
    const service = createService()
    service.createCaseFromRequirementDocument.mockResolvedValue({
      case: { id: 'case-1', title: '采购需求单' },
      document: { id: 'document-1', caseId: 'case-1', role: 'requirement' }
    })
    const provider = new ProcurementQuoteComparisonViewProvider(service)

    const result = await provider.executeViewFileAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      'create_case_from_requirement_file',
      {
        input: {
          name: '采购需求单.csv'
        }
      },
      {
        originalname: '采购需求单.csv',
        mimetype: 'text/csv',
        size: 128,
        buffer: Buffer.from('采购编号,项目名称\nPR-001,研发中心办公电脑更新采购')
      }
    )

    expect(result.success).toBe(true)
    expect(service.createCaseFromRequirementDocument).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        name: '采购需求单.csv',
        extractedContent: expect.stringContaining('研发中心办公电脑更新采购'),
        extractionStatus: 'extracted'
      })
    )
  })

  it('returns a prepared chat command when starting requirement parsing', async () => {
    const service = createService()
    service.prepareRequirementParseChatMessage.mockResolvedValue({
      commandKey: 'assistant.chat.send_message',
      payload: {
        text: '请解析采购需求并调用 procurement_save_requirement',
        clientMessageId: 'procurement-requirement-parse:job-1',
        files: [],
        attachments: [],
        references: [],
        followUpMode: 'queue',
        state: {
          procurementQuoteComparison: {
            action: 'parse_requirement',
            caseId: 'case-1',
            documentId: 'doc-1',
            parseJobId: 'job-1'
          }
        }
      },
      caseId: 'case-1',
      documentId: 'doc-1',
      parseJobId: 'job-1'
    })
    const provider = new ProcurementQuoteComparisonViewProvider(service)

    const result = await provider.executeViewAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      'start_requirement_parse',
      {
        targetId: 'case-1',
        input: null
      }
    )

    expect(result.success).toBe(true)
    expect(result.refresh).toBe(false)
    expect(result.data).toEqual({
      commandKey: 'assistant.chat.send_message',
      payload: {
        text: '请解析采购需求并调用 procurement_save_requirement',
        clientMessageId: 'procurement-requirement-parse:job-1',
        files: [],
        attachments: [],
        references: [],
        followUpMode: 'queue',
        state: {
          procurementQuoteComparison: {
            action: 'parse_requirement',
            caseId: 'case-1',
            documentId: 'doc-1',
            parseJobId: 'job-1'
          }
        }
      },
      caseId: 'case-1',
      documentId: 'doc-1',
      parseJobId: 'job-1'
    })
    expect(service.prepareRequirementParseChatMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        caseId: 'case-1',
        xpertId: 'xpert-1'
      })
    )
    expect(service.startRequirementParse).not.toHaveBeenCalled()
  })

  it('marks a prepared parse message as dispatched from the remote workbench', async () => {
    const service = createService()
    service.markParseMessageDispatched.mockResolvedValue({
      id: 'job-1',
      caseId: 'case-1',
      status: 'running',
      clientMessageId: 'procurement-requirement-parse:job-1'
    })
    const provider = new ProcurementQuoteComparisonViewProvider(service)

    const result = await provider.executeViewAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      'mark_parse_message_dispatched',
      {
        targetId: 'case-1',
        input: {
          caseId: 'case-1',
          parseJobId: 'job-1',
          clientMessageId: 'procurement-requirement-parse:job-1',
          conversationId: 'conversation-1',
          threadId: 'thread-1'
        }
      }
    )

    expect(result.success).toBe(true)
    expect(result.refresh).toBe(false)
    expect(service.markParseMessageDispatched).toHaveBeenCalledWith(
      expect.any(Object),
      {
        caseId: 'case-1',
        parseJobId: 'job-1',
        clientMessageId: 'procurement-requirement-parse:job-1',
        conversationId: 'conversation-1',
        threadId: 'thread-1'
      }
    )
  })

  it('prefers the browser file name from remote input when host originalname is mojibake', async () => {
    const service = createService()
    service.createCaseFromRequirementDocument.mockResolvedValue({
      case: { id: 'case-1', title: '研发中心办公电脑更新采购' },
      document: { id: 'document-1', caseId: 'case-1', role: 'requirement' }
    })
    const provider = new ProcurementQuoteComparisonViewProvider(service)
    const brokenName = Buffer.from('乱码文件名.xlsx', 'utf8').toString('latin1')

    await provider.executeViewFileAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      'create_case_from_requirement_file',
      {
        input: {
          name: '采购需求单-研发中心办公电脑更新采购.xlsx'
        }
      },
      {
        originalname: brokenName,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 2048,
        buffer: Buffer.from('demo'),
        fileAssetId: 'file-asset-1'
      }
    )

    expect(service.createCaseFromRequirementDocument).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        name: '采购需求单-研发中心办公电脑更新采购.xlsx'
      })
    )
  })

  it('repairs UTF-8 mojibake file names from the host when registering source documents', async () => {
    const service = createService()
    service.registerSourceDocument.mockResolvedValue({
      id: 'document-1',
      caseId: 'case-1',
      role: 'supplier_quote'
    })
    const provider = new ProcurementQuoteComparisonViewProvider(service)
    const brokenName = Buffer.from('报价单-上海启明科技有限公司.xlsx', 'utf8').toString('latin1')

    await provider.executeViewFileAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
      'upload_supplier_quote_file',
      {
        targetId: 'case-1',
        input: null
      },
      {
        originalname: brokenName,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 2048,
        buffer: Buffer.from('demo'),
        fileAssetId: 'file-asset-1'
      }
    )

    expect(service.registerSourceDocument).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        name: '报价单-上海启明科技有限公司.xlsx'
      })
    )
  })
})
