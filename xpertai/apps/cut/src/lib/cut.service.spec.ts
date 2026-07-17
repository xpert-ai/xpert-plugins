import type { Repository } from 'typeorm'
import type { AgentMiddlewareRuntimeCapabilityRegistry, WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol.for('xpert.runtime.capabilities')
}))

import { CutService } from './cut.service.js'
import { CutActionLog, CutExport, CutMediaAsset, CutProject, CutProjectVersion } from './entities/index.js'
import type { CutScope } from './types.js'

describe('CutService scoped persistence and Workspace Files', () => {
  it('uploads media, preserves portable references across iframe saves, and writes MP4 exports', async () => {
    const projects = memoryRepository<CutProject>()
    const versions = memoryRepository<CutProjectVersion>()
    const media = memoryRepository<CutMediaAsset>()
    const exports = memoryRepository<CutExport>()
    const logs = memoryRepository<CutActionLog>()
    const uploadBuffer = jest.fn(async (input) => ({
      name: input.originalName,
      filePath: `${input.folder}/${input.originalName}`,
      workspacePath: `/workspace/${input.folder}/${input.originalName}`,
      fileUrl: `https://files.example.test/${input.originalName}`,
      mimeType: input.mimeType ?? 'application/octet-stream',
      size: input.size ?? input.buffer.byteLength,
      catalog: input.catalog ?? 'projects',
      scopeId: input.scopeId ?? undefined
    }))
    const resolveRuntimeReference = jest.fn(async (input) => ({
      ...input,
      source: 'platform.workspace.files' as const,
      workspacePath: input.workspacePath ?? input.filePath,
      tenantId: input.tenantId ?? scope.tenantId
    }))
    const workspaceFiles = { uploadBuffer, resolveRuntimeReference } as Pick<WorkspaceFilesApi, 'uploadBuffer' | 'resolveRuntimeReference'>
    const runtimeCapabilities = { get: jest.fn(() => workspaceFiles) } as Pick<AgentMiddlewareRuntimeCapabilityRegistry, 'get'>
    const service = new CutService(
      projects.repository, versions.repository, media.repository, exports.repository, logs.repository,
      runtimeCapabilities as AgentMiddlewareRuntimeCapabilityRegistry
    )
    const scope: CutScope = {
      tenantId: 'tenant-a', organizationId: 'org-a', projectId: 'platform-project-a', userId: 'user-a', assistantId: 'assistant-a'
    }
    const created = await service.createProject(scope, { title: 'Cut service gate', changeSummary: 'Created service gate project.' })
    const projectId = created.item.id!
    await expect(service.saveProject(scope, {
      projectId,
      document: created.document,
      baseRevision: undefined as never,
      changeSummary: 'Unsafe save without a revision.'
    })).rejects.toThrow('baseRevision is required')
    const updateSpy = jest.spyOn(projects.repository, 'update').mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] })
    await expect(service.saveProject(scope, {
      projectId,
      document: created.document,
      baseRevision: created.item.revision,
      changeSummary: 'Lose a simulated compare-and-swap race.'
    })).rejects.toThrow('revision changed')
    updateSpy.mockRestore()
    expect((await service.getProject(scope, projectId)).item.revision).toBe(created.item.revision)
    const imported = await service.uploadMedia(scope, projectId, {
      buffer: Buffer.from('<svg/>'), originalName: 'gate.svg', mimeType: 'image/svg+xml', size: 6
    }, 5, created.item.revision, 'Imported gate media.', {
      codedWidth: 1920, codedHeight: 1080, displayWidth: 1080, displayHeight: 1920, rotationDegrees: 90
    })

    expect(imported.document.settings).toMatchObject({ width: 1920, height: 1080, durationSeconds: 30 })
    expect(imported.media).toMatchObject({
      duration: 5, codedWidth: 1920, codedHeight: 1080, displayWidth: 1080, displayHeight: 1920, rotationDegrees: 90
    })
    expect(imported.document.tracks[0]!.clips[0]!.source).toMatchObject({
      source: 'platform.workspace.files', tenantId: 'tenant-a', catalog: 'projects', scopeId: 'platform-project-a'
    })
    expect(imported.document.tracks[0]!.clips[0]!.previewUrl).toBeUndefined()
    expect(imported.media.previewUrl).toBeNull()
    expect(uploadBuffer).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a', catalog: 'projects', scopeId: 'platform-project-a', folder: `files/cut/${projectId}/media`
    }))

    const iframeDocument = structuredClone(imported.document)
    delete iframeDocument.tracks[0]!.clips[0]!.source
    iframeDocument.tracks[0]!.clips[0]!.previewUrl = 'https://api.example.test/api/workspace-files/content/session/grant/gate.svg'
    iframeDocument.tracks[0]!.clips[0]!.start = 2
    const saved = await service.saveProject(scope, {
      projectId, document: iframeDocument, baseRevision: imported.project.revision, changeSummary: 'Saved iframe timeline.'
    })
    expect(saved.changedClipIds).toEqual([imported.document.tracks[0]!.clips[0]!.id])
    expect(saved.document.tracks[0]!.clips[0]!.source?.source).toBe('platform.workspace.files')
    expect(saved.document.tracks[0]!.clips[0]!.start).toBe(2)
    expect(saved.document.tracks[0]!.clips[0]!.previewUrl).toBeUndefined()

    await expect(service.resolveMediaFile(scope, projectId, imported.media.id!)).resolves.toMatchObject({
      fileName: 'gate.svg',
      mimeType: 'image/svg+xml',
      reference: { source: 'platform.workspace.files', tenantId: 'tenant-a' }
    })
    await expect(service.resolveMediaFile({ ...scope, organizationId: 'org-b' }, projectId, imported.media.id!))
      .rejects.toThrow('current tenant and organization')
    await expect(service.resolveMediaFile({ ...scope, assistantId: 'assistant-b' }, projectId, imported.media.id!))
      .rejects.toThrow('current host project')

    const validated = await service.applyEditBatch(scope, {
      projectId,
      baseRevision: saved.project.revision,
      mode: 'validate',
      operations: [
        { kind: 'split', clipId: saved.document.tracks[0]!.clips[0]!.id, at: 4 },
        { kind: 'move', clipId: saved.document.tracks[0]!.clips[0]!.id, start: 0 }
      ],
      changeSummary: 'Validate two edits.'
    })
    expect(validated).toMatchObject({ applied: false, project: { revision: saved.project.revision } })
    expect((await service.getProject(scope, projectId)).document.tracks[0]!.clips).toHaveLength(1)

    const batch = await service.applyEditBatch(scope, {
      projectId,
      baseRevision: saved.project.revision,
      operations: [
        { kind: 'split', clipId: saved.document.tracks[0]!.clips[0]!.id, at: 4 },
        { kind: 'move', clipId: saved.document.tracks[0]!.clips[0]!.id, start: 0 }
      ],
      changeSummary: 'Apply two edits atomically.'
    })
    expect(batch).toMatchObject({ applied: true, project: { revision: saved.project.revision + 1 } })
    expect(batch.changedClipIds).toHaveLength(2)

    await expect(service.applyEditBatch(scope, {
      projectId,
      baseRevision: batch.project.revision,
      operations: [
        { kind: 'move', clipId: batch.document.tracks[0]!.clips[0]!.id, start: 1 },
        { kind: 'split', clipId: 'missing-clip', at: 2 }
      ],
      changeSummary: 'Reject a partially invalid batch.'
    })).rejects.toThrow('was not found')
    const afterRejectedBatch = await service.getProject(scope, projectId)
    expect(afterRejectedBatch.item.revision).toBe(batch.project.revision)
    expect(afterRejectedBatch.document).toEqual(batch.document)

    const exported = await service.saveExport(scope, projectId, {
      buffer: Buffer.from('mp4-gate'), originalName: 'gate.mp4', mimeType: 'video/mp4', size: 8
    }, 'Saved 30-second MP4 gate.')
    expect(exported.export.fileReference).toMatchObject({
      source: 'platform.workspace.files', tenantId: 'tenant-a', userId: 'user-a', catalog: 'projects'
    })
    expect(uploadBuffer).toHaveBeenLastCalledWith(expect.objectContaining({
      folder: `files/cut/${projectId}/exports`, mimeType: 'video/mp4'
    }))

    await expect(service.getProject({ ...scope, organizationId: 'org-b' }, projectId)).rejects.toThrow('current tenant and organization')
  })
})

