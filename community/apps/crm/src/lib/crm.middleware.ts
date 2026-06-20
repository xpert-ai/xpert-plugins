import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  CRM_CREATE_RECORD_TOOL_NAME,
  CRM_FEATURE,
  CRM_GET_RECORD_TOOL_NAME,
  CRM_ICON,
  CRM_LIST_OBJECTS_TOOL_NAME,
  CRM_MIDDLEWARE_NAME,
  CRM_SEARCH_RECORDS_TOOL_NAME,
  CRM_UPDATE_RECORD_TOOL_NAME
} from './constants'
import { CrmService } from './crm.service'
import type { CrmScope } from './types'

const listObjectsSchema = z.object({
  includeFields: z.boolean().optional().describe('Whether to include field definitions. Defaults to true.')
})

const searchRecordsSchema = z.object({
  objectKey: z.string().optional().describe('CRM object key such as company, person, opportunity, task, or note.'),
  search: z.string().optional().describe('Keyword search across record values.'),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional()
})

const getRecordSchema = z.object({
  recordId: z.string().min(1).describe('CRM record id.'),
  objectKey: z.string().optional().describe('Optional CRM object key to validate the record type.')
})

const createRecordSchema = z.object({
  objectKey: z.string().min(1).describe('CRM object key. Use crm_list_objects when unsure.'),
  values: z.record(z.unknown()).describe('Record values keyed by CRM field key.')
})

const updateRecordSchema = z.object({
  recordId: z.string().min(1).describe('CRM record id.'),
  objectKey: z.string().optional().describe('Optional CRM object key to validate the record type.'),
  values: z.record(z.unknown()).describe('Partial record values keyed by CRM field key.')
})

@Injectable()
@AgentMiddlewareStrategy(CRM_MIDDLEWARE_NAME)
export class CrmMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: CrmService) {}

  meta: TAgentMiddlewareMeta = {
    name: CRM_MIDDLEWARE_NAME,
    label: {
      en_US: 'CRM',
      zh_Hans: 'CRM'
    },
    description: {
      en_US: 'Adds native CRM tools for listing metadata and reading or writing CRM records.',
      zh_Hans: '提供原生 CRM 元数据查询、记录查询、创建和更新工具。'
    },
    icon: {
      type: 'svg',
      value: CRM_ICON,
      color: '#0f766e'
    },
    features: [CRM_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    const listObjectsTool = tool(
      async (_input: z.infer<typeof listObjectsSchema>) => {
        const objects = await this.service.listObjects(scope)
        return stringify({
          success: true,
          message: 'CRM objects were listed.',
          data: {
            objects
          }
        })
      },
      {
        name: CRM_LIST_OBJECTS_TOOL_NAME,
        description:
          'List CRM object definitions and field definitions. Call this before creating or updating CRM records when field keys are uncertain.',
        schema: listObjectsSchema
      }
    )

    const searchRecordsTool = tool(
      async (input: z.infer<typeof searchRecordsSchema>) => {
        const result = await this.service.searchRecords(scope, input)
        return stringify({
          success: true,
          message: 'CRM records were searched.',
          data: result
        })
      },
      {
        name: CRM_SEARCH_RECORDS_TOOL_NAME,
        description:
          'Search CRM records by object key and keyword. Use this for customer, contact, opportunity, task, or note lookup.',
        schema: searchRecordsSchema
      }
    )

    const getRecordTool = tool(
      async (input: z.infer<typeof getRecordSchema>) => {
        const record = await this.service.getRecord(scope, input.recordId, input.objectKey)
        return stringify({
          success: true,
          message: 'CRM record detail was returned.',
          data: record
        })
      },
      {
        name: CRM_GET_RECORD_TOOL_NAME,
        description: 'Get one CRM record by id. Use this before updating a record when current values matter.',
        schema: getRecordSchema
      }
    )

    const createRecordTool = tool(
      async (input: z.infer<typeof createRecordSchema>) => {
        const record = await this.service.createRecord(scope, {
          objectKey: input.objectKey,
          values: input.values,
          source: 'agent'
        })
        return stringify({
          success: true,
          message: 'CRM record was created. Ask the user to review it in the CRM Workbench if important fields were inferred.',
          data: record
        })
      },
      {
        name: CRM_CREATE_RECORD_TOOL_NAME,
        description:
          'Create one CRM record. Only call when the user clearly asks to save a new company, person, opportunity, task, or note.',
        schema: createRecordSchema
      }
    )

    const updateRecordTool = tool(
      async (input: z.infer<typeof updateRecordSchema>) => {
        const record = await this.service.updateRecord(scope, {
          recordId: input.recordId,
          objectKey: input.objectKey,
          values: input.values,
          source: 'agent'
        })
        return stringify({
          success: true,
          message: 'CRM record was updated. Report changed fields and suggest Workbench review for important data.',
          data: record
        })
      },
      {
        name: CRM_UPDATE_RECORD_TOOL_NAME,
        description:
          'Update one existing CRM record. Use crm_search_records or crm_get_record first unless the user already supplied an exact record id.',
        schema: updateRecordSchema
      }
    )

    return {
      name: CRM_MIDDLEWARE_NAME,
      tools: [listObjectsTool, searchRecordsTool, getRecordTool, createRecordTool, updateRecordTool]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): CrmScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}

function stringify(value: unknown) {
  return JSON.stringify(value)
}
