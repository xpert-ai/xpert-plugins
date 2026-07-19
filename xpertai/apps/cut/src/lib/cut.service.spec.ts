import type { EntityManager, Repository } from 'typeorm'
import type { AgentMiddlewareRuntimeCapabilityRegistry, WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol.for('xpert.runtime.capabilities')
}))

import { CutService } from './cut.service.js'
import { appendCutMediaClip } from './cut-project.js'
import {
  CutActionLog,
  CutAnalysisJob,
  CutCaptionDraft,
  CutEditProposal,
  CutExport,
  CutMediaAsset,
  CutMediaSegment,
  CutProject,
  CutProjectVersion,
  CutTranscript,
  CutTranscriptSegment
} from './entities/index.js'
import type { CutScope } from './types.js'

describe('CutService scoped persistence and Workspace Files', () => {
  it('uploads media, preserves portable references, and writes downloadable MP4/WebM exports', async () => {
    const projects = memoryRepository<CutProject>()
    const versions = memoryRepository<CutProjectVersion>()
    const media = memoryRepository<CutMediaAsset>()
    const exports = memoryRepository<CutExport>()
    const logs = memoryRepository<CutActionLog>()
    const analysisJobs = memoryRepository<CutAnalysisJob>()
    const mediaSegments = memoryRepository<CutMediaSegment>()
    const transcripts = memoryRepository<CutTranscript>()
    const transcriptSegments = memoryRepository<CutTranscriptSegment>()
    const captionDrafts = memoryRepository<CutCaptionDraft>()
    const editProposals = memoryRepository<CutEditProposal>()
    attachMemoryManager(projects.repository, new Map<Function, object>([
      [CutProject, projects.repository],
      [CutProjectVersion, versions.repository],
      [CutMediaAsset, media.repository],
      [CutExport, exports.repository],
      [CutActionLog, logs.repository],
      [CutAnalysisJob, analysisJobs.repository],
      [CutMediaSegment, mediaSegments.repository],
      [CutTranscript, transcripts.repository],
      [CutTranscriptSegment, transcriptSegments.repository],
      [CutCaptionDraft, captionDrafts.repository],
      [CutEditProposal, editProposals.repository]
    ]))
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
    const deleteFile = jest.fn(async () => undefined)
    const workspaceFiles = { uploadBuffer, resolveRuntimeReference, deleteFile } as Pick<WorkspaceFilesApi, 'uploadBuffer' | 'resolveRuntimeReference' | 'deleteFile'>
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
    const unchanged = await service.saveProject(scope, {
      projectId,
      document: created.document,
      baseRevision: created.item.revision,
      changeSummary: 'Repeated an unchanged Workbench save.'
    })
    expect(unchanged.project.revision).toBe(created.item.revision)
    expect(unchanged.changedClipIds).toEqual([])
    expect(unchanged.changedTrackIds).toEqual([])
    const imported = await service.uploadMedia(scope, projectId, {
      buffer: Buffer.from('<svg/>'), originalName: 'gate.svg', mimeType: 'image/svg+xml', size: 6
    }, 5, created.item.revision, 'Imported gate media.', {
      codedWidth: 1920, codedHeight: 1080, displayWidth: 1080, displayHeight: 1920, rotationDegrees: 90
    })

    expect(imported.document.settings).toMatchObject({ width: 1920, height: 1080, durationSeconds: 30 })
    expect(imported.media).toMatchObject({
      duration: 5, codedWidth: 1920, codedHeight: 1080, displayWidth: 1080, displayHeight: 1920, rotationDegrees: 90
    })
    expect(imported.project.revision).toBe(created.item.revision)
    expect(imported.document.tracks.flatMap((track) => track.clips)).toEqual([])
    expect(imported.media.previewUrl).toBeNull()
    expect(uploadBuffer).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a', catalog: 'projects', scopeId: 'platform-project-a', folder: `files/cut/${projectId}/media`
    }))

    uploadBuffer.mockResolvedValueOnce({
      name: 'gate.svg',
      filePath: `files/cut/${projectId}/media/recovered-gate.svg`,
      workspacePath: `/workspace/files/cut/${projectId}/media/recovered-gate.svg`,
      fileUrl: 'https://files.example.test/recovered-gate.svg',
      mimeType: 'image/svg+xml',
      size: 6,
      catalog: 'projects',
      scopeId: 'platform-project-a'
    })
    const repaired = await service.uploadMedia(scope, projectId, {
      buffer: Buffer.from('<svg/>'), originalName: 'gate.svg', mimeType: 'image/svg+xml', size: 6
    }, 5, imported.project.revision, 'Repaired the missing Workspace media reference.')
    expect(repaired.project.revision).toBe(imported.project.revision)
    expect(repaired.document.tracks.flatMap((track) => track.clips)).toEqual([])
    expect(repaired.media.fileReference).toMatchObject({
      filePath: `files/cut/${projectId}/media/recovered-gate.svg`,
      workspacePath: `/workspace/files/cut/${projectId}/media/recovered-gate.svg`
    })
    expect(media.rows).toHaveLength(1)

    const iframeDocument = appendCutMediaClip(imported.document, {
      id: 'gate-clip', name: 'gate.svg', type: 'image', mediaAssetId: imported.media.id!,
      source: imported.media.fileReference, duration: 5
    })
    iframeDocument.tracks[0]!.clips[0]!.previewUrl = 'https://api.example.test/api/workspace-files/content/session/grant/gate.svg'
    iframeDocument.tracks[0]!.clips[0]!.start = 2
    const saved = await service.saveProject(scope, {
      projectId, document: iframeDocument, baseRevision: imported.project.revision, changeSummary: 'Saved iframe timeline.'
    })
    expect(saved.changedClipIds).toEqual(['gate-clip'])
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

    const webm = await service.saveExport(scope, projectId, {
      buffer: Buffer.from('webm-gate'), originalName: 'gate.webm', mimeType: 'video/webm', size: 9
    }, 'Saved compact WebM gate.')
    expect(webm.export).toMatchObject({ kind: 'webm', fileName: 'gate.webm', mimeType: 'video/webm' })
    expect(uploadBuffer).toHaveBeenLastCalledWith(expect.objectContaining({
      folder: `files/cut/${projectId}/exports`, originalName: 'gate.webm', mimeType: 'video/webm',
      metadata: { plugin: 'cut', cutProjectId: projectId, kind: 'webm' }
    }))
    await expect(service.resolveExportFile(scope, projectId, webm.export.id!)).resolves.toMatchObject({
      fileName: 'gate.webm', mimeType: 'video/webm', size: 9,
      reference: { source: 'platform.workspace.files', tenantId: 'tenant-a' }
    })
    await expect(service.resolveExportFile({ ...scope, assistantId: 'assistant-b' }, projectId, webm.export.id!))
      .rejects.toThrow('current host project')

    const summary = await service.getProjectSummary(scope, projectId)
    expect(summary).toMatchObject({
      project: { id: projectId, revision: batch.project.revision },
      timeline: { trackCount: 2, clipCount: 2 },
      resources: { mediaAssets: 1, exports: 2 }
    })
    expect(summary).not.toHaveProperty('document')
    expect(summary.availableReads.map((read) => read.tool)).toEqual(expect.arrayContaining([
      'cut_list_tracks', 'cut_list_clips', 'cut_get_clip', 'cut_list_media_assets', 'cut_get_media_asset', 'cut_list_project_resources'
    ]))

    const trackList = await service.listTracks(scope, { projectId, expectedRevision: batch.project.revision })
    expect(trackList.items[0]).toMatchObject({ name: 'Video 1', kind: 'visual', clipCount: 2 })
    const clipList = await service.listClips(scope, {
      projectId, expectedRevision: batch.project.revision, types: ['image'], pageSize: 1
    })
    expect(clipList).toMatchObject({ total: 2, page: 1, pageSize: 1 })
    expect(clipList.items[0]).not.toHaveProperty('source')
    expect(clipList.items[0]).not.toHaveProperty('previewUrl')
    const clipDetail = await service.getClip(scope, {
      projectId, expectedRevision: batch.project.revision, clipId: batch.document.tracks[0]!.clips[0]!.id
    })
    expect(clipDetail.clip).not.toHaveProperty('source')
    expect(clipDetail.clip).not.toHaveProperty('previewUrl')
    await expect(service.listClips(scope, { projectId, expectedRevision: batch.project.revision - 1 }))
      .rejects.toThrow('call cut_get_project again')

    const mediaList = await service.listMediaAssets(scope, { projectId, expectedRevision: batch.project.revision })
    expect(mediaList.items[0]).toMatchObject({ id: imported.media.id, kind: 'image', usedByClipCount: 2 })
    expect(mediaList.items[0]).not.toHaveProperty('fileReference')
    const mediaDetail = await service.getMediaAsset(scope, {
      projectId, expectedRevision: batch.project.revision, mediaAssetId: imported.media.id!
    })
    expect(mediaDetail.item).not.toHaveProperty('fileReference')
    const exportList = await service.listProjectResources(scope, {
      projectId, expectedRevision: batch.project.revision, resource: 'exports'
    })
    expect(exportList).toMatchObject({ total: 2, resource: 'exports' })
    expect(exportList.items[0]).not.toHaveProperty('fileReference')
    expect(exportList.items[0]).not.toHaveProperty('fileUrl')
    expect(exportList.items[0]).not.toHaveProperty('report')

    await expect(service.getProject({ ...scope, organizationId: 'org-b' }, projectId)).rejects.toThrow('current tenant and organization')

    const activeJob: CutAnalysisJob = Object.assign(new CutAnalysisJob(), {
      id: '00000000-0000-4000-8000-000000000101',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      cutProjectId: projectId,
      status: 'running' as const
    })
    analysisJobs.rows.push(activeJob)
    await expect(service.deleteProject(scope, projectId, batch.project.revision)).rejects.toThrow('Cancel active Cut tasks')
    expect(projects.rows).toHaveLength(1)
    expect(deleteFile).not.toHaveBeenCalled()

    activeJob.status = 'cancelled'
    mediaSegments.rows.push(Object.assign(new CutMediaSegment(), { tenantId: scope.tenantId, organizationId: scope.organizationId, cutProjectId: projectId }))
    transcripts.rows.push(Object.assign(new CutTranscript(), { tenantId: scope.tenantId, organizationId: scope.organizationId, cutProjectId: projectId }))
    transcriptSegments.rows.push(Object.assign(new CutTranscriptSegment(), { tenantId: scope.tenantId, organizationId: scope.organizationId, cutProjectId: projectId }))
    captionDrafts.rows.push(Object.assign(new CutCaptionDraft(), { tenantId: scope.tenantId, organizationId: scope.organizationId, cutProjectId: projectId }))
    editProposals.rows.push(Object.assign(new CutEditProposal(), { tenantId: scope.tenantId, organizationId: scope.organizationId, cutProjectId: projectId }))
    const deleted = await service.deleteProject(scope, projectId, batch.project.revision)
    expect(deleted).toMatchObject({ success: true, deleted: true, projectId, workspaceFilesDeleted: true })
    expect(projects.rows).toHaveLength(0)
    expect(versions.rows).toHaveLength(0)
    expect(media.rows).toHaveLength(0)
    expect(exports.rows).toHaveLength(0)
    expect(logs.rows).toHaveLength(0)
    expect(analysisJobs.rows).toHaveLength(0)
    expect(mediaSegments.rows).toHaveLength(0)
    expect(transcripts.rows).toHaveLength(0)
    expect(transcriptSegments.rows).toHaveLength(0)
    expect(captionDrafts.rows).toHaveLength(0)
    expect(editProposals.rows).toHaveLength(0)
    expect(deleteFile).toHaveBeenCalledTimes(1)
    expect(deleteFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: `files/cut/${projectId}` }))
    await expect(service.getProject(scope, projectId)).rejects.toThrow('current tenant and organization')
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
    async count(options: { where: Partial<T> }) {
      return rows.filter((row) => matches(row, options.where)).length
    },
    async update(criteria: Partial<T>, patch: Partial<T>) {
      const row = rows.find((item) => matches(item, criteria))
      if (!row) return { affected: 0 }
      Object.assign(row, patch, { updatedAt: new Date() })
      return { affected: 1 }
    },
    async delete(criteria: Partial<T>) {
      let affected = 0
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (!matches(rows[index]!, criteria)) continue
        rows.splice(index, 1)
        affected += 1
      }
      return { affected }
    }
  }
  return { repository: repository as Repository<T>, rows }
}

function attachMemoryManager(projectRepository: Repository<CutProject>, repositories: Map<Function, object>) {
  const manager = {
    getRepository(entity: Function) {
      const repository = repositories.get(entity)
      if (!repository) throw new Error(`Missing in-memory repository for ${entity.name}.`)
      return repository
    },
    async transaction<T>(run: (manager: EntityManager) => Promise<T>) {
      return run(manager as unknown as EntityManager)
    }
  }
  Object.defineProperty(projectRepository, 'manager', { value: manager })
}

function matches<T extends object>(row: T, where: Partial<T>) {
  return Object.entries(where).every(([key, value]) => (row as Record<string, object | string | number | boolean | null | undefined>)[key] === value)
}
