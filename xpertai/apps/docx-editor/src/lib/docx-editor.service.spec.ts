import * as docxAgentsServer from '@eigenpal/docx-editor-agents/server'
import { DocxEditorService } from './docx-editor.service.js'
import { DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY, type DocxEditorScope } from './types.js'

describe('DocxEditorService', () => {
  const scope: DocxEditorScope = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    assistantId: 'xpert-1'
  }

  const createRepository = () => ({
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    delete: jest.fn()
  })

  const createWorkspaceFiles = () => ({
    uploadBuffer: jest.fn(async () => ({
      name: 'v1-abcd1234.docx',
      filePath: 'files/docx-editor/documents/document-1/versions/v1-abcd1234.docx',
      workspacePath: 'files/docx-editor/documents/document-1/versions/v1-abcd1234.docx',
      fileUrl: 'https://files.example/v1-abcd1234.docx',
      catalog: 'xperts',
      scopeId: 'xpert-1',
      size: 4
    })),
    readBuffer: jest.fn(async () => ({
      name: 'v1-abcd1234.docx',
      filePath: 'files/docx-editor/documents/document-1/versions/v1-abcd1234.docx',
      workspacePath: 'files/docx-editor/documents/document-1/versions/v1-abcd1234.docx',
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04])
    })),
    deleteFile: jest.fn()
  })

  const createAgentBridge = (paragraphs: Array<{ paraId: string; text: string }>) => ({
    getContent: jest.fn(() =>
      paragraphs.map((paragraph, index) => ({
        type: 'paragraph',
        index,
        paraId: paragraph.paraId,
        text: paragraph.text
      }))
    ),
    getContentAsText: jest.fn(() =>
      paragraphs.map((paragraph) => `[${paragraph.paraId}] ${paragraph.text}`).join('\n')
    ),
    proposeChange: jest.fn(() => true)
  })

  const createAgentToolHarness = (
    bridge: ReturnType<typeof createAgentBridge>,
    reviewerOverrides: Record<string, unknown> = {}
  ) => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    const document = {
      id: 'document-1',
      title: 'Contract',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      assistantId: 'xpert-1',
      currentVersionId: 'version-1',
      currentVersionNumber: 1,
      workspaceFilePath: 'files/docx-editor/documents/document-1/versions/v1-abcd1234.docx',
      workspaceCatalog: 'xperts',
      workspaceScopeId: 'xpert-1'
    }
    const version = {
      id: 'version-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      documentId: 'document-1',
      versionNumber: 1,
      source: 'upload',
      workspaceFilePath: 'files/docx-editor/documents/document-1/versions/v1-abcd1234.docx',
      workspaceCatalog: 'xperts',
      workspaceScopeId: 'xpert-1',
      size: 4
    }
    documentRepository.findOne.mockResolvedValue(document)
    documentRepository.save.mockImplementation(async (value) => ({ ...value, id: 'document-1' }))
    versionRepository.findOne.mockResolvedValue(version)
    versionRepository.save.mockImplementation(async (value) => ({ ...value, id: 'version-2' }))
    operationRepository.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 'operation-1' }))
    const reviewer = {
      toBuffer: jest.fn(async () => {
        const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04])
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      }),
      getChanges: jest.fn(() => []),
      getComments: jest.fn(() => []),
      acceptChange: jest.fn(),
      rejectChange: jest.fn(),
      acceptAll: jest.fn(() => 0),
      rejectAll: jest.fn(() => 0),
      removeComment: jest.fn(),
      resolveComment: jest.fn(),
      ...reviewerOverrides
    }
    jest.spyOn(docxAgentsServer.DocxReviewer, 'fromBuffer').mockResolvedValue(reviewer as never)
    jest.spyOn(docxAgentsServer, 'createReviewerBridge').mockReturnValue(bridge as never)
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never,
      {
        get: jest.fn((key) => (key === DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY ? workspaceFiles : undefined))
      } as never
    )

    return {
      service,
      bridge,
      reviewer,
      workspaceFiles,
      snapshotRepository,
      operationRepository
    }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('can be constructed with repository dependencies', () => {
    const repository = createRepository()

    const service = new DocxEditorService(repository as never, repository as never, repository as never, repository as never)

    expect(service).toBeInstanceOf(DocxEditorService)
  })

  it('persists document versions as workspace file references', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    documentRepository.findOne.mockResolvedValue({
      id: 'document-1',
      title: 'Contract',
      assistantId: 'xpert-1',
      currentVersionNumber: 0
    })
    versionRepository.save.mockImplementation(async (value) => ({ ...value, id: 'version-1' }))
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never,
      {
        get: jest.fn((key) => (key === DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY ? workspaceFiles : undefined))
      } as never
    )

    await service.saveDocumentVersion(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        assistantId: 'xpert-1'
      },
      {
        documentId: 'document-1',
        docxBase64: Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString('base64'),
        fileName: 'contract.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
    )

    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: 'xperts',
        xpertId: 'xpert-1',
        isolateByUser: false,
        folder: 'files/docx-editor/documents/document-1/versions',
        fileName: expect.stringMatching(/^v1-[a-f0-9]{8}\.docx$/)
      })
    )
    const savedVersion = versionRepository.save.mock.calls[0][0]
    expect(savedVersion).toEqual(
      expect.objectContaining({
        workspaceFilePath: 'files/docx-editor/documents/document-1/versions/v1-abcd1234.docx',
        workspaceCatalog: 'xperts',
        workspaceScopeId: 'xpert-1'
      })
    )
    expect(savedVersion).not.toHaveProperty('docxBase64')
  })

  it('loads current version bytes from workspace files for the Workbench', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    documentRepository.findOne.mockResolvedValue({
      id: 'document-1',
      title: 'Contract',
      assistantId: 'xpert-1',
      currentVersionId: 'version-1',
      currentVersionNumber: 1
    })
    versionRepository.find.mockResolvedValue([
      {
        id: 'version-1',
        documentId: 'document-1',
        versionNumber: 1,
        workspaceFilePath: 'files/docx-editor/documents/document-1/versions/v1-abcd1234.docx',
        workspaceCatalog: 'xperts',
        workspaceScopeId: 'xpert-1',
        size: 4
      }
    ])
    snapshotRepository.findOne.mockResolvedValue(null)
    operationRepository.find.mockResolvedValue([])
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never,
      {
        get: jest.fn((key) => (key === DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY ? workspaceFiles : undefined))
      } as never
    )

    const data = await service.getWorkbenchData(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        assistantId: 'xpert-1'
      },
      { documentId: 'document-1' }
    )

    expect(workspaceFiles.readBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: 'xperts',
        xpertId: 'xpert-1',
        filePath: 'files/docx-editor/documents/document-1/versions/v1-abcd1234.docx'
      })
    )
    expect(data.currentVersion?.docxBase64).toBe(Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString('base64'))
  })

  it('preserves existing snapshot fields when syncing only the live selection', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    documentRepository.findOne.mockResolvedValue({
      id: 'document-1',
      title: 'Contract',
      currentVersionId: 'version-1'
    })
    snapshotRepository.findOne.mockResolvedValue({
      id: 'snapshot-1',
      documentId: 'document-1',
      versionId: 'version-1',
      contentText: '[p1] Existing text',
      paragraphCount: 1,
      totalPages: 3,
      currentPage: 1,
      selection: null,
      comments: [{ id: 1 }],
      changes: [{ id: 2 }],
      pages: [{ pageNumber: 1, text: 'Existing page' }]
    })
    snapshotRepository.save.mockImplementation(async (value) => ({ ...value, id: 'snapshot-2' }))
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never
    )

    await service.syncSnapshot(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        assistantId: 'xpert-1'
      },
      {
        documentId: 'document-1',
        currentPage: 2,
        selection: {
          selectedText: 'selected'
        }
      }
    )

    expect(snapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contentText: '[p1] Existing text',
        paragraphCount: 1,
        totalPages: 3,
        currentPage: 2,
        selection: {
          selectedText: 'selected'
        },
        comments: [{ id: 1 }],
        changes: [{ id: 2 }],
        pages: [{ pageNumber: 1, text: 'Existing page' }]
      })
    )
  })

  it('falls back to the current DOCX file when comment snapshot is empty text', async () => {
    const bridge = createAgentBridge([])
    const { service, snapshotRepository } = createAgentToolHarness(bridge)
    snapshotRepository.findOne.mockResolvedValue({
      id: 'snapshot-empty-comments',
      documentId: 'document-1',
      versionId: 'version-1',
      comments: 'No comments.'
    })
    jest.spyOn(docxAgentsServer, 'executeToolCall').mockImplementation((toolName) => {
      if (toolName === 'read_comments') {
        return {
          success: true,
          data: [
            {
              id: 7,
              author: 'Xpert DOCX Assistant',
              text: 'Check this clause.',
              anchoredText: 'risk clause'
            }
          ]
        } as never
      }
      return { success: true, data: [] } as never
    })

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_read_comments',
      input: {}
    })

    expect(docxAgentsServer.executeToolCall).toHaveBeenCalledWith('read_comments', {}, bridge)
    expect(response.result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              id: 7,
              text: 'Check this clause.',
              anchoredText: 'risk clause'
            })
          ],
          returnedCount: 1
        })
      })
    )
  })

  it('supports docx_suggest_change changes[] and saves one new version', async () => {
    const bridge = createAgentBridge([
      { paraId: 'p1', text: 'First old paragraph.' },
      { paraId: 'p2', text: 'Second old paragraph.' }
    ])
    const { service, workspaceFiles, snapshotRepository } = createAgentToolHarness(bridge)
    jest.spyOn(docxAgentsServer, 'executeToolCall').mockImplementation((toolName) => {
      if (toolName === 'read_comments') {
        return { success: true, data: [{ id: 1, text: 'comment' }] } as never
      }
      if (toolName === 'read_changes') {
        return { success: true, data: [{ id: 2, type: 'replace' }, { id: 3, type: 'replace' }] } as never
      }
      return { success: true, data: [] } as never
    })

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_suggest_change',
      input: {
        changes: [
          { paraId: 'p1', search: 'First old paragraph.', replaceWith: 'First new paragraph.' },
          { paraId: 'p2', search: 'Second old paragraph.', replaceWith: 'Second new paragraph.' }
        ]
      }
    })

    expect(bridge.proposeChange).toHaveBeenCalledTimes(2)
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledTimes(1)
    expect(response.result).toEqual(expect.objectContaining({ success: true, appliedCount: 2 }))
    expect(response.operation).toEqual(expect.objectContaining({ id: 'operation-1', toolName: 'docx_suggest_change' }))
    expect(response.operation).not.toHaveProperty('tenantId')
    expect(response.operation).not.toHaveProperty('input')
    expect(response.version).toEqual({ id: 'version-2' })
    expect(response.document).toEqual({ id: 'document-1' })
    expect(snapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'document-1',
        versionId: 'version-2',
        comments: [{ id: 1, text: 'comment' }],
        changes: [{ id: 2, type: 'replace' }, { id: 3, type: 'replace' }]
      })
    )
  })

  it('keeps the legacy single-paragraph docx_suggest_change input', async () => {
    const bridge = createAgentBridge([
      { paraId: 'p1', text: 'Old paragraph text.' }
    ])
    const { service, workspaceFiles } = createAgentToolHarness(bridge)

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_suggest_change',
      input: {
        paraId: 'p1',
        search: 'Old paragraph text.',
        replaceWith: 'New paragraph text.'
      }
    })

    expect(bridge.proposeChange).toHaveBeenCalledWith({
      paraId: 'p1',
      search: 'Old paragraph text.',
      replaceWith: 'New paragraph text.'
    })
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledTimes(1)
    expect(response.result).toEqual(expect.objectContaining({ success: true, appliedCount: 1 }))
  })

  it('accepts all tracked changes and saves one compact result version', async () => {
    const bridge = createAgentBridge([])
    const { service, reviewer, workspaceFiles } = createAgentToolHarness(bridge, {
      acceptAll: jest.fn(() => 3)
    })

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_accept_all_changes',
      input: {
        includeFootnotes: true
      }
    })

    expect(reviewer.acceptAll).toHaveBeenCalledWith({
      includeFootnotes: true,
      includeEndnotes: false
    })
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledTimes(1)
    expect(response.result).toEqual(
      expect.objectContaining({
        success: true,
        appliedCount: 3,
        data: expect.objectContaining({
          acceptedCount: 3,
          includeFootnotes: true
        })
      })
    )
    expect(response.version).toEqual({ id: 'version-2' })
    expect(response.document).toEqual({ id: 'document-1' })
  })

  it('does not save a new version when a bulk review operation affects no items', async () => {
    const bridge = createAgentBridge([])
    const { service, workspaceFiles } = createAgentToolHarness(bridge, {
      rejectAll: jest.fn(() => 0)
    })

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_reject_all_changes',
      input: {}
    })

    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
    expect(response.result).toEqual(expect.objectContaining({ success: true, appliedCount: 0 }))
    expect(response.version).toEqual({ id: 'version-1' })
  })

  it('deletes all comments and saves one new version', async () => {
    const bridge = createAgentBridge([])
    const { service, reviewer, workspaceFiles } = createAgentToolHarness(bridge, {
      getComments: jest.fn(() => [
        {
          id: 7,
          text: 'Top-level comment',
          replies: [{ id: 8, text: 'Reply' }]
        },
        {
          id: 9,
          text: 'Second comment',
          replies: []
        }
      ]),
      removeComment: jest.fn()
    })

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_delete_all_comments',
      input: {}
    })

    expect(reviewer.removeComment).toHaveBeenCalledWith(7)
    expect(reviewer.removeComment).toHaveBeenCalledWith(9)
    expect(reviewer.removeComment).not.toHaveBeenCalledWith(8)
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledTimes(1)
    expect(response.result).toEqual(
      expect.objectContaining({
        success: true,
        appliedCount: 3,
        data: expect.objectContaining({
          deletedCount: 3,
          rootDeletedCount: 2
        })
      })
    )
  })

  it('rejects ambiguous tracked change ids before saving a version', async () => {
    const bridge = createAgentBridge([])
    const { service, workspaceFiles } = createAgentToolHarness(bridge, {
      getChanges: jest.fn(() => [
        {
          id: 5,
          type: 'deletion',
          author: 'A',
          date: null,
          text: 'body',
          context: 'body context',
          paragraphIndex: 1
        },
        {
          id: 5,
          type: 'deletion',
          author: 'A',
          date: null,
          text: 'note',
          context: 'note context',
          paragraphIndex: 1,
          noteId: 2,
          noteType: 'footnote'
        }
      ])
    })

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_accept_change',
      input: {
        changeId: 5
      }
    })

    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
    expect(response.result).toEqual(
      expect.objectContaining({
        success: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            reason: 'ambiguous_change_id'
          })
        ])
      })
    )
  })

  it.each([
    {
      name: 'missing paraId',
      paragraphs: [{ paraId: 'p1', text: 'Existing text.' }],
      input: {
        changes: [{ paraId: 'missing', search: 'Existing text.', replaceWith: 'Replacement.' }]
      },
      reason: 'paraId_not_found'
    },
    {
      name: 'search not found',
      paragraphs: [{ paraId: 'p1', text: 'Existing text.' }],
      input: {
        changes: [{ paraId: 'p1', search: 'Other text.', replaceWith: 'Replacement.' }]
      },
      reason: 'search_not_found'
    },
    {
      name: 'search appears multiple times',
      paragraphs: [{ paraId: 'p1', text: 'Repeated text and repeated text.' }],
      input: {
        changes: [{ paraId: 'p1', search: 'repeated text', replaceWith: 'replacement text' }]
      },
      reason: 'search_ambiguous'
    }
  ])('does not save a new version when suggest-change preflight fails: $name', async ({ paragraphs, input, reason }) => {
    const bridge = createAgentBridge(paragraphs)
    const { service, workspaceFiles } = createAgentToolHarness(bridge)

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_suggest_change',
      input
    })

    expect(bridge.proposeChange).not.toHaveBeenCalled()
    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
    expect(response.result).toEqual(
      expect.objectContaining({
        success: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            reason
          })
        ])
      })
    )
  })

  it('rejects mixed single and batch docx_suggest_change input before saving a version', async () => {
    const bridge = createAgentBridge([
      { paraId: 'p1', text: 'Existing text.' }
    ])
    const { service, workspaceFiles } = createAgentToolHarness(bridge)

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_suggest_change',
      input: {
        paraId: 'p1',
        search: 'Existing text.',
        replaceWith: 'Replacement.',
        changes: [{ paraId: 'p1', search: 'Existing text.', replaceWith: 'Replacement.' }]
      }
    })

    expect(bridge.proposeChange).not.toHaveBeenCalled()
    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
    expect(response.result).toEqual(
      expect.objectContaining({
        success: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            reason: 'mixed_parameters'
          })
        ])
      })
    )
  })

  it('compacts large docx_read_document results with continuation metadata', async () => {
    const bridge = createAgentBridge([])
    const { service } = createAgentToolHarness(bridge)
    const lines = Array.from({ length: 120 }, (_, index) => `[p${index}] Paragraph ${index}.`)
    jest.spyOn(docxAgentsServer, 'executeToolCall').mockReturnValue({
      success: true,
      data: lines.join('\n')
    })

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_read_document',
      input: {
        fromIndex: 0
      }
    })

    expect(response.result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          returnedLineCount: 80,
          availableLineCount: 120,
          truncated: true,
          nextFromIndex: 80,
          continueHint: expect.stringContaining('fromIndex=80')
        })
      })
    )
    expect((response.result as { data: { text: string } }).data.text).toContain('[p0]')
    expect((response.result as { data: { text: string } }).data.text).not.toContain('[p100]')
  })

  it('compacts docx_find_text results to handles and bounded context', async () => {
    const bridge = createAgentBridge([])
    const { service } = createAgentToolHarness(bridge)
    jest.spyOn(docxAgentsServer, 'executeToolCall').mockReturnValue({
      success: true,
      data: Array.from({ length: 30 }, (_, index) => ({
        paraId: `p${index}`,
        match: 'needle',
        before: 'before '.repeat(200),
        after: 'after '.repeat(200),
        unusedLargeField: 'x'.repeat(5000)
      }))
    })

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_find_text',
      input: {
        query: 'needle'
      }
    })

    expect(response.result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          returnedCount: 20,
          availableCount: 30,
          truncated: true,
          refineHint: expect.any(String)
        })
      })
    )
    const data = (response.result as { data: { items: Array<Record<string, unknown>> } }).data
    expect(data.items[0]).toEqual(
      expect.objectContaining({
        paraId: 'p0',
        match: 'needle'
      })
    )
    expect(data.items[0]).not.toHaveProperty('unusedLargeField')
  })
})
