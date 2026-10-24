import { Inject, Injectable, ForbiddenException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { ArtifactsRuntimeCapability, WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type WorkspaceFilesApi, type DataSourceActor, type WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { analyticsBindingSchema } from '@xpert-ai/plugin-sdk/analytics'
import { PLUGIN, PROVIDER, definitionSchema, registrationSchema, type Definition } from './schema'
import type { z } from 'zod/v3'

export const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
@Injectable()
export class ScriptDefinitions {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  async register(actor: DataSourceActor, files: WorkspaceFilesApi, input: z.infer<typeof registrationSchema>) {
    const code = await files.readRuntimeBuffer(input.path)
    if (!code.buffer.length || code.buffer.length > 64000) throw new Error('WORKSPACE_SCRIPT_SIZE_INVALID')
    const snapshot = await this.store(actor, code.buffer, input.language === 'python' ? 'script.py' : 'script.mjs')
    const definition: Definition = definitionSchema.parse({ schema: 'xpert.analytics-script',
      title: input.title, language: input.language, mode: input.mode,
      authorization: code.reference, script: input.mode === 'pinned' ? snapshot : code.reference,
      scriptSha256: digest(code.buffer), files: await Promise.all(input.files.map(async file => ({ alias: file.alias,
        reference: (await files.readRuntimeBuffer(file.path)).reference }))), sources: input.sources,
      parameters: input.parameters, output: input.output })
    const artifact = await this.runtime.require(ArtifactsRuntimeCapability).createArtifact({
      source: { pluginName: PLUGIN, resourceType: 'definition', resourceId: randomUUID() }, kind: 'file',
      title: input.title, scope: { ...actor, xpertId: code.reference.xpertId, projectId: code.reference.projectId } })
    const buffer = Buffer.from(JSON.stringify(definition)), sha256 = digest(buffer)
    const stored = await this.store(actor, buffer, 'definition.json')
    const { version } = await this.runtime.require(ArtifactsRuntimeCapability).ensureArtifactVersion({ artifactId: artifact.id,
      expectedCurrentVersionId: null, idempotencyKey: sha256, sha256, mimeType: 'application/json', fileName: 'definition.json', workspaceFileRef: stored })
    return { artifactId: artifact.id, versionId: version.id, definition }
  }
  async open(actor: DataSourceActor, artifactId: string, versionId: string): Promise<Definition> {
    const artifacts = this.runtime.require(ArtifactsRuntimeCapability), artifact = await artifacts.getArtifact(artifactId)
    if (artifact.pluginName !== PLUGIN || artifact.resourceType !== 'definition' || artifact.status !== 'active' ||
      artifact.tenantId !== actor.tenantId || artifact.organizationId !== actor.organizationId || artifact.userId !== actor.userId)
      throw new ForbiddenException('WORKSPACE_SCRIPT_ACCESS_DENIED')
    const version = (await artifacts.listArtifactVersions({ artifactId, status: 'active' })).find(v => v.id === versionId)
    if (!version?.workspaceFileRef || !version.sha256) throw new Error('WORKSPACE_SCRIPT_VERSION_UNAVAILABLE')
    const bytes = (await this.runtime.require(WorkspaceFilesRuntimeCapability).readBuffer(version.workspaceFileRef)).buffer
    if (bytes.length > 400000 || digest(bytes) !== version.sha256) throw new Error('WORKSPACE_SCRIPT_VERSION_CHANGED')
    const definition = definitionSchema.parse(JSON.parse(bytes.toString('utf8')))
    // The private version snapshot does not grant access to a revoked Assistant/Project workspace.
    await this.runtime.require(WorkspaceFilesRuntimeCapability).resolveFile(definition.authorization)
    return definition
  }
  async store(actor: DataSourceActor, buffer: Buffer, name: string): Promise<WorkspacePortableFileReference> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId, catalog: 'users' as const }
    const file = await this.runtime.require(WorkspaceFilesRuntimeCapability).uploadBuffer({ ...scope, buffer,
      originalName: name, fileName: name, folder: `workspace-script/${digest(buffer)}`, mimeType: 'application/octet-stream' })
    return { source: 'platform.workspace.files', ...scope, filePath: file.filePath, workspacePath: file.workspacePath }
  }
  binding(artifactId: string, versionId: string, definition: Definition) {
    return analyticsBindingSchema.parse({ source: { kind: 'artifact', artifactId, versionId }, id: definition.output.datasetId,
      providerId: PROVIDER, operation: 'query', contractVersion: 1, payload: {}, parameters: definition.parameters, output: definition.output })
  }
}
