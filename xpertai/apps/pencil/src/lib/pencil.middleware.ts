import { Injectable } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  RequestContext,
  WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import type { ParamDef, ToolDef } from '@open\u002dpencil/core'
import { z } from 'zod/v3'
import {
  PENCIL_AGENT_CAPABILITY,
  PENCIL_BASE_MIDDLEWARE_TOOL_NAMES,
  PENCIL_CREATE_DOCUMENT_TOOL_NAME,
  PENCIL_CREATE_SAMPLE_DOCUMENT_TOOL_NAME,
  PENCIL_EXPORT_FILE_TOOL_NAME,
  PENCIL_FEATURE,
  PENCIL_GET_DOCUMENT_TOOL_NAME,
  PENCIL_GET_NODE_TOOL_NAME,
  PENCIL_ICON,
  PENCIL_IMPORT_FILE_TOOL_NAME,
  PENCIL_MIDDLEWARE_NAME,
  PENCIL_REPORT_FAILURE_TOOL_NAME,
  PENCIL_RENDER_PATCH_TOOL_NAME,
  PENCIL_SAVE_VERSION_TOOL_NAME,
  PENCIL_SEARCH_DOCUMENTS_TOOL_NAME,
  PENCIL_UPDATE_STATUS_TOOL_NAME,
  PENCIL_WORKBENCH_CAPABILITY,
  PENCIL_CORE_TOOL_PREFIX
} from './constants.js'
import {
  stringifyAgentToolResult,
  summarizeCoreToolResult,
  summarizeDocumentMutationResult,
  summarizeFailureResult,
  summarizeGetDocumentResult,
  summarizeGetNodeResult,
  summarizeSearchResult
} from './pencil-agent-response.js'
import { PencilService } from './pencil.service.js'
import type { PencilJsonObject, PencilJsonValue, PencilScope } from './types.js'

const documentKindSchema = z.enum(['design', 'figma-import', 'wireframe', 'prototype', 'component-library', 'illustration', 'other'])
const documentStatusSchema = z.enum(['draft', 'reviewed', 'archived'])
const versionSourceSchema = z.enum(['agent_snapshot', 'agent_tool', 'workbench', 'import', 'restore', 'sample'])
const exportFormatSchema = z.enum(['fig', 'png', 'jpg', 'webp', 'svg', 'pdf', 'jsx'])
const jsonValueSchema: z.ZodType<PencilJsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
)
const recordSchema = z.record(jsonValueSchema) as z.ZodType<PencilJsonObject>
const graphSnapshotSchema = z
  .object({
    formatVersion: z.literal('pencil.scene-graph.v1'),
    pencilVersion: z.string(),
    rootId: z.string().min(1),
    nodes: z.array(z.tuple([z.string(), recordSchema])),
    images: z.array(z.tuple([z.string(), z.string()])),
    variables: z.array(z.tuple([z.string(), recordSchema])),
    variableCollections: z.array(z.tuple([z.string(), recordSchema])),
    activeMode: z.array(z.tuple([z.string(), z.string()])),
    instanceIndex: z.array(z.tuple([z.string(), z.array(z.string())])),
    figKiwiVersion: z.number().nullable().optional(),
    figSchemaDeflatedBase64: z.string().nullable().optional(),
    documentColorSpace: z.string().optional()
  })
  .passthrough()

const createDocumentSchema = z.object({
  title: z.string().min(1).describe('Human-readable Pencil document title.'),
  description: z.string().optional(),
  kind: documentKindSchema.optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional().describe('Short source label, such as user_request, imported_file, or agent_plan.'),
  sourceFormat: z.string().optional(),
  graphSnapshot: graphSnapshotSchema.optional().describe('Optional complete PencilGraphSnapshot. Usually omit for a blank document.'),
  viewState: recordSchema.optional(),
  selectionSummary: recordSchema.optional(),
  changeSummary: z.string().optional()
})

const createSampleDocumentSchema = z.object({
  title: z.string().optional().describe('Optional title. Defaults to a revenue intelligence dashboard case.'),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
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
  documentId: z.string().min(1),
  versionId: z.string().optional(),
  versionNumber: z.number().int().min(1).optional(),
  includeSnapshot: z.boolean().optional().describe('Set true only when exact PencilGraphSnapshot JSON is required.'),
  includeLogs: z.boolean().optional(),
  versionLimit: z.number().int().min(1).max(100).optional(),
  logLimit: z.number().int().min(1).max(50).optional()
})

