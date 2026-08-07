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
  LUCIDCHART_APPLY_DIAGRAM_STAGE_TOOL_NAME,
  LUCIDCHART_CREATE_DOCUMENT_TOOL_NAME,
  LUCIDCHART_ARTIFACT_SHARING_CAPABILITY,
  LUCIDCHART_FEATURE,
  LUCIDCHART_FINALIZE_DOCUMENT_TOOL_NAME,
  LUCIDCHART_GET_DIAGRAM_PAGE_TOOL_NAME,
  LUCIDCHART_GET_DOCUMENT_TOOL_NAME,
  LUCIDCHART_ICON,
  LUCIDCHART_MIDDLEWARE_NAME,
  LUCIDCHART_PUBLISH_ARTIFACT_LINK_TOOL_NAME,
  LUCIDCHART_REGISTER_EXTERNAL_DOCUMENT_TOOL_NAME,
  LUCIDCHART_REPORT_FAILURE_TOOL_NAME,
  LUCIDCHART_REVOKE_ARTIFACT_LINK_TOOL_NAME,
  LUCIDCHART_SAVE_MERMAID_DRAFT_TOOL_NAME,
  LUCIDCHART_SEARCH_DOCUMENTS_TOOL_NAME,
  LUCIDCHART_UPDATE_DOCUMENT_STATUS_TOOL_NAME
} from './constants.js'
import {
  applyDiagramStageSchema,
  createAgentDocumentSchema,
  finalizeDocumentSchema,
  getDiagramPageSchema
} from './lucidchart-agent-tool.schemas.js'
import { LucidchartService } from './lucidchart.service.js'
import type {
  ApplyLucidchartDiagramStageInput,
  FinalizeLucidchartDiagramInput,
  GetLucidchartDiagramPageInput,
  LucidchartScope
} from './types.js'

const documentKindSchema = z.enum(['diagram', 'flowchart', 'architecture', 'process', 'wireframe', 'orgchart', 'network', 'other'])
const documentStatusSchema = z.enum(['draft', 'reviewed', 'archived'])
const productSchema = z.enum(['lucidchart', 'lucidspark'])
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
  evidence: z.string().max(4_000).optional().describe('Short redacted diagnostic evidence as text.')
})
const publishArtifactLinkSchema = z.object({ documentId: z.string().min(1), accessMode: z.enum(['public_link', 'organization_all', 'workspace_all']).optional(), targetMode: z.enum(['version', 'latest']).optional(), userConfirmedPublicLink: z.boolean().optional().describe('Must be true after the user explicitly confirms public_link access.') })
const revokeArtifactLinkSchema = z.object({ documentId: z.string().min(1) })

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
    features: [LUCIDCHART_FEATURE, LUCIDCHART_ARTIFACT_SHARING_CAPABILITY],
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
          async (input) => JSON.stringify(await this.service.createAgentDocument(scope, input), null, 2),
          {
            name: LUCIDCHART_CREATE_DOCUMENT_TOOL_NAME,
            description:
              'Create Lucidchart document metadata only. Then build the diagram with bounded lucidchart_apply_diagram_stage calls and finalize it with lucidchart_finalize_document.',
            schema: createAgentDocumentSchema
          }
        ),
        tool(
          async (input) =>
            JSON.stringify(await this.service.applyDiagramStage(scope, input as ApplyLucidchartDiagramStageInput), null, 2),
          {
            name: LUCIDCHART_APPLY_DIAGRAM_STAGE_TOOL_NAME,
            description:
              'Apply at most 12 typed shape, line, or removal operations to one page. The server assembles official Lucid Standard Import JSON; use the returned draftRevision for the next stage.',
            schema: applyDiagramStageSchema
          }
        ),
        tool(
          async (input) =>
            JSON.stringify(await this.service.finalizeDiagram(scope, input as FinalizeLucidchartDiagramInput), null, 2),
          {
            name: LUCIDCHART_FINALIZE_DOCUMENT_TOOL_NAME,
            description:
              'Validate the complete staged diagram and save one official Lucid Standard Import version. Call only after all bounded stages succeed.',
            schema: finalizeDocumentSchema
          }
        ),
        tool(
          async (input) =>
            JSON.stringify(await this.service.getDiagramPage(scope, input as GetLucidchartDiagramPageInput), null, 2),
          {
            name: LUCIDCHART_GET_DIAGRAM_PAGE_TOOL_NAME,
            description:
              'Read at most 20 staged shapes and lines from one Lucidchart page before making targeted updates.',
            schema: getDiagramPageSchema
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
          async (input) => JSON.stringify(await this.service.getAgentDocument(scope, input.documentId), null, 2),
          {
            name: LUCIDCHART_GET_DOCUMENT_TOOL_NAME,
            description: 'Get compact Lucidchart metadata, draft revision, page counts, and the next safe staged action without returning the full diagram JSON.',
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
        ),
        tool(
          async (input) => JSON.stringify(await this.service.publishArtifact(scope, input), null, 2),
          {
            name: LUCIDCHART_PUBLISH_ARTIFACT_LINK_TOOL_NAME,
            description: 'Create or reuse a read-only HTML Artifact link for the current saved Lucidchart version. Public links require explicit user confirmation; download is disabled.',
            schema: publishArtifactLinkSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.revokeArtifactShare(scope, input.documentId), null, 2),
          {
            name: LUCIDCHART_REVOKE_ARTIFACT_LINK_TOOL_NAME,
            description: 'Revoke the active Artifact link for a Lucidchart document.',
            schema: revokeArtifactLinkSchema
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
