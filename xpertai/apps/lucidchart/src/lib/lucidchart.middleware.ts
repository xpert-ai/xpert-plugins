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
  LUCIDCHART_CREATE_DOCUMENT_TOOL_NAME,
  LUCIDCHART_FEATURE,
  LUCIDCHART_GET_DOCUMENT_TOOL_NAME,
  LUCIDCHART_ICON,
  LUCIDCHART_MIDDLEWARE_NAME,
  LUCIDCHART_PATCH_STANDARD_IMPORT_TOOL_NAME,
  LUCIDCHART_REGISTER_EXTERNAL_DOCUMENT_TOOL_NAME,
  LUCIDCHART_REPORT_FAILURE_TOOL_NAME,
  LUCIDCHART_SAVE_MERMAID_DRAFT_TOOL_NAME,
  LUCIDCHART_SAVE_STANDARD_IMPORT_VERSION_TOOL_NAME,
  LUCIDCHART_SEARCH_DOCUMENTS_TOOL_NAME,
  LUCIDCHART_UPDATE_DOCUMENT_STATUS_TOOL_NAME
} from './constants.js'
import { LucidchartService } from './lucidchart.service.js'
import type { LucidchartScope } from './types.js'

const documentKindSchema = z.enum(['diagram', 'flowchart', 'architecture', 'process', 'wireframe', 'orgchart', 'network', 'other'])
const documentStatusSchema = z.enum(['draft', 'reviewed', 'archived'])
const productSchema = z.enum(['lucidchart', 'lucidspark'])
const versionSourceSchema = z.enum([
  'agent_standard_import',
  'agent_patch',
  'agent_mermaid',
  'workbench',
  'workbench_mermaid',
  'import',
  'external_lucid',
  'restore'
])
const recordSchema = z.record(z.unknown())
const documentContentSchema = z.object({
  standardImport: recordSchema.optional().describe('Lucid Standard Import document.json content. Keep it serializable JSON.'),
  mermaidSource: z.string().optional().describe('Mermaid draft source kept for review or later conversion.'),
  lucidDocumentId: z.string().optional().describe('Real Lucid document id after import or manual creation in Lucid.'),
  lucidDocumentUrl: z.string().optional().describe('Real Lucid document URL.'),
  embedUrl: z.string().optional().describe('Lucid Embed API iframe URL, if available.'),
  embedId: z.string().optional().describe('Lucid embed id or token identifier, if available.'),
  previewUrl: z.string().optional().describe('Optional preview image URL.'),
  product: productSchema.optional().describe('Lucid product for Standard Import. Defaults to lucidchart.'),
  importFileName: z.string().optional().describe('Preferred .lucid import filename or document.json filename.')
})

const createDocumentSchema = documentContentSchema.extend({
  title: z.string().min(1).describe('Human-readable Lucidchart document title.'),
  description: z.string().optional(),
  kind: documentKindSchema.optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional().describe('Short source label, such as user_request, agent_plan, external_lucid, or imported_file.'),
  changeSummary: z.string().optional().describe('Short summary for the initial version.')
})

const saveStandardImportVersionSchema = documentContentSchema.extend({
  documentId: z.string().min(1).describe('Existing Lucidchart plugin document id.'),
  sourceType: versionSourceSchema.optional().describe('Where this version came from. Agent Standard Import should use agent_standard_import.'),
  changeSummary: z.string().optional()
})

const patchStandardImportSchema = documentContentSchema.extend({
  documentId: z.string().min(1),
  standardImportPatch: recordSchema.optional().describe('Shallow patch merged into the current Standard Import document.json.'),
  merge: z.boolean().optional().describe('Set false to replace current Standard Import with standardImportPatch. Defaults to true.'),
  changeSummary: z.string().optional()
})

const saveMermaidDraftSchema = z.object({
  documentId: z.string().optional().describe('Existing plugin document id. Omit to create a new Lucidchart document record.'),
  title: z.string().optional().describe('Required when documentId is omitted; otherwise used only as context.'),
  description: z.string().optional(),
  kind: documentKindSchema.optional(),
  mermaidSource: z.string().min(1).describe('Mermaid diagram source to keep as a Lucidchart draft.'),
  changeSummary: z.string().optional()
})

const registerExternalDocumentSchema = z.object({
  documentId: z.string().optional().describe('Existing plugin document id. Omit to create a new record for the Lucid document.'),
  title: z.string().optional(),
  description: z.string().optional(),
  kind: documentKindSchema.optional(),
  lucidDocumentId: z.string().optional(),
  lucidDocumentUrl: z.string().optional(),
  embedUrl: z.string().optional(),
  embedId: z.string().optional(),
  previewUrl: z.string().optional(),
  product: productSchema.optional(),
  changeSummary: z.string().optional()
})

