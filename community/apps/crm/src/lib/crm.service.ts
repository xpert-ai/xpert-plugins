import { Injectable } from '@nestjs/common'
import { CrmMetadataService } from './crm-metadata.service'
import { CrmRecordService } from './crm-record.service'
import { CrmSeedService } from './crm-seed.service'
import type { CrmFieldDefinition } from './entities'
import type {
  CrmRecordInput,
  CrmRecordSearchInput,
  CrmRecordUpdateInput,
  CrmScope,
  CrmTimelineItem,
  CrmViewColumnsUpdateInput,
  CrmViewDataInput
} from './types'

@Injectable()
export class CrmService {
  constructor(
    private readonly metadataService: CrmMetadataService,
    private readonly recordService: CrmRecordService,
    private readonly seedService: CrmSeedService
  ) {}

  async ensureReady(scope: CrmScope) {
    await this.seedService.ensureWorkspace(scope)
  }

  async listObjects(scope: CrmScope) {
    await this.ensureReady(scope)
    return this.metadataService.listObjectsWithFields(scope)
  }

  async searchRecords(scope: CrmScope, input: CrmRecordSearchInput) {
    await this.ensureReady(scope)
    return this.recordService.searchRecords(scope, input)
  }

  async getRecord(scope: CrmScope, recordId: string, objectKey?: string) {
    await this.ensureReady(scope)
    return this.recordService.getRecord(scope, recordId, objectKey)
  }

  async createRecord(scope: CrmScope, input: CrmRecordInput) {
    await this.ensureReady(scope)
    return this.recordService.createRecord(scope, input)
  }

  async updateRecord(scope: CrmScope, input: CrmRecordUpdateInput) {
    await this.ensureReady(scope)
    return this.recordService.updateRecord(scope, input)
  }

  async updateViewColumns(scope: CrmScope, input: CrmViewColumnsUpdateInput) {
    await this.ensureReady(scope)
    return this.metadataService.updateViewColumns(scope, input)
  }

  async getViewData(scope: CrmScope, input: CrmViewDataInput) {
    await this.ensureReady(scope)
    const objects = await this.metadataService.listObjectsWithFields(scope)
    const selectedObjectKey = input.objectKey || objects[0]?.objectKey || 'company'
    const selectedObject = objects.find((object) => object.objectKey === selectedObjectKey) ?? objects[0]
    const records = await this.recordService.searchRecords(scope, {
      objectKey: selectedObjectKey,
      search: input.search,
      page: input.page,
      pageSize: input.pageSize
    })
    const selectedRecordId = input.recordId || records.items[0]?.id
    const selectedRecord = selectedRecordId
      ? await this.recordService.getRecord(scope, selectedRecordId, selectedObjectKey)
      : null
    const views = selectedObjectKey ? await this.metadataService.listViews(scope, selectedObjectKey) : []
    const relationLabels = await this.getRelationLabels(scope, selectedObject?.fields ?? [], [
      ...records.items,
      ...(selectedRecord ? [selectedRecord] : [])
    ])
    const relatedRecords = selectedRecord?.id
      ? await this.getRelatedRecords(scope, objects, selectedObjectKey, selectedRecord.id)
      : []
    const timeline = selectedRecord?.id
      ? await this.getTimeline(scope, selectedRecord)
      : []
    return {
      summary: {
        objectCount: objects.length,
        selectedObjectKey,
        totalRecords: records.total
      },
      objects,
      selectedObject,
      fields: selectedObject?.fields ?? [],
      views,
      table: records,
      selectedRecord,
      meta: {
        implementation: 'xpert-native-crm',
        relationLabels,
        relatedRecords,
        timeline,
        twentyCompatibility: {
          objectsAndFields: 'prototype',
          views: 'prototype',
          relations: 'usable',
          activities: 'usable',
          importExport: 'not-started',
          workflow: 'not-started',
          apps: 'not-started',
          skillsAndAgents: 'prototype'
        }
      }
    }
  }

  private async getRelatedRecords(
    scope: CrmScope,
    objects: Array<{ objectKey?: string; label?: string; pluralLabel?: string; fields?: CrmFieldDefinition[] }>,
    targetObjectKey: string,
    targetRecordId: string
  ) {
    const sections = []
    for (const object of objects) {
      if (!object.objectKey) continue
      const relationFields = (object.fields ?? []).filter(
        (field) => field.type === 'relation' && field.relationObjectKey === targetObjectKey && field.objectKey && field.fieldKey
      )
      for (const field of relationFields) {
        const table = await this.recordService.listRecordsByRelation(scope, {
          objectKey: field.objectKey ?? '',
          fieldKey: field.fieldKey ?? '',
          recordId: targetRecordId,
          pageSize: 6
        })
        if (!table.total) continue
        sections.push({
          objectKey: object.objectKey,
          objectLabel: object.label,
          objectPluralLabel: object.pluralLabel,
          relationFieldKey: field.fieldKey,
          relationFieldLabel: field.label,
          fields: object.fields ?? [],
          items: table.items,
          total: table.total
        })
      }
    }
    return sections
  }

