import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { CrmActivity, CrmFieldDefinition, CrmRecord } from './entities'
import { CrmMetadataService } from './crm-metadata.service'
import { applyScopeToQueryBuilder, scopeColumns, scopeWhere } from './scope'
import type { CrmRecordInput, CrmRecordSearchInput, CrmRecordUpdateInput, CrmScope } from './types'

@Injectable()
export class CrmRecordService {
  constructor(
    @InjectRepository(CrmRecord)
    private readonly recordRepository: Repository<CrmRecord>,
    @InjectRepository(CrmActivity)
    private readonly activityRepository: Repository<CrmActivity>,
    private readonly metadataService: CrmMetadataService
  ) {}

  async countRecords(scope: CrmScope) {
    return this.recordRepository.count({
      where: scopeWhere(scope, { archivedAt: IsNull() }) as never
    })
  }

  async searchRecords(scope: CrmScope, input: CrmRecordSearchInput) {
    const page = normalizePage(input.page)
    const pageSize = normalizePageSize(input.pageSize)
    const qb = this.recordRepository.createQueryBuilder('record')
    applyScopeToQueryBuilder(qb, 'record', scope)
    qb.andWhere('record.archivedAt IS NULL')
    if (input.objectKey) {
      qb.andWhere('record.objectKey = :objectKey', { objectKey: input.objectKey })
    }
    if (input.search?.trim()) {
      qb.andWhere('LOWER(record.searchText) LIKE :search', {
        search: `%${input.search.trim().toLowerCase()}%`
      })
    }
    qb.orderBy('record.updatedAt', 'DESC')
    qb.skip((page - 1) * pageSize)
    qb.take(pageSize)
    const [items, total] = await qb.getManyAndCount()
    return {
      key: 'records',
      items: items.map(serializeRecord),
      total,
      page,
      pageSize
    }
  }

  async getRecord(scope: CrmScope, recordId: string, objectKey?: string) {
    const where = scopeWhere(scope, {
      id: recordId,
      archivedAt: IsNull(),
      ...(objectKey ? { objectKey } : {})
    })
    const record = await this.recordRepository.findOne({ where: where as never })
    if (!record) {
      throw new NotFoundException('CRM record was not found.')
    }
    const activities = await this.activityRepository.find({
      where: scopeWhere(scope, { recordId: record.id }) as never,
      order: { createdAt: 'DESC' },
      take: 20
    })
    return {
      ...serializeRecord(record),
      activities
    }
  }

  async getRecordsByIds(scope: CrmScope, objectKey: string, recordIds: string[]) {
    const ids = [...new Set(recordIds.map((id) => String(id).trim()).filter(Boolean))]
    if (!ids.length) return []
    const records = await this.recordRepository.find({
      where: scopeWhere(scope, {
        id: In(ids),
        objectKey,
        archivedAt: IsNull()
      }) as never
    })
    return records.map(serializeRecord)
  }

  async listRecordsByRelation(scope: CrmScope, input: { objectKey: string; fieldKey: string; recordId: string; pageSize?: number }) {
    const pageSize = normalizePageSize(input.pageSize)
    const qb = this.recordRepository.createQueryBuilder('record')
    applyScopeToQueryBuilder(qb, 'record', scope)
    qb.andWhere('record.archivedAt IS NULL')
    qb.andWhere('record.objectKey = :objectKey', { objectKey: input.objectKey })
    qb.andWhere(
      `(
        record.values ->> :fieldKey = :recordId
        OR (
          jsonb_typeof(record.values -> :fieldKey) = 'array'
          AND (record.values -> :fieldKey) ? :recordId
        )
      )`,
      {
        fieldKey: input.fieldKey,
        recordId: input.recordId
      }
    )
    qb.orderBy('record.updatedAt', 'DESC')
    qb.take(pageSize)
    const [items, total] = await qb.getManyAndCount()
    return {
      key: `${input.objectKey}.${input.fieldKey}`,
      items: items.map(serializeRecord),
      total,
      page: 1,
      pageSize
    }
  }

  async createRecord(scope: CrmScope, input: CrmRecordInput) {
    const object = await this.metadataService.getObjectWithFields(scope, input.objectKey)
    if (!object) {
      throw new BadRequestException(`Unknown CRM object: ${input.objectKey}`)
    }
    const values = normalizeValues(input.values, object.fields ?? [], true)
    const record = await this.recordRepository.save(
      this.recordRepository.create({
        ...scopeColumns(scope),
        objectKey: input.objectKey,
        values,
        searchText: buildSearchText(values),
        createdById: scope.userId ?? null,
        updatedById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        archivedAt: null
      })
    )
    await this.logActivity(scope, record, input.source === 'agent' ? 'agent_record_created' : 'record_created', {
      values
    })
    return serializeRecord(record)
  }

