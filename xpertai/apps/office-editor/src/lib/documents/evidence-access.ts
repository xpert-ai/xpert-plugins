import { ForbiddenException } from '@nestjs/common'
import { ContentResourcesRuntimeCapability, type ContentDocumentScope, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import { z } from 'zod/v3'
import type { OfficeDocument, OfficeSnapshot } from '../entities/index.js'

const originSchema = z.object({ xpertEvidence: z.object({ id: z.string().uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).optional() }).passthrough()

/** The immutable first snapshot pins provenance. Editable current snapshots cannot remove this guard. */
export async function authorizeDocumentEvidence(runtime: RuntimeCapabilityRegistry,
  snapshots: Pick<Repository<OfficeSnapshot>, 'findOneBy'>, scope: ContentDocumentScope, document: OfficeDocument) {
  if (!['office-editor.document', 'office-editor.presentation'].includes(document.contentModel ?? '')) return
  const initial = await snapshots.findOneBy({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
    projectId: scope.projectId, documentId: document.id, versionNumber: 1 })
  const parsed = originSchema.safeParse(initial?.snapshot)
  if (!parsed.success) throw new ForbiddenException('office.evidence_source_unavailable')
  if (!parsed.data.xpertEvidence) return
  await runtime.require(ContentResourcesRuntimeCapability).authorize({ actor: scope.actor,
    providerKey: 'live-dashboard.analysis-evidence', resourceId: parsed.data.xpertEvidence.id, operation: 'read' })
}
