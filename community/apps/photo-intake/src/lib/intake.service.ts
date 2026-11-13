import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { CATEGORY_IDS } from './domain/categories.js'
import {
  ANALYSIS_STALE_MS,
  createCaseSchema,
  IntakeError,
  scopeSchema,
  submitSuggestionsSchema
} from './domain/contracts.js'
import type {
  CaseDetail,
  CaseStatus,
  CaseSummary,
  CategorySuggestion,
  CreateCaseInput,
  FailureCode,
  IntakeScope,
  SubmitSuggestionsInput
} from './domain/contracts.js'
import { decodePhotoDataUrl, toDataUrl } from './domain/photo.js'
import { IntakeCase } from './intake-case.entity.js'
import { IntakePhoto } from './intake-photo.entity.js'

const LIST_LIMIT = 50
/** Statuses from which a new analysis may start. `analyzing` qualifies only once stale. */
const ANALYZABLE: readonly CaseStatus[] = ['draft', 'suggested', 'failed']

export interface StartedAnalysis {
  caseId: string
  revision: number
  title: string
  photo: { mimeType: string; buffer: Buffer; sha256: string }
}

function parseSuggestions(json: string | null): CategorySuggestion[] {
  if (!json) return []
  const value: unknown = JSON.parse(json)
  return Array.isArray(value) ? value : []
}

@Injectable()
export class IntakeService {
  /** Overridable in tests so staleness can be checked without waiting. */
  now = () => new Date()

  constructor(
    @InjectRepository(IntakeCase) private readonly cases: Repository<IntakeCase>,
    @InjectRepository(IntakePhoto) private readonly photos: Repository<IntakePhoto>
  ) {}

  private isStale(record: IntakeCase) {
    return this.now().getTime() - Date.parse(record.updatedAt) > ANALYSIS_STALE_MS
  }

  private canAnalyze(record: IntakeCase) {
    return ANALYZABLE.includes(record.status) || (record.status === 'analyzing' && this.isStale(record))
  }

  private toSummary(record: IntakeCase): CaseSummary {
    return {
      id: record.id,
      title: record.title,
      status: record.status,
      revision: record.revision,
      canAnalyze: this.canAnalyze(record),
      confirmedCategoryId: record.confirmedCategoryId,
      failureCode: record.failureCode,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }
  }

  private async findOwned(scope: IntakeScope, id: string) {
    const record = await this.cases.findOneBy({ ...scopeSchema.parse(scope), id })
    if (!record) throw new IntakeError('not_found')
    return record
  }

  /**
   * Compare-and-swap on the revision (and optionally the status), so two writers can never both
   * win. Returns the stored row on success, or null when the expected state no longer holds.
   */
  private async transition(
    scope: IntakeScope,
    id: string,
    expected: { revision: number; status?: CaseStatus },
    changes: Partial<Pick<IntakeCase, 'status' | 'suggestionsJson' | 'failureCode'>>
  ) {
    const owner = scopeSchema.parse(scope)
    const result = await this.cases.update(
      { ...owner, id, revision: expected.revision, ...(expected.status ? { status: expected.status } : {}) },
      { ...changes, revision: expected.revision + 1, updatedAt: this.now().toISOString() }
    )
    if (result.affected !== 1) return null
    return this.findOwned(scope, id)
  }

  async listCases(scope: IntakeScope): Promise<CaseSummary[]> {
    const records = await this.cases.find({
      where: scopeSchema.parse(scope),
      order: { updatedAt: 'DESC' },
      take: LIST_LIMIT
    })
    return records.map(record => this.toSummary(record))
  }

  async getCase(scope: IntakeScope, id: string): Promise<CaseSummary> {
    return this.toSummary(await this.findOwned(scope, id))
  }

  async getCaseDetail(scope: IntakeScope, id: string): Promise<CaseDetail> {
    const record = await this.findOwned(scope, id)
    const photo = await this.photos.findOneBy({ ...scopeSchema.parse(scope), caseId: id })
    return {
      ...this.toSummary(record),
      photoDataUrl: photo ? toDataUrl(photo.mimeType, photo.base64) : null,
      suggestions: parseSuggestions(record.suggestionsJson)
    }
  }

