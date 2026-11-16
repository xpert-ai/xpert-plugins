import { createHash, randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { AnalysisEvidenceSnapshot, AnalyticalDataset, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ArtifactContentRuntimeCapability, ArtifactDraftsRuntimeCapability, ArtifactsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ContentActor, type ContentDocumentScope, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { analysisEvidenceDigestInput, canonicalEvidenceJson, parseAnalysisEvidence, resolveAnalyticsParameters } from '@xpert-ai/plugin-sdk/analytics'
import { z } from 'zod/v3'
import { DashboardService, PLUGIN_NAME, projectId } from '../dashboard.service'
import { AnalysisEvidenceRecord } from './evidence.entity'

export const EVIDENCE_TYPE = 'analysis-evidence'
export const EVIDENCE_PROVIDER = 'live-dashboard.analysis-evidence'
export const captureEvidenceSchema = z.object({ requestId: z.string().uuid(), artifactId: z.string().uuid(), versionId: z.string().uuid(),
  title: z.string().min(1).max(200), controls: z.record(z.string().min(1).max(80), z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]))
    .refine(value => Object.keys(value).length <= 32) }).strict()
export const evidenceContext = (scope: ContentDocumentScope): XpertResolvedViewHostContext => ({ ...scope.actor, hostType: 'project', hostId: scope.projectId, slots: [] })
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
/** Exclude execution clocks while retaining source versions, certification and exact row scope.
 * If current results differ, old cells cannot be newly disclosed under potentially changed row-level permissions. */
