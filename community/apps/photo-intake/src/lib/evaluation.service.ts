import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { CATEGORIES } from './domain/categories.js'
import { IntakeError, scopeSchema } from './domain/contracts.js'
import type { IntakeScope } from './domain/contracts.js'
import {
  ATTEMPT_LEASE_MS, MAX_ATTEMPTS, cellSchema, createRunSchema, decideRunSchema,
  decisionSchema, latestAttempt, reviewSampleSchema, reviewSchema, runRevisionSchema, snapshotSchema
} from './domain/evaluation.js'
import type {
  CreateRunInput, EvaluationAttempt, EvaluationCell, EvaluationRunDetail,
  EvaluationRunSummary, ModelSnapshot, RunSnapshot
} from './domain/evaluation.js'
import { EvaluationRun } from './evaluation-run.entity.js'
import { IntakeService } from './intake.service.js'

function pendingAttempt(number = 1): EvaluationAttempt {
  return {
    id: randomUUID(), number, status: 'pending', startedAt: null, finishedAt: null,
    latencyMs: null, rawOutput: null, rawOutputTruncated: false, output: null, failureCode: null, usage: null
  }
}

@Injectable()
export class EvaluationService {
  now = () => new Date()
  constructor(
    @InjectRepository(EvaluationRun) private readonly runs: Repository<EvaluationRun>,
    private readonly intake: IntakeService
  ) {}

  private async owned(scope: IntakeScope, id: string) {
    const row = await this.runs.findOneBy({ ...scopeSchema.parse(scope), id })
    if (!row) throw new IntakeError('not_found')
    return row
  }

  private summary(row: EvaluationRun): EvaluationRunSummary {
    return {
      id: row.id, title: row.title, revision: row.revision, status: row.status,
      sampleCount: row.sampleCount, createdAt: row.createdAt, updatedAt: row.updatedAt
    }
  }

  private detail(row: EvaluationRun): EvaluationRunDetail {
    return {
      ...this.summary(row), snapshot: snapshotSchema.parse(JSON.parse(row.snapshotJson)),
      cells: z.array(cellSchema).parse(JSON.parse(row.cellsJson)),
      reviews: z.array(reviewSchema).parse(JSON.parse(row.reviewsJson)),
      decision: row.decisionJson ? decisionSchema.parse(JSON.parse(row.decisionJson)) : null,
      canRecover: row.status === 'running' && !!row.leaseUntil && Date.parse(row.leaseUntil) <= this.now().getTime()
    }
  }

  private async update(scope: IntakeScope, row: EvaluationRun, patch: Partial<EvaluationRun>) {
    const changed = await this.runs.update(
      { ...scopeSchema.parse(scope), id: row.id, revision: row.revision },
      { ...patch, revision: row.revision + 1, updatedAt: this.now().toISOString() }
    )
    if (changed.affected !== 1) throw new IntakeError('conflict')
    return this.get(scope, row.id)
  }

  async list(scope: IntakeScope, page = 1) {
    const [rows, total] = await this.runs.findAndCount({
      where: scopeSchema.parse(scope), order: { createdAt: 'DESC', id: 'DESC' },
      take: 20, skip: (page - 1) * 20,
      select: ['id', 'title', 'revision', 'status', 'sampleCount', 'createdAt', 'updatedAt']
    })
    return { items: rows.map(row => this.summary(row)), total, page }
  }

  async get(scope: IntakeScope, id: string) { return this.detail(await this.owned(scope, id)) }

  async create(scope: IntakeScope, input: CreateRunInput) {
    const owner = scopeSchema.parse(scope)
    const parsed = createRunSchema.parse(input)
    const existing = await this.runs.findOneBy({ ...owner, requestKey: parsed.requestKey })
    if (existing) return this.summary(existing)
    const samples = await Promise.all(parsed.sampleIds.map(id => this.intake.evaluationSample(scope, id)))
    if (new Set(samples.map(item => item.sample.sha256)).size !== samples.length) {
      throw new IntakeError('invalid_input', 'Duplicate image content would bias the comparison.')
    }
    const snapshot: RunSnapshot = {
      samples: samples.map(item => item.sample), prompts: { a: parsed.promptA, b: parsed.promptB },
      categories: CATEGORIES.map(({ id, definition }) => ({ id, definition })), protocolVersion: 1, model: null
    }
    // Alternate which variant is called first across samples. Calls never share messages.
    const cells: EvaluationCell[] = snapshot.samples.flatMap((sample, index) =>
      (index % 2 === 0 ? ['a', 'b'] as const : ['b', 'a'] as const).map(variant => ({
        sampleId: sample.id, variant, attempts: [pendingAttempt()]
      }))
    )
    const now = this.now().toISOString()
    const row = this.runs.create({
      ...owner, id: randomUUID(), requestKey: parsed.requestKey, title: parsed.title,
      revision: 1, status: 'ready', sampleCount: samples.length,
      snapshotJson: JSON.stringify(snapshot), cellsJson: JSON.stringify(cells),
      reviewsJson: '[]', decisionJson: null, leaseUntil: null, createdAt: now, updatedAt: now
    })
    try { await this.runs.insert(row) } catch (error) {
      const winner = await this.runs.findOneBy({ ...owner, requestKey: parsed.requestKey })
      if (winner) return this.summary(winner)
      throw error
    }
    return this.summary(row)
  }

