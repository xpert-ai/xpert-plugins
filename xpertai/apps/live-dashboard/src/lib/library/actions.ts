import { BadRequestException } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { LibraryCatalogService } from './catalog.service'
import { LibraryTransfersService } from './transfers.service'
import { catalogV2Query, resourceV2Schema } from './resource-contract'

/** @beta Transport names are V2-only; V1 UI/catalog entries keep their explicit legacy route. */
export const resourceActions = ['resource-list', 'resource-open', 'resource-draft-save', 'resource-draft-open', 'resource-release',
  'resource-publish', 'resource-withdraw', 'resource-import-status', 'resource-import-commit', 'resource-import-cancel',
  'resource-jobs', 'resource-imports-cleanup', 'resource-files-cleanup', 'resource-upload-asset', 'resource-import', 'resource-prepare-task', 'resource-prepare-template', 'resource-execution-status']
export const resourceFileActions = ['resource-upload-asset', 'resource-import']
const target = z.object({ releaseId: z.string().uuid() }).strict()
const draft = z.object({ draftId: z.string().uuid() }).strict()
const transfer = z.object({ importId: z.string().uuid() }).strict()
const revision = z.number().int().nonnegative().max(2_000_000_000)

export async function executeResourceAction(catalog: LibraryCatalogService, transfers: LibraryTransfersService,
  context: XpertResolvedViewHostContext, action: string, input: unknown): Promise<unknown> {
  switch (action) {
    case 'resource-list': return catalog.list(context, catalogV2Query.parse(input))
    case 'resource-open': return catalog.read(context, target.parse(input).releaseId)
    case 'resource-draft-save': {
      const request = z.object({ document: resourceV2Schema, expectedRevision: revision }).strict().parse(input)
      return catalog.saveDraft(context, request.document, request.expectedRevision)
    }
    case 'resource-draft-open': return catalog.getDraft(context, draft.parse(input).draftId)
    case 'resource-release': {
      const request = draft.extend({ expectedRevision: revision }).parse(input)
      return catalog.releaseDraft(context, request.draftId, request.expectedRevision)
    }
    case 'resource-publish': {
      const request = target.extend({ confirmed: z.literal(true) }).parse(input)
      return catalog.publish(context, request.releaseId, request.confirmed)
    }
    case 'resource-withdraw': return catalog.withdraw(context, target.parse(input).releaseId)
    case 'resource-import-status': return transfers.inspect(context, transfer.parse(input).importId)
    case 'resource-import-commit': return transfers.commit(context, transfer.parse(input).importId)
    case 'resource-import-cancel': return transfers.cancel(context, transfer.parse(input).importId)
    case 'resource-jobs': z.object({}).strict().parse(input); return transfers.jobs(context)
    case 'resource-imports-cleanup': {
      const request = z.object({ before: z.string().datetime() }).strict().parse(input)
      return transfers.cleanup(context, new Date(request.before))
    }
    case 'resource-files-cleanup': {
      const request = z.object({ before: z.string().datetime(), afterId: z.string().uuid().optional() }).strict().parse(input)
      return catalog.files.cleanup(await catalog.actor(context, true), new Date(request.before), request.afterId)
    }
    default: throw new BadRequestException('DASHBOARD_ACTION_UNSUPPORTED')
  }
}
