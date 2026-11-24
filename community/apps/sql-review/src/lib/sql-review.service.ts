import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { SqlReviewCase, SqlReviewFinding } from './entities'
import { SqlReviewRulesService } from './rules/sql-review-rules.service'
import type {
  SqlReviewAiReport,
  SqlReviewCaseSnapshot,
  SqlReviewCaseStatus,
  SqlReviewDialect,
  SqlReviewFindingDecision,
  SqlReviewFindingPayload,
  SqlReviewSourceType
} from './types'
import { SqlReviewCaseStatusMachine } from './types'

export interface SqlReviewScope {
  tenantId?: string
  organizationId?: string
  assistantId?: string
}

export interface SubmitCaseInput {
  scope: SqlReviewScope
  sqlText: string
  ddlContext?: string
  dbDialect: SqlReviewDialect
  title?: string
  sourceType: SqlReviewSourceType
  createdById?: string
  conversationId?: string
  caseNo?: string
}

const CASE_NO_PREFIX = 'SR'
const MAX_SQL_LENGTH = 100_000

@Injectable()
export class SqlReviewService {
  constructor(
    @InjectRepository(SqlReviewCase)
    private readonly caseRepository: Repository<SqlReviewCase>,
    @InjectRepository(SqlReviewFinding)
    private readonly findingRepository: Repository<SqlReviewFinding>,
    private readonly rules: SqlReviewRulesService
  ) {}

  /** Create a case, run deterministic rules immediately, move to pending_ai. */
  async submitCase(input: SubmitCaseInput): Promise<{ caseNo: string; ruleFindings: SqlReviewFindingPayload[] }> {
    const sql = (input.sqlText ?? '').trim()
    if (!sql) throw new BadRequestException('sqlText is required')
    if (sql.length > MAX_SQL_LENGTH) throw new BadRequestException(`sqlText exceeds ${MAX_SQL_LENGTH} characters`)
    const caseNo = input.caseNo || this.nextCaseNo()
    const ruleFindings = this.rules.analyze(sql, input.dbDialect, input.ddlContext)
    const record = new SqlReviewCase()
    record.tenantId = input.scope.tenantId
    record.organizationId = input.scope.organizationId
    record.assistantId = input.scope.assistantId
    record.conversationId = input.conversationId
    record.createdById = input.createdById
    record.caseNo = caseNo
    record.title = input.title?.trim() || this.guessTitle(sql)
    record.status = 'pending_ai'
    record.sourceType = input.sourceType
    record.dbDialect = input.dbDialect
    record.sqlText = sql
    record.ddlContext = input.ddlContext?.trim() || null
    record.retryCount = 0
    const saved = await this.caseRepository.save(record)
    if (ruleFindings.length > 0) {
      await this.saveFindings(saved.id!, ruleFindings)
    }
    return { caseNo, ruleFindings }
  }

  /** Rule findings for the AI analyst to reference (server-recoverable, never an LLM input). */
  async getRuleFindings(scope: SqlReviewScope, caseNo: string): Promise<SqlReviewFindingPayload[]> {
    const record = await this.getByCaseNo(scope, caseNo)
    const rows = await this.findingRepository.find({ where: { caseId: record.id!, source: 'rule' } })
    return rows
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      .map((r) => this.toFindingPayload(r))
  }

