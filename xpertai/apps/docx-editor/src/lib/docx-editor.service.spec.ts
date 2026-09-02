import * as docxAgentsServer from '@eigenpal/docx-editor-agents/server'
import { WorkspaceFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { DocxEditorService } from './docx-editor.service.js'
import { DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY, type DocxEditorScope } from './types.js'
import { DocxEditorVersion } from './entities/index.js'

jest.mock('@eigenpal/docx-editor-agents/server', () => {
  const actual = jest.requireActual('@eigenpal/docx-editor-agents/server')
  return {
    ...actual,
    createReviewerBridge: jest.fn(actual.createReviewerBridge),
    executeToolCall: jest.fn(actual.executeToolCall)
  }
})

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
    delete: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
    manager: {
      transaction: jest.fn()
    }
  })

  const attachTransactionManager = (
    documentRepository: ReturnType<typeof createRepository>,
    versionRepository: ReturnType<typeof createRepository>
  ) => {
    documentRepository.manager.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: (entity: unknown) => entity === DocxEditorVersion ? versionRepository : documentRepository
      })
    )
  }

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
    deleteFile: jest.fn(async () => undefined)
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
    attachTransactionManager(documentRepository, versionRepository)
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
    attachTransactionManager(documentRepository, versionRepository)
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

  it('uses the current scoped runtime capability when the global registry is unbound', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    const scopedCapabilities = {
      get: jest.fn((key) => key === WorkspaceFilesRuntimeCapability ? workspaceFiles : undefined)
    }
    const runtimeService = {
      createScopedApi: jest.fn(() => ({ capabilities: scopedCapabilities }))
    }
    documentRepository.findOne.mockResolvedValue({
      id: 'document-1',
      title: 'Project contract',
      projectId: 'project-1',
      assistantId: 'xpert-1',
      currentVersionNumber: 0
    })
    versionRepository.save.mockImplementation(async (value) => ({ ...value, id: 'version-1' }))
    attachTransactionManager(documentRepository, versionRepository)
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never,
      { get: jest.fn(() => undefined) } as never,
      undefined,
      runtimeService as never
    )

    await service.saveDocumentVersion(
      {
        ...scope,
        projectId: 'project-1',
        workspaceFiles: {
          catalog: 'projects',
          scopeId: 'project-1',
          projectId: 'project-1',
          userId: 'user-1',
          isolateByUser: false
        }
      },
      {
        documentId: 'document-1',
        docxBase64: Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString('base64'),
        fileName: 'project-contract.docx'
      }
    )

    expect(runtimeService.createScopedApi).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      workspaceId: null,
      projectId: 'project-1',
      xpertId: 'xpert-1',
      conversationId: undefined,
      catalog: 'projects',
      scopeId: 'project-1',
      isolateByUser: false
    })
    expect(scopedCapabilities.get).toHaveBeenCalledWith(WorkspaceFilesRuntimeCapability)
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledTimes(1)
  })

  it('removes a newly created draft when its first version cannot be stored', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    workspaceFiles.uploadBuffer.mockRejectedValue(new Error('storage failed'))
    documentRepository.save.mockImplementation(async (value) => ({ ...value, id: 'document-created' }))
    documentRepository.findOne.mockResolvedValue({
      id: 'document-created',
      title: 'Failed upload',
      assistantId: 'xpert-1',
      currentVersionNumber: 0
    })
    documentRepository.delete.mockResolvedValue({ affected: 1 })
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never,
      {
        get: jest.fn((key) => key === DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY ? workspaceFiles : undefined)
      } as never
    )

    await expect(service.uploadDocx(scope, {
      title: 'Failed upload',
      fileName: 'failed.docx',
      docxBase64: Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString('base64')
    })).rejects.toThrow('storage failed')

    expect(documentRepository.delete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'document-created' })
    )
  })

  it('does not delete the successful version file when a concurrent save loses the version race', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const storedFiles = new Map<string, Buffer>()
    const workspaceFiles = {
      uploadBuffer: jest.fn(async (input) => {
        const filePath = `${input.folder}/${input.fileName}`
        storedFiles.set(filePath, Buffer.from(input.buffer))
        return {
          name: input.fileName,
          filePath,
          workspacePath: filePath,
          catalog: input.catalog,
          scopeId: input.scopeId,
          size: input.buffer.byteLength
        }
      }),
      readBuffer: jest.fn(async ({ filePath }) => {
        const buffer = storedFiles.get(filePath)
        if (!buffer) throw new Error('File not found')
        return { filePath, buffer: Buffer.from(buffer) }
      }),
      deleteFile: jest.fn(async ({ filePath }) => {
        storedFiles.delete(filePath)
      })
    }
    const document = {
      id: 'document-1',
      title: 'Contract',
      assistantId: 'xpert-1',
      currentVersionNumber: 0
    }
    documentRepository.findOne.mockResolvedValue(document)
    versionRepository.save
      .mockImplementationOnce(async (value) => ({ ...value, id: 'version-1' }))
      .mockRejectedValueOnce(Object.assign(new Error('duplicate version'), {
        driverError: { code: '23505' }
      }))
    attachTransactionManager(documentRepository, versionRepository)
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never,
      {
        get: jest.fn((key) => (key === DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY ? workspaceFiles : undefined))
      } as never
    )
    const input = {
      documentId: 'document-1',
      expectedVersionNumber: 0,
      docxBase64: Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString('base64'),
      fileName: 'contract.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }

    const successful = await service.saveDocumentVersion(scope, input)
    const successfulPath = successful.version.workspaceFilePath

    await expect(service.saveDocumentVersion(scope, input)).rejects.toThrow(
      'DOCX document was changed by another editor'
    )
    await expect(workspaceFiles.readBuffer({ filePath: successfulPath })).resolves.toMatchObject({
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04])
    })
  })

  it('imports a generated runtime DOCX as an official editor document and version', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    const runtimeWorkspaceFiles = {
      ...workspaceFiles,
      readRuntimeBuffer: jest.fn(async () => ({
        name: 'generated.docx',
        filePath: 'sessions/conversation-1/generated.docx',
        workspacePath: '/workspace/generated.docx',
        catalog: 'xperts',
        buffer: docxBuffer,
        reference: {
          source: 'platform.workspace.files',
          filePath: 'sessions/conversation-1/generated.docx',
          workspacePath: '/workspace/generated.docx',
          originalName: 'generated.docx',
          catalog: 'xperts',
          xpertId: 'xpert-1'
        }
      }))
    }
    documentRepository.save.mockImplementation(async (value) => ({ ...value, id: 'document-created' }))
    documentRepository.findOne.mockResolvedValue({
      id: 'document-created',
      title: 'Generated report',
      assistantId: 'xpert-1',
      currentVersionNumber: 0
    })
    versionRepository.save.mockImplementation(async (value) => ({ ...value, id: 'version-created' }))
    attachTransactionManager(documentRepository, versionRepository)
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never,
      {
        get: jest.fn((key) => (key === DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY ? workspaceFiles : undefined))
      } as never
    )

    const result = await service.importRuntimeFile(
      scope,
      { file: '/workspace/generated.docx', title: 'Generated report' },
      runtimeWorkspaceFiles as never
    )

    expect(runtimeWorkspaceFiles.readRuntimeBuffer).toHaveBeenCalledWith('/workspace/generated.docx')
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: docxBuffer,
        originalName: 'generated.docx',
        metadata: expect.objectContaining({ source: 'agent' })
      })
    )
    expect(result).toEqual(expect.objectContaining({
      documentId: 'document-created',
      versionId: 'version-created',
      versionNumber: 1
    }))
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

  it('loads the requested version bytes from workspace files for the Workbench', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    workspaceFiles.readBuffer.mockImplementation(async (input) => ({
      name: input.filePath.endsWith('v1-history.docx') ? 'v1-history.docx' : 'v2-current.docx',
      filePath: input.filePath,
      workspacePath: input.filePath,
      buffer: input.filePath.endsWith('v1-history.docx')
        ? Buffer.from([0x50, 0x4b, 0x01, 0x00])
        : Buffer.from([0x50, 0x4b, 0x02, 0x00])
    }))
    documentRepository.findOne.mockResolvedValue({
      id: 'document-1',
      title: 'Contract',
      assistantId: 'xpert-1',
      currentVersionId: 'version-2',
      currentVersionNumber: 2
    })
    versionRepository.find.mockResolvedValue([
      {
        id: 'version-2',
        documentId: 'document-1',
        versionNumber: 2,
        workspaceFilePath: 'files/docx-editor/documents/document-1/versions/v2-current.docx',
        workspaceCatalog: 'xperts',
        workspaceScopeId: 'xpert-1',
        size: 4
      },
      {
        id: 'version-1',
        documentId: 'document-1',
        versionNumber: 1,
        workspaceFilePath: 'files/docx-editor/documents/document-1/versions/v1-history.docx',
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
      { documentId: 'document-1', versionId: 'version-1' }
    )

    expect(workspaceFiles.readBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'files/docx-editor/documents/document-1/versions/v1-history.docx'
      })
    )
    expect(data.currentVersion?.id).toBe('version-1')
    expect(data.currentVersion?.versionNumber).toBe(1)
    expect(data.currentVersion?.docxBase64).toBe(Buffer.from([0x50, 0x4b, 0x01, 0x00]).toString('base64'))
  })

  it('uses the canonical workspace scope returned by the host when persisting a save', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    workspaceFiles.uploadBuffer.mockResolvedValue({
      name: 'v1-private.docx',
      filePath: 'files/docx-editor/documents/document-1/versions/v1-private.docx',
      workspacePath: 'files/docx-editor/documents/document-1/versions/v1-private.docx',
      catalog: 'user-xperts',
      scopeId: 'canonical-xpert-1',
      size: 4
    })
    documentRepository.findOne.mockResolvedValue({
      id: 'document-1',
      title: 'Private contract',
      assistantId: 'xpert-1',
      createdById: 'user-1',
      currentVersionNumber: 0
    })
    versionRepository.save.mockImplementation(async (value) => ({ ...value, id: 'version-1' }))
    attachTransactionManager(documentRepository, versionRepository)
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
        ...scope,
        workspaceFiles: {
          catalog: 'user-xperts',
          scopeId: 'xpert-1',
          xpertId: 'xpert-1',
          userId: 'user-1',
          isolateByUser: true
        }
      },
      {
        documentId: 'document-1',
        docxBase64: Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString('base64')
      }
    )

    expect(versionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceCatalog: 'user-xperts',
        workspaceScopeId: 'canonical-xpert-1'
      })
    )
    expect(documentRepository.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceCatalog: 'user-xperts',
        workspaceScopeId: 'canonical-xpert-1'
      })
    )
  })

  it('shares Project document queries without filtering by creator', async () => {
    const documentRepository = createRepository()
    documentRepository.findAndCount.mockResolvedValue([[], 0])
    const service = new DocxEditorService(
      documentRepository as never,
      createRepository() as never,
      createRepository() as never,
      createRepository() as never
    )

    await service.getWorkbenchData({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      userId: 'user-2',
      assistantId: 'xpert-1',
      workspaceFiles: {
        catalog: 'projects',
        scopeId: 'project-1',
        projectId: 'project-1',
        userId: 'user-2',
        isolateByUser: false
      }
    }, {})

    const where = documentRepository.findAndCount.mock.calls[0][0].where
    expect(where).toEqual(expect.objectContaining({ projectId: 'project-1' }))
    expect(where).not.toHaveProperty('createdById')
    expect(where).not.toHaveProperty('assistantId')
  })

  it('reads private user-xperts versions with the current authorized user scope', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    documentRepository.findOne.mockResolvedValue({
      id: 'document-1',
      title: 'Private contract',
      assistantId: 'xpert-1',
      createdById: 'user-1',
      currentVersionId: 'version-1',
      currentVersionNumber: 1
    })
    versionRepository.find.mockResolvedValue([
      {
        id: 'version-1',
        documentId: 'document-1',
        versionNumber: 1,
        workspaceFilePath: 'files/docx-editor/documents/document-1/versions/v1-private.docx',
        workspaceCatalog: 'user-xperts',
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

    await service.getWorkbenchData(
      {
        ...scope,
        workspaceFiles: {
          catalog: 'user-xperts',
          scopeId: 'xpert-1',
          xpertId: 'xpert-1',
          userId: 'user-1',
          isolateByUser: true
        }
      },
      { documentId: 'document-1' }
    )

    expect(workspaceFiles.readBuffer).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      catalog: 'user-xperts',
      scopeId: 'xpert-1',
      xpertId: 'xpert-1',
      isolateByUser: true,
      filePath: 'files/docx-editor/documents/document-1/versions/v1-private.docx'
    })
  })

  it('restores and deletes private user-xperts versions in their persisted scope', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    const workspaceFiles = createWorkspaceFiles()
    const document = {
      id: 'document-1',
      title: 'Private contract',
      assistantId: 'xpert-1',
      createdById: 'user-1',
      currentVersionId: 'version-1',
      currentVersionNumber: 1
    }
    const version = {
      id: 'version-1',
      documentId: 'document-1',
      versionNumber: 1,
      workspaceFilePath: 'files/docx-editor/documents/document-1/versions/v1-private.docx',
      workspaceCatalog: 'user-xperts' as const,
      workspaceScopeId: 'xpert-1',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 4
    }
    documentRepository.findOne.mockResolvedValue(document)
    versionRepository.findOne.mockResolvedValue(version)
    versionRepository.find.mockResolvedValue([version])
    versionRepository.save.mockImplementation(async (value) => ({ ...value, id: 'version-2' }))
    workspaceFiles.uploadBuffer.mockResolvedValue({
      name: 'v2-private.docx',
      filePath: 'files/docx-editor/documents/document-1/versions/v2-private.docx',
      workspacePath: 'files/docx-editor/documents/document-1/versions/v2-private.docx',
      catalog: 'user-xperts',
      scopeId: 'xpert-1',
      size: 4
    })
    attachTransactionManager(documentRepository, versionRepository)
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never,
      {
        get: jest.fn((key) => (key === DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY ? workspaceFiles : undefined))
      } as never
    )
    const privateScope: DocxEditorScope = {
      ...scope,
      workspaceFiles: {
        catalog: 'user-xperts',
        scopeId: 'xpert-1',
        xpertId: 'xpert-1',
        userId: 'user-1',
        isolateByUser: true
      }
    }

    await service.restoreVersion(privateScope, {
      documentId: 'document-1',
      versionId: 'version-1'
    })
    await service.deleteDocument(privateScope, 'document-1')

    expect(workspaceFiles.readBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: 'user-xperts',
        scopeId: 'xpert-1',
        xpertId: 'xpert-1',
        userId: 'user-1',
        isolateByUser: true
      })
    )
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: 'user-xperts',
        scopeId: 'xpert-1',
        xpertId: 'xpert-1',
        userId: 'user-1',
        isolateByUser: true
      })
    )
    expect(workspaceFiles.deleteFile).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      catalog: 'user-xperts',
      scopeId: 'xpert-1',
      xpertId: 'xpert-1',
      isolateByUser: true,
      filePath: 'files/docx-editor/documents/document-1/versions/v1-private.docx'
    })
  })

  it('authorizes an operation through its parent document before completing it', async () => {
    const documentRepository = createRepository()
    const versionRepository = createRepository()
    const snapshotRepository = createRepository()
    const operationRepository = createRepository()
    operationRepository.findOne.mockResolvedValue({
      id: 'operation-foreign',
      documentId: 'document-foreign',
      status: 'queued'
    })
    documentRepository.findOne.mockResolvedValue(null)
    const service = new DocxEditorService(
      documentRepository as never,
      versionRepository as never,
      snapshotRepository as never,
      operationRepository as never
    )

    await expect(
      service.completeOperation(
        {
          ...scope,
          workspaceFiles: {
            catalog: 'user-xperts',
            scopeId: 'xpert-1',
            xpertId: 'xpert-1',
            userId: 'user-1',
            isolateByUser: true
          }
        },
        { operationId: 'operation-foreign', status: 'applied' }
      )
    ).rejects.toThrow('DOCX document was not found.')
    expect(documentRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'document-foreign',
          assistantId: 'xpert-1',
          createdById: 'user-1'
        })
      })
    )
    expect(operationRepository.save).not.toHaveBeenCalled()
  })

  it('uses the same authorized document scope for list queries', async () => {
    const documentRepository = createRepository()
    documentRepository.findAndCount.mockResolvedValue([[], 0])
    const repository = createRepository()
    const service = new DocxEditorService(
      documentRepository as never,
      repository as never,
      repository as never,
      repository as never
    )

    await service.getWorkbenchData(
      {
        ...scope,
        workspaceFiles: {
          catalog: 'user-xperts',
          scopeId: 'xpert-1',
          xpertId: 'xpert-1',
          userId: 'user-1',
          isolateByUser: true
        }
      },
      {}
    )

    expect(documentRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          workspaceId: 'workspace-1',
          assistantId: 'xpert-1',
          createdById: 'user-1'
        })
      })
    )
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

  it('queues live Workbench changes without creating a new version', async () => {
    const bridge = createAgentBridge([
      { paraId: 'p1', text: 'Old paragraph text.' }
    ])
    const { service, workspaceFiles, operationRepository } = createAgentToolHarness(bridge)

    const response = await service.runAgentTool(scope, {
      documentId: 'document-1',
      toolName: 'docx_suggest_change',
      executionTarget: 'workbench_live',
      input: {
        paraId: 'p1',
        search: 'Old paragraph text.',
        replaceWith: 'New paragraph text.',
        executionTarget: 'workbench_live'
      }
    })

    expect(docxAgentsServer.DocxReviewer.fromBuffer).not.toHaveBeenCalled()
    expect(bridge.proposeChange).not.toHaveBeenCalled()
    expect(workspaceFiles.readBuffer).not.toHaveBeenCalled()
    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
    expect(operationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'document-1',
        versionId: 'version-1',
        toolName: 'docx_suggest_change',
        status: 'queued',
        input: {
          paraId: 'p1',
          search: 'Old paragraph text.',
          replaceWith: 'New paragraph text.'
        },
        result: expect.objectContaining({
          success: true,
          queued: true,
          source: 'workbench_live'
        })
      })
    )
    expect(response.operation).toEqual(
      expect.objectContaining({
        id: 'operation-1',
        status: 'queued',
        toolName: 'docx_suggest_change'
      })
    )
    expect(response.result).toEqual(
      expect.objectContaining({
        success: true,
        queued: true,
        source: 'workbench_live'
      })
    )
    expect(response.version).toEqual({ id: 'version-1' })
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
      paragraphs: [{ paraId: 'p1', text: 'repeated text and repeated text.' }],
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
