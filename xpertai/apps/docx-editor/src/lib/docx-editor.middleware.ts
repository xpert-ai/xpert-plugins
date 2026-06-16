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
  DOCX_EDITOR_AGENT_REVIEW_CAPABILITY,
  DOCX_EDITOR_FEATURE,
  DOCX_EDITOR_ICON,
  DOCX_EDITOR_MIDDLEWARE_NAME
} from './constants.js'
import { DocxEditorService } from './docx-editor.service.js'
import type { DocxEditorScope, DocxEditorToolName } from './types.js'

const documentToolBaseSchema = z.object({
  documentId: z.string().min(1).describe('DOCX Editor plugin document id. Open or create a document in the Workbench first.'),
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

const suggestChangeSchema = documentToolBaseSchema.extend({
  paraId: z.string().min(1),
  search: z.string().describe('Exact phrase to replace/delete. Use empty string to insert at paragraph end.'),
  replaceWith: z.string().describe('Replacement text. Use empty string to delete the searched phrase.')
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

const scrollSchema = documentToolBaseSchema.extend({
  paraId: z.string().min(1).describe('Stable paragraph id to reveal in the live Workbench editor.')
})

type ToolSchema = typeof documentToolBaseSchema

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
        this.createDocxTool(scope, 'docx_read_document', readDocumentSchema, 'Read paraId-tagged DOCX content. Call this before comments or tracked changes.'),
        this.createDocxTool(scope, 'docx_read_selection', readSelectionSchema, 'Read the live editor selection from the latest Workbench snapshot.'),
        this.createDocxTool(scope, 'docx_read_page', readPageSchema, 'Read one rendered page from the latest Workbench snapshot.'),
        this.createDocxTool(scope, 'docx_read_pages', readPagesSchema, 'Read a contiguous rendered page range from the latest Workbench snapshot.'),
        this.createDocxTool(scope, 'docx_find_text', findTextSchema, 'Find text and return stable paraId handles. Use the handle for comments or changes.'),
        this.createDocxTool(scope, 'docx_read_comments', readCommentsSchema, 'Read document comments. Prefer the latest Workbench snapshot when available.'),
        this.createDocxTool(scope, 'docx_read_changes', readChangesSchema, 'Read tracked changes. Prefer the latest Workbench snapshot when available.'),
        this.createDocxTool(scope, 'docx_add_comment', addCommentSchema, 'Add a review comment to a paragraph. Requires a paraId from docx_read_document or docx_find_text.'),
        this.createDocxTool(scope, 'docx_suggest_change', suggestChangeSchema, 'Create a tracked change suggestion. Requires a paraId from docx_read_document or docx_find_text.'),
        this.createDocxTool(scope, 'docx_apply_formatting', applyFormattingSchema, 'Apply direct character formatting to a paragraph or exact phrase.'),
        this.createDocxTool(scope, 'docx_set_paragraph_style', setParagraphStyleSchema, 'Apply an existing paragraph style id.'),
        this.createDocxTool(scope, 'docx_reply_comment', replyCommentSchema, 'Reply to an existing comment thread.'),
        this.createDocxTool(scope, 'docx_resolve_comment', resolveCommentSchema, 'Mark a comment as resolved.'),
        this.createDocxTool(scope, 'docx_scroll', scrollSchema, 'Queue a Workbench scroll to a paraId. This does not modify the document.')
      ]
    }
  }

  private createDocxTool(scope: DocxEditorScope, toolName: DocxEditorToolName, schema: ToolSchema, description: string) {
    return tool(
      async (input) =>
        JSON.stringify(
          await this.service.runAgentTool(scope, {
            documentId: input.documentId,
            toolName,
            input,
            author: input.author
          }),
          null,
          2
        ),
      {
        name: toolName,
        description,
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