  /** Idempotent on requestKey: a repeated or retried request returns the case it created first. */
  async createCase(scope: IntakeScope, input: CreateCaseInput): Promise<CaseSummary> {
    const owner = scopeSchema.parse(scope)
    const parsed = createCaseSchema.parse(input)
    const existing = await this.cases.findOneBy({ ...owner, requestKey: parsed.requestKey })
    if (existing) return this.toSummary(existing)
    const photo = decodePhotoDataUrl(parsed.photo.dataUrl)

    const now = this.now().toISOString()
    const record = this.cases.create({
      ...owner,
      id: randomUUID(),
      requestKey: parsed.requestKey,
      title: parsed.title,
      status: 'draft',
      revision: 1,
      suggestionsJson: null,
      confirmedCategoryId: null,
      failureCode: null,
      createdAt: now,
      updatedAt: now
    })
    try {
      await this.cases.insert(record)
    } catch (error) {
      // Two requests with the same key raced; the unique index kept one row.
      const winner = await this.cases.findOneBy({ ...owner, requestKey: parsed.requestKey })
      if (winner) return this.toSummary(winner)
      throw error
    }
    try {
      await this.photos.insert({
        ...owner,
        caseId: record.id,
        mimeType: photo.mimeType,
        byteSize: photo.buffer.length,
        sha256: photo.sha256,
        base64: photo.buffer.toString('base64'),
        createdAt: now
      })
    } catch (error) {
      // Without a platform transaction, undo the case so no photo-less draft is left behind.
      await this.cases.delete({ ...owner, id: record.id })
      throw error
    }
    return this.toSummary(record)
  }

  /**
   * Opens a case for analysis and returns the photo to show the model.
   * Repeating the call while the same analysis is running returns the same revision.
   */
  async startAnalysis(scope: IntakeScope, caseId: string): Promise<StartedAnalysis> {
    const record = await this.findOwned(scope, caseId)
    const photo = await this.photos.findOneBy({ ...scopeSchema.parse(scope), caseId })
    if (!photo) throw new IntakeError('photo_missing', 'This case has no photo, so it cannot be analysed.')
    const started = (current: IntakeCase): StartedAnalysis => ({
      caseId,
      revision: current.revision,
      title: current.title,
      photo: { mimeType: photo.mimeType, buffer: Buffer.from(photo.base64, 'base64'), sha256: photo.sha256 }
    })

    if (record.status === 'analyzing' && !this.isStale(record)) return started(record)
    if (!this.canAnalyze(record)) {
      throw new IntakeError('invalid_state', `A ${record.status} case cannot be analysed again.`)
    }
    const updated = await this.transition(scope, caseId, { revision: record.revision }, {
      status: 'analyzing',
      suggestionsJson: null,
      failureCode: null
    })
    if (!updated) throw new IntakeError('conflict', 'The case changed while starting the analysis. Read it again.')
    return started(updated)
  }

  /** Saves the model's ranked suggestions for exactly the analysis revision it was given. */
  async submitSuggestions(scope: IntakeScope, input: SubmitSuggestionsInput): Promise<CaseSummary> {
    const parsed = submitSuggestionsSchema.parse(input)
    const unknown = parsed.suggestions.filter(item => !CATEGORY_IDS.includes(item.categoryId))
    if (unknown.length) {
      throw new IntakeError(
        'unknown_category',
        `Unknown categoryId: ${unknown.map(item => item.categoryId).join(', ')}. Allowed: ${CATEGORY_IDS.join(', ')}.`
      )
    }
    if (new Set(parsed.suggestions.map(item => item.categoryId)).size !== parsed.suggestions.length) {
      throw new IntakeError('invalid_input', 'Each categoryId may appear only once.')
    }
    const ranked = [...parsed.suggestions].sort((a, b) => b.confidence - a.confidence)
    const updated = await this.transition(
      scope,
      parsed.caseId,
      { revision: parsed.revision, status: 'analyzing' },
      { status: 'suggested', suggestionsJson: JSON.stringify(ranked), failureCode: null }
    )
    if (updated) return this.toSummary(updated)

    const current = await this.findOwned(scope, parsed.caseId)
    throw new IntakeError(
      'conflict',
      `The case is now ${current.status} at revision ${current.revision}; this analysis (revision ${parsed.revision}) is no longer current. Nothing was saved.`
    )
  }

  /** Records a failed analysis. Returns false when that analysis was already superseded. */
  async markFailed(scope: IntakeScope, caseId: string, revision: number, code: FailureCode): Promise<boolean> {
    const updated = await this.transition(scope, caseId, { revision, status: 'analyzing' }, {
      status: 'failed',
      failureCode: code
    })
    return updated !== null
  }
}
