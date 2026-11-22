import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import {
  ANALYSIS_STALE_MS,
  caseSuggestionSchema,
  confirmCaseSchema,
  createCaseSchema,
  FAILURE_CODES,
  IntakeError,
  scopeSchema
} from './domain/contracts.js'
import type {
  CaseDetail,
  CaseStatus,
  CaseSuggestion,
  CaseSummary,
  ConfirmCaseInput,
  CreateCaseInput,
  FailureCode,
  IntakeScope
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
  photoDataUrl: string
}

/** Rows written by an earlier format simply have no suggestion. */
function parseSuggestion(json: string | null): CaseSuggestion | null {
  if (!json) return null
  try {
    const parsed = caseSuggestionSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
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

  /** Not confirmed yet, and no model call is in flight for it. */
  private isOpen(record: IntakeCase) {
    return ANALYZABLE.includes(record.status) || (record.status === 'analyzing' && this.isStale(record))
  }

  private toSummary(record: IntakeCase): CaseSummary {
    const open = this.isOpen(record)
    return {
      id: record.id,
      title: record.title,
      status: record.status,
      revision: record.revision,
      canAnalyze: open,
      canConfirm: open,
      suggestedCategoryId: parseSuggestion(record.suggestionsJson)?.categoryId ?? null,
      confirmedCategoryId: record.confirmedCategoryId,
      failureCode: FAILURE_CODES.find(code => code === record.failureCode) ?? null,
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
    changes: Partial<Pick<IntakeCase, 'status' | 'suggestionsJson' | 'failureCode' | 'confirmedCategoryId'>>
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
      suggestion: parseSuggestion(record.suggestionsJson)
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
   * Claims a case for one analysis and returns the photo to show the model. The claim is a
   * compare-and-swap, so of several simultaneous requests only one goes on to call the model.
   */
  async startAnalysis(scope: IntakeScope, caseId: string): Promise<StartedAnalysis> {
    const record = await this.findOwned(scope, caseId)
    const photo = await this.photos.findOneBy({ ...scopeSchema.parse(scope), caseId })
    if (!photo) throw new IntakeError('photo_missing', 'This case has no photo, so it cannot be analysed.')
    if (record.status === 'confirmed') throw new IntakeError('invalid_state', 'A confirmed case is not analysed again.')
    if (!this.isOpen(record)) throw new IntakeError('conflict', 'This case is already being analysed.')
    const updated = await this.transition(scope, caseId, { revision: record.revision }, {
      status: 'analyzing',
      failureCode: null
    })
    if (!updated) throw new IntakeError('conflict', 'The case changed while starting the analysis. Read it again.')
    return { caseId, revision: updated.revision, photoDataUrl: toDataUrl(photo.mimeType, photo.base64) }
  }

  /** Saves the suggestion for exactly the analysis revision that produced it; a late one is refused. */
  async saveSuggestion(scope: IntakeScope, caseId: string, revision: number, suggestion: CaseSuggestion): Promise<CaseSummary> {
    const updated = await this.transition(scope, caseId, { revision, status: 'analyzing' }, {
      status: 'suggested',
      suggestionsJson: JSON.stringify(caseSuggestionSchema.parse(suggestion)),
      failureCode: null
    })
    if (updated) return this.toSummary(updated)
    throw new IntakeError('conflict', 'This analysis is no longer current. Nothing was saved.')
  }

  /** Records a failed analysis. Returns false when that analysis was already superseded. */
  async markFailed(scope: IntakeScope, caseId: string, revision: number, code: FailureCode): Promise<boolean> {
    const updated = await this.transition(scope, caseId, { revision, status: 'analyzing' }, {
      status: 'failed',
      failureCode: code
    })
    return updated !== null
  }

  /**
   * A person records the category: the suggested one or a different one, with or without a
   * suggestion. The suggestion stays on the case, so it remains visible whether they agreed.
   */
  async confirmCase(scope: IntakeScope, input: ConfirmCaseInput): Promise<CaseSummary> {
    const parsed = confirmCaseSchema.parse(input)
    const record = await this.findOwned(scope, parsed.caseId)
    if (record.revision !== parsed.revision) throw new IntakeError('conflict')
    if (!this.isOpen(record)) throw new IntakeError('invalid_state')
    const updated = await this.transition(scope, parsed.caseId, { revision: parsed.revision }, {
      status: 'confirmed',
      confirmedCategoryId: parsed.categoryId,
      failureCode: null
    })
    if (!updated) throw new IntakeError('conflict')
    return this.toSummary(updated)
  }

  /** Only cases a person has confirmed can serve as acceptance samples; their category is the reference. */
  async evaluationSample(scope: IntakeScope, id: string) {
    const record = await this.findOwned(scope, id)
    if (record.status !== 'confirmed' || !record.confirmedCategoryId) {
      throw new IntakeError('invalid_input', 'Only cases confirmed by a person can be used as acceptance samples.')
    }
    const photo = await this.photos.findOneBy({ ...scopeSchema.parse(scope), caseId: id })
    if (!photo) throw new IntakeError('photo_missing')
    return {
      sample: { id, title: record.title, referenceCategoryId: record.confirmedCategoryId, sha256: photo.sha256 },
      photoDataUrl: toDataUrl(photo.mimeType, photo.base64)
    }
  }
}
