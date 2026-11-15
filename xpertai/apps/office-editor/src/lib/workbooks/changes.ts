import { z } from 'zod/v3'
import { Between, In, type Repository } from 'typeorm'
import type { ContentDocumentScope } from '@xpert-ai/plugin-sdk'
import { OfficeDocument, OfficeSnapshot, OfficeOperation } from '../entities/index.js'

import { workbookChange } from './changes-schema.js'
/** Bounded log catch-up. Structural/legacy writes and missing history explicitly
 * require a fresh snapshot; no coordinate transform is guessed here. */
export async function readWorkbookChanges(documents: Repository<OfficeDocument>, scope: ContentDocumentScope, document: OfficeDocument, after: number) {
  const revision = document.currentVersionNumber!
  if (after > revision || revision - after > 100) return { reset: true as const, revision }
  const scopeWhere = { documentId: document.id, tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId, projectId: scope.projectId }
  const rows = revision > after ? await documents.manager.getRepository(OfficeSnapshot).find({
    where: { ...scopeWhere, versionNumber: Between(after + 1, revision) }, order: { versionNumber: 'ASC' }, take: 50,
    select: { id: true, versionNumber: true, changeSummary: true } }) : []
  if (rows.length !== Math.min(50, revision - after) || rows.some((row, i) => row.versionNumber !== after + i + 1 || !['xpert.workbook.operations@1', 'xpert.workbook.operations@2', 'xpert.workbook.structure@2'].includes(row.changeSummary)))
    return { reset: true as const, revision }
  const operations = rows.length ? await documents.manager.getRepository(OfficeOperation).find({
    where: { ...scopeWhere, snapshotId: In(rows.map(row => row.id!)), status: 'applied' }, select: { snapshotId: true, result: true } }) : []
  const items: z.infer<typeof workbookChange>[] = []
  let bytes = 0
  for (const row of rows) {
    const parsed = workbookChange.safeParse(operations.find(operation => operation.snapshotId === row.id)?.result)
    if (!parsed.success || parsed.data.revision !== row.versionNumber) return { reset: true as const, revision }
    bytes += JSON.stringify(parsed.data).length * 2
    if (bytes > 2 * 1024 * 1024) return { reset: true as const, revision }
    items.push(parsed.data)
  }
  const cursor = items.at(-1)?.revision ?? after
  return { reset: false as const, revision, cursor, items, more: cursor < revision,
    title: document.title, sourcePath: document.sourceSnapshotPath ?? '', sourceHash: document.sourceSnapshotHash ?? '' }
}