  private async getTimeline(
    scope: CrmScope,
    selectedRecord: {
      id?: string
      activities?: Array<{
        id?: string
        type?: string
        objectKey?: string | null
        recordId?: string | null
        summary?: string | null
        payload?: Record<string, unknown> | null
        createdAt?: Date | string
      }>
    }
  ): Promise<CrmTimelineItem[]> {
    const recordId = selectedRecord.id
    if (!recordId) return []

    const activityItems = (selectedRecord.activities ?? []).map((activity) => ({
      id: activity.id ?? `${activity.type ?? 'activity'}-${activity.createdAt ?? ''}`,
      type: 'activity' as const,
      objectKey: activity.objectKey,
      recordId: activity.recordId,
      title: activity.summary || titleFromActivityType(activity.type),
      body: describeActivityPayload(activity.payload),
      occurredAt: activity.createdAt,
      createdAt: activity.createdAt,
      payload: activity.payload ?? undefined
    }))

    const [notes, tasks] = await Promise.all([
      this.recordService.listRecordsByRelation(scope, {
        objectKey: 'note',
        fieldKey: 'recordId',
        recordId,
        pageSize: 8
      }),
      this.recordService.listRecordsByRelation(scope, {
        objectKey: 'task',
        fieldKey: 'recordId',
        recordId,
        pageSize: 8
      })
    ])

    const noteItems = notes.items.map((note) => ({
      id: note.id ?? '',
      type: 'note' as const,
      objectKey: 'note',
      recordId,
      title: getStringValue(note.values?.title) || 'Note',
      body: getStringValue(note.values?.content),
      occurredAt: note.updatedAt ?? note.createdAt,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    }))

    const taskItems = tasks.items.map((task) => ({
      id: task.id ?? '',
      type: 'task' as const,
      objectKey: 'task',
      recordId,
      title: getStringValue(task.values?.title) || 'Task',
      body: getStringValue(task.values?.dueDate) ? `Due ${getStringValue(task.values?.dueDate)}` : undefined,
      status: getStringValue(task.values?.status),
      occurredAt: task.updatedAt ?? task.createdAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }))

    return [...noteItems, ...taskItems, ...activityItems]
      .filter((item) => item.id)
      .sort((left, right) => dateMs(right.occurredAt ?? right.createdAt) - dateMs(left.occurredAt ?? left.createdAt))
      .slice(0, 20)
  }

  private async getRelationLabels(scope: CrmScope, fields: CrmFieldDefinition[], records: Array<{ values?: Record<string, unknown> }>) {
    const relationLabels: Record<string, Record<string, string>> = {}
    const relationFields = fields.filter((field) => field.type === 'relation' && field.relationObjectKey)
    for (const field of relationFields) {
      const ids = records
        .map((record) => record.values?.[field.fieldKey])
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      const relatedRecords = await this.recordService.getRecordsByIds(scope, field.relationObjectKey ?? '', ids)
      relationLabels[field.fieldKey] = Object.fromEntries(relatedRecords.map((record) => [record.id, getRecordTitle(record.values ?? {}, record.id)]))
    }
    return relationLabels
  }
}

function getRecordTitle(values: Record<string, unknown>, fallback: string) {
  const name = values.name || [values.firstName, values.lastName].filter(Boolean).join(' ') || values.title
  if (name) return String(name)
  const firstValue = Object.values(values).find((value) => value !== undefined && value !== null && String(value).trim())
  return firstValue ? String(firstValue) : fallback
}

function titleFromActivityType(type?: string) {
  if (type === 'agent_record_created') return 'Agent created this record.'
  if (type === 'agent_record_updated') return 'Agent updated this record.'
  if (type === 'record_created') return 'Record was created.'
  if (type === 'record_updated') return 'Record was updated.'
  if (type === 'schema_seeded') return 'CRM schema was initialized.'
  if (type === 'view_action') return 'View was updated.'
  return 'CRM activity'
}

function describeActivityPayload(payload?: Record<string, unknown> | null) {
  const changedFields = payload?.changedFields
  if (Array.isArray(changedFields) && changedFields.length) {
    return changedFields
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
        const field = Reflect.get(item, 'field')
        return typeof field === 'string' && field.trim() ? field.trim() : ''
      })
      .filter(Boolean)
      .slice(0, 5)
      .join(', ')
  }
  const values = payload?.values
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    return Object.keys(values).slice(0, 5).join(', ')
  }
  return undefined
}

function getStringValue(value: unknown) {
  return value === undefined || value === null ? undefined : String(value)
}

function dateMs(value: unknown) {
  if (!value) return 0
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}
