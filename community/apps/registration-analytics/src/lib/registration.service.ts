import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RegistrationRecord } from './registration.entity'
import { SavedQuery } from './saved-query.entity'
import { RegistrationSeedService } from './registration-seed.service'
import { applyScopeToQueryBuilder, scopeColumns, scopeWhere } from './scope'
import type {
  RegistrationQueryCondition,
  RegistrationQueryInput,
  RegistrationScope,
  RegistrationViewData,
  SavedQueryInput
} from './types'

export interface RegistrationRecordInput {
  activityId: string
  activityName: string
  name: string
  phone?: string | null
  email?: string | null
  city?: string | null
  channel?: string | null
  registerTime?: Date | string | null
  status?: string | null
  fee?: number | string | null
  note?: string | null
  source?: 'agent' | 'workbench' | 'seed'
}

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(RegistrationRecord)
    private readonly recordRepository: Repository<RegistrationRecord>,
    @InjectRepository(SavedQuery)
    private readonly savedQueryRepository: Repository<SavedQuery>,
    private readonly seedService: RegistrationSeedService
  ) {}

  async ensureReady(scope: RegistrationScope) {
    await this.seedService.ensureSeeded(scope)
  }

  async countRecords(scope: RegistrationScope) {
    return this.recordRepository.count({ where: scopeWhere(scope) as never })
  }

  async listActivities(scope: RegistrationScope) {
    await this.ensureReady(scope)
    const qb = this.recordRepository.createQueryBuilder('record')
    applyScopeToQueryBuilder(qb, 'record', scope)
    qb.select('record.activityId', 'activityId')
      .addSelect('record.activityName', 'activityName')
      .addSelect('COUNT(record.id)', 'count')
      .groupBy('record.activityId')
      .addGroupBy('record.activityName')
      .orderBy('COUNT(record.id)', 'DESC')
    const rows = await qb.getRawMany()
    return rows.map((row) => ({
      activityId: row.activityId ?? '',
      activityName: row.activityName ?? 'Unknown',
      count: Number(row.count ?? 0)
    }))
  }

  async createRecord(scope: RegistrationScope, input: RegistrationRecordInput) {
    const record = await this.recordRepository.save(
      this.recordRepository.create({
        ...scopeColumns(scope),
        activityId: input.activityId,
        activityName: input.activityName,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        city: input.city ?? null,
        channel: input.channel ?? null,
        registerTime: input.registerTime ? new Date(input.registerTime) : null,
        status: input.status ?? 'pending',
        fee: input.fee !== undefined && input.fee !== null ? Number(input.fee) : null,
        note: input.note ?? null,
        createdById: scope.userId ?? null
      })
    )
    return serializeRecord(record)
  }

  async searchRecords(scope: RegistrationScope, condition: RegistrationQueryCondition) {
    await this.ensureReady(scope)
    const page = normalizePage(condition.page)
    const pageSize = normalizePageSize(condition.pageSize)
    const qb = this.recordRepository.createQueryBuilder('record')
    applyScopeToQueryBuilder(qb, 'record', scope)
    if (condition.activityId) {
      qb.andWhere('record.activityId = :activityId', { activityId: condition.activityId })
    }
    applyFilters(qb, 'record', condition.filters)
    qb.orderBy('record.registerTime', 'DESC')
    qb.skip((page - 1) * pageSize)
    qb.take(pageSize)
    const [items, total] = await qb.getManyAndCount()
    return {
      items: items.map(serializeRecord),
      total,
      page,
      pageSize
    }
  }

  async aggregateRecords(scope: RegistrationScope, condition: RegistrationQueryCondition) {
    await this.ensureReady(scope)
    const groupBy = (condition.groupBy ?? []).filter((field) => QUERYABLE_FIELDS.has(field))
    const aggregates = (condition.aggregates ?? []).length
      ? condition.aggregates!.filter((agg) => QUERYABLE_FIELDS.has(agg.field) && agg.op !== undefined)
      : [{ field: 'id', op: 'count' as const }]

    const params: Record<string, unknown> = {}
    const where: string[] = []
    if (scope.tenantId) {
      where.push(`record."tenantId" = :tenantId`)
      params.tenantId = scope.tenantId
    } else {
      where.push(`record."tenantId" IS NULL`)
    }
    if (scope.organizationId) {
      where.push(`record."organizationId" = :organizationId`)
      params.organizationId = scope.organizationId
    } else {
      where.push(`record."organizationId" IS NULL`)
    }
    if (condition.activityId) {
      where.push(`record."activityId" = :activityId`)
      params.activityId = condition.activityId
    }
    appendFilterSql(where, params, condition.filters)

    const selectParts: string[] = []
    for (const field of groupBy) {
      selectParts.push(`record."${field}" AS "${field}"`)
    }
    for (const agg of aggregates) {
      if (agg.op === 'count') {
        selectParts.push(`COUNT(record.id) AS "count(id)"`)
      } else {
        selectParts.push(`${agg.op.toUpperCase()}(record."${agg.field}") AS "${agg.op}(${agg.field})"`)
      }
    }
    if (!groupBy.length) {
      selectParts.push(`COUNT(record.id) AS "count(id)"`)
    }

    const sql = `SELECT ${selectParts.join(', ')} FROM plugin_registration_record record ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${groupBy.length ? `GROUP BY ${groupBy.map((f) => `record."${f}"`).join(', ')}` : ''}`
    const rows: Array<Record<string, unknown>> = await this.recordRepository.query(sql, [params])
    return rows
  }

  async queryRegistrations(scope: RegistrationScope, input: RegistrationQueryInput) {
    const condition = input.condition ?? {}
    const hasGroupOrAgg =
      (condition.groupBy?.length ?? 0) > 0 || (condition.aggregates?.length ?? 0) > 0
    if (hasGroupOrAgg) {
      const rows = await this.aggregateRecords(scope, condition)
      return {
        mode: 'aggregate',
        rows,
        total: rows.length
      }
    }
    const result = await this.searchRecords(scope, condition)
    return {
      mode: 'detail',
      rows: result.items,
      total: result.total
    }
  }

  async saveQuery(scope: RegistrationScope, input: SavedQueryInput) {
    if (!input.name?.trim()) {
      throw new BadRequestException('Query name is required.')
    }
    if (!input.question?.trim()) {
      throw new BadRequestException('Query question is required.')
    }
    const saved = await this.savedQueryRepository.save(
      this.savedQueryRepository.create({
        ...scopeColumns(scope),
        name: input.name.trim(),
        question: input.question.trim(),
        condition: input.condition ?? {},
        createdById: scope.userId ?? null
      })
    )
    return serializeSavedQuery(saved)
  }

  async listSavedQueries(scope: RegistrationScope) {
    await this.ensureReady(scope)
    const items = await this.savedQueryRepository.find({
      where: scopeWhere(scope) as never,
      order: { createdAt: 'DESC' },
      take: 50
    })
    return items.map(serializeSavedQuery)
  }

  async deleteSavedQuery(scope: RegistrationScope, savedQueryId: string) {
    const existing = await this.savedQueryRepository.findOne({
      where: scopeWhere(scope, { id: savedQueryId }) as never
    })
    if (!existing) {
      throw new NotFoundException('Saved query was not found.')
    }
    await this.savedQueryRepository.delete(existing.id!)
    return { id: savedQueryId }
  }

  async getViewData(scope: RegistrationScope): Promise<RegistrationViewData> {
    await this.ensureReady(scope)
    const summary = await this.getSummary(scope)
    const table = await this.searchRecords(scope, { page: 1, pageSize: 25 })
    const savedQueries = await this.listSavedQueries(scope)
    return {
      summary,
      table,
      savedQueries,
      fields: FIELD_DEFINITIONS,
      suggestedQuestions: SUGGESTED_QUESTIONS
    }
  }

  private async getSummary(scope: RegistrationScope) {
    const qb = this.recordRepository.createQueryBuilder('record')
    applyScopeToQueryBuilder(qb, 'record', scope)
    qb.select('COUNT(record.id)', 'total')
      .addSelect(`COUNT(DISTINCT record.activityId)`, 'activities')
    const row = await qb.getRawOne()
    const statusQb = this.recordRepository.createQueryBuilder('record')
    applyScopeToQueryBuilder(statusQb, 'record', scope)
    statusQb.select('record.status', 'status').addSelect('COUNT(record.id)', 'count').groupBy('record.status')
    const statusRows = await statusQb.getRawMany()
    return {
      total: Number(row?.total ?? 0),
      activities: Number(row?.activities ?? 0),
      byStatus: Object.fromEntries(statusRows.map((r) => [r.status ?? 'unknown', Number(r.count ?? 0)]))
    }
  }
}