function memoryRepository<T extends { id?: string; createdAt?: Date; updatedAt?: Date }>() {
  const rows: T[] = []
  let sequence = 0
  const repository = {
    create(input: T) { return { ...input } as T },
    async save(input: T) {
      const now = new Date()
      if (!input.id) input.id = `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
      input.createdAt ??= now
      input.updatedAt = now
      const index = rows.findIndex((row) => row.id === input.id)
      if (index >= 0) rows[index] = input
      else rows.push(input)
      return input
    },
    async findOne(options: { where: Partial<T> }) {
      return rows.find((row) => matches(row, options.where)) ?? null
    },
    async find(options: { where: Partial<T>; take?: number }) {
      const found = rows.filter((row) => matches(row, options.where))
      return options.take ? found.slice(0, options.take) : found
    },
    async update(criteria: Partial<T>, patch: Partial<T>) {
      const row = rows.find((item) => matches(item, criteria))
      if (!row) return { affected: 0 }
      Object.assign(row, patch, { updatedAt: new Date() })
      return { affected: 1 }
    }
  }
  return { repository: repository as Repository<T>, rows }
}

function matches<T extends object>(row: T, where: Partial<T>) {
  return Object.entries(where).every(([key, value]) => (row as Record<string, object | string | number | boolean | null | undefined>)[key] === value)
}