  async updateRecord(scope: CrmScope, input: CrmRecordUpdateInput) {
    const record = await this.recordRepository.findOne({
      where: scopeWhere(scope, {
        id: input.recordId,
        archivedAt: IsNull(),
        ...(input.objectKey ? { objectKey: input.objectKey } : {})
      }) as never
    })
    if (!record) {
      throw new NotFoundException('CRM record was not found.')
    }
    const object = await this.metadataService.getObjectWithFields(scope, record.objectKey ?? '')
    if (!object) {
      throw new BadRequestException(`Unknown CRM object: ${record.objectKey}`)
    }
    const nextValues = normalizeValues(
      {
        ...(record.values ?? {}),
        ...input.values
      },
      object.fields ?? [],
      true
    )
    const before = record.values ?? {}
    record.values = nextValues
    record.searchText = buildSearchText(nextValues)
    record.updatedById = scope.userId ?? null
    record.assistantId = scope.assistantId ?? record.assistantId ?? null
    record.conversationId = scope.conversationId ?? record.conversationId ?? null
    const saved = await this.recordRepository.save(record)
    await this.logActivity(scope, saved, input.source === 'agent' ? 'agent_record_updated' : 'record_updated', {
      changedFields: buildChangedFields(before, nextValues)
    })
    return serializeRecord(saved)
  }

  private async logActivity(scope: CrmScope, record: CrmRecord, type: 'record_created' | 'record_updated' | 'agent_record_created' | 'agent_record_updated', payload: Record<string, unknown>) {
    await this.activityRepository.save(
      this.activityRepository.create({
        ...scopeColumns(scope),
        objectKey: record.objectKey,
        recordId: record.id,
        type,
        actorId: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        summary: type.includes('created') ? 'CRM record was created.' : 'CRM record was updated.',
        payload
      })
    )
  }
}

function normalizeValues(values: Record<string, unknown>, fields: CrmFieldDefinition[], creating: boolean) {
  const normalized: Record<string, unknown> = {}
  const fieldMap = new Map(fields.map((field) => [field.fieldKey, field]))
  for (const field of fields) {
    const key = field.fieldKey
    if (!key) continue
    const rawValue = values[key]
    const value = rawValue === undefined && creating ? field.defaultValue : rawValue
    if (isEmptyValue(value)) {
      if (field.required) {
        throw new BadRequestException(`Required CRM field is missing: ${field.label ?? key}`)
      }
      if (value !== undefined && value !== null) {
        normalized[key] = value
      }
      continue
    }
    normalized[key] = normalizeFieldValue(field, value)
  }
  for (const [key, value] of Object.entries(values)) {
    if (!fieldMap.has(key) && !key.startsWith('_')) {
      normalized[key] = value
    }
  }
  return normalized
}

function normalizeFieldValue(field: CrmFieldDefinition, value: unknown) {
  if (value === null || value === undefined) return value
  if (field.type === 'number' || field.type === 'currency') {
    const numberValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException(`CRM field must be numeric: ${field.label ?? field.fieldKey}`)
    }
    return numberValue
  }
  if (field.type === 'boolean') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      return value === 'true' || value === '1' || value.toLowerCase() === 'yes'
    }
    return Boolean(value)
  }
  if (field.type === 'multi_select') {
    if (Array.isArray(value)) return value.map(String)
    if (typeof value === 'string') return value.split(/[,，、;；\n]+/).map((item) => item.trim()).filter(Boolean)
    return []
  }
  if (field.type === 'select' && field.options?.length) {
    const stringValue = String(value)
    const allowed = new Set(field.options.map((option) => option.value))
    if (!allowed.has(stringValue)) {
      throw new BadRequestException(`CRM field has unsupported option: ${field.label ?? field.fieldKey}`)
    }
    return stringValue
  }
  return String(value)
}

function isEmptyValue(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

function buildSearchText(values: Record<string, unknown>) {
  return Object.values(values)
    .flatMap((value) => {
      if (Array.isArray(value)) return value
      if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>)
      return [value]
    })
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase())
    .join(' ')
}

function buildChangedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      field: key,
      before: before[key],
      after: after[key]
    }))
}

function serializeRecord(record: CrmRecord) {
  return {
    id: record.id,
    objectKey: record.objectKey,
    values: record.values ?? {},
    searchText: record.searchText,
    createdById: record.createdById,
    updatedById: record.updatedById,
    assistantId: record.assistantId,
    conversationId: record.conversationId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  }
}

function normalizePage(page?: number) {
  return Number.isInteger(page) && page && page > 0 ? page : 1
}

function normalizePageSize(pageSize?: number) {
  if (!Number.isInteger(pageSize) || !pageSize) return 25
  return Math.min(Math.max(pageSize, 1), 100)
}