const getNodeSchema = z.object({
  documentId: z.string().min(1),
  nodeId: z.string().min(1),
  versionId: z.string().optional(),
  versionNumber: z.number().int().min(1).optional()
})

const saveVersionSchema = z.object({
  documentId: z.string().min(1),
  graphSnapshot: graphSnapshotSchema.optional().describe('Optional complete graph snapshot. Omit to version the current working copy.'),
  viewState: recordSchema.optional(),
  selectionSummary: recordSchema.optional(),
  sourceType: versionSourceSchema.optional(),
  changeSummary: z.string().optional()
})

const runtimeFileLocatorSchema = z.union([
  z.string(),
  z
    .object({
      path: z.string().optional(),
      filePath: z.string().optional(),
      workspacePath: z.string().optional(),
      originalName: z.string().optional(),
      name: z.string().optional(),
      mimeType: z.string().optional(),
      mimetype: z.string().optional(),
      size: z.number().optional()
    })
    .passthrough()
])

const importFileSchema = z.object({
  file: runtimeFileLocatorSchema.describe('Workspace file path, /workspace path, or portable fileRef for a .fig or .pen file.'),
  title: z.string().optional(),
  description: z.string().optional(),
  kind: documentKindSchema.optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional()
})

const exportTargetSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('document') }),
  z.object({ scope: z.literal('page'), pageId: z.string().min(1) }),
  z.object({ scope: z.literal('selection'), nodeIds: z.array(z.string().min(1)).min(1) }),
  z.object({ scope: z.literal('node'), nodeId: z.string().min(1) })
])

const exportFileSchema = z.object({
  documentId: z.string().min(1),
  format: exportFormatSchema,
  target: exportTargetSchema.optional(),
  fileName: z.string().optional(),
  scale: z.number().positive().max(4).optional(),
  quality: z.number().positive().max(1).optional(),
  colorSpace: z.enum(['srgb', 'display-p3']).optional(),
  writeToWorkspace: z.boolean().optional().describe('Defaults to true for Agent calls. Keep true unless the user explicitly wants inline content.')
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
  evidence: jsonValueSchema.optional()
})

const renderDraftEditSchema = z.object({
  oldText: z.string().min(1).max(4000).describe('Exact source fragment from the current draft revision. Include enough context to match once.'),
  newText: z.string().max(8000).describe('Replacement JSX fragment. Use an empty string to delete oldText.')
})

const patchRenderDraftSchema = z.object({
  documentId: z.string().min(1),
  draftId: z.string().min(1),
  expectedRevision: z.number().int().min(1),
  edits: z.array(renderDraftEditSchema).min(1).max(20),
  changeSummary: z.string().optional()
})

