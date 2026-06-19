import { Injectable } from '@nestjs/common'
import { SystemMessage, ToolMessage } from '@langchain/core/messages'
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
  DOCX_EDITOR_AGENT_REVIEW_CAPABILITY,
  DOCX_EDITOR_FEATURE,
  DOCX_EDITOR_ICON,
  DOCX_EDITOR_MIDDLEWARE_NAME,
  DOCX_EDITOR_TOOL_NAMES
} from './constants.js'
import { DocxEditorService } from './docx-editor.service.js'
import type { DocxEditorScope, DocxEditorToolName } from './types.js'

const documentToolBaseSchema = z.object({
  documentId: z
    .string()
    .min(1)
    .optional()
    .describe('DOCX Editor plugin document id. Optional when a current DOCX Workbench document is open.'),
  author: z.string().optional().describe('Optional author name for comments and tracked changes.')
})

const readDocumentSchema = documentToolBaseSchema.extend({
  fromIndex: z.number().int().min(0).optional().describe('Optional starting paragraph index for a smaller read.'),
  toIndex: z.number().int().min(0).optional().describe('Optional ending paragraph index for a smaller read.')
})

const readSelectionSchema = documentToolBaseSchema

const readPageSchema = documentToolBaseSchema.extend({
  pageNumber: z.number().int().min(1).describe('1-indexed rendered page number from the live Workbench snapshot.')
})

const readPagesSchema = documentToolBaseSchema.extend({
  from: z.number().int().min(1).describe('First 1-indexed rendered page number.'),
  to: z.number().int().min(1).describe('Last 1-indexed rendered page number, inclusive.')
})

const findTextSchema = documentToolBaseSchema.extend({
  query: z.string().min(1).describe('Text to locate in the document. Returns stable paraId handles.'),
  caseSensitive: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional()
})

const readCommentsSchema = documentToolBaseSchema
const readChangesSchema = documentToolBaseSchema

const addCommentSchema = documentToolBaseSchema.extend({
  paraId: z.string().min(1).describe('Stable paragraph id returned by docx_read_document or docx_find_text.'),
  text: z.string().min(1).describe('Comment text to attach.'),
  search: z.string().optional().describe('Optional exact unique phrase inside the paragraph.')
})

const suggestChangeItemSchema = z.object({
  paraId: z.string().min(1).describe('Stable paragraph id returned by docx_read_document or docx_find_text.'),
  search: z
    .string()
    .describe('Exact plain text inside this paragraph. Use empty string only to insert at paragraph end.'),
  replaceWith: z.string().describe('Replacement text. Use empty string only to delete a non-empty searched phrase.')
})