  /** Persist the AI report; any thrown failure marks the case failed (retryable). */
  async saveAiReport(scope: SqlReviewScope, caseNo: string, report: SqlReviewAiReport, modelUsed?: string): Promise<SqlReviewCaseSnapshot> {
    const record = await this.getByCaseNo(scope, caseNo)
    this.assertTransition(record, 'pending_confirmation')
    try {
      if (!report || !Array.isArray(report.findings)) throw new BadRequestException('report.findings must be an array')
      const existing = await this.findingRepository.find({ where: { caseId: record.id!, source: 'rule' } })
      let seq = existing.length
      const aiFindings = report.findings.slice(0, 30)
      for (const f of aiFindings) {
        seq += 1
        const row = new SqlReviewFinding()
        row.caseId = record.id
        row.seq = seq
        row.source = 'ai'
        row.ruleId = f.ruleId ?? null
        row.category = f.category
        row.severity = f.severity
        row.location = f.location ?? ''
        row.originalText = (f.originalText ?? '').slice(0, 500) || null
        row.explanation = f.explanation ?? ''
        row.suggestion = f.suggestion ?? ''
        row.decision = 'pending'
        await this.findingRepository.save(row)
      }
      record.status = 'pending_confirmation'
      record.summary = report.summary?.slice(0, 2000) ?? ''
      record.confidence = Math.min(1, Math.max(0, Number(report.confidence) || 0))
      record.modelUsed = modelUsed ?? null
      record.lastError = null
      await this.caseRepository.save(record)
    } catch (error) {
      record.status = 'failed'
      record.lastError = error instanceof Error ? error.message : String(error)
      await this.caseRepository.save(record)
      throw error
    }
    return this.getCaseSnapshot(scope, caseNo)
  }

  /** Human decision on a single finding — view-side only, never an agent tool. */
  async decideFinding(
    scope: SqlReviewScope,
    caseNo: string,
    seq: number,
    decision: Exclude<SqlReviewFindingDecision, 'pending'>,
    decidedById?: string,
    comment?: string
  ): Promise<SqlReviewCaseSnapshot> {
    const record = await this.getByCaseNo(scope, caseNo)
    if (record.status !== 'pending_confirmation') {
      throw new BadRequestException(`decisions allowed only in pending_confirmation, got ${record.status}`)
    }
    const finding = await this.findingRepository.findOne({ where: { caseId: record.id!, seq } })
    if (!finding) throw new NotFoundException(`finding ${seq} not found in case ${caseNo}`)
    finding.decision = decision
    finding.decidedById = decidedById ?? null
    finding.decidedAt = new Date()
    finding.decisionComment = comment?.slice(0, 500) ?? null
    await this.findingRepository.save(finding)
    return this.getCaseSnapshot(scope, caseNo)
  }

  /** Finalize the case after human review: confirmed when no high finding accepted remains unhandled. */
  async finalizeCase(scope: SqlReviewScope, caseNo: string, decidedById?: string): Promise<SqlReviewCaseSnapshot> {
    const record = await this.getByCaseNo(scope, caseNo)
    const all = await this.findingRepository.find({ where: { caseId: record.id! } })
    const pending = all.filter((f) => f.decision === 'pending')
    if (pending.length > 0) {
      throw new BadRequestException(`${pending.length} finding(s) still pending decision`)
    }
    const acceptedHigh = all.some((f) => f.decision === 'accepted' && f.severity === 'high')
    record.status = acceptedHigh ? 'rejected' : 'confirmed'
    record.confirmedById = decidedById ?? null
    await this.caseRepository.save(record)
    return this.getCaseSnapshot(scope, caseNo)
  }

  /** Failure-retry path: failed -> pending_ai keeps SQL and rule findings intact. */
  async retryCase(scope: SqlReviewScope, caseNo: string): Promise<SqlReviewCaseSnapshot> {
    const record = await this.getByCaseNo(scope, caseNo)
    this.assertTransition(record, 'pending_ai')
    record.status = 'pending_ai'
    record.retryCount = (record.retryCount ?? 0) + 1
    record.lastError = null
    await this.caseRepository.save(record)
    await this.findingRepository.delete({ caseId: record.id!, source: In(['ai']) })
    return this.getCaseSnapshot(scope, caseNo)
  }

  async getCaseSnapshot(scope: SqlReviewScope, caseNo: string): Promise<SqlReviewCaseSnapshot> {
    const record = await this.getByCaseNo(scope, caseNo)
    const rows = await this.findingRepository.find({ where: { caseId: record.id! } })
    rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    return {
      caseNo: record.caseNo!,
      title: record.title ?? undefined,
      status: record.status!,
      dbDialect: record.dbDialect!,
      sqlText: record.sqlText!,
      ddlContext: record.ddlContext ?? undefined,
      summary: record.summary ?? undefined,
      confidence: record.confidence ?? undefined,
      retryCount: record.retryCount ?? 0,
      lastError: record.lastError ?? undefined,
      findings: rows.map((r) => ({
        ...this.toFindingPayload(r),
        seq: r.seq ?? 0,
        decision: (r.decision ?? 'pending') as SqlReviewFindingDecision
      }))
    }
  }

