import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { createSchema, emptyReport, ensureConfirmable, IntakeError, recordSchema, reportKeys, saveSchema, type Scope, type ViewData } from '../shared/contracts'
import { IntakeEntity } from './intake.entity'
import { activeAnalysis, mergeAnswers, protectedFields } from './analysis/domain'

@Injectable()
export class IntakeService {
  constructor(@InjectRepository(IntakeEntity) private readonly records: Repository<IntakeEntity>) {}

  private where(scope: Scope) {
    if (!scope.tenantId || !scope.organizationId || !scope.userId) throw new IntakeError('scope_required')
    return { tenantId: scope.tenantId, organizationId: scope.organizationId, ownerId: scope.userId }
  }

  async get(scope: Scope, id: string) {
    if (!z.string().uuid().safeParse(id).success) throw new IntakeError('not_found')
    const row = await this.records.findOneBy({ ...this.where(scope), id })
    if (!row) throw new IntakeError('not_found')
    return this.dto(row)
  }

  async list(scope: Scope, options: { id?: string; search?: string; page?: number }): Promise<ViewData> {
    const page = Math.min(10000, Math.max(1, Math.trunc(options.page || 1)))
    const pageSize = 25
    const qb = this.records.createQueryBuilder('record').where(this.where(scope))
    const search = options.search?.trim().slice(0, 200)
    if (search) qb.andWhere('(record."originalFeedback" ILIKE :search OR record.report->>\'title\' ILIKE :search)', { search: `%${search.replace(/[\\%_]/g, '\\$&')}%` })
    const [rows, total] = await qb.orderBy('record.updatedAt', 'DESC').addOrderBy('record.id', 'DESC').skip((page - 1) * pageSize).take(pageSize).getManyAndCount()
    return { items: rows.map((row) => ({ id: row.id, title: row.report.title, preview: row.originalFeedback.slice(0, 90), status: row.status, revision: row.revision, updatedAt: row.updatedAt.toISOString() })), item: options.id ? await this.get(scope, options.id) : null, total, meta: { page, pageSize } }
  }

  async create(scope: Scope, input: z.infer<typeof createSchema>) {
    const values = createSchema.parse(input)
    const where = { ...this.where(scope), requestId: values.requestId }
    // Retrying an uncertain create response must not create a second report.
    await this.records.createQueryBuilder().insert().values({ ...where, originalFeedback: values.originalFeedback, supplement: '', report: emptyReport(), status: 'draft', revision: 1, confirmed: null }).orIgnore().execute()
    const row = await this.records.findOneByOrFail(where)
    return this.dto(row)
  }

  async save(scope: Scope, id: string, input: z.infer<typeof saveSchema>) {
    const values = saveSchema.parse(input)
    const record = await this.get(scope, id)
    let answers
    try { answers = mergeAnswers(record, values.answers) } catch { throw new IntakeError('invalid_input') }
    const manualFields = [...new Set([...protectedFields(record), ...reportKeys.filter(key => record.report[key] !== values.report[key])])]
    const analysis = activeAnalysis(record.analysis) && record.analysis ? { ...record.analysis, status: 'superseded' as const, completedAt: new Date().toISOString() } : record.analysis
    const result = await this.records.update({ ...this.where(scope), id, revision: values.revision }, { report: values.report, supplement: values.supplement, answers, protectedFields: manualFields, analysis, status: 'draft', revision: () => 'revision + 1' })
    if (result.affected !== 1) throw new IntakeError('revision_conflict')
    return this.get(scope, id)
  }

  async confirm(scope: Scope, id: string, revision: number) {
    const record = await this.get(scope, id)
    if (activeAnalysis(record.analysis)) throw new IntakeError('analysis_pending')
    // An idempotent repeat does not create another snapshot/revision.
    if (record.status === 'confirmed' && record.confirmed?.sourceRevision === revision) return record
    if (record.revision !== revision) throw new IntakeError('revision_conflict')
    if (record.status === 'confirmed') return record
    ensureConfirmable(record.report)
    const confirmed = { report: record.report, supplement: record.supplement, sourceRevision: revision, confirmedAt: new Date().toISOString() }
    const result = await this.records.update({ ...this.where(scope), id, revision }, { confirmed, status: 'confirmed', revision: () => 'revision + 1' })
    if (result.affected !== 1) throw new IntakeError('revision_conflict')
    return this.get(scope, id)
  }

  private dto(row: IntakeEntity) {
    return recordSchema.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })
  }
}