const suggestChangeSchema = documentToolBaseSchema
  .extend({
    paraId: z
      .string()
      .min(1)
      .optional()
      .describe('Single-change mode paragraph id. Do not use together with changes[].'),
    search: z
      .string()
      .optional()
      .describe('Single-change mode exact paragraph plain text. Do not use together with changes[].'),
    replaceWith: z.string().optional().describe('Single-change mode replacement. Do not use together with changes[].'),
    changes: z
      .array(suggestChangeItemSchema)
      .min(1)
      .max(50)
      .optional()
      .describe('Batch mode for cross-paragraph edits. Each item targets exactly one paraId and exact paragraph plain text.')
  })
  .superRefine((value, ctx) => {
    const hasBatch = Array.isArray(value.changes)
    const hasSingle = value.paraId !== undefined || value.search !== undefined || value.replaceWith !== undefined
    if (hasBatch && hasSingle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use either paraId/search/replaceWith or changes[], not both.'
      })
      return
    }
    if (hasBatch) {
      return
    }

    for (const field of ['paraId', 'search', 'replaceWith'] as const) {
      if (typeof value[field] !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when changes[] is omitted.`
        })
      }
    }
    if (value.search === '' && value.replaceWith === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['replaceWith'],
        message: 'replaceWith must be non-empty when search is empty.'
      })
    }
  })

const applyFormattingSchema = documentToolBaseSchema.extend({
  paraId: z.string().min(1),
  search: z.string().optional(),
  marks: z
    .object({
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      underline: z.union([z.boolean(), z.object({ style: z.string().optional() })]).optional(),
      strike: z.boolean().optional(),
      color: z.object({ rgb: z.string().optional(), themeColor: z.string().optional() }).optional(),
      highlight: z.string().optional(),
      fontSize: z.number().positive().optional(),
      fontFamily: z.object({ ascii: z.string().optional(), hAnsi: z.string().optional() }).optional()
    })
    .describe('Character formatting marks. Omit keys to leave formatting unchanged; pass false to clear boolean marks.')
})

const setParagraphStyleSchema = documentToolBaseSchema.extend({
  paraId: z.string().min(1),
  styleId: z.string().min(1).describe('Existing paragraph style id, such as Heading1, Heading2, Title, Quote, or Normal.')
})

const replyCommentSchema = documentToolBaseSchema.extend({
  commentId: z.number().int().min(0),
  text: z.string().min(1)
})

const resolveCommentSchema = documentToolBaseSchema.extend({
  commentId: z.number().int().min(0)
})

const resolveAllCommentsSchema = documentToolBaseSchema

const deleteCommentSchema = documentToolBaseSchema.extend({
  commentId: z.number().int().min(0).describe('Comment id returned by docx_read_comments.')
})

const deleteAllCommentsSchema = documentToolBaseSchema

const changeTargetSchema = documentToolBaseSchema.extend({
  changeId: z.number().int().min(0).describe('Tracked change id returned by docx_read_changes.'),
  noteId: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional note id when the change lives inside a footnote or endnote.'),
  noteType: z
    .enum(['footnote', 'endnote'])
    .optional()
    .describe('Optional note type when the change lives inside a footnote or endnote.')
})

const allChangesSchema = documentToolBaseSchema.extend({
  includeFootnotes: z.boolean().optional().describe('Also process tracked changes in footnotes. Default false.'),
  includeEndnotes: z.boolean().optional().describe('Also process tracked changes in endnotes. Default false.')
})

const scrollSchema = documentToolBaseSchema.extend({
  paraId: z.string().min(1).describe('Stable paragraph id to reveal in the live Workbench editor.')
})

type ToolSchema = z.ZodTypeAny

type RuntimeContextRecord = Record<string, unknown>

type CurrentDocxWorkbenchDocument = {
  documentId: string
  title?: string
  fileName?: string
  currentVersionId?: string
  currentVersionNumber?: number
  workspaceFilePath?: string
  dirty?: boolean
  mode?: string
}

const DOCX_TOOL_NAMES = new Set<string>(DOCX_EDITOR_TOOL_NAMES)
const DOCUMENT_ID_FALLBACK_HINT = ' If a current DOCX Workbench document is open, documentId may be omitted.'
const MISSING_DOCUMENT_CONTEXT_MESSAGE =
  '未找到当前 Workbench 文档，请先打开文档或显式传 documentId。'
@Injectable()
@AgentMiddlewareStrategy(DOCX_EDITOR_MIDDLEWARE_NAME)
export class DocxEditorMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: DOCX_EDITOR_MIDDLEWARE_NAME,
    label: {
      en_US: 'DOCX Editor',
      zh_Hans: 'DOCX 文档编辑器'
    },
    icon: {
      type: 'svg',
      value: DOCX_EDITOR_ICON
    },
    description: {
      en_US: 'Read DOCX documents, add comments, suggest tracked changes, apply formatting, and coordinate live Workbench actions.',
      zh_Hans: '读取 DOCX 文档，添加批注，提出修订建议，应用格式，并协调 Workbench 内的实时操作。'
    },
    features: [DOCX_EDITOR_FEATURE, DOCX_EDITOR_AGENT_REVIEW_CAPABILITY],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: DocxEditorService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: DOCX_EDITOR_MIDDLEWARE_NAME,
      tools: [
        this.createDocxTool(
          scope,
          'docx_read_document',
          readDocumentSchema,
          'Read paraId-tagged DOCX content. Results may be compacted; use fromIndex/toIndex from the response to continue reading. Call this before comments or tracked changes.'
        ),
        this.createDocxTool(scope, 'docx_read_selection', readSelectionSchema, 'Read the live editor selection from the latest Workbench snapshot. Large text fields are previewed.'),
        this.createDocxTool(scope, 'docx_read_page', readPageSchema, 'Read one rendered page from the latest Workbench snapshot. Large page text may be previewed.'),
        this.createDocxTool(scope, 'docx_read_pages', readPagesSchema, 'Read a contiguous rendered page range from the latest Workbench snapshot. Use a smaller range if the result is truncated.'),
        this.createDocxTool(scope, 'docx_find_text', findTextSchema, 'Find text and return stable paraId handles. Results are compacted; refine the query or read around returned paraIds for more context.'),
        this.createDocxTool(scope, 'docx_read_comments', readCommentsSchema, 'Read document comments as compact items. Prefer the latest Workbench snapshot when available.'),
        this.createDocxTool(scope, 'docx_read_changes', readChangesSchema, 'Read tracked changes as compact items. Prefer the latest Workbench snapshot when available.'),
        this.createDocxTool(scope, 'docx_add_comment', addCommentSchema, 'Add a review comment to a paragraph. Requires a paraId from docx_read_document or docx_find_text.'),
        this.createDocxTool(
          scope,
          'docx_suggest_change',
          suggestChangeSchema,
          [
            'Create tracked change suggestions with exact paragraph plain-text matching.',
            'For one paragraph, pass paraId/search/replaceWith.',
            'For selected text spanning multiple paragraphs, pass changes[] with one item per paraId.',
            'Visual indentation, numbering, and bullet glyphs are often formatting, not paragraph plain text; use docx_read_document or docx_find_text output for search.'
          ].join(' ')
        ),
        this.createDocxTool(scope, 'docx_apply_formatting', applyFormattingSchema, 'Apply direct character formatting to a paragraph or exact phrase.'),
        this.createDocxTool(scope, 'docx_set_paragraph_style', setParagraphStyleSchema, 'Apply an existing paragraph style id.'),
        this.createDocxTool(scope, 'docx_reply_comment', replyCommentSchema, 'Reply to an existing comment thread.'),
        this.createDocxTool(scope, 'docx_resolve_comment', resolveCommentSchema, 'Mark a comment as resolved.'),
        this.createDocxTool(scope, 'docx_resolve_all_comments', resolveAllCommentsSchema, 'Mark all unresolved comments as resolved.'),
        this.createDocxTool(scope, 'docx_delete_comment', deleteCommentSchema, 'Delete one comment by id. Deleting a top-level comment also removes its replies.'),
        this.createDocxTool(scope, 'docx_delete_all_comments', deleteAllCommentsSchema, 'Delete all comments from the current document version.'),
        this.createDocxTool(scope, 'docx_accept_change', changeTargetSchema, 'Accept one tracked change by changeId. If it is in a footnote or endnote, include noteId and noteType from docx_read_changes.'),
        this.createDocxTool(scope, 'docx_reject_change', changeTargetSchema, 'Reject one tracked change by changeId. If it is in a footnote or endnote, include noteId and noteType from docx_read_changes.'),
        this.createDocxTool(scope, 'docx_accept_all_changes', allChangesSchema, 'Accept all tracked changes in the document body. Set includeFootnotes/includeEndnotes to include note bodies.'),
        this.createDocxTool(scope, 'docx_reject_all_changes', allChangesSchema, 'Reject all tracked changes in the document body. Set includeFootnotes/includeEndnotes to include note bodies.'),
        this.createDocxTool(scope, 'docx_scroll', scrollSchema, 'Queue a Workbench scroll to a paraId. This does not modify the document.')
      ],
      wrapModelCall: (request, handler) => {
        const currentDocument = resolveCurrentWorkbenchDocument(request.runtime)
        if (!currentDocument?.documentId) {
          return handler(request)
        }

        return handler({
          ...request,
          systemMessage: appendSystemMessage(request.systemMessage, buildCurrentDocumentSystemPrompt(currentDocument))
        })
      },
      wrapToolCall: (request, handler) => {
        if (!DOCX_TOOL_NAMES.has(request.toolCall.name)) {
          return handler(request)
        }

        const args = isRecord(request.toolCall.args) ? request.toolCall.args : {}
        if (getString(args['documentId'])) {
          return handler(request)
        }

        const currentDocument = resolveCurrentWorkbenchDocument(request.runtime)
        if (!currentDocument?.documentId) {
          return new ToolMessage({
            content: MISSING_DOCUMENT_CONTEXT_MESSAGE,
            tool_call_id: request.toolCall.id ?? 'unknown',
            name: request.toolCall.name,
            status: 'error'
          })
        }

        return handler({
          ...request,
          toolCall: {
            ...request.toolCall,
            args: {
              ...args,
              documentId: currentDocument.documentId
            }
          }
        })
      }
    }
  }

  private createDocxTool(scope: DocxEditorScope, toolName: DocxEditorToolName, schema: ToolSchema, description: string) {
    return tool(
      async (input) => {
        return JSON.stringify(
          await this.service.runAgentTool(scope, {
            documentId: input.documentId ?? '',
            toolName,
            input,
            author: input.author
          }),
          null,
          2
        )
      },
      {
        name: toolName,
        description: `${description}${DOCUMENT_ID_FALLBACK_HINT}`,
        schema
      }
    )
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): DocxEditorScope {
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

function appendSystemMessage(systemMessage: unknown, addition: string) {
  const content =
    typeof systemMessage === 'string'
      ? systemMessage
      : systemMessage instanceof SystemMessage && typeof systemMessage.content === 'string'
        ? systemMessage.content
        : isRecord(systemMessage) && typeof systemMessage['content'] === 'string'
          ? systemMessage['content']
          : ''

  return new SystemMessage([content, addition].filter(Boolean).join('\n\n'))
}

function buildCurrentDocumentSystemPrompt(document: CurrentDocxWorkbenchDocument) {
  const lines = [
    'Current DOCX Workbench document context:',
    `- documentId: ${document.documentId}`,
    document.title ? `- title: ${document.title}` : null,
    document.fileName ? `- fileName: ${document.fileName}` : null,
    document.currentVersionId ? `- currentVersionId: ${document.currentVersionId}` : null,
    document.currentVersionNumber !== undefined ? `- currentVersionNumber: ${document.currentVersionNumber}` : null,
    document.workspaceFilePath ? `- workspaceFilePath: ${document.workspaceFilePath}` : null,
    `- dirty: ${document.dirty === true ? 'true' : 'false'}`,
    document.mode ? `- mode: ${document.mode}` : null,
    document.mode ? `- modeGuidance: ${describeWorkbenchModeGuidance(document.mode)}` : null,
    'DOCX Editor tools may omit documentId when operating on this current Workbench document.'
  ]

  return lines.filter(Boolean).join('\n')
}

function describeWorkbenchModeGuidance(mode: string) {
  switch (mode) {
    case 'suggesting':
      return 'The Workbench is in suggesting mode. Prefer docx_suggest_change for content edits so the user can review tracked changes.'
    case 'editing':
      return 'The Workbench is in editing mode. Direct modification tools are acceptable when they exist; text replacements currently use docx_suggest_change because that is the available text-edit tool.'
    case 'viewing':
      return 'The Workbench is in viewing mode. Treat the document as read-only unless the user explicitly asks to modify it.'
    default:
      return 'Use the Workbench mode as a hint for whether to propose tracked changes or direct modifications.'
  }
}

function resolveCurrentWorkbenchDocument(runtime: unknown): CurrentDocxWorkbenchDocument | null {
  const runtimeContext = resolveRuntimeContext(runtime)
  const docxEditorContext = getRecord(runtimeContext, 'docxEditor')
  const currentDocument = getRecord(docxEditorContext, 'currentDocument')
  const env = getRecord(runtimeContext, 'env')
  const documentId = getString(currentDocument?.['documentId']) ?? getString(env?.['docxEditorDocumentId'])

  if (!documentId) {
    return null
  }

  return {
    documentId,
    title: getString(currentDocument?.['title']),
    fileName: getString(currentDocument?.['fileName']),
    currentVersionId: getString(currentDocument?.['currentVersionId']) ?? getString(env?.['docxEditorVersionId']),
    currentVersionNumber: getNumber(currentDocument?.['currentVersionNumber']),
    workspaceFilePath:
      getString(currentDocument?.['workspaceFilePath']) ?? getString(env?.['docxEditorWorkspaceFilePath']),
    dirty: currentDocument?.['dirty'] === true,
    mode: getString(currentDocument?.['mode']) ?? getString(env?.['docxEditorMode'])
  }
}

function resolveRuntimeContext(runtime: unknown): RuntimeContextRecord | null {
  if (!isRecord(runtime)) {
    return null
  }

  const directContext = getRecord(runtime, 'context')
  if (directContext) {
    return directContext
  }

  return getRecord(getRecord(runtime, 'configurable'), 'context')
}

function getRecord(record: unknown, key: string): RuntimeContextRecord | null {
  if (!isRecord(record)) {
    return null
  }

  const value = record[key]
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is RuntimeContextRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