const searchDocumentsSchema = z.object({
  status: documentStatusSchema.optional(),
  kind: documentKindSchema.optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional()
})

const getDocumentSchema = z.object({
  documentId: z.string().min(1)
})

const updateDocumentStatusSchema = z.object({
  documentId: z.string().min(1),
  status: documentStatusSchema,
  reason: z.string().optional()
})

const reportFailureSchema = z.object({
  documentId: z.string().optional(),
  versionId: z.string().optional(),
  operation: z.string().min(1),
  errorMessage: z.string().min(1),
  recoverable: z.boolean().optional(),
  evidence: z.unknown().optional()
})

@Injectable()
@AgentMiddlewareStrategy(LUCIDCHART_MIDDLEWARE_NAME)
export class LucidchartMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: LUCIDCHART_MIDDLEWARE_NAME,
    label: {
      en_US: 'Lucidchart',
      zh_Hans: 'Lucidchart 绘图'
    },
    description: {
      en_US: 'Create, version, search, and recover Lucidchart Standard Import drafts and external Lucid documents from an Agent.',
      zh_Hans: '让 Agent 创建、版本化、检索和恢复 Lucidchart Standard Import 草稿与外部 Lucid 文档。'
    },
    icon: {
      type: 'svg',
      value: LUCIDCHART_ICON,
      color: '#2563eb'
    },
    features: [LUCIDCHART_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: LucidchartService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: LUCIDCHART_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => JSON.stringify(await this.service.createDocument(scope, input), null, 2),
          {
            name: LUCIDCHART_CREATE_DOCUMENT_TOOL_NAME,
            description:
              'Create a reviewable Lucidchart document record. Include Lucid Standard Import document.json when you can produce it, or create a record before saving Mermaid/external Lucid links.',
            schema: createDocumentSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveStandardImportVersion(scope, input), null, 2),
          {
            name: LUCIDCHART_SAVE_STANDARD_IMPORT_VERSION_TOOL_NAME,
            description:
              'Save a complete Lucid Standard Import document.json as a new version. Use this for Agent-generated Lucidchart drafts intended for Lucid REST Standard Import.',
            schema: saveStandardImportVersionSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.patchStandardImport(scope, input), null, 2),
          {
            name: LUCIDCHART_PATCH_STANDARD_IMPORT_TOOL_NAME,
            description:
              'Patch or replace the current Lucid Standard Import document.json and save it as a new version. Call lucidchart_get_document first.',
            schema: patchStandardImportSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveMermaidDraft(scope, input), null, 2),
          {
            name: LUCIDCHART_SAVE_MERMAID_DRAFT_TOOL_NAME,
            description:
              'Save Mermaid source as a Lucidchart draft for Workbench review. Use this when the user describes a flow before a Standard Import JSON is ready.',
            schema: saveMermaidDraftSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.registerExternalDocument(scope, input), null, 2),
          {
            name: LUCIDCHART_REGISTER_EXTERNAL_DOCUMENT_TOOL_NAME,
            description:
              'Register a real Lucid document id, Lucid document URL, or Lucid Embed API URL after a document has been imported or manually created in Lucid.',
            schema: registerExternalDocumentSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.searchDocuments(scope, input), null, 2),
          {
            name: LUCIDCHART_SEARCH_DOCUMENTS_TOOL_NAME,
            description: 'Search existing Lucidchart document records by status, kind, keyword, and pagination.',
            schema: searchDocumentsSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.getDocument(scope, input.documentId), null, 2),
          {
            name: LUCIDCHART_GET_DOCUMENT_TOOL_NAME,
            description: 'Get a Lucidchart document with current Standard Import, Mermaid source, external link metadata, versions, and logs.',
            schema: getDocumentSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.updateDocumentStatus(scope, input), null, 2),
          {
            name: LUCIDCHART_UPDATE_DOCUMENT_STATUS_TOOL_NAME,
            description: 'Update a Lucidchart document status to draft, reviewed, or archived after user confirmation.',
            schema: updateDocumentStatusSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.reportFailure(scope, input), null, 2),
          {
            name: LUCIDCHART_REPORT_FAILURE_TOOL_NAME,
            description:
              'Record a failed Standard Import generation, Lucid import, embed registration, Mermaid draft, or export attempt with evidence.',
            schema: reportFailureSchema
          }
        )
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): LucidchartScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    conversationId: context.conversationId ?? null,
    assistantId: context.xpertId ?? null
  }
}
