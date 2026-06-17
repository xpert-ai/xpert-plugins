import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DEFAULT_CRM_OBJECTS, DEFAULT_CRM_VIEW_COLUMNS } from './default-schema'
import {
  CrmActivity,
  CrmFieldDefinition,
  CrmObjectDefinition,
  CrmRelationDefinition,
  CrmViewDefinition
} from './entities'
import { scopeColumns, scopeWhere } from './scope'
import type { CrmScope } from './types'

@Injectable()
export class CrmMetadataService {
  constructor(
    @InjectRepository(CrmObjectDefinition)
    private readonly objectRepository: Repository<CrmObjectDefinition>,
    @InjectRepository(CrmFieldDefinition)
    private readonly fieldRepository: Repository<CrmFieldDefinition>,
    @InjectRepository(CrmRelationDefinition)
    private readonly relationRepository: Repository<CrmRelationDefinition>,
    @InjectRepository(CrmViewDefinition)
    private readonly viewRepository: Repository<CrmViewDefinition>,
    @InjectRepository(CrmActivity)
    private readonly activityRepository: Repository<CrmActivity>
  ) {}

  async ensureDefaultSchema(scope: CrmScope) {
    const existingObjects = await this.objectRepository.count({
      where: scopeWhere(scope) as never
    })
    if (existingObjects > 0) {
      return
    }

    const scopeData = scopeColumns(scope)
    for (const objectInput of DEFAULT_CRM_OBJECTS) {
      await this.objectRepository.save(
        this.objectRepository.create({
          ...scopeData,
          objectKey: objectInput.objectKey,
          label: objectInput.label,
          pluralLabel: objectInput.pluralLabel,
          icon: objectInput.icon,
          description: objectInput.description,
          isSystem: true,
          isActive: true,
          displayOrder: objectInput.displayOrder ?? 0,
          metadata: {
            source: 'twenty-native-crm-prototype'
          }
        })
      )

      for (const fieldInput of objectInput.fields) {
        await this.fieldRepository.save(
          this.fieldRepository.create({
            ...scopeData,
            objectKey: objectInput.objectKey,
            fieldKey: fieldInput.fieldKey,
            type: fieldInput.type,
            label: fieldInput.label,
            required: fieldInput.required ?? false,
            isUnique: fieldInput.isUnique ?? false,
            defaultValue: fieldInput.defaultValue,
            options: fieldInput.options,
            relationObjectKey: fieldInput.relationObjectKey,
            isActive: true,
            displayOrder: fieldInput.displayOrder ?? 0,
            metadata: fieldInput.metadata
          })
        )

        if (fieldInput.type === 'relation' && fieldInput.relationObjectKey) {
          await this.relationRepository.save(
            this.relationRepository.create({
              ...scopeData,
              sourceObjectKey: objectInput.objectKey,
              targetObjectKey: fieldInput.relationObjectKey,
              relationType: 'many-to-one',
              sourceFieldKey: fieldInput.fieldKey,
              targetFieldKey: 'id',
              metadata: {
                source: 'field-definition'
              }
            })
          )
        }
      }

      await this.viewRepository.save(
        this.viewRepository.create({
          ...scopeData,
          objectKey: objectInput.objectKey,
          viewKey: 'all',
          name: `All ${objectInput.pluralLabel}`,
          columns: DEFAULT_CRM_VIEW_COLUMNS[objectInput.objectKey] ?? objectInput.fields.map((field) => field.fieldKey),
          filters: [],
          sorts: [{ fieldKey: 'updatedAt', direction: 'desc' }],
          visibility: 'system',
          isDefault: true,
          metadata: {
            seeded: true
          }
        })
      )
    }

    await this.activityRepository.save(
      this.activityRepository.create({
        ...scopeData,
        type: 'schema_seeded',
        actorId: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        summary: 'Default CRM schema was initialized.',
        payload: {
          objects: DEFAULT_CRM_OBJECTS.map((item) => item.objectKey)
        }
      })
    )
  }

  async listObjectsWithFields(scope: CrmScope) {
    const objects = await this.objectRepository.find({
      where: scopeWhere(scope, { isActive: true }) as never,
      order: { displayOrder: 'ASC', objectKey: 'ASC' }
    })
    const fields = await this.fieldRepository.find({
      where: scopeWhere(scope, { isActive: true }) as never,
      order: { objectKey: 'ASC', displayOrder: 'ASC', fieldKey: 'ASC' }
    })
    const fieldsByObject = new Map<string, CrmFieldDefinition[]>()
    for (const field of fields) {
      const key = field.objectKey ?? ''
      fieldsByObject.set(key, [...(fieldsByObject.get(key) ?? []), field])
    }
    return objects.map((object) => ({
      ...object,
      fields: fieldsByObject.get(object.objectKey ?? '') ?? []
    }))
  }

  async getObjectWithFields(scope: CrmScope, objectKey: string) {
    const object = await this.objectRepository.findOne({
      where: scopeWhere(scope, { objectKey, isActive: true }) as never
    })
    if (!object) {
      return null
    }
    const fields = await this.fieldRepository.find({
      where: scopeWhere(scope, { objectKey, isActive: true }) as never,
      order: { displayOrder: 'ASC', fieldKey: 'ASC' }
    })
    return {
      ...object,
      fields
    }
  }

  async listViews(scope: CrmScope, objectKey: string) {
    return this.viewRepository.find({
      where: scopeWhere(scope, { objectKey }) as never,
      order: { isDefault: 'DESC', name: 'ASC' }
    })
  }

  async updateViewColumns(scope: CrmScope, input: { objectKey: string; viewKey?: string; columns: string[] }) {
    const object = await this.getObjectWithFields(scope, input.objectKey)
    if (!object) {
      throw new NotFoundException(`CRM object was not found: ${input.objectKey}`)
    }
    const activeFieldKeys = new Set((object.fields ?? []).map((field) => field.fieldKey).filter(Boolean))
    const columns = [...new Set(input.columns.map((column) => String(column).trim()).filter((column) => activeFieldKeys.has(column)))]
    if (!columns.length) {
      throw new BadRequestException('At least one CRM view column is required.')
    }

    const view = await this.viewRepository.findOne({
      where: scopeWhere(scope, {
        objectKey: input.objectKey,
        viewKey: input.viewKey || 'all'
      }) as never
    })
    if (!view) {
      throw new NotFoundException('CRM view was not found.')
    }

    view.columns = columns
    view.metadata = {
      ...(view.metadata ?? {}),
      updatedFrom: 'workbench-fields-menu'
    }
    const saved = await this.viewRepository.save(view)
    await this.activityRepository.save(
      this.activityRepository.create({
        ...scopeColumns(scope),
        objectKey: input.objectKey,
        type: 'view_action',
        actorId: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        summary: 'CRM view columns were updated.',
        payload: {
          viewKey: saved.viewKey,
          columns
        }
      })
    )
    return saved
  }
}
