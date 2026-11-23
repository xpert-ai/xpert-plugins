import { Inject, Injectable } from '@nestjs/common'
import { ContentResourcesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { AnalysisEvidenceService, EVIDENCE_PROVIDER } from './evidence.service'
import { projectId } from '../dashboard.service'
@Injectable()
export class AnalysisEvidenceTransfers {
  constructor(private readonly evidence: AnalysisEvidenceService,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  async convert(context: XpertResolvedViewHostContext, input: { id: string; requestId: string; title: string; target: 'document' | 'presentation' | 'motion' }) {
    const snapshot = await this.evidence.read(context, input.id)
    const scope = { actor: { tenantId: context.tenantId!, organizationId: context.organizationId!, userId: context.userId! }, projectId: projectId(context)! }
    const catalog = this.runtime.require(ContentResourcesRuntimeCapability).catalog
    const source = await catalog.register({ ...scope, source: { providerKey: EVIDENCE_PROVIDER, resourceId: snapshot.id } })
    const target = input.target !== 'motion' ? { providerKey: 'office.documents', implementationKey: input.target === 'presentation' ? 'office-presentation' : 'office-document' }
      : { providerKey: 'motion.evidence-video', implementationKey: 'motion-evidence-video' }
    return catalog.create({ ...scope, ...target, requestId: input.requestId, title: input.title,
      transferFrom: { contentId: source.contentId, expectedRevision: snapshot.sha256 } })
  }
}
