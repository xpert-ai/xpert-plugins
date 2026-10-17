import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { AnalyticalDataset, AnalyticsValue, AnalyticsDiscoveryRequest, AnalyticsQueryRequest, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import {
  AnalyticsRuntimeCapability, ArtifactsRuntimeCapability, WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type ArtifactRecord, type ArtifactVersionRecord
} from '@xpert-ai/plugin-sdk'
import { dashboardSchema, type DashboardManifest } from './dashboard.schema'
import { toDataAnalyticsPayload } from './renderer'
import { HtmlDashboardValidation } from './html-validation'
import { resolveLibraryAssets } from './document-libraries'
import { decodeDashboardPackage, encodeDashboardPackage, MAX_DASHBOARD_PACKAGE_BYTES } from './document-package'

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
    const result = await this.runtime.require(ArtifactsRuntimeCapability).listArtifacts({ pluginName: PLUGIN_NAME, resourceType: RESOURCE_TYPE, resourceIdPrefix: hostPrefix(context), status: 'active', pageSize: 100 })
    return result.items.filter((item) => item.resourceId.startsWith(hostPrefix(context)) && item.userId === context.userId).map((item) => summary(item))
  }
  async save(context: XpertResolvedViewHostContext, manifest: DashboardManifest, expectedVersionId: string | null) {
    const scopedActor = actor(context)
    const parsed = dashboardSchema.parse(manifest)
    const artifacts = this.runtime.require(ArtifactsRuntimeCapability)
    const source = { pluginName: PLUGIN_NAME, resourceType: RESOURCE_TYPE, resourceId: `${hostPrefix(context)}${parsed.id}` }
    const existing = await artifacts.findArtifactBySource(source)
    if (existing && existing.userId !== scopedActor.userId) throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    const previous = existing?.currentVersionId ? await this.openDocument(context, existing.id) : null
    const dependencies = await resolveLibraryAssets(parsed.presentation?.dependencies ?? [], previous?.dependencies)
    const buffer = encodeDashboardPackage(parsed, dependencies)
    if (buffer.byteLength > MAX_DASHBOARD_PACKAGE_BYTES) throw new BadRequestException('DASHBOARD_MANIFEST_TOO_LARGE')
    const digest = createHash('sha256').update(buffer).digest('hex')
    if ((existing?.currentVersionId ?? null) !== expectedVersionId && existing?.currentVersion?.sha256 !== digest) throw new ConflictException('DASHBOARD_VERSION_CONFLICT')
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
    const result = await artifacts.ensureArtifactVersion({ artifactId: artifact.id, idempotencyKey: digest,
      expectedCurrentVersionId: expectedVersionId, mimeType: MIME_TYPE, title: parsed.title, fileName: 'dashboard.json', sha256: digest,
      ...(htmlValidation ? { metadata: { htmlValidation } } : {}),
      workspaceFileRef: { source: 'platform.workspace.files', ...scope, filePath: file.filePath, workspacePath: file.workspacePath } })
    return { artifactId: artifact.id, versionId: result.version.id, versionNumber: result.version.versionNumber, title: parsed.title }
  }
  async open(context: XpertResolvedViewHostContext, artifactId: string, versionId?: string) {
    const { dependencies, ...saved } = await this.openDocument(context, artifactId, versionId)
    return saved
  }
  /** Trusted View transport only. Agent read tools receive locks, never megabytes of library code. */
  async openDocument(context: XpertResolvedViewHostContext, artifactId: string, versionId?: string) {
    actor(context)
    const artifacts = this.runtime.require(ArtifactsRuntimeCapability)
    const artifact = await artifacts.getArtifact(artifactId)
    assertOwned(context, artifact)
    const version = versionId ? (await artifacts.listArtifactVersions({ artifactId, status: 'active' })).find((item) => item.id === versionId) : artifact.currentVersion
    if (!version?.workspaceFileRef || version.mimeType !== MIME_TYPE) throw new BadRequestException('DASHBOARD_VERSION_UNAVAILABLE')
    const file = await this.runtime.require(WorkspaceFilesRuntimeCapability).readBuffer(version.workspaceFileRef)
    if (file.buffer.byteLength > MAX_DASHBOARD_PACKAGE_BYTES) throw new BadRequestException('DASHBOARD_MANIFEST_TOO_LARGE')
    if (!version.sha256 || createHash('sha256').update(file.buffer).digest('hex') !== version.sha256)
      throw new BadRequestException('DASHBOARD_VERSION_CONTENT_CHANGED')
    const { manifest, dependencies } = decodeDashboardPackage(file.buffer)
    return { ...summary(artifact, version), manifest, dependencies }
  }
  async query(context: XpertResolvedViewHostContext, artifactId: string, versionId: string, controls: Record<string, AnalyticsValue>) {
    const saved = await this.open(context, artifactId, versionId)
    const datasets = await this.execute(context, saved.manifest, controls)
    return { ...saved, datasets, ...(saved.manifest.presentation ? {} : { payload: toDataAnalyticsPayload(saved.manifest, datasets) }) }
  }
  async queryBinding(context: XpertResolvedViewHostContext, artifactId: string, versionId: string, bindingId: string, input: Record<string, AnalyticsValue>) {
    const saved = await this.open(context, artifactId, versionId)
    const binding = saved.manifest.bindings.find(item => item.id === bindingId)
    if (!binding) throw new ForbiddenException('DASHBOARD_BINDING_DENIED')
    const controls = validateControls(saved.manifest, input)
    const selected = Object.fromEntries(Object.entries(controls).filter(([id]) => binding.parameters.some(parameter => parameter.controlId === id)))
    return this.runtime.require(AnalyticsRuntimeCapability).query(actor(context), { binding, controls: selected })
  }
  private async execute(context: XpertResolvedViewHostContext, manifest: DashboardManifest, input: Record<string, AnalyticsValue>) {
    const controls = validateControls(manifest, input)
    const datasets: AnalyticalDataset[] = []
    for (const binding of manifest.bindings) {
      const selected = Object.fromEntries(Object.entries(controls).filter(([id]) => binding.parameters.some((parameter) => parameter.controlId === id)))
      datasets.push(await this.runtime.require(AnalyticsRuntimeCapability).query(actor(context), { binding, controls: selected }))
    }
    if (Buffer.byteLength(JSON.stringify(datasets)) > 3_000_000) throw new BadRequestException('DASHBOARD_RESULT_TOO_LARGE')
    return datasets
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
function validateControls(manifest: DashboardManifest, input: Record<string, AnalyticsValue>) {
  if (Object.keys(input).some(id => !manifest.controls.some(control => control.controlId === id))) throw new BadRequestException('DASHBOARD_UNKNOWN_CONTROL')
  const values = { ...Object.fromEntries(manifest.controls.filter(control => control.defaultValue !== undefined).map(control => [control.controlId, control.defaultValue ?? null])), ...input }
  for (const control of manifest.controls) {
    const value = values[control.controlId]
    if (value === undefined) continue
    if (control.allowedValues && !control.allowedValues.includes(value)) throw new BadRequestException('DASHBOARD_CONTROL_VALUE_DENIED')
    if (value !== null && (control.type === 'number' ? typeof value !== 'number' || !Number.isFinite(value) : control.type === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'string'))
      throw new BadRequestException('DASHBOARD_CONTROL_TYPE_INVALID')
  }
  return values
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