export function evidenceDataDigest(datasets: AnalyticalDataset[]) {
  return digest(canonicalEvidenceJson(datasets.map(({ freshness: _clock, provenance, ...data }) => {
    const { executionId: _id, upstreamExecutionId: _upstream, auditRef: _audit, certification, ...source } = provenance
    const proof = certification ? (({ verifiedAt: _checked, ...value }) => value)(certification) : undefined
    return { ...data, dataAsOf: _clock.dataAsOf, provenance: { ...source, certification: proof } }
  })))
}
@Injectable()
export class AnalysisEvidenceService {
  constructor(@InjectRepository(AnalysisEvidenceRecord) private readonly records: Repository<AnalysisEvidenceRecord>,
    private readonly dashboards: DashboardService, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  private scope(context: XpertResolvedViewHostContext) {
    const project = projectId(context)
    if (!context.tenantId || !context.organizationId || !context.userId || !project) throw new ForbiddenException('EVIDENCE_PROJECT_REQUIRED')
    return { tenantId: context.tenantId, organizationId: context.organizationId, projectId: project }
  }
  private async query(context: XpertResolvedViewHostContext, source: AnalysisEvidenceSnapshot['source'], controls: AnalysisEvidenceSnapshot['controls']) {
    if (this.scope(context).projectId !== source.projectId) throw new ForbiddenException('EVIDENCE_SCOPE_DENIED')
    const result = await this.dashboards.query(context, source.artifactId, source.versionId, controls)
    if (result.failures.length || !result.datasets.length) throw new ForbiddenException('EVIDENCE_SOURCE_UNAVAILABLE')
    return result.datasets
  }
  async authorize(context: XpertResolvedViewHostContext, id: string, write = false) {
    await this.dashboards.authorizeProject(context, write ? 'write' : 'read')
    const row = await this.records.findOneBy({ ...this.scope(context), id })
    if (!row) throw new ForbiddenException('EVIDENCE_UNAVAILABLE')
    if (write && row.artifactId) throw new ForbiddenException('EVIDENCE_IMMUTABLE')
    const snapshot = parseAnalysisEvidence(row.snapshot)
    if (snapshot.id !== row.id || snapshot.source.projectId !== row.projectId || digest(analysisEvidenceDigestInput(snapshot)) !== snapshot.sha256)
      throw new ForbiddenException('EVIDENCE_INTEGRITY_FAILED')
    const current = await this.query(context, snapshot.source, snapshot.controls)
    if (evidenceDataDigest(current) !== evidenceDataDigest(snapshot.datasets)) throw new ConflictException('EVIDENCE_SOURCE_CHANGED_CAPTURE_NEW_SNAPSHOT')
    await this.dashboards.authorizeProject(context)
    return row
  }
  async contextFor(actor: ContentActor, id: string) {
    const row = await this.records.findOneBy({ tenantId: actor.tenantId, organizationId: actor.organizationId, id })
    if (!row) throw new ForbiddenException('EVIDENCE_UNAVAILABLE')
    return evidenceContext({ actor, projectId: row.projectId })
  }
  async validateBytes(buffer: Buffer) {
    if (buffer.length > 2_000_000) throw new BadRequestException('EVIDENCE_SIZE_LIMIT')
    const snapshot = parseAnalysisEvidence(JSON.parse(buffer.toString('utf8')))
    const row = await this.records.findOneBy({ id: snapshot.id })
    if (!row || canonicalEvidenceJson(row.snapshot) !== canonicalEvidenceJson(snapshot)) throw new ForbiddenException('EVIDENCE_IMMUTABLE')
  }
  async canCapture(context: XpertResolvedViewHostContext) {
    try { await this.dashboards.authorizeProject(context, 'write'); return true }
    catch (error) { if (error instanceof ForbiddenException) return false; throw error }
  }
  async read(context: XpertResolvedViewHostContext, id: string) { return (await this.authorize(context, id)).snapshot }
  async refresh(context: XpertResolvedViewHostContext, id: string, requestId: string, title: string) {
    await this.dashboards.authorizeProject(context, 'write')
    const row = await this.records.findOneBy({ ...this.scope(context), id })
    if (!row) throw new ForbiddenException('EVIDENCE_UNAVAILABLE')
    const snapshot = parseAnalysisEvidence(row.snapshot)
    if (snapshot.id !== row.id || snapshot.source.projectId !== row.projectId || digest(analysisEvidenceDigestInput(snapshot)) !== snapshot.sha256)
      throw new ForbiddenException('EVIDENCE_INTEGRITY_FAILED')
    // A changed row scope must never disclose the old rows. Only reuse source
    // coordinates internally; capture authorizes and queries the current source.
    const receipt = await this.capture(context, { requestId, title, artifactId: snapshot.source.artifactId,
      versionId: snapshot.source.versionId, controls: snapshot.controls })
    return { ...receipt, previousId: id }
  }
  async list(context: XpertResolvedViewHostContext, cursor = 0) {
    await this.dashboards.authorizeProject(context)
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new BadRequestException('EVIDENCE_CURSOR_INVALID')
    const rows = await this.records.find({ where: this.scope(context), order: { createdAt: 'DESC', id: 'ASC' }, skip: cursor, take: 50 })
    const items: Array<{ id: string; title: string; sha256: string; capturedAt: string; artifactId: string | null }> = []
    for (const row of rows) {
      if (!row.artifactId) continue
      try { const current = await this.authorize(context, row.id); items.push({ id: row.id, title: current.snapshot.title, sha256: current.snapshot.sha256, capturedAt: current.snapshot.capturedAt, artifactId: current.artifactId }) }
      catch (error) { if (!(error instanceof ForbiddenException || error instanceof ConflictException)) throw error }
    }
    return { items, ...(rows.length === 50 ? { nextCursor: cursor + 50 } : {}) }
  }
  async capture(context: XpertResolvedViewHostContext, raw: z.infer<typeof captureEvidenceSchema>) {
    const input = captureEvidenceSchema.parse(raw), scope = this.scope(context)
    await this.dashboards.authorizeProject(context, 'write')
    const requestHash = digest(canonicalEvidenceJson(input))
    let row = await this.records.findOneBy({ ...scope, requestId: input.requestId })
    if (row && (row.requestHash !== requestHash || row.createdById !== context.userId)) throw new ConflictException('EVIDENCE_REQUEST_CONFLICT')
    if (!row) {
      const source = { artifactId: input.artifactId, versionId: input.versionId, projectId: scope.projectId }
      const saved = await this.dashboards.open(context, source.artifactId, source.versionId)
      if (saved.isDraft || saved.versionId !== source.versionId) throw new BadRequestException('EVIDENCE_PUBLISHED_VERSION_REQUIRED')
      const known = new Set(saved.manifest.controls.map(control => control.controlId))
      if (Object.keys(input.controls).some(key => !known.has(key))) throw new BadRequestException('EVIDENCE_CONTROL_UNKNOWN')
      const controls = { ...input.controls }
      for (const binding of saved.manifest.bindings) {
        const parameters = resolveAnalyticsParameters(binding, input.controls)
        for (const parameter of binding.parameters ?? []) {
          const value = parameters[parameter.name]
          if (value !== undefined) {
            if (parameter.controlId in controls && controls[parameter.controlId] !== value) throw new BadRequestException('EVIDENCE_CONTROL_DEFAULT_CONFLICT')
            controls[parameter.controlId] = value
          }
        }
      }
      const datasets = await this.query(context, source, controls)
      if (datasets.reduce((n, dataset) => n + dataset.rows.length, 0) > 1000) throw new BadRequestException('EVIDENCE_ROW_LIMIT')
      const snapshot: AnalysisEvidenceSnapshot = { schema: 'xpert.analysis-evidence@1', id: randomUUID(), title: input.title,
        capturedAt: new Date().toISOString(), source, controls, datasets,
        statements: datasets.flatMap(dataset => dataset.rows.map((cells, row) => ({ kind: 'fact' as const,
          text: dataset.fields.map(field => `${field.label}: ${String(cells[field.id])}${field.unit ? ' ' + field.unit : ''}`).join('; '),
          citations: dataset.fields.map(field => ({ datasetId: dataset.datasetId, row, field: field.id })) }))), sha256: '0'.repeat(64) }
      snapshot.sha256 = digest(analysisEvidenceDigestInput(snapshot))
      parseAnalysisEvidence(snapshot)
      await this.records.createQueryBuilder().insert().values({ ...scope, id: snapshot.id, createdById: context.userId,
        requestId: input.requestId, requestHash, snapshot, artifactId: null }).orIgnore().execute()
      row = await this.records.findOneByOrFail({ ...scope, requestId: input.requestId })
      if (row.requestHash !== requestHash || row.createdById !== context.userId) throw new ConflictException('EVIDENCE_REQUEST_CONFLICT')
    }
    // Recheck even on retries. Never regenerate bytes of an existing snapshot.
    await this.authorize(context, row.id)
    const api = this.runtime.require(ArtifactsRuntimeCapability)
    const source = { pluginName: PLUGIN_NAME, resourceType: EVIDENCE_TYPE, resourceId: row.id }
    const artifact = await api.findArtifactBySource(source) ?? await api.createArtifact({ source,
      type: { pluginName: PLUGIN_NAME, resourceType: EVIDENCE_TYPE }, authorizationProviderKey: EVIDENCE_PROVIDER,
      kind: 'file', title: row.snapshot.title, scope: { ...scope, userId: null } })
    const drafts = this.runtime.require(ArtifactDraftsRuntimeCapability)
    let draft = await drafts.get(artifact.id)
    if (!draft) {
      const buffer = Buffer.from(JSON.stringify(row.snapshot))
      const ref = await this.runtime.require(ArtifactContentRuntimeCapability).write({ artifactId: artifact.id, buffer })
      try { draft = await drafts.save({ artifactId: artifact.id, expectedRevision: 0, expectedCurrentVersionId: null,
        workspaceFileRef: ref, mimeType: 'application/json', fileName: 'analysis-evidence.json', title: row.snapshot.title, sha256: digest(buffer.toString()) }) }
      catch (error) { if (!(error instanceof ConflictException)) throw error; draft = await drafts.get(artifact.id); if (!draft) throw error }
    }
    await this.records.update({ id: row.id, ...scope }, { artifactId: artifact.id })
    await this.authorize(context, row.id)
    return { id: row.id, artifactId: artifact.id, sha256: row.snapshot.sha256, capturedAt: row.snapshot.capturedAt }
  }
}
