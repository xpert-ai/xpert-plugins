import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { AnalyticsValue, AnalyticsDiscoveryRequest, AnalyticsQueryRequest, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import {
  AnalyticsRuntimeCapability, ArtifactDraftsRuntimeCapability, ArtifactsRuntimeCapability, WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type ArtifactRecord, type ArtifactVersionRecord
} from '@xpert-ai/plugin-sdk'
import { dashboardSchema, dashboardChangesSchema, type DashboardManifest, type DashboardChanges } from './dashboard.schema'
import { toDataAnalyticsPayload } from './renderer'
import { queryDashboard, queryDashboardBinding } from './dashboard-queries'
import { HtmlDashboardValidation } from './html-validation'
import { resolveLibraryAssets } from './document-libraries'
import { decodeDashboardPackage, encodeDashboardPackage, MAX_DASHBOARD_PACKAGE_BYTES } from './document-package'
import { DASHBOARD_SHARE_KEY, dashboardSharingIssues } from './dashboard-sharing'

export const PLUGIN_NAME = '@xpert-ai/plugin-live-dashboard'
const RESOURCE_TYPE = 'live-dashboard'
const MIME_TYPE = 'application/json'

@Injectable()
export class DashboardService {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry, private readonly htmlValidation: HtmlDashboardValidation) {}
  sources(context: XpertResolvedViewHostContext) { return this.runtime.require(AnalyticsRuntimeCapability).list(actor(context)) }
  discover(context: XpertResolvedViewHostContext, input: AnalyticsDiscoveryRequest) { return this.runtime.require(AnalyticsRuntimeCapability).discover(actor(context), input) }
  async preview(context: XpertResolvedViewHostContext, input: AnalyticsQueryRequest) {
    const dataset = await this.runtime.require(AnalyticsRuntimeCapability).query(actor(context), input)
    await this.probeControls(context, input.binding, input.controls ?? {})
    return dataset
  }
  async list(context: XpertResolvedViewHostContext) {
    actor(context)
    const result = await this.runtime.require(ArtifactsRuntimeCapability).listArtifacts({ pluginName: PLUGIN_NAME, resourceType: RESOURCE_TYPE, resourceIdPrefix: hostPrefix(context), status: 'active', pageSize: 100, includeCurrentVersion: true })
    const items = result.items.filter((item) => item.resourceId.startsWith(hostPrefix(context)) && item.userId === context.userId)
    const drafts = new Map((await this.runtime.require(ArtifactDraftsRuntimeCapability).list(items.map(item => item.id))).map(draft => [draft.artifactId, draft]))
    return items.map(item => ({ ...summary(item), ...(drafts.has(item.id) ? { title: drafts.get(item.id)!.title ?? item.title } : {}) }))
  }
  async save(context: XpertResolvedViewHostContext, manifest: DashboardManifest, expectedVersionId: string | null, expectedRevision = 0) {
    const scopedActor = actor(context)
    const parsed = dashboardSchema.parse(manifest)
    const artifacts = this.runtime.require(ArtifactsRuntimeCapability)
    const source = { pluginName: PLUGIN_NAME, resourceType: RESOURCE_TYPE, resourceId: `${hostPrefix(context)}${parsed.id}` }
    const existing = await artifacts.findArtifactBySource(source)
    if (existing && existing.userId !== scopedActor.userId) throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    // A failed first upload can leave an Artifact with no saved content; revision 0 initializes it.
    const previous = existing && (existing.currentVersionId || expectedRevision > 0) ? await this.openDocument(context, existing.id) : null
    const dependencies = await resolveLibraryAssets(parsed.presentation?.dependencies ?? [], previous?.dependencies)
    const buffer = encodeDashboardPackage(parsed, dependencies)
    if (buffer.byteLength > MAX_DASHBOARD_PACKAGE_BYTES) throw new BadRequestException('DASHBOARD_MANIFEST_TOO_LARGE')
    const digest = createHash('sha256').update(buffer).digest('hex')
    if ((existing?.currentVersionId ?? null) !== expectedVersionId) throw new ConflictException('DASHBOARD_VERSION_CONFLICT')
    // Recheck current data access even for an idempotent retry; the platform enforces the final CAS under a row lock.
    const preview = await this.execute(context, parsed, Object.fromEntries(parsed.controls.filter((control) => control.defaultValue !== undefined).map((control) => [control.controlId, control.defaultValue ?? null])))
    if (!parsed.presentation) toDataAnalyticsPayload(parsed, preview)
    for (const binding of parsed.bindings) await this.probeControls(context, binding,
      Object.fromEntries(parsed.controls.filter((control) => control.defaultValue !== undefined).map((control) => [control.controlId, control.defaultValue ?? null])))
    const htmlValidation = await this.htmlValidation.validate(context, parsed, preview, dependencies)
    const artifact = existing ?? await artifacts.createArtifact({ source, kind: 'file', title: parsed.title,
      scope: { ...scopedActor, ...(context.hostType === 'project' ? { projectId: context.hostId } : { xpertId: context.hostId }) } })
    const files = this.runtime.require(WorkspaceFilesRuntimeCapability)
    const scope = { tenantId: scopedActor.tenantId, userId: scopedActor.userId, catalog: 'users' as const }
    const file = await files.uploadBuffer({ ...scope, buffer, originalName: 'dashboard.json', fileName: `${digest}.json`, folder: `live-dashboards/${parsed.id}`, mimeType: MIME_TYPE })
    const result = await this.runtime.require(ArtifactDraftsRuntimeCapability).save({ artifactId: artifact.id, expectedRevision,
      expectedCurrentVersionId: expectedVersionId, mimeType: MIME_TYPE, title: parsed.title, fileName: 'dashboard.json', sha256: digest,
      ...(htmlValidation ? { metadata: { htmlValidation } } : {}),
      workspaceFileRef: { source: 'platform.workspace.files', ...scope, filePath: file.filePath, workspacePath: file.workspacePath } })
    return { artifactId: artifact.id, draftId: result.id, draftRevision: result.revision, baseVersionId: result.baseVersionId, status: 'draft' as const, title: parsed.title }
  }
  async open(context: XpertResolvedViewHostContext, artifactId: string, versionId?: string, draftRevision?: number) {
    const { dependencies, ...saved } = await this.openDocument(context, artifactId, versionId, draftRevision)
    return saved
  }
  /** Trusted View transport only. Agent read tools receive locks, never megabytes of library code. */
  async openDocument(context: XpertResolvedViewHostContext, artifactId: string, versionId?: string, draftRevision?: number) {
    actor(context)
    const artifacts = this.runtime.require(ArtifactsRuntimeCapability)
    const artifact = await artifacts.getArtifact(artifactId)
    assertOwned(context, artifact)
    const draft = !versionId || draftRevision !== undefined ? await this.runtime.require(ArtifactDraftsRuntimeCapability).get(artifactId) : null
    if (draftRevision !== undefined && draft?.revision !== draftRevision) throw new ConflictException('DASHBOARD_DRAFT_CONFLICT')
    const version = draft ?? (versionId ? (await artifacts.listArtifactVersions({ artifactId, status: 'active' })).find((item) => item.id === versionId) : artifact.currentVersion)
    if (!version?.workspaceFileRef || version.mimeType !== MIME_TYPE) throw new BadRequestException('DASHBOARD_VERSION_UNAVAILABLE')
    const file = await this.runtime.require(WorkspaceFilesRuntimeCapability).readBuffer(version.workspaceFileRef)
    if (file.buffer.byteLength > MAX_DASHBOARD_PACKAGE_BYTES) throw new BadRequestException('DASHBOARD_MANIFEST_TOO_LARGE')
    if (!version.sha256 || createHash('sha256').update(file.buffer).digest('hex') !== version.sha256)
      throw new BadRequestException('DASHBOARD_VERSION_CONTENT_CHANGED')
    const { manifest, dependencies } = decodeDashboardPackage(file.buffer)
    if (artifact.resourceId !== `${hostPrefix(context)}${manifest.id}`) throw new BadRequestException('DASHBOARD_IDENTITY_MISMATCH')
    return { ...summary(artifact, 'versionNumber' in version ? version : undefined),
      ...(draft ? { draftId: draft.id, draftRevision: draft.revision, baseVersionId: draft.baseVersionId,
        isDraft: draft.revision !== draft.publishedRevision, title: draft.title, updatedAt: draft.updatedAt } : {}), manifest, dependencies }
  }
  async history(context: XpertResolvedViewHostContext, artifactId: string) {
    actor(context)
    const artifacts = this.runtime.require(ArtifactsRuntimeCapability)
    const artifact = await artifacts.getArtifact(artifactId)
    assertOwned(context, artifact)
    const versions = await artifacts.listArtifactVersions({ artifactId, status: 'active' })
    return versions.map(version => ({ ...summary(artifact, version), current: version.id === artifact.currentVersionId }))
      .sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0))
  }
  async update(context: XpertResolvedViewHostContext, artifactId: string, expectedRevision: number, changes: DashboardChanges, expectedCurrentVersionId: string | null) {
    const saved = await this.open(context, artifactId)
    if ((saved.draftRevision ?? 0) !== expectedRevision || (saved.baseVersionId ?? saved.versionId ?? null) !== expectedCurrentVersionId) throw new ConflictException('DASHBOARD_DRAFT_CONFLICT')
    return this.save(context, dashboardSchema.parse({ ...saved.manifest, ...dashboardChangesSchema.parse(changes) }),
      saved.baseVersionId ?? saved.versionId ?? null, expectedRevision)
  }
  async publish(context: XpertResolvedViewHostContext, artifactId: string, expectedRevision: number, expectedCurrentVersionId: string | null) {
    const saved = await this.open(context, artifactId, undefined, expectedRevision)
    const share = await this.runtime.require(ArtifactsRuntimeCapability).getArtifactShare({ artifactId, shareKey: DASHBOARD_SHARE_KEY })
    if (share?.status === 'active' && share.versionMode === 'latest' && (!share.expiresAt || new Date(share.expiresAt).getTime() > Date.now())) {
      const issues = dashboardSharingIssues(saved.manifest, await this.sources(context))
      if (issues.length) throw new BadRequestException({ message: 'DASHBOARD_PUBLISH_SHARE_BLOCKED', code: 'DASHBOARD_PUBLISH_SHARE_BLOCKED', issues })
    }
    // Revalidate current source access and bindings before publishing the exact reviewed bytes.
    await this.execute(context, saved.manifest, {})
    const version = await this.runtime.require(ArtifactDraftsRuntimeCapability).publish({ artifactId, expectedRevision, expectedCurrentVersionId })
    return { artifactId, versionId: version.id, versionNumber: version.versionNumber, title: version.title }
  }
  async query(context: XpertResolvedViewHostContext, artifactId: string, versionId: string | undefined, controls: Record<string, AnalyticsValue>, draftRevision?: number) {
    const saved = await this.open(context, artifactId, versionId, draftRevision)
    const datasets = await this.execute(context, saved.manifest, controls)
    return { ...saved, datasets, ...(saved.manifest.presentation ? {} : { payload: toDataAnalyticsPayload(saved.manifest, datasets) }) }
  }
  async queryBinding(context: XpertResolvedViewHostContext, artifactId: string, versionId: string | undefined, bindingId: string, input: Record<string, AnalyticsValue>, draftRevision?: number) {
    const saved = await this.open(context, artifactId, versionId, draftRevision)
    return queryDashboardBinding(this.runtime, actor(context), saved.manifest, bindingId, input)
  }
  private execute(context: XpertResolvedViewHostContext, manifest: DashboardManifest, input: Record<string, AnalyticsValue>) {
    return queryDashboard(this.runtime, actor(context), manifest, input)
  }
  private async probeControls(context: XpertResolvedViewHostContext, binding: AnalyticsQueryRequest['binding'], input: Record<string, AnalyticsValue>) {
    const controls = Object.fromEntries(binding.parameters.map((parameter) => [parameter.controlId,
      Object.hasOwn(input, parameter.controlId) ? input[parameter.controlId] : parameter.defaultValue ?? null]))
    // A null default can bypass a native predicate entirely. Verify a real selection too,
    // using declared values only; never invent a business filter for open-ended controls.
    for (const parameter of binding.parameters) {
      const current = controls[parameter.controlId]
      const alternative = parameter.allowedValues?.find((value) => value !== null && value !== current)
      const samples = [...(alternative !== undefined ? [alternative] : []),
        ...(current !== null && parameter.allowedValues?.includes(null) ? [null] : [])]
      for (const value of samples) {
        try {
          await this.runtime.require(AnalyticsRuntimeCapability).query(actor(context), { binding, controls: { ...controls, [parameter.controlId]: value } })
        } catch {
          throw new BadRequestException(`DASHBOARD_FILTER_PREVIEW_FAILED: ${parameter.controlId}; a declared non-default filter failed. Inspect the native parameter type and operator before retrying.`)
        }
      }
    }
  }
}
function actor(context: XpertResolvedViewHostContext) {
  if (!context.tenantId || !context.organizationId || !context.userId || !['agent', 'project'].includes(context.hostType)) throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
  return { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
}
function hostPrefix(context: XpertResolvedViewHostContext) { return `${context.hostType}/${context.hostId}/` }
function assertOwned(context: XpertResolvedViewHostContext, artifact: ArtifactRecord) {
  if (artifact.pluginName !== PLUGIN_NAME || artifact.resourceType !== RESOURCE_TYPE || !artifact.resourceId.startsWith(hostPrefix(context)) ||
    artifact.tenantId !== context.tenantId || artifact.organizationId !== context.organizationId || artifact.userId !== context.userId) throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
}
function summary(artifact: ArtifactRecord, version: ArtifactVersionRecord | null | undefined = artifact.currentVersion) {
  return { artifactId: artifact.id, versionId: version?.id ?? artifact.currentVersionId, versionNumber: version?.versionNumber,
    title: version?.title ?? artifact.title, updatedAt: artifact.updatedAt }
}
