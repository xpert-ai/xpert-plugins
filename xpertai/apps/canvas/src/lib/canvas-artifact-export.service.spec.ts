import 'reflect-metadata'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`,
  CollaborationRuntimeCapability: { id: 'platform.collaboration' },
  SandboxJobsRuntimeCapability: { id: 'platform.sandbox-jobs' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol.for('XPERT_RUNTIME_CAPABILITIES_TOKEN'),
  MANAGED_QUEUE_SERVICE_TOKEN: Symbol.for('MANAGED_QUEUE_SERVICE_TOKEN'),
  SYSTEM_GLOBAL_SCOPE: 'system:global',
  isSandboxJobRuntimeError: (error: unknown) => {
    const candidate = error as { name?: unknown; code?: unknown; retryable?: unknown }
    return candidate?.name === 'SandboxJobRuntimeError'
      && candidate.code === 'EXPORT_INPUT_INVALID'
      && typeof candidate.retryable === 'boolean'
  }
}))

import {
  CollaborationRuntimeCapability,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import type { AgentMiddlewareRuntimeCapabilityRegistry, ManagedQueueService } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import { CanvasArtifactExportService } from './canvas-artifact-export.service.js'
import type { CanvasArtifactService } from './canvas-artifact.service.js'
import { CanvasArtifactExport, CanvasDocument } from './entities/index.js'
import { createCanvasYDoc, encodeCanvasYDoc } from './canvas-yjs.js'
import type { CanvasScope, CanvasSnapshotData } from './types.js'

describe('CanvasArtifactExportService', () => {
  const scope: CanvasScope = {
    tenantId: 'tenant-1', organizationId: 'org-1', projectId: 'project-1', userId: 'user-1', assistantId: 'assistant-1'
  }
  const document: CanvasDocument = {
    id: 'document-1', tenantId: 'tenant-1', organizationId: 'org-1', projectId: 'project-1', createdById: 'user-1',
    title: 'Backend export', status: 'draft', workingCopyRevision: 5
  }
  const snapshot: CanvasSnapshotData = {
    schema: {},
    store: {
      'document:document': { id: 'document:document', typeName: 'document', name: '' },
      'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1', meta: {} }
    }
  }

  it('checks Action and pool health before persisting, stages a portable snapshot, and queues only the export id', async () => {
    const fixture = createFixture(snapshot)
    const result = await fixture.service.requestPublish(scope, {
      documentId: 'document-1', accessMode: 'public_link', targetMode: 'version', userConfirmedPublicLink: true,
      baseRevision: 5, pageId: 'page:page'
    })

    expect(result).toEqual(expect.objectContaining({ exportId: 'export-1', status: 'queued', stage: 'queued' }))
    expect(fixture.sandboxJobs.getActionHealth).toHaveBeenCalledWith(expect.objectContaining({ action: 'canvas.export', actionVersion: '1.0.0' }))
    expect(fixture.queue.getExecutionPoolHealth).toHaveBeenCalledWith({ executionPool: 'sandbox-browser' })
    expect(fixture.exportRepository.save.mock.invocationCallOrder[0]).toBeGreaterThan(fixture.queue.getExecutionPoolHealth.mock.invocationCallOrder[0])
    expect(fixture.files.uploadBuffer).toHaveBeenCalledWith(expect.objectContaining({
      folder: 'files/canvas/artifacts/document-1/exports/export-1/input', mimeType: 'application/json'
    }))
    expect(fixture.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      payload: { exportId: 'export-1' }, tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1',
      executionPool: 'sandbox-browser', scopeKey: 'system:global', attempts: 3
    }))
  })

  it('rejects a stale collaboration sequence before creating export state', async () => {
    const fixture = createFixture(snapshot)
    await expect(fixture.service.requestPublish(scope, {
      documentId: 'document-1', accessMode: 'public_link', userConfirmedPublicLink: true, baseRevision: 4, pageId: 'page:page'
    })).rejects.toThrow(/current revision 5/i)
    expect(fixture.exportRepository.save).not.toHaveBeenCalled()
    expect(fixture.queue.enqueue).not.toHaveBeenCalled()
  })

  it('uses explicit queue ownership and the persisted tenant for the Sandbox Job', async () => {
    const fixture = createFixture(snapshot)
    const exportRecord = {
      id: 'export-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      userId: 'user-1',
      assistantId: 'assistant-1',
      documentId: 'document-1',
      status: 'queued',
      stage: 'queued',
      revision: 5,
      snapshotChecksum: 'a'.repeat(64),
      pageId: 'page:page',
      pageName: 'Page 1',
      accessMode: 'public_link',
      targetMode: 'version',
      userConfirmedPublicLink: true,
      inputFileReference: {
        source: 'platform.workspace.files',
        tenantId: 'tenant-1',
        catalog: 'projects',
        scopeId: 'project-1',
        filePath: 'files/canvas/snapshot.json',
        originalName: 'snapshot.json'
      },
      inputSize: 128,
      inputSha256: 'b'.repeat(64)
    } as unknown as CanvasArtifactExport
    fixture.exportRepository.findOne.mockResolvedValue(exportRecord)
    fixture.sandboxJobs.run.mockRejectedValue(Object.assign(new Error('Invalid Canvas snapshot.'), {
      name: 'SandboxJobRuntimeError',
      code: 'EXPORT_INPUT_INVALID',
      retryable: false,
      jobId: 'export-1'
    }))

    await fixture.service.processExportJob(
      { exportId: 'export-1' },
      {
        pluginName: 'canvas',
        queueName: 'artifact-export',
        jobName: 'publish',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1'
      }
    )

    expect(fixture.sandboxJobs.run).toHaveBeenCalledWith(expect.objectContaining({
      scope: expect.objectContaining({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        businessResourceId: 'export-1'
      })
    }))
    expect(exportRecord).toEqual(expect.objectContaining({
      status: 'failed',
      stage: 'failed',
      errorCode: 'EXPORT_INPUT_INVALID',
      errorMessage: 'Invalid Canvas snapshot.'
    }))
  })

  it('rejects a queue job whose explicit scope does not match the persisted export', async () => {
    const fixture = createFixture(snapshot)
    fixture.exportRepository.findOne.mockResolvedValue({
      id: 'export-1', tenantId: 'tenant-1', organizationId: 'org-1', status: 'queued'
    })

    await expect(fixture.service.processExportJob(
      { exportId: 'export-1' },
      {
        pluginName: 'canvas', queueName: 'artifact-export', jobName: 'publish',
        tenantId: 'tenant-1', organizationId: 'org-2'
      }
    )).rejects.toThrow(/ownership does not match/i)
    expect(fixture.sandboxJobs.run).not.toHaveBeenCalled()
  })

  function createFixture(authoritativeSnapshot: CanvasSnapshotData) {
    const state = encodeCanvasYDoc(createCanvasYDoc(authoritativeSnapshot))
    const exportRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        value.id ??= 'export-1'
        return value
      }),
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
      delete: jest.fn()
    }
    const documentRepository = { findOne: jest.fn(async () => document) }
    const collaboration = {
      ensureDocument: jest.fn(async () => ({ id: 'collaboration-1' })),
      getDocumentState: jest.fn(async () => ({ document: { id: 'collaboration-1' }, updateBase64: state.stateBase64, stateVectorBase64: state.stateVectorBase64, sequenceNumber: 5 }))
    }
    const sandboxJobs = {
      getActionHealth: jest.fn(async () => ({ available: true, runtimeProfile: 'browser/playwright-1.61/v1', sandboxRuntimeVersion: '1.61.0' })),
      run: jest.fn()
    }
    const files = {
      uploadBuffer: jest.fn(async (input) => ({
        name: input.fileName, filePath: `${input.folder}/${input.fileName}`, workspacePath: `/workspace/${input.folder}/${input.fileName}`,
        mimeType: input.mimeType, size: input.size, catalog: 'projects', scopeId: 'project-1'
      })),
      readBuffer: jest.fn(),
      deleteFile: jest.fn()
    }
    const registry = {
      get: (capability: unknown) => capability === CollaborationRuntimeCapability
        ? collaboration
        : capability === SandboxJobsRuntimeCapability
          ? sandboxJobs
          : capability === WorkspaceFilesRuntimeCapability
            ? files
            : undefined
    }
    const queue = {
      getExecutionPoolHealth: jest.fn(async () => ({ executionPool: 'sandbox-browser', available: true, workerCount: 1 })),
      enqueue: jest.fn(async () => ({ jobId: 'queue-1' }))
    }
    const artifactService = { isAvailable: jest.fn(() => true) }
    return {
      service: new CanvasArtifactExportService(
        exportRepository as unknown as Repository<CanvasArtifactExport>,
        documentRepository as unknown as Repository<CanvasDocument>,
        artifactService as unknown as CanvasArtifactService,
        registry as AgentMiddlewareRuntimeCapabilityRegistry,
        queue as unknown as ManagedQueueService
      ),
      exportRepository,
      sandboxJobs,
      files,
      queue
    }
  }
})