const FIELD_DEFINITIONS = [
  { key: 'name', label: '姓名', type: 'text' },
  { key: 'activityName', label: '活动', type: 'text' },
  { key: 'city', label: '城市', type: 'text' },
  { key: 'channel', label: '渠道', type: 'text' },
  { key: 'registerTime', label: '报名时间', type: 'datetime' },
  { key: 'status', label: '状态', type: 'text' },
  { key: 'fee', label: '报名费', type: 'number' }
]

const SUGGESTED_QUESTIONS = [
  '本周有多少人报名？',
  '按城市统计报名人数',
  '各渠道的报名人数分布',
  '已确认报名的有多少人？',
  '哪个活动报名人数最多？'
]

export function applyFilters(qb: { andWhere: (condition: string, parameters?: Record<string, unknown>) => unknown }, alias: string, filters?: Array<{ field: string; op: string; value: string | number }>) {
  const list = (filters ?? []).filter((f) => f && QUERYABLE_FIELDS.has(f.field) && f.op !== undefined && f.value !== undefined && f.value !== null && f.value !== '')
  for (let index = 0; index < list.length; index += 1) {
    const filter = list[index]
    const param = `filter_value_${index}`
    const numeric = typeof filter.value === 'number'
    const textField = isTextField(filter.field)
    switch (filter.op) {
      case 'eq':
        qb.andWhere(
          numeric ? `${alias}.${filter.field} = :${param}` : textField ? `LOWER(${alias}.${filter.field}) = LOWER(:${param})` : `${alias}.${filter.field} = :${param}`,
          { [param]: filter.value }
        )
        break
      case 'neq':
        qb.andWhere(
          numeric ? `${alias}.${filter.field} <> :${param}` : textField ? `LOWER(${alias}.${filter.field}) <> LOWER(:${param})` : `${alias}.${filter.field} <> :${param}`,
          { [param]: filter.value }
        )
        break
      case 'contains':
        qb.andWhere(textField ? `LOWER(${alias}.${filter.field}) LIKE :${param}` : `${alias}.${filter.field} LIKE :${param}`, {
          [param]: `%${String(filter.value).toLowerCase()}%`
        })
        break
      case 'gt':
        qb.andWhere(`${alias}.${filter.field} > :${param}`, { [param]: filter.value })
        break
      case 'gte':
        qb.andWhere(`${alias}.${filter.field} >= :${param}`, { [param]: filter.value })
        break
      case 'lt':
        qb.andWhere(`${alias}.${filter.field} < :${param}`, { [param]: filter.value })
        break
      case 'lte':
        qb.andWhere(`${alias}.${filter.field} <= :${param}`, { [param]: filter.value })
        break
      default:
        break
    }
  }
}

