import 'reflect-metadata'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`,
  ArtifactsRuntimeCapability: { id: 'platform.artifacts' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol.for('XPERT_RUNTIME_CAPABILITIES_TOKEN')
}))

import { ArtifactsRuntimeCapability, WorkspaceFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import type { AgentMiddlewareRuntimeCapabilityRegistry, ArtifactsApi, WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import { CanvasArtifactService } from './canvas-artifact.service.js'
import { CanvasArtifactViewerService } from './canvas-artifact-viewer.service.js'
import { CanvasActionLog, CanvasDocument } from './entities/index.js'
import type { CanvasScope } from './types.js'

describe('CanvasArtifactService', () => {
  const scope: CanvasScope = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    userId: 'user-1',
    assistantId: 'assistant-1'
  }
  const document: CanvasDocument = {
    id: 'canvas-1',
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? undefined,
    workspaceId: scope.workspaceId ?? undefined,
    projectId: scope.projectId ?? undefined,
    assistantId: scope.assistantId ?? undefined,
    createdById: scope.userId ?? undefined,
    title: 'Offline Canvas',
    description: 'Architecture',
    status: 'draft',
    currentVersionId: 'canvas-version-3',
    currentVersionNumber: 3,
    workingCopyRevision: 8,
    snapshotChecksum: 'snapshot-checksum'
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#fff"/></svg>'

  it('requires public confirmation and idempotently reuses Artifact content and the stable share slot', async () => {
    const fixture = createFixture(document)
    const service = fixture.service

    await expect(service.publish(scope, publishInput({ userConfirmedPublicLink: false }))).rejects.toThrow(/explicit user confirmation/i)
    const first = await service.publish(scope, publishInput())
    const second = await service.publish(scope, publishInput())

    expect(first).toEqual(expect.objectContaining({ shareUrl: '/artifacts/share/canvas-1', reused: false, revision: 8 }))
    expect(second).toEqual(expect.objectContaining({ shareUrl: '/artifacts/share/canvas-1', reused: true, revision: 8 }))
    expect(fixture.artifacts.createArtifact).toHaveBeenCalledTimes(1)
    expect(fixture.files.uploadBuffer).toHaveBeenCalledTimes(1)
    expect(fixture.artifacts.ensureArtifactVersion).toHaveBeenCalledTimes(2)
    expect(fixture.artifacts.ensureArtifactShare).toHaveBeenCalledWith(expect.objectContaining({
      shareKey: 'readonly-default',
      artifactVersionId: 'artifact-version-1',
      versionMode: 'version',
      presentation: expect.objectContaining({ safeHtmlProfile: 'interactive', allowDownload: false })
    }))
    expect(await service.getShare(scope, 'canvas-1')).toEqual(expect.objectContaining({ shareUrl: '/artifacts/share/canvas-1' }))
  })

  it('rejects a stale working-copy export before creating Artifact content', async () => {
    const fixture = createFixture(document)
    await expect(fixture.service.publish(scope, publishInput({ baseRevision: 7 }))).rejects.toThrow(/current revision 8/i)
    expect(fixture.artifacts.createArtifact).not.toHaveBeenCalled()
    expect(fixture.files.uploadBuffer).not.toHaveBeenCalled()
  })

  it('revokes the stable share without deleting Canvas versions', async () => {
    const fixture = createFixture(document)
    await fixture.service.publish(scope, publishInput())
    const result = await fixture.service.revoke(scope, 'canvas-1')

    expect(result.revoked).toBe(true)
    expect(fixture.artifacts.revokeArtifactShare).toHaveBeenCalledWith({ artifactId: 'artifact-1', shareKey: 'readonly-default' })
  })

  function publishInput(overrides: Partial<Parameters<CanvasArtifactService['publish']>[1]> = {}) {
    return {
      documentId: 'canvas-1',
      accessMode: 'public_link' as const,
      targetMode: 'version' as const,
      userConfirmedPublicLink: true,
      baseRevision: 8,
      baseSnapshotChecksum: 'snapshot-checksum',
      pageId: 'page:page-1',
      pageName: 'Page 1',
      svg,
      width: 640,
      height: 400,
      ...overrides
    }
  }
})

function createFixture(document: CanvasDocument) {
  let artifact: Record<string, unknown> | null = null
  let artifactVersion: Record<string, unknown> | null = null
  let share: Record<string, unknown> | null = null
  const artifacts = {
    findArtifactBySource: jest.fn(async () => artifact),
    createArtifact: jest.fn(async () => {
      artifact = { id: 'artifact-1', kind: 'html', status: 'active' }
      return artifact
    }),
    listArtifactVersions: jest.fn(async (input: { idempotencyKey?: string }) =>
      artifactVersion && artifactVersion.idempotencyKey === input.idempotencyKey ? [artifactVersion] : []),
    ensureArtifactVersion: jest.fn(async (input: { idempotencyKey: string; workspaceFileRef: object }) => {
      const reused = Boolean(artifactVersion)
      artifactVersion ??= {
        id: 'artifact-version-1',
        artifactId: 'artifact-1',
        versionNumber: 1,
        status: 'active',
        idempotencyKey: input.idempotencyKey,
        workspaceFileRef: input.workspaceFileRef,
        mimeType: 'text/html'
      }
      return { version: artifactVersion, outcome: reused ? 'reused' : 'created' }
    }),
    ensureArtifactShare: jest.fn(async (input: { artifactId: string; artifactVersionId?: string; versionMode: string; access: { mode: string }; metadata: object }) => {
      const reused = Boolean(share)
      share ??= {
        id: 'artifact-link-1',
        artifactId: input.artifactId,
        artifactVersionId: input.artifactVersionId,
        shareKey: 'readonly-default',
        versionMode: input.versionMode,
        slug: 'canvas-1',
        publicUrl: '/artifacts/share/canvas-1',
        accessMode: input.access.mode,
        status: 'active',
        disposition: 'inline',
        allowDownload: false,
        metadata: input.metadata,
        version: artifactVersion
      }
      return { link: share, outcome: reused ? 'reused' : 'created' }
    }),
    getArtifactShare: jest.fn(async () => share),
    revokeArtifactShare: jest.fn(async () => {
      const previous = share
      share = null
      return previous
    }),
    archiveArtifact: jest.fn(),
    deleteArtifact: jest.fn()
  }
  const files = {
    uploadBuffer: jest.fn(async (input: { fileName: string; mimeType: string; size: number }) => ({
      name: input.fileName,
      filePath: `files/canvas/artifacts/canvas-1/${input.fileName}`,
      workspacePath: `/workspace/files/canvas/artifacts/canvas-1/${input.fileName}`,
      mimeType: input.mimeType,
      size: input.size,
      catalog: 'projects',
      scopeId: 'project-1'
    })),
    deleteFile: jest.fn()
  }
  const documentRepository = {
    findOne: jest.fn(async () => document)
  }
  const logRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value)
  }
  const registry = {
    get: (capability: unknown) => capability === ArtifactsRuntimeCapability
      ? artifacts
      : capability === WorkspaceFilesRuntimeCapability
        ? files
        : undefined
  }
  return {
    service: new CanvasArtifactService(
      asRepository<CanvasDocument>(documentRepository),
      asRepository<CanvasActionLog>(logRepository),
      new CanvasArtifactViewerService(),
      registry as AgentMiddlewareRuntimeCapabilityRegistry
    ),
    artifacts: artifacts as unknown as jest.Mocked<ArtifactsApi>,
    files: files as unknown as jest.Mocked<WorkspaceFilesApi>
  }
}

function asRepository<T extends object>(value: object) {
  return value as Repository<T>
}
