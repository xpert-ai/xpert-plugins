import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  OFFICE_EDITOR_AGENT_REVIEW_CAPABILITY,
  OFFICE_EDITOR_DOCUMENT_TYPES,
  OFFICE_EDITOR_FEATURE,
  OFFICE_EDITOR_ICON,
  OFFICE_EDITOR_MIDDLEWARE_NAME
} from './constants.js'
import { OfficeEditorService } from './office-editor.service.js'
import type { OfficeDocumentType, OfficeOperationInput, OfficeScope } from './types.js'

const documentTypeSchema = z.enum(OFFICE_EDITOR_DOCUMENT_TYPES)

const createDocumentSchema = z.object({
  documentType: documentTypeSchema.describe('Explicit Office document type. Do not infer this from title or localized text.'),
  title: z.string().min(1),
  description: z.string().optional()
})

const listDocumentsSchema = z.object({
  documentType: documentTypeSchema.optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional()
})

const documentIdSchema = z.object({
  documentId: z.string().min(1).describe('Office Editor plugin document id.')
})

const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const officeOperationSchema = z.discriminatedUnion('operationType', [
  z.object({
    operationType: z.literal('sheet_set_range_values'),
    sheetName: z.string().optional(),
    range: z.string().min(1).describe('A1-style range, such as A1:C3.'),
    values: z.array(z.array(cellValueSchema)).min(1)
  }),
  z.object({
    operationType: z.literal('doc_append_text'),
    text: z.string().min(1)
  }),
  z.object({
    operationType: z.literal('doc_replace_text'),
    search: z.string().min(1),
    replaceWith: z.string(),
    matchCase: z.boolean().optional()
  }),
  z.object({
    operationType: z.literal('slide_create_outline'),
    slides: z.array(z.object({
      title: z.string().min(1),
      bullets: z.array(z.string()).optional(),
      speakerNotes: z.string().optional()
    })).min(1)
  }),
  z.object({
    operationType: z.literal('slide_update_text'),
    slideId: z.string().optional(),
    slideIndex: z.number().int().min(0).optional(),
    targetText: z.string().min(1),
    replaceWith: z.string()
  })
])

const queueEditSchema = documentIdSchema.extend({
  operation: officeOperationSchema.describe('Explicit discriminated operation to queue for the Workbench.'),
  reviewNote: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
})

const reviewNoteSchema = documentIdSchema.extend({
  note: z.string().min(1),
  target: z.unknown().optional(),
  confidence: z.number().min(0).max(1).optional()
})

const failureSchema = z.object({
  documentId: z.string().optional(),
  documentType: documentTypeSchema.optional(),
  title: z.string().optional(),
  reason: z.string().min(1),
  recoverable: z.boolean().optional()
})

@Injectable()
@AgentMiddlewareStrategy(OFFICE_EDITOR_MIDDLEWARE_NAME)
export class OfficeEditorMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: OFFICE_EDITOR_MIDDLEWARE_NAME,
    label: {
      en_US: 'Office Editor',
      zh_Hans: 'Office 协作编辑器'
    },
    icon: {
      type: 'svg',
      value: OFFICE_EDITOR_ICON
    },
    description: {
      en_US: 'Create, read, and queue edits for Univer-native spreadsheets, documents, and presentations.',
      zh_Hans: '创建、读取并排队编辑 Univer 原生电子表格、文档和演示稿。'
    },
    features: [OFFICE_EDITOR_FEATURE, OFFICE_EDITOR_AGENT_REVIEW_CAPABILITY],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: OfficeEditorService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: OFFICE_EDITOR_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => JSON.stringify(await this.service.createDocument(scope, {
            documentType: input.documentType as OfficeDocumentType,
            title: input.title,
            description: input.description
          }), null, 2),
          {
            name: 'office_create_document',
            description: 'Create a Univer-native Office document. Always pass explicit documentType: spreadsheet, document, or presentation.',
            schema: createDocumentSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.getWorkbenchData(scope, {
            documentType: input.documentType as OfficeDocumentType | undefined,
            search: input.search,
            page: input.page,
            pageSize: input.pageSize
          }), null, 2),
          {
            name: 'office_list_documents',
            description: 'List Office Editor documents visible to the current tenant, organization, and workspace scope.',
            schema: listDocumentsSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.getWorkbenchData(scope, {
            documentId: input.documentId
          }), null, 2),
          {
            name: 'office_read_document',
            description: 'Read the latest persisted Office document snapshot and queued operations before proposing edits.',
            schema: documentIdSchema
          }
        ),
        tool(
          async (input) => {
            const operation = input.operation as OfficeOperationInput
            const queued = await this.service.queueOperation(scope, {
              documentId: input.documentId,
              operationType: operation.operationType,
              input: operation,
              reviewNote: input.reviewNote,
              confidence: input.confidence,
              source: 'agent'
            })
            return JSON.stringify({
              message: 'Office edit was queued. Open the Office Editor Workbench to apply it through the live Univer editor.',
              operation: queued
            }, null, 2)
          },
          {
            name: 'office_queue_edit',
            description: 'Queue one explicit Office edit for the Workbench. The live Univer editor applies queued edits so a human can review them.',
            schema: queueEditSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.addReviewNote(scope, {
            documentId: input.documentId,
            note: input.note,
            target: input.target,
            confidence: input.confidence
          }), null, 2),
          {
            name: 'office_add_review_note',
            description: 'Add a review note that a human should inspect in the Office Editor Workbench.',
            schema: reviewNoteSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.reportFailure(scope, {
            documentId: input.documentId,
            documentType: input.documentType as OfficeDocumentType | undefined,
            title: input.title,
            reason: input.reason,
            recoverable: input.recoverable
          }), null, 2),
          {
            name: 'office_report_failure',
            description: 'Report an Office editing failure or unsupported input. Use this instead of inventing a type or heuristic.',
            schema: failureSchema
          }
        )
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): OfficeScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    assistantId: context.xpertId ?? null,
    conversationId: context.conversationId ?? null
  }
}