const NON_TEXT_FIELDS = new Set(['registerTime', 'createdAt', 'updatedAt', 'fee'])

export function isTextField(field: string) {
  return !NON_TEXT_FIELDS.has(field)
}

const QUERYABLE_FIELDS = new Set([
  'id',
  'activityId',
  'activityName',
  'name',
  'phone',
  'email',
  'city',
  'channel',
  'registerTime',
  'status',
  'fee',
  'note',
  'createdAt',
  'updatedAt'
])

function appendFilterSql(where: string[], params: Record<string, unknown>, filters?: Array<{ field: string; op: string; value: string | number }>) {
  const list = (filters ?? []).filter((f) => f && QUERYABLE_FIELDS.has(f.field) && f.op !== undefined && f.value !== undefined && f.value !== null && f.value !== '')
  for (let index = 0; index < list.length; index += 1) {
    const filter = list[index]
    const param = `filter_value_${index}`
    const numeric = typeof filter.value === 'number'
    const textField = isTextField(filter.field)
    switch (filter.op) {
      case 'eq':
        where.push(numeric ? `record."${filter.field}" = :${param}` : textField ? `LOWER(record."${filter.field}") = LOWER(:${param})` : `record."${filter.field}" = :${param}`)
        params[param] = filter.value
        break
      case 'neq':
        where.push(numeric ? `record."${filter.field}" <> :${param}` : textField ? `LOWER(record."${filter.field}") <> LOWER(:${param})` : `record."${filter.field}" <> :${param}`)
        params[param] = filter.value
        break
      case 'contains':
        where.push(textField ? `LOWER(record."${filter.field}") LIKE :${param}` : `CAST(record."${filter.field}" AS TEXT) LIKE :${param}`)
        params[param] = `%${String(filter.value).toLowerCase()}%`
        break
      case 'gt':
        where.push(`record."${filter.field}" > :${param}`)
        params[param] = filter.value
        break
      case 'gte':
        where.push(`record."${filter.field}" >= :${param}`)
        params[param] = filter.value
        break
      case 'lt':
        where.push(`record."${filter.field}" < :${param}`)
        params[param] = filter.value
        break
      case 'lte':
        where.push(`record."${filter.field}" <= :${param}`)
        params[param] = filter.value
        break
      default:
        break
    }
  }
}

function serializeRecord(record: RegistrationRecord) {
  return {
    id: record.id,
    activityId: record.activityId,
    activityName: record.activityName,
    name: record.name,
    phone: record.phone,
    email: record.email,
    city: record.city,
    channel: record.channel,
    registerTime: record.registerTime,
    status: record.status,
    fee: record.fee,
    note: record.note,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  }
}

function serializeSavedQuery(saved: SavedQuery) {
  return {
    id: saved.id,
    name: saved.name,
    question: saved.question,
    condition: saved.condition ?? {},
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt
  }
}

function normalizePage(page?: number) {
  return Number.isInteger(page) && page && page > 0 ? page : 1
}

function normalizePageSize(pageSize?: number) {
  if (!Number.isInteger(pageSize) || !pageSize) return 25
  return Math.min(Math.max(pageSize, 1), 100)
}