  async listCases(scope: SqlReviewScope, limit = 50): Promise<Array<Pick<SqlReviewCaseSnapshot, 'caseNo' | 'title' | 'status' | 'confidence' | 'retryCount'> & { findingCount: number; createdAt?: Date }>> {
    const qb = this.caseRepository.createQueryBuilder('c')
    if (scope.tenantId) qb.andWhere('c.tenantId = :tenantId', { tenantId: scope.tenantId })
    if (scope.organizationId) qb.andWhere('c.organizationId = :organizationId', { organizationId: scope.organizationId })
    if (scope.assistantId) qb.andWhere('c.assistantId = :assistantId', { assistantId: scope.assistantId })
    qb.orderBy('c.createdAt', 'DESC').limit(Math.min(limit, 100))
    const rows = await qb.getMany()
    const counts = await this.findingRepository
      .createQueryBuilder('f')
      .select('f.caseId', 'caseId')
      .addSelect('COUNT(*)', 'n')
      .where('f.caseId IN (:...ids)', { ids: rows.map((r) => r.id) })
      .groupBy('f.caseId')
      .getRawMany()
    const countMap = new Map(counts.map((c) => [c.caseId, Number(c.n)]))
    return rows.map((r) => ({
      caseNo: r.caseNo!,
      title: r.title ?? '',
      status: r.status!,
      confidence: r.confidence,
      retryCount: r.retryCount ?? 0,
      findingCount: countMap.get(r.id!) ?? 0,
      createdAt: r.createdAt
    }))
  }

  private async getByCaseNo(scope: SqlReviewScope, caseNo: string): Promise<SqlReviewCase> {
    const where: Record<string, unknown> = { caseNo }
    if (scope.tenantId) where.tenantId = scope.tenantId
    if (scope.organizationId) where.organizationId = scope.organizationId
    const record = await this.caseRepository.findOne({ where })
    if (!record) throw new NotFoundException(`sql review case ${caseNo} not found`)
    return record
  }

  private assertTransition(record: SqlReviewCase, to: SqlReviewCaseStatus): void {
    const from = record.status!
    const allowed = SqlReviewCaseStatusMachine[from] ?? []
    if (!allowed.includes(to)) {
      throw new BadRequestException(`illegal status transition ${from} -> ${to}`)
    }
  }

  private async saveFindings(caseId: string, findings: SqlReviewFindingPayload[]): Promise<void> {
    let seq = 0
    for (const f of findings) {
      seq += 1
      const row = new SqlReviewFinding()
      Object.assign(row, {
        caseId,
        seq,
        source: f.source,
        ruleId: f.ruleId ?? null,
        category: f.category,
        severity: f.severity,
        location: f.location,
        originalText: (f.originalText ?? '').slice(0, 500) || null,
        explanation: f.explanation,
        suggestion: f.suggestion,
        decision: 'pending'
      })
      await this.findingRepository.save(row)
    }
  }

  private toFindingPayload(r: SqlReviewFinding): SqlReviewFindingPayload {
    return {
      source: (r.source ?? 'rule') as SqlReviewFindingPayload['source'],
      ruleId: r.ruleId ?? undefined,
      category: r.category!,
      severity: r.severity!,
      location: r.location ?? '',
      originalText: r.originalText ?? '',
      explanation: r.explanation ?? '',
      suggestion: r.suggestion ?? ''
    }
  }

  private guessTitle(sql: string): string {
    const kw = /^(select|update|delete|insert|create|alter|drop|with)/im.exec(sql)
    const head = sql.replace(/\s+/g, ' ').slice(0, 40)
    return `${(kw?.[1] ?? 'SQL').toUpperCase()} ${head}`
  }

  private nextCaseNo(): string {
    const t = new Date()
    const stamp = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`
    return `${CASE_NO_PREFIX}-${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  }
}
