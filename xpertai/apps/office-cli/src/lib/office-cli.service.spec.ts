jest.mock('@xpert-ai/plugin-sdk', () => ({
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('runtime-capabilities'),
  pluginArtifactTableName: (namespace: string, key: string) => `${namespace}_${key}`
}))

import { formatPreviewError, OfficeCliService } from './office-cli.service.js'
import type { OfficeCliScope } from './types.js'
import { createHash } from 'node:crypto'

const scope: OfficeCliScope = {
  tenantId: 'tenant-a',
  organizationId: 'organization-a',
  projectId: 'project-a',
  userId: 'user-a'
}

function createFixture() {
  const documentRepository = {
    findOne: jest.fn(),
    delete: jest.fn(async () => ({ affected: 1 }))
  }
  const versionRepository = {
    find: jest.fn(),
    delete: jest.fn(async () => ({ affected: 1 }))
  }
  const deleteFile = jest.fn(async () => undefined)
  const runtimeCapabilities = {
    get: jest.fn(() => ({ deleteFile }))
  }
  const service = new OfficeCliService(
    documentRepository as never,
    versionRepository as never,
    {} as never,
    runtimeCapabilities as never
  )
  return { service, documentRepository, versionRepository, deleteFile }
}

describe('OfficeCliService file management', () => {
  it('turns runtime download failures into an actionable Chinese preview message', () => {
    expect(formatPreviewError(new Error('fetch failed'))).toContain('运行时尚未准备完成')
    expect(formatPreviewError(new Error('OfficeCLI view timed out'))).toContain('生成预览超时')
  })

  it('writes a stable current file into the sandbox-visible files tree and archives the version', async () => {
    const buffer = Buffer.from('native-office-file')
    const checksum = createHash('sha256').update(buffer).digest('hex')
    let currentDocument = {
      id: 'document-a',
      format: 'xlsx',
      title: '销售汇总',
      status: 'draft',
      fileName: '销售汇总.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      currentVersionId: undefined,
      currentVersionNumber: 0
    }
    const documentRepository = {
      findOne: jest.fn(async () => currentDocument),
      save: jest.fn(async (value) => {
        currentDocument = value
        return value
      })
    }
    const versionRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'version-1' })),
      find: jest.fn(async () => []),
      delete: jest.fn(async () => ({ affected: 1 }))
    }
    const writeRuntimeBuffer = jest.fn(async (input) => {
      const filePath = `${input.folder}/${input.fileName}`
      const workspacePath = `/workspace/${filePath}`
      return {
        name: input.fileName,
        filePath,
        workspacePath,
        catalog: input.catalog,
        scopeId: input.scopeId,
        mimeType: input.mimeType,
        size: input.buffer.byteLength,
        reference: {
          source: 'platform.workspace.files',
          filePath,
          workspacePath,
          catalog: input.catalog,
          scopeId: input.scopeId,
          projectId: input.projectId,
          originalName: input.originalName,
          name: input.fileName,
          mimeType: input.mimeType,
          size: input.buffer.byteLength
        }
      }
    })
    const runtimeCapabilities = {
      get: jest.fn(() => ({
        writeRuntimeBuffer,
        deleteFile: jest.fn(async () => undefined)
      }))
    }
    const service = new OfficeCliService(
      documentRepository as never,
      versionRepository as never,
      {} as never,
      runtimeCapabilities as never
    )

    const result = await (service as unknown as {
      saveVersion(
        scope: OfficeCliScope,
        document: typeof currentDocument,
        buffer: Buffer,
        metadata: { source: 'create'; command: string }
      ): Promise<any>
    }).saveVersion(scope, currentDocument, buffer, {
      source: 'create',
      command: 'create'
    })

    expect(writeRuntimeBuffer).toHaveBeenNthCalledWith(1, expect.objectContaining({
      folder: 'files/office-cli/documents/document-a/.versions',
      fileName: `v000001-${checksum.slice(0, 12)}.xlsx`
    }))
    expect(writeRuntimeBuffer).toHaveBeenNthCalledWith(2, expect.objectContaining({
      folder: 'files/office-cli/documents/document-a',
      fileName: '销售汇总.xlsx'
    }))
    expect(result.file).toMatchObject({
      filePath: '/workspace/files/office-cli/documents/document-a/销售汇总.xlsx',
      workspacePath: '/workspace/files/office-cli/documents/document-a/销售汇总.xlsx',
      storageFilePath: 'files/office-cli/documents/document-a/销售汇总.xlsx',
      fileRef: {
        source: 'platform.workspace.files',
        filePath: 'files/office-cli/documents/document-a/销售汇总.xlsx'
      }
    })
    expect(result.version.workspaceFilePath).toBe(
      `files/office-cli/documents/document-a/.versions/v000001-${checksum.slice(0, 12)}.xlsx`
    )
    expect(currentDocument.workspaceFilePath).toBe(
      'files/office-cli/documents/document-a/销售汇总.xlsx'
    )
  })

  it('permanently deletes the document, its version rows, and workspace files', async () => {
    const fixture = createFixture()
    fixture.documentRepository.findOne.mockResolvedValue({
      id: 'document-a',
      status: 'active'
    })
    fixture.versionRepository.find.mockResolvedValue([
      {
        id: 'version-1',
        documentId: 'document-a',
        workspaceCatalog: 'projects',
        workspaceScopeId: 'project-a',
        workspaceFilePath: 'files/office-cli/document-a/versions/v1.xlsx'
      },
      {
        id: 'version-2',
        documentId: 'document-a',
        workspaceCatalog: 'projects',
        workspaceScopeId: 'project-a',
        workspaceFilePath: 'files/office-cli/document-a/versions/v2.xlsx'
      }
    ])

    await expect(fixture.service.deleteDocument(scope, 'document-a')).resolves.toMatchObject({
      documentId: 'document-a',
      deleted: true,
      deletedVersions: 2,
      deletedWorkspaceFiles: 2,
      workspaceFilesDeleted: true
    })
    expect(fixture.deleteFile).toHaveBeenCalledTimes(2)
    expect(fixture.versionRepository.delete).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'document-a'
    }))
    expect(fixture.documentRepository.delete).toHaveBeenCalledWith(expect.objectContaining({
      id: 'document-a'
    }))
  })

  it('retains only the latest five versions and removes older workspace files', async () => {
    const fixture = createFixture()
    fixture.versionRepository.find.mockResolvedValue([
      {
        id: 'version-1',
        documentId: 'document-a',
        versionNumber: 1,
        workspaceCatalog: 'projects',
        workspaceScopeId: 'project-a',
        workspaceFilePath: 'files/office-cli/document-a/versions/v1.xlsx'
      }
    ])

    await (fixture.service as unknown as {
      pruneOldVersions(scope: OfficeCliScope, documentId: string): Promise<void>
    }).pruneOldVersions(scope, 'document-a')

    expect(fixture.versionRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      order: { versionNumber: 'DESC' },
      skip: 5
    }))
    expect(fixture.deleteFile).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'files/office-cli/document-a/versions/v1.xlsx'
    }))
    expect(fixture.versionRepository.delete).toHaveBeenCalledWith(expect.objectContaining({
      id: 'version-1'
    }))
  })

  it('coalesces repeated preview requests for the same immutable version', async () => {
    const renderHtml = jest.fn(async () => '<html>preview</html>')
    const service = new OfficeCliService(
      {} as never,
      {} as never,
      { renderHtml } as never,
      undefined
    )
    const previewService = service as unknown as {
      renderPreview(
        version: { id: string; checksum: string },
        buffer: Buffer,
        format: 'xlsx'
      ): Promise<string>
    }
    const version = { id: 'version-1', checksum: 'checksum-1' }
    const first = previewService.renderPreview(version, Buffer.from('one'), 'xlsx')
    const second = previewService.renderPreview(version, Buffer.from('one'), 'xlsx')

    await expect(Promise.all([first, second])).resolves.toEqual([
      '<html>preview</html>',
      '<html>preview</html>'
    ])
    expect(renderHtml).toHaveBeenCalledTimes(1)
  })

  it('defines real Word styles, inserts a TOC, and enables field updates without refresh', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    let revision = 0
    const executeDocumentCommand = jest.fn(async (input) => {
      calls.push({ command: input.command, args: input.args ?? [] })
      revision += 1
      if (input.command === 'get' && input.args?.[0] === '/styles') {
        return execution(input, {
          data: {
            results: [{
              children: [{ format: { styleId: 'Normal' } }]
            }]
          }
        }, revision)
      }
      if (input.command === 'query' && input.args?.[0] === 'paragraph[style="Heading 1"]') {
        return execution(input, {
          data: { results: [{ path: '/body/p[@paraId=ABC123]' }] }
        }, revision)
      }
      if (input.command === 'query' && input.args?.[0] === 'toc') {
        return execution(input, { data: { results: [] } }, revision)
      }
      if (input.command === 'get' && input.args?.[0] === '/body') {
        return execution(input, {
          data: {
            results: [{
              children: [{ type: 'paragraph', path: '/body/p[@paraId=TITLE01]' }]
            }]
          }
        }, revision)
      }
      if (input.command === 'raw') {
        return execution(input, { data: '<w:settings><w:compat/></w:settings>' }, revision)
      }
      if (input.command === 'validate') {
        return execution(input, { data: { count: 0, errors: [] } }, revision)
      }
      return execution(input, { success: true }, revision)
    })
    const service = new OfficeCliService(
      {} as never,
      {} as never,
      { executeDocumentCommand } as never,
      undefined
    )

    const result = await (service as unknown as {
      applyWordDesignToBuffer(
        buffer: Buffer,
        input: { includeTableOfContents: boolean }
      ): Promise<{
        styles: string[]
        remappedParagraphs: number
        tableOfContents: string
        warnings: string[]
      }>
    }).applyWordDesignToBuffer(Buffer.from('docx'), {
      includeTableOfContents: true
    })

    expect(result.styles).toEqual(expect.arrayContaining([
      'Normal',
      'Title',
      'Heading1',
      'Heading2',
      'Heading3',
      'TOCHeading',
      'TOC1',
      'TOC2',
      'TOC3'
    ]))
    expect(result.remappedParagraphs).toBe(1)
    expect(result.tableOfContents).toBe('created')
    expect(calls).toContainEqual(expect.objectContaining({
      command: 'raw-set',
      args: expect.arrayContaining(['<w:updateFields w:val="true"/>'])
    }))
    expect(calls.some((call) => call.command === 'refresh')).toBe(false)
    expect(calls.at(-1)?.command).toBe('validate')
  })
})

function execution(
  input: { command: string; args?: string[]; buffer: Buffer },
  json: unknown,
  revision: number
) {
  return {
    command: 'officecli',
    args: [input.command, ...(input.args ?? [])],
    exitCode: 0,
    stdout: JSON.stringify(json),
    stderr: '',
    json,
    durationMs: 1,
    fileBuffer: Buffer.from(`revision-${revision}`)
  }
}