  /** Atomic claim before any paid invocation. Only one item may run in this aggregate.
   * A second worker gets no claim; it cannot call the provider. */
  async claim(scope: IntakeScope, id: string, model: ModelSnapshot) {
    const row = await this.owned(scope, id)
    if (row.status !== 'ready') return null
    const detail = this.detail(row)
    const cell = detail.cells.find(item => latestAttempt(item).status === 'pending')
    if (!cell) return null
    const attempt = latestAttempt(cell)
    attempt.status = 'running'
    attempt.startedAt = this.now().toISOString()
    detail.snapshot.model ??= model
    try {
      const run = await this.update(scope, row, {
        status: 'running', snapshotJson: JSON.stringify(detail.snapshot), cellsJson: JSON.stringify(detail.cells),
        leaseUntil: new Date(this.now().getTime() + ATTEMPT_LEASE_MS).toISOString()
      })
      return { run, cell, attempt }
    } catch (error) {
      if (error instanceof IntakeError && error.code === 'conflict') return null
      throw error
    }
  }

  async finish(scope: IntakeScope, id: string, attemptId: string, result: EvaluationAttempt) {
    const row = await this.owned(scope, id)
    const detail = this.detail(row)
    const cell = detail.cells.find(item => latestAttempt(item).id === attemptId)
    if (row.status !== 'running' || !cell || latestAttempt(cell).status !== 'running') {
      throw new IntakeError('conflict', 'This attempt was interrupted or superseded; its late result was not saved.')
    }
    cell.attempts[cell.attempts.length - 1] = result
    return this.update(scope, row, {
      cellsJson: JSON.stringify(detail.cells), leaseUntil: null,
      status: detail.cells.some(item => latestAttempt(item).status === 'pending') ? 'ready' : 'completed'
    })
  }

  async recover(scope: IntakeScope, input: z.infer<typeof runRevisionSchema>) {
    const parsed = runRevisionSchema.parse(input)
    const row = await this.owned(scope, parsed.runId)
    const detail = this.detail(row)
    if (row.revision !== parsed.revision) throw new IntakeError('conflict')
    if (!detail.canRecover) throw new IntakeError('invalid_state')
    for (const cell of detail.cells) {
      const attempt = latestAttempt(cell)
      if (attempt.status === 'running') {
        attempt.status = 'failed'
        attempt.failureCode = 'interrupted'
        attempt.finishedAt = this.now().toISOString()
      }
    }
    return this.update(scope, row, {
      cellsJson: JSON.stringify(detail.cells), leaseUntil: null,
      status: detail.cells.some(cell => latestAttempt(cell).status === 'pending') ? 'ready' : 'completed'
    })
  }

  async retryFailures(scope: IntakeScope, input: z.infer<typeof runRevisionSchema>) {
    const parsed = runRevisionSchema.parse(input)
    const row = await this.owned(scope, parsed.runId)
    const detail = this.detail(row)
    if (row.revision !== parsed.revision) throw new IntakeError('conflict')
    if (row.status !== 'completed') throw new IntakeError('invalid_state')
    const retried = new Set<string>()
    for (const cell of detail.cells) {
      if (latestAttempt(cell).status === 'failed' && cell.attempts.length < MAX_ATTEMPTS) {
        cell.attempts.push(pendingAttempt(cell.attempts.length + 1))
        retried.add(cell.sampleId)
      }
    }
    if (!retried.size) throw new IntakeError('invalid_state')
    return this.update(scope, row, {
      status: 'ready', cellsJson: JSON.stringify(detail.cells)
    })
  }

  async review(scope: IntakeScope, input: z.infer<typeof reviewSampleSchema>) {
    const parsed = reviewSampleSchema.parse(input)
    const row = await this.owned(scope, parsed.runId)
    const detail = this.detail(row)
    if (row.revision !== parsed.revision) throw new IntakeError('conflict')
    if (row.status !== 'completed') throw new IntakeError('invalid_state')
    if (!detail.snapshot.samples.some(sample => sample.id === parsed.sampleId)) throw new IntakeError('not_found')
    if (detail.reviews.length >= 100) throw new IntakeError('invalid_state', 'This run has reached its review history limit.')
    const review = {
      sampleId: parsed.sampleId, verdict: parsed.verdict, note: parsed.note, reviewedAt: this.now().toISOString(),
      attemptIds: detail.cells.filter(cell => cell.sampleId === parsed.sampleId).map(cell => latestAttempt(cell).id)
    }
    return this.update(scope, row, {
      reviewsJson: JSON.stringify([...detail.reviews, review])
    })
  }

  async decide(scope: IntakeScope, input: z.infer<typeof decideRunSchema>) {
    const parsed = decideRunSchema.parse(input)
    const row = await this.owned(scope, parsed.runId)
    const detail = this.detail(row)
    if (row.revision !== parsed.revision) throw new IntakeError('conflict')
    if (row.status !== 'completed') throw new IntakeError('invalid_state')
    if ((parsed.verdict === 'a' || parsed.verdict === 'b')
      && detail.cells.some(cell => cell.variant === parsed.verdict && latestAttempt(cell).status !== 'succeeded')) {
      throw new IntakeError('invalid_state', 'The selected version still has failed items.')
    }
    return this.update(scope, row, {
      status: 'reviewed',
      decisionJson: JSON.stringify({ verdict: parsed.verdict, note: parsed.note, decidedAt: this.now().toISOString() })
    })
  }
}
