import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import { saveDraftSchema, draftSchema } from './domain/draft.js'
import type { RoadEventDraft } from './domain/draft.js'
import { RoadEventDraftRecord } from './road-event-command-center-draft.entity.js'

export interface DraftScope {
  tenantId: string
  organizationId: string
  workspaceId: string
  userId: string
  xpertId: string
}

function recordId(scope: DraftScope) {
  return createHash('sha256').update(JSON.stringify([
    scope.tenantId, scope.organizationId, scope.workspaceId, scope.userId, scope.xpertId
  ])).digest('hex')
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = 'driverError' in error && error.driverError && typeof error.driverError === 'object'
    ? error.driverError
    : error
  if ('code' in candidate && (
    candidate.code === '23505' ||
    candidate.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    candidate.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
  )) return true
  // sql.js does not expose a stable machine-readable error code.
  return error instanceof Error &&
    /^UNIQUE constraint failed: plugin_road_event_command_center_road_event_draft\./.test(error.message)
}

@Injectable()
export class RoadEventCommandCenterDraftService {
  constructor(@InjectRepository(RoadEventDraftRecord) private readonly records: Repository<RoadEventDraftRecord>) {}

  async get(scope: DraftScope) {
    const row = await this.records.findOneBy({ ...scope, id: recordId(scope) })
    return {
      revision: row?.revision ?? 0,
      draft: row ? draftSchema.parse(JSON.parse(row.payloadJson)) : null,
      updatedAt: row?.updatedAt ?? null
    }
  }

  async save(scope: DraftScope, input: unknown) {
    const parsed = saveDraftSchema.parse(input)
    const id = recordId(scope)
    const current = await this.records.findOneBy({ ...scope, id })
    const updatedAt = new Date().toISOString()
    const previousDraft = current ? draftSchema.parse(JSON.parse(current.payloadJson)) : null
    const eventFields = ['title', 'eventType', 'severity', 'locationDescription', 'description', 'occurredAt', 'coordinates'] as const
    const eventIsUnchanged = previousDraft && eventFields.every((field) =>
      JSON.stringify(previousDraft[field] ?? null) === JSON.stringify(parsed.draft[field] ?? null)
    )
    const recommendationIsUnchanged = previousDraft && JSON.stringify(previousDraft.recommendation ?? null) === JSON.stringify(parsed.draft.recommendation ?? null)
    const draftToSave = previousDraft ? {
      ...parsed.draft,
      ...(eventIsUnchanged ? {} : { recommendation: null, recommendationAttempt: null }),
      confirmation: eventIsUnchanged && recommendationIsUnchanged ? previousDraft.confirmation ?? null : null
    } : parsed.draft
    if (!current) {
      if (parsed.expectedRevision !== 0) throw new Error('conflict')
      try {
        await this.records.insert({
          ...scope, id, revision: 1,
          payloadJson: JSON.stringify(draftToSave), updatedAt
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new Error('conflict')
        throw error
      }
      return { revision: 1, updatedAt }
    }
    if (current.revision !== parsed.expectedRevision) throw new Error('conflict')
    const result = await this.records.update(
      { ...scope, id, revision: parsed.expectedRevision },
      { revision: parsed.expectedRevision + 1, payloadJson: JSON.stringify(draftToSave), updatedAt }
    )
    if (result.affected !== 1) throw new Error('conflict')
    return { revision: parsed.expectedRevision + 1, updatedAt }
  }
  async confirmRecommendation(scope: DraftScope, expectedRevision: number) {
    const id = recordId(scope)
    const current = await this.records.findOneBy({ ...scope, id })
    if (!current) throw new Error('draft_not_found')
    if (current.revision !== expectedRevision) throw new Error('conflict')

    const draft = draftSchema.parse(JSON.parse(current.payloadJson))
    if (!draft.recommendation || draft.recommendationAttempt?.status !== 'succeeded') {
      throw new Error('recommendation_required')
    }
    if (draft.confirmation?.status === 'confirmed') {
      return { revision: current.revision, updatedAt: current.updatedAt, confirmation: draft.confirmation }
    }

    const updatedAt = new Date().toISOString()
    const confirmation = { status: 'confirmed' as const, confirmedAt: updatedAt, confirmedBy: scope.userId }
    const result = await this.records.update(
      { ...scope, id, revision: expectedRevision },
      { revision: expectedRevision + 1, payloadJson: JSON.stringify({ ...draft, confirmation }), updatedAt }
    )
    if (result.affected !== 1) throw new Error('conflict')
    return { revision: expectedRevision + 1, updatedAt, confirmation }
  }
}