/** Exposes scoped persistence tools plus a curated subset of Pencil core tools to an Agent. */
@Injectable()
@AgentMiddlewareStrategy(PENCIL_MIDDLEWARE_NAME)
export class PencilMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: PENCIL_MIDDLEWARE_NAME,
    label: {
      en_US: 'Pencil',
      zh_Hans: 'Pencil 设计'
    },
    description: {
      en_US: 'Create, import, inspect, edit, export, version, and recover Pencil design documents from an Agent.',
      zh_Hans: '让 Agent 创建、导入、检查、编辑、导出、版本化和恢复 Pencil 设计文档。'
    },
    icon: {
      type: 'svg',
      value: PENCIL_ICON,
      color: '#2563eb'
    },
    features: [PENCIL_FEATURE, PENCIL_AGENT_CAPABILITY, PENCIL_WORKBENCH_CAPABILITY],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: PencilService) {}

  async createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): Promise<AgentMiddleware> {
    // Resolve ownership once from trusted runtime context; schemas never expose tenant or organization ids.
    const scope = scopeFromContext(context)
    const coreToolDefinitions = await this.service.getCoreToolDefinitions()
    const tools = [
      tool(
        async (input) =>
          stringifyAgentToolResult(
            summarizeDocumentMutationResult(
              await this.service.createDocument(scope, input as Parameters<PencilService['createDocument']>[1]),
              'Pencil document was created.'
            )
          ),
        {
          name: PENCIL_CREATE_DOCUMENT_TOOL_NAME,
          description:
            'Create a persistent Pencil document. Use this only when there is no current pencilDocumentId or the user explicitly asks for a new design document.',
          schema: createDocumentSchema,
          verboseParsingErrors: true
        }
      ),
      tool(
        async (input) =>
          stringifyAgentToolResult(
            summarizeDocumentMutationResult(
              await this.service.createSampleDocument(scope, input as Parameters<PencilService['createSampleDocument']>[1]),
              'Pencil sample data case was created.'
            )
          ),
        {
          name: PENCIL_CREATE_SAMPLE_DOCUMENT_TOOL_NAME,
          description:
            'Create a persistent Pencil sample data case with realistic dashboard data, nested auto-layout, grid layout, wrapping cards, charts, and tables. Use this when the user wants a real example to review or extend.',
          schema: createSampleDocumentSchema,
          verboseParsingErrors: true
        }
      ),
      tool(async (input) => stringifyAgentToolResult(summarizeSearchResult(await this.service.searchDocuments(scope, input))), {
        name: PENCIL_SEARCH_DOCUMENTS_TOOL_NAME,
        description: 'Search Pencil documents by status, kind, keyword, and pagination. Returns metadata only.',
        schema: searchDocumentsSchema,
        verboseParsingErrors: true
      }),
      tool(
        async (input) => {
          const payload = input as Parameters<PencilService['getDocument']>[1]
          return stringifyAgentToolResult(summarizeGetDocumentResult(await this.service.getDocument(scope, payload), payload.includeSnapshot))
        },
        {
          name: PENCIL_GET_DOCUMENT_TOOL_NAME,
          description:
            'Get Pencil document metadata, current working graph summary, version metadata, logs, and optionally the full graph snapshot. Read this before modifying an existing document.',
          schema: getDocumentSchema,
          verboseParsingErrors: true
        }
      ),
      tool(async (input) => stringifyAgentToolResult(summarizeGetNodeResult(await this.service.getNode(scope, input as Parameters<PencilService['getNode']>[1]))), {
        name: PENCIL_GET_NODE_TOOL_NAME,
        description: 'Fetch one exact Pencil node summary from the working copy by default, or from a requested version.',
        schema: getNodeSchema,
        verboseParsingErrors: true
      }),
      tool(
        async (input) =>
          stringifyAgentToolResult(
            summarizeDocumentMutationResult(
              await this.service.saveVersion(scope, input as Parameters<PencilService['saveVersion']>[1]),
              'Pencil version was saved.'
            )
          ),
        {
          name: PENCIL_SAVE_VERSION_TOOL_NAME,
          description:
            'Save the current Pencil working copy, or a supplied complete PencilGraphSnapshot, as a new persistent version. Do not claim a design was saved unless this tool succeeds.',
          schema: saveVersionSchema,
          verboseParsingErrors: true
        }
      ),
      tool(
        async (input) => {
          const workspaceFiles = context.runtime.capabilities?.require(WorkspaceFilesRuntimeCapability)
          if (!workspaceFiles) {
            throw new Error('WorkspaceFilesRuntimeCapability is required for pencil_import_file.')
          }
          return stringifyAgentToolResult(
            summarizeDocumentMutationResult(
              await this.service.importRuntimeFile(scope, input as Parameters<PencilService['importRuntimeFile']>[1], workspaceFiles),
              'Pencil file was imported.'
            )
          )
        },
        {
          name: PENCIL_IMPORT_FILE_TOOL_NAME,
          description: 'Import a .fig or .pen file from the current runtime workspace and create a versioned Pencil document.',
          schema: importFileSchema,
          verboseParsingErrors: true
        }
      ),
      tool(
        async (input) => {
          const workspaceFiles = context.runtime.capabilities?.require(WorkspaceFilesRuntimeCapability)
          if (!workspaceFiles) {
            throw new Error('WorkspaceFilesRuntimeCapability is required for pencil_export_file.')
          }
          const exportInput = input as Parameters<PencilService['exportDocument']>[1]
          const exportResult = await this.service.exportDocument(scope, { ...exportInput, writeToWorkspace: exportInput.writeToWorkspace ?? true }, workspaceFiles)
          return stringifyAgentToolResult(
            summarizeDocumentMutationResult(
              {
                success: true,
                message: 'Pencil export was written to workspace.',
                document: { id: exportInput.documentId },
                export: exportResult
              },
              'Pencil export was written to workspace.'
            )
          )
        },
        {
          name: PENCIL_EXPORT_FILE_TOOL_NAME,
          description:
            'Export an Pencil document, page, node, or selection to a workspace file. Returns a portable file reference, path, mime, size, and sha256 instead of inline base64.',
          schema: exportFileSchema,
          verboseParsingErrors: true
        }
      ),
      tool(
        async (input) =>
          stringifyAgentToolResult(
            summarizeDocumentMutationResult(
              await this.service.updateDocumentStatus(scope, input as Parameters<PencilService['updateDocumentStatus']>[1]),
              'Pencil document status was updated.'
            )
          ),
        {
          name: PENCIL_UPDATE_STATUS_TOOL_NAME,
          description: 'Update an Pencil document status to draft, reviewed, or archived after user confirmation.',
          schema: updateDocumentStatusSchema,
          verboseParsingErrors: true
        }
      ),
      tool(async (input) => stringifyAgentToolResult(summarizeFailureResult(await this.service.reportFailure(scope, input as Parameters<PencilService['reportFailure']>[1]))), {
        name: PENCIL_REPORT_FAILURE_TOOL_NAME,
        description: 'Record a failed Pencil import, export, graph mutation, or requested edit with recoverability and evidence.',
        schema: reportFailureSchema,
        verboseParsingErrors: true
      }),
      tool(
        async (input) =>
          stringifyAgentToolResult(
            summarizeCoreToolResult(
              await this.service.patchRenderDraft(
                scope,
                input as Parameters<PencilService['patchRenderDraft']>[1]
              )
            )
          ),
        {
          name: PENCIL_RENDER_PATCH_TOOL_NAME,
          description:
            'Repair a failed pencil_render call without resending the complete JSX. Use the returned renderDraftId and revision, replace only one uniquely matching oldText fragment, and let the server commit automatically when the repaired JSX validates.',
          schema: patchRenderDraftSchema,
          verboseParsingErrors: true
        }
      ),
      ...coreToolDefinitions.map((toolDef) => this.createCoreTool(scope, toolDef))
    ]

    // Only tools with a user-facing change summary emit progress steps into the conversation timeline.
    const changeSummaryToolNames = new Set(
      tools
        .map((item) => item.name)
        .filter((name) => PENCIL_BASE_MIDDLEWARE_TOOL_NAMES.includes(name as (typeof PENCIL_BASE_MIDDLEWARE_TOOL_NAMES)[number]) || name.startsWith(PENCIL_CORE_TOOL_PREFIX))
    )

    return {
      name: PENCIL_MIDDLEWARE_NAME,
      tools,
      wrapToolCall: async (request, handler) => {
        const changeSummary = readChangeSummaryMessage(request.toolCall.args)
        if (!changeSummary || !changeSummaryToolNames.has(request.toolCall.name)) {
          return handler(request)
        }
        const createdAt = new Date()
        await dispatchPencilToolStepEvent({ request, message: changeSummary, status: 'running', createdAt })
        try {
          const result = await handler(request)
          await dispatchPencilToolStepEvent({ request, message: changeSummary, status: 'success', createdAt })
          return result
        } catch (error) {
          await dispatchPencilToolStepEvent({
            request,
            message: changeSummary,
            status: 'fail',
            createdAt,
            error: getErrorMessage(error)
          })
          throw error
        }
      }
    }
  }

  private createCoreTool(scope: PencilScope, toolDef: ToolDef) {
    const renderGuidance = toolDef.name === 'render'
      ? ' For complex pages, first render an empty root frame, then render one major region at a time with parent_id and insert_index. Use replace_id to replace only a failed or incorrect region. If syntax fails and a renderDraftId is returned, call pencil_render_patch instead of resending the complete JSX.'
      : ''
    return tool(
      async (input: Record<string, unknown>) => {
        const documentId = typeof input.documentId === 'string' ? input.documentId : ''
        const changeSummary = typeof input.changeSummary === 'string' ? input.changeSummary : undefined
        // documentId and changeSummary belong to the plugin contract, not the upstream core tool.
        const args = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'documentId' && key !== 'changeSummary'))
        return stringifyAgentToolResult(
          summarizeCoreToolResult(
            await this.service.executeCoreTool(scope, {
              documentId,
              toolName: toolDef.name,
              args,
              changeSummary
            })
          )
        )
      },
      {
        name: `${PENCIL_CORE_TOOL_PREFIX}${toolDef.name}`,
        description: `${toolDef.description} Applies to the Pencil document identified by documentId. Use pencil_get_document first when modifying an existing user-edited document.${renderGuidance}`,
        schema: buildCoreToolSchema(toolDef),
        verboseParsingErrors: true
      }
    )
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): PencilScope {
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

/** Adds plugin-owned document context to a core tool schema while preserving upstream parameter constraints. */
function buildCoreToolSchema(toolDef: ToolDef) {
  const shape: Record<string, z.ZodTypeAny> = {
    documentId: z.string().min(1).describe('Existing Pencil document id. Prefer env.pencilDocumentId when present.'),
    changeSummary: z.string().optional().describe('Short user-facing summary for mutating Pencil tools.')
  }
  for (const [name, param] of Object.entries(toolDef.params)) {
    // Core path arguments address an in-memory graph; the plugin injects the current document graph instead.
    if (name === 'path') {
      continue
    }
    shape[name] = zodForParam(param)
  }
  return z.object(shape)
}

function zodForParam(param: ParamDef): z.ZodTypeAny {
  let schema: z.ZodTypeAny
  if (param.type === 'number') {
    let numberSchema = z.number()
    if (typeof param.min === 'number') {
      numberSchema = numberSchema.min(param.min)
    }
    if (typeof param.max === 'number') {
      numberSchema = numberSchema.max(param.max)
    }
    schema = numberSchema
  } else if (param.type === 'boolean') {
    schema = z.boolean()
  } else if (param.type === 'string[]') {
    schema = z.array(z.string())
  } else {
    schema = z.string()
    if (param.enum?.length) {
      schema = z.enum(param.enum as [string, ...string[]])
    }
  }
  schema = schema.describe(param.description)
  return param.required ? schema : schema.optional()
}

type ToolArgsValue = PencilJsonValue | object | null | undefined

function readChangeSummaryMessage(args: ToolArgsValue) {
  if (!isPlainObject(args)) {
    return undefined
  }
  const value = args.changeSummary
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

type PencilToolStepStatus = 'running' | 'success' | 'fail'

/** Mirrors long-running design operations into ChatKit without affecting tool success semantics. */
async function dispatchPencilToolStepEvent({
  request,
  message,
  status,
  createdAt,
  error
}: {
  request: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
  message: string
  status: PencilToolStepStatus
  createdAt: Date
  error?: string
}) {
  const toolCall = request.toolCall
  const runtimeMetadata = request.runtime && typeof request.runtime === 'object' ? Reflect.get(request.runtime, 'metadata') : undefined
  const metadata = isPlainObject(runtimeMetadata) ? runtimeMetadata : {}
  const toolName = toolCall.name
  const toolCallId = getToolCallDisplayId(toolCall)
  const toolset = readStringField(metadata, ['toolset']) ?? PENCIL_MIDDLEWARE_NAME
  const toolsetId = readStringField(metadata, ['toolsetId'])
  const title = readStringField(metadata, ['toolName', toolName]) ?? toolName
  const payload = {
    id: toolCallId,
    tool_call_id: toolCall.id,
    category: 'Tool',
    type: ChatMessageStepCategory.Program,
    toolset,
    ...(toolsetId ? { toolset_id: toolsetId } : {}),
    tool: toolName,
    title,
    message,
    status,
    created_date: createdAt,
    input: toolCall.args,
    ...(status === 'running' ? { end_date: null } : { end_date: new Date() }),
    ...(error ? { error } : {})
  }
  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, payload)
  } catch (dispatchError) {
    console.warn('[PencilMiddleware] dispatch tool message failed:', getErrorMessage(dispatchError))
  }
}

function getToolCallDisplayId(toolCall: { id?: string; name: string; args?: ToolArgsValue }) {
  if (typeof toolCall.id === 'string' && toolCall.id.trim()) {
    return toolCall.id.trim()
  }
  return `${toolCall.name}:${stringifyValue(toolCall.args)}`
}

function stringifyValue(value: ToolArgsValue) {
  if (typeof value === 'string') {
    return value
  }
  if (value == null) {
    return ''
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function readStringField(record: PencilJsonObject, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown error')
}

function isPlainObject(value: ToolArgsValue): value is PencilJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
