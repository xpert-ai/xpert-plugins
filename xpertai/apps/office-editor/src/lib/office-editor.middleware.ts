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
import type { ExcelAutomationOperation } from './types.js'

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

const excelReadSchema = documentIdSchema.extend({
  sheetName: z.string().min(1).optional(),
  range: z.string().min(1).describe('Optional A1-style range, such as A1:F50.').optional()
})

const excelOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set_range_values'),
    sheetName: z.string().min(1),
    range: z.string().min(1),
    values: z.array(z.array(cellValueSchema)).min(1)
  }),
  z.object({
    type: z.literal('set_range_formulas'),
    sheetName: z.string().min(1),
    range: z.string().min(1),
    formulas: z.array(z.array(z.string().nullable())).min(1)
  }),
  z.object({
    type: z.literal('clear_range'),
    sheetName: z.string().min(1),
    range: z.string().min(1)
  }),
  z.object({
    type: z.literal('create_sheet'),
    sheetName: z.string().min(1).max(31)
  }),
  z.object({
    type: z.literal('rename_sheet'),
    sheetName: z.string().min(1).max(31),
    newSheetName: z.string().min(1).max(31)
  }),
  z.object({
    type: z.literal('delete_sheet'),
    sheetName: z.string().min(1).max(31)
  })
])

const excelEditSchema = documentIdSchema.extend({
  expectedVersionNumber: z.number().int().min(1).optional(),
  operations: z.array(excelOperationSchema).min(1).max(100),
  changeSummary: z.string().optional(),
  idempotencyKey: z.string().min(1).max(128).optional()
})

const excelRestoreSchema = documentIdSchema.extend({
  versionId: z.string().min(1),
  expectedVersionNumber: z.number().int().min(1).optional(),
  changeSummary: z.string().optional()
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
          async (input) => JSON.stringify(await this.service.readExcel(scope, {
            documentId: input.documentId,
            sheetName: input.sheetName,
            range: input.range
          }), null, 2),
          {
            name: 'office_excel_read',
            description: 'Read workbook metadata or a bounded XLSX range from the current persisted Excel file version. Call this before editing.',
            schema: excelReadSchema
          }
        ),
        tool(
          async (input) => {
            const result = await this.service.editExcel(scope, {
              documentId: input.documentId,
              expectedVersionNumber: input.expectedVersionNumber,
              operations: input.operations as ExcelAutomationOperation[],
              changeSummary: input.changeSummary,
              idempotencyKey: input.idempotencyKey
            })
            return [
              JSON.stringify(result, null, 2),
              {
                files: [result.file]
              }
            ]
          },
          {
            name: 'office_excel_edit',
            description: 'Automatically edit the persisted XLSX file on the server, create a new immutable file version and synchronized Univer snapshot, and return the edited XLSX artifact. Use expectedVersionNumber to prevent overwriting concurrent work.',
            schema: excelEditSchema,
            responseFormat: 'content_and_artifact'
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.listExcelVersions(scope, input.documentId), null, 2),
          {
            name: 'office_excel_get_versions',
            description: 'List immutable XLSX file versions for a spreadsheet document.',
            schema: documentIdSchema
          }
        ),
        tool(
          async (input) => {
            const result = await this.service.restoreExcelVersion(scope, {
              documentId: input.documentId,
              versionId: input.versionId,
              expectedVersionNumber: input.expectedVersionNumber,
              changeSummary: input.changeSummary
            })
            return [
              JSON.stringify(result, null, 2),
              {
                files: [result.file]
              }
            ]
          },
          {
            name: 'office_excel_restore_version',
            description: 'Restore an earlier XLSX file version as a new current version without destroying version history.',
            schema: excelRestoreSchema,
            responseFormat: 'content_and_artifact'
          }
        ),
        tool(
          async (input) => {
            const result = await this.service.getExcelFile(scope, input.documentId)
            return [
              JSON.stringify(result, null, 2),
              {
                files: [{
                  fileName: result.fileName,
                  filePath: result.filePath,
                  fileUrl: result.fileUrl,
                  mimeType: result.mimeType,
                  extension: result.extension
                }]
              }
            ]
          },
          {
            name: 'office_excel_get_file',
            description: 'Return the current persisted XLSX file as a downloadable workspace artifact.',
            schema: documentIdSchema,
            responseFormat: 'content_and_artifact'
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
