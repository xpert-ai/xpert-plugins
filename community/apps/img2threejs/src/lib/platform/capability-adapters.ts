import { createHash } from 'node:crypto'
import type {
  ArtifactKind,
  ArtifactsApi,
  RuntimeCapabilityRegistry,
  WorkspaceFile,
  WorkspacePortableFileReference,
  WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import {
  ArtifactsRuntimeCapability,
  WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import {
  IMG2THREEJS_ARTIFACT_NAMESPACE,
  IMG2THREEJS_PLUGIN_NAME
} from '../constants.js'
import type { CapabilityAvailability, Scope, WorkspaceAssetReference } from '../domain/types.js'

export type WorkspaceWriteInput = {
  folder: string
  fileName: string
  mimeType: string
  buffer: Buffer
}

export class WorkspaceFilesAdapter {
  constructor(private readonly registry?: RuntimeCapabilityRegistry) {}

  availability(): CapabilityAvailability {
    return this.api()
      ? { available: true, code: 'available' }
      : {
          available: false,
          code: 'runtime_unavailable',
          reason: 'The platform Workspace Files runtime capability is not registered.'
        }
  }

  async read(scope: Scope, filePath: string): Promise<{ buffer: Buffer; asset: WorkspaceAssetReference }> {
    const api = this.requireApi()
    const workspaceScope = resolveWorkspaceScope(scope)
    const file = await api.readBuffer({ ...workspaceScope, filePath })
    return {
      buffer: file.buffer,
      asset: mapWorkspaceFile(file, scope, workspaceScope, file.buffer)
    }
  }

  async write(scope: Scope, input: WorkspaceWriteInput): Promise<WorkspaceAssetReference> {
    const api = this.requireApi()
    const workspaceScope = resolveWorkspaceScope(scope)
    const file = await api.uploadBuffer({
      ...workspaceScope,
      buffer: input.buffer,
      originalName: input.fileName,
      mimeType: input.mimeType,
      size: input.buffer.length,
      folder: input.folder,
      fileName: input.fileName,
      metadata: { pluginName: '@xpert-ai/plugin-img2threejs' }
    })
    return mapWorkspaceFile(file, scope, workspaceScope, input.buffer)
  }

  private api(): WorkspaceFilesApi | undefined {
    return this.registry?.get(WorkspaceFilesRuntimeCapability)
  }

  private requireApi(): WorkspaceFilesApi {
    const api = this.api()
    if (!api) {
      throw new Error('WORKSPACE_FILES_UNAVAILABLE: platform Workspace Files capability is not registered.')
    }
    return api
  }
}

export type PublishedArtifactReceipt = {
  artifactId: string
  versionId: string
  outcome: 'created' | 'reused'
}

export class ArtifactsAdapter {
  constructor(private readonly registry?: RuntimeCapabilityRegistry) {}

  availability(): CapabilityAvailability {
    return this.api()
      ? { available: true, code: 'available' }
      : {
          available: false,
          code: 'runtime_unavailable',
          reason: 'The platform Artifacts runtime capability is not registered.'
        }
  }

  async publishModelArtifacts(scope: Scope, input: {
    projectId: string
    projectName: string
    sourceAsset: WorkspaceAssetReference
    comparisonAsset: WorkspaceAssetReference | null
  }): Promise<{
    model: PublishedArtifactReceipt
    comparison: PublishedArtifactReceipt | null
  }> {
    const api = this.requireApi()
    const model = await this.ensureArtifact(api, scope, {
      resourceType: 'threejs-model-package',
      resourceId: input.projectId,
      title: `${input.projectName} · Three.js TypeScript`,
      description: 'Animation-ready procedural Three.js TypeScript model package.',
      kind: 'file',
      artifactMimeType: 'text/plain',
      asset: input.sourceAsset
    })
    const comparison = input.comparisonAsset
      ? await this.ensureArtifact(api, scope, {
          resourceType: 'threejs-comparison-evidence',
          resourceId: input.projectId,
          title: `${input.projectName} · comparison evidence`,
          description: 'Deterministic reference-versus-model comparison evidence.',
          // The platform deliberately rejects directly shared SVG artifacts.
          // Preserve the original Workspace File and publish a reviewable file
          // wrapper using an explicitly allowlisted MIME type.
          kind: 'file',
          artifactMimeType: 'text/plain',
          asset: input.comparisonAsset
        })
      : null
    return { model, comparison }
  }

  async createSignedPreview(input: {
    artifactId: string
    artifactVersionId: string
  }): Promise<string | null> {
    const api = this.api()
    if (!api) return null
    const link = await api.createSignedPreviewLink({
      artifactId: input.artifactId,
      artifactVersionId: input.artifactVersionId,
      versionMode: 'version',
      ttlSeconds: 600,
      presentation: { disposition: 'inline', allowDownload: true },
      metadata: { artifactNamespace: IMG2THREEJS_ARTIFACT_NAMESPACE }
    }).catch(() => null)
    return link?.publicUrl ?? null
  }

  async createReferenceImagePreview(
    scope: Scope,
    input: { evidenceId: string; label: string; asset: WorkspaceAssetReference }
  ): Promise<string | null> {
    const api = this.api()
    if (!api) return null
    const receipt = await this.ensureArtifact(api, scope, {
      resourceType: 'reference-image',
      resourceId: input.evidenceId,
      title: input.label,
      description: 'Admitted source image used as deterministic modeling evidence.',
      kind: 'image',
      artifactMimeType: input.asset.mimeType,
      asset: input.asset
    }).catch(() => null)
    if (!receipt) return null
    const link = await api.createSignedPreviewLink({
      artifactId: receipt.artifactId,
      artifactVersionId: receipt.versionId,
      versionMode: 'version',
      ttlSeconds: 3_600,
      presentation: { disposition: 'inline', allowDownload: false },
      metadata: { artifactNamespace: IMG2THREEJS_ARTIFACT_NAMESPACE }
    }).catch(() => null)
    return link?.publicUrl ?? null
  }

  private async ensureArtifact(
    api: ArtifactsApi,
    scope: Scope,
    input: {
      resourceType: string
      resourceId: string
      title: string
      description: string
      kind: ArtifactKind
      artifactMimeType: string
      asset: WorkspaceAssetReference
    }
  ): Promise<PublishedArtifactReceipt> {
    const artifact = await api.createArtifact({
      source: {
        pluginName: IMG2THREEJS_PLUGIN_NAME,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        checksum: input.asset.sha256
      },
      kind: input.kind,
      title: input.title,
      description: input.description,
      scope: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        xpertId: scope.xpertId
      },
      metadata: { artifactNamespace: IMG2THREEJS_ARTIFACT_NAMESPACE }
    })
    const result = await api.ensureArtifactVersion({
      artifactId: artifact.id,
      idempotencyKey: `${IMG2THREEJS_PLUGIN_NAME}:${input.resourceType}:${input.resourceId}:${input.asset.sha256}`,
      workspaceFileRef: toPortableReference(input.asset),
      mimeType: input.artifactMimeType,
      fileName: input.asset.name,
      title: input.title,
      description: input.description,
      size: input.asset.size,
      sha256: input.asset.sha256,
      checksum: input.asset.sha256,
      setCurrent: true,
      metadata: { artifactNamespace: IMG2THREEJS_ARTIFACT_NAMESPACE }
    })
    return {
      artifactId: artifact.id,
      versionId: result.version.id,
      outcome: result.outcome
    }
  }

  private api(): ArtifactsApi | undefined {
    return this.registry?.get(ArtifactsRuntimeCapability)
  }

  private requireApi(): ArtifactsApi {
    const api = this.api()
    if (!api) throw new Error('ARTIFACTS_UNAVAILABLE: platform Artifacts capability is not registered.')
    return api
  }
}

export function resolveWorkspaceScope(scope: Scope): {
  tenantId: string
  userId: string
  catalog: 'projects' | 'xperts'
  scopeId: string
  projectId?: string
  xpertId?: string
  isolateByUser: false
} {
  if (scope.projectId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'projects',
      scopeId: scope.projectId,
      projectId: scope.projectId,
      isolateByUser: false
    }
  }
  if (scope.xpertId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'xperts',
      scopeId: scope.xpertId,
      xpertId: scope.xpertId,
      isolateByUser: false
    }
  }
  throw new Error('WORKSPACE_SCOPE_REQUIRED: current project or Xpert context is required.')
}

function mapWorkspaceFile(
  file: WorkspaceFile,
  scope: Scope,
  workspaceScope: ReturnType<typeof resolveWorkspaceScope>,
  buffer: Buffer
): WorkspaceAssetReference {
  return {
    source: 'platform.workspace.files',
    tenantId: scope.tenantId,
    userId: scope.userId,
    catalog: workspaceScope.catalog,
    scopeId: workspaceScope.scopeId,
    projectId: workspaceScope.projectId,
    xpertId: workspaceScope.xpertId,
    isolateByUser: false,
    filePath: file.filePath,
    workspacePath: file.workspacePath,
    name: file.name,
    mimeType: file.mimeType ?? 'application/octet-stream',
    size: file.size ?? buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex')
  }
}

export function toPortableReference(asset: WorkspaceAssetReference): WorkspacePortableFileReference {
  return {
    source: asset.source,
    tenantId: asset.tenantId,
    userId: asset.userId,
    catalog: asset.catalog,
    scopeId: asset.scopeId,
    projectId: asset.projectId,
    xpertId: asset.xpertId,
    isolateByUser: asset.isolateByUser,
    filePath: asset.filePath,
    workspacePath: asset.workspacePath,
    originalName: asset.name,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size
  }
}
