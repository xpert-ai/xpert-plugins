import assert from 'node:assert/strict'
import test from 'node:test'
import { DocxEditorService } from './docx-editor.service.js'
import { DocxEditorDocument } from './entities/docx-editor-document.entity.js'
import { DocxEditorVersion } from './entities/docx-editor-version.entity.js'
import { DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY } from './types.js'

test('imports an Agent runtime DOCX into an official editor version', async () => {
  let document: Record<string, unknown> | null = null
  const documentRepository = {
    create: (value: Record<string, unknown>) => value,
    save: async (value: Record<string, unknown>) => {
      document = { ...value, id: value.id ?? 'document-created' }
      return document
    },
    update: async (_where: unknown, value: Record<string, unknown>) => {
      document = { ...(document ?? {}), ...value }
      return { affected: 1 }
    },
    findOne: async () => document
  }
  const versionRepository = {
    create: (value: Record<string, unknown>) => value,
    save: async (value: Record<string, unknown>) => ({ ...value, id: 'version-created' })
  }
  Object.assign(documentRepository, {
    manager: {
      transaction: async (
        callback: (manager: {
          getRepository: (entity: unknown) => typeof documentRepository | typeof versionRepository
        }) => Promise<unknown>
      ) =>
        callback({
          getRepository: (entity: unknown) =>
            entity === DocxEditorVersion ? versionRepository : entity === DocxEditorDocument ? documentRepository : documentRepository
        })
    }
  })
  const workspaceFiles = {
    uploadBuffer: async (input: Record<string, unknown>) => ({
      name: input.fileName,
      filePath: `files/docx-editor/documents/document-created/versions/${String(input.fileName)}`,
      workspacePath: `files/docx-editor/documents/document-created/versions/${String(input.fileName)}`,
      catalog: 'xperts',
      scopeId: 'xpert-1',
      size: input.size
    }),
    deleteFile: async () => undefined
  }
  const runtimeDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04])
  const runtimeWorkspaceFiles = {
    ...workspaceFiles,
    readRuntimeBuffer: async (input: unknown) => ({
      name: 'generated.docx',
      filePath: 'sessions/conversation-1/generated.docx',
      workspacePath: '/workspace/generated.docx',
      catalog: 'xperts',
      scopeId: 'xpert-1',
      buffer: runtimeDocx,
      reference: {
        source: 'platform.workspace.files',
        filePath: 'sessions/conversation-1/generated.docx',
        workspacePath: typeof input === 'string' ? input : '/workspace/generated.docx',
        originalName: 'generated.docx',
        catalog: 'xperts',
        xpertId: 'xpert-1'
      }
    })
  }
  const service = new DocxEditorService(
    documentRepository as never,
    versionRepository as never,
    {} as never,
    {} as never,
    {
      get: (key: unknown) => key === DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY ? workspaceFiles : undefined
    } as never
  )

  const result = await service.importRuntimeFile(
    { tenantId: 'tenant-1', assistantId: 'xpert-1', conversationId: 'conversation-1' },
    { file: '/workspace/generated.docx', title: 'Generated report' },
    runtimeWorkspaceFiles as never
  )

  assert.equal(result.documentId, 'document-created')
  assert.equal(result.versionId, 'version-created')
  assert.equal(result.versionNumber, 1)
  assert.equal(result.document.currentVersionId, 'version-created')
  assert.equal(result.version.source, 'agent')
  assert.equal(result.importedFile.workspacePath, '/workspace/generated.docx')
})
