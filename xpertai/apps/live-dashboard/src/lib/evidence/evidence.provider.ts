import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { ArtifactTypeProvider, ContentResourceProvider, type ArtifactTypeSource, type ArtifactTypeActor, type ContentOperation,
  type IArtifactTypeProvider, type ContentCatalogProvider, type IContentResourceProvider, type ContentResourceRequest } from '@xpert-ai/plugin-sdk'
import { AnalysisEvidenceService, EVIDENCE_TYPE, EVIDENCE_PROVIDER, evidenceContext } from './evidence.service'
import { EVIDENCE_EDITOR } from './evidence-view.provider'
import { PLUGIN_NAME } from '../dashboard.service'

const model = { typeId: 'analysis-evidence', modelId: 'xpert.analysis-evidence', schemaVersion: '1', editProtocol: { id: 'immutable.snapshot', version: '1' } }
@Injectable()
@ArtifactTypeProvider(EVIDENCE_TYPE)
export class AnalysisEvidenceArtifactType implements IArtifactTypeProvider {
  constructor(private readonly evidence: AnalysisEvidenceService) {}
  readonly definition = { versioning: { mode: 'draft-only' as const }, title: { en_US: 'Analysis evidence', zh_Hans: '分析证据快照' },
    kinds: ['file' as const], content: { mimeTypes: ['application/json'], maxBytes: 2_000_000 }, collection: { allowCopy: false }, presentation: { mode: 'file' as const } }
  async authorize(source: ArtifactTypeSource, actor: ArtifactTypeActor, operation: ContentOperation) {
    if (!actor.tenantId || !actor.userId || actor.tenantId !== source.tenantId || !source.organizationId || !source.projectId ||
      source.pluginName !== PLUGIN_NAME || source.resourceType !== EVIDENCE_TYPE) throw new ForbiddenException('EVIDENCE_SCOPE_DENIED')
    await this.evidence.authorize(evidenceContext({ actor: { tenantId: actor.tenantId, userId: actor.userId, organizationId: source.organizationId }, projectId: source.projectId }), source.resourceId, operation !== 'read')
  }
  authorizeDraft(source: ArtifactTypeSource, actor: ArtifactTypeActor, operation: ContentOperation) { return this.authorize(source, actor, operation) }
  async validateContent(buffer: Buffer, mimeType: string) {
    if (mimeType !== 'application/json') throw new BadRequestException('EVIDENCE_FORMAT_INVALID')
    await this.evidence.validateBytes(buffer)
  }
}
@Injectable()
@ContentResourceProvider(EVIDENCE_PROVIDER)
export class AnalysisEvidenceContent implements IContentResourceProvider {
  readonly title = 'Immutable analysis evidence'
  constructor(private readonly evidence: AnalysisEvidenceService) {}
  readonly catalog: ContentCatalogProvider = {
    types: [{ ...model, title: { en_US: 'Analysis evidence', zh_Hans: '分析证据快照' }, implementationKey: EVIDENCE_TYPE,
      defaultEditorKey: EVIDENCE_EDITOR, implementationTitle: { en_US: 'Captured query results', zh_Hans: '已保存查询结果' }, creatable: false }],
    discover: async scope => { const page = await this.evidence.list(evidenceContext(scope), Number(scope.cursor ?? 0));
      return { resourceIds: page.items.map(item => item.id), ...(page.nextCursor === undefined ? {} : { nextCursor: String(page.nextCursor) }) } },
    describe: async scope => {
      const record = await this.evidence.authorize(evidenceContext(scope), scope.sourceResourceId)
      const snapshot = record.snapshot
      return { ...model, projectId: scope.projectId, title: snapshot.title, revision: snapshot.sha256, updatedAt: snapshot.capturedAt,
        deleted: false, defaultEditorKey: EVIDENCE_EDITOR, source: { kind: 'managed' }, allowedActions: [],
        preview: { kind: 'outline', revision: snapshot.sha256, lines: [snapshot.title, snapshot.capturedAt, ...snapshot.statements.slice(0, 3).map(item => item.text.slice(0, 160))] } }
    },
    extract: async scope => { const snapshot = await this.evidence.read(evidenceContext(scope), scope.sourceResourceId)
      if (snapshot.sha256 !== scope.expectedRevision) throw new BadRequestException('EVIDENCE_REVISION_CONFLICT')
      return { revision: snapshot.sha256, sections: snapshot.statements.map((statement, index) => ({ anchor: { kind: statement.kind, id: String(index) }, text: statement.text })) } },
    transfer: async scope => {
      if (!scope.acceptedSchemas.includes('xpert.content-analysis-transfer@1')) throw new BadRequestException('EVIDENCE_TARGET_UNSUPPORTED')
      const snapshot = await this.evidence.read(evidenceContext(scope), scope.sourceResourceId)
      if (snapshot.sha256 !== scope.expectedRevision) throw new BadRequestException('EVIDENCE_REVISION_CONFLICT')
      return { schema: 'xpert.content-analysis-transfer@1', source: { providerKey: EVIDENCE_PROVIDER, resourceId: snapshot.id, revision: snapshot.sha256, title: snapshot.title }, evidence: snapshot }
    },
    create: async () => { throw new BadRequestException('EVIDENCE_CAPTURE_REQUIRED') }
  }
  async authorize(input: ContentResourceRequest) {
    const context = await this.evidence.contextFor(input.actor, input.resourceId)
    const record = await this.evidence.authorize(context, input.resourceId, input.operation !== 'read')
    return { providerKey: EVIDENCE_PROVIDER, resourceId: input.resourceId, title: record.snapshot.title, role: input.operation === 'read' ? 'viewer' as const : 'editor' as const,
      canWrite: input.operation !== 'read', canManage: false }
  }
}
