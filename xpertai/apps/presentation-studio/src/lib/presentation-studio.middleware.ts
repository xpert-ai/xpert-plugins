import { Injectable } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, type TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  RequestContext,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type WorkspaceFileLocator,
  type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  PRESENTATION_EXPORT_CAPABILITY,
  PRESENTATION_EXPORT_KINDS,
  PRESENTATION_FEATURE,
  PRESENTATION_GENERATION_CAPABILITY,
  PRESENTATION_ICON,
  PRESENTATION_MIDDLEWARE_NAME,
  PRESENTATION_MUTATION_TOOL_NAMES,
  PRESENTATION_SLIDE_STATUSES,
  PRESENTATION_STATUSES,
  PRESENTATION_THEME_PACKS,
  PRESENTATION_TOOL_NAMES,
  PRESENTATION_WORKBENCH_CAPABILITY
} from './constants.js'
import { PresentationCatalogService } from './presentation-catalog.service.js'
import { PresentationDebugService } from './presentation-debug.service.js'
import { PresentationStudioService } from './presentation-studio.service.js'
import {
  PRESENTATION_SHARE_ACCESS_MODES,
  type PresentationAwarenessV2,
  type PresentationJsonObject,
  type PresentationJsonValue,
  type PresentationScope,
  type PresentationWorkbenchAgentContext
} from './types.js'

const themeSchema = z.enum(PRESENTATION_THEME_PACKS)
const statusSchema = z.enum(PRESENTATION_STATUSES)
const slideStatusSchema = z.enum(PRESENTATION_SLIDE_STATUSES)
const exportKindSchema = z.enum(PRESENTATION_EXPORT_KINDS)
const jsonValueSchema: z.ZodType<PresentationJsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
)
const jsonObjectSchema: z.ZodType<PresentationJsonObject> = z.record(jsonValueSchema)

const createDeckSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  audience: z.string().optional(),
  owner: z.string().optional(),
  themePack: themeSchema,
  pageCount: z.number().int().min(3).max(30)
})
const searchDecksSchema = z.object({
  status: statusSchema.optional(), search: z.string().optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(100).optional()
})
const getDeckSchema = z.object({ deckId: z.string().uuid(), includeSlides: z.boolean().optional() })
const searchLayoutsSchema = z.object({
  themePack: themeSchema, role: z.string().optional(), keyword: z.string().optional(), needsMedia: z.boolean().optional(),
  mediaCount: z.number().int().min(1).optional(), mediaKind: z.enum(['image', 'video', 'mixed']).optional(),
  requireInitialMedia: z.boolean().optional(), limit: z.number().int().min(1).max(12).optional(), seed: z.string().optional()
})
const inspectLayoutsSchema = z.object({ layouts: z.array(z.string().min(1)).min(1).max(8) })
const addSlideSchema = z.object({
  deckId: z.string().uuid(), position: z.number().int().min(0).optional(), layout: z.string().min(1), props: jsonObjectSchema,
  changeSummary: z.string().optional()
})
const patchSlideSchema = z.object({
  deckId: z.string().uuid(), slideId: z.string().uuid(), layout: z.string().optional(), status: slideStatusSchema.optional(),
  propsPatch: jsonObjectSchema.optional(), textPatch: z.record(z.string().max(5000)).optional(),
  expectedRevision: z.number().int().min(0).optional(), changeSummary: z.string().optional()
})
const reorderSchema = z.object({
  deckId: z.string().uuid(), slideIds: z.array(z.string().uuid()).min(1), expectedRevision: z.number().int().min(0)
})
const fileRefSchema = z.object({
  source: z.literal('platform.workspace.files'), filePath: z.string().min(1), workspacePath: z.string().min(1),
  catalog: z.enum(['projects', 'users', 'knowledges', 'skills', 'xperts']).optional(), scopeId: z.string().optional(),
  tenantId: z.string().optional(), userId: z.string().optional(), projectId: z.string().optional(), xpertId: z.string().optional(),
  isolateByUser: z.boolean().optional(), originalName: z.string().optional(), name: z.string().optional(), mimeType: z.string().optional(), size: z.number().optional()
})
const addAssetSchema = z.object({
  deckId: z.string().uuid(), role: z.string().min(1), slideId: z.string().uuid().optional(), evidence: jsonValueSchema.optional(),
  path: z.string().optional(), filePath: z.string().optional(), workspacePath: z.string().optional(), fileRef: fileRefSchema.optional(),
  originalName: z.string().optional(), name: z.string().optional(), mimeType: z.string().optional(), size: z.number().int().positive().optional()
})
const finalizeSchema = z.object({
  deckId: z.string().uuid(), expectedRevision: z.number().int().min(0), changeSummary: z.string().optional()
})
const requestExportSchema = z.object({
  deckId: z.string().uuid(), versionId: z.string().uuid().optional(), kind: exportKindSchema, fileName: z.string().optional(), expectedRevision: z.number().int().min(0).optional()
})
const getExportSchema = z.object({ exportId: z.string().uuid() })
const shareHtmlSchema = z.object({
  deckId: z.string().uuid(),
  accessMode: z.enum(PRESENTATION_SHARE_ACCESS_MODES).optional()
})
const revokeHtmlShareSchema = z.object({ deckId: z.string().uuid() })
const updateStatusSchema = z.object({ deckId: z.string().uuid(), status: statusSchema, reason: z.string().optional() })
const failureSchema = z.object({
  deckId: z.string().uuid().optional(), operation: z.string().min(1), errorMessage: z.string().min(1), recoverable: z.boolean().optional(), evidence: jsonValueSchema.optional()
})
const AGENT_PRESENCE_TOOL_NAMES = new Set<string>(PRESENTATION_TOOL_NAMES)
const CHANGE_SUMMARY_EVENT_TOOL_NAMES = new Set<string>([
  'presentation_add_slide',
  'presentation_patch_slide',
  'presentation_finalize_deck'
])
const AGENT_EDITING_TOOL_NAMES = new Set<string>([
  'presentation_add_slide',
  'presentation_patch_slide',
  'presentation_reorder_slides',
  'presentation_add_asset',
  'presentation_update_status'
])
const STUDIO_ELEMENT_POSITIONS_KEY = '__studioElementPositions'
const TOOL_OPERATION_LABELS: Record<string, string> = {
  presentation_create_deck: 'Creating presentation',
  presentation_search_decks: 'Searching presentations',
  presentation_get_deck: 'Reading presentation',
  presentation_search_layouts: 'Searching layouts',
  presentation_inspect_layouts: 'Inspecting layouts',
  presentation_add_slide: 'Adding slide',
  presentation_patch_slide: 'Editing slide',
  presentation_reorder_slides: 'Reordering slides',
  presentation_add_asset: 'Adding media',
  presentation_finalize_deck: 'Saving version',
  presentation_request_export: 'Requesting export',
  presentation_get_export: 'Checking export',
  presentation_share_html: 'Sharing presentation',
  presentation_revoke_html_share: 'Revoking presentation share',
  presentation_update_status: 'Updating status'
}

@Injectable()
@AgentMiddlewareStrategy(PRESENTATION_MIDDLEWARE_NAME)
export class PresentationStudioMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: PRESENTATION_MIDDLEWARE_NAME,
    label: { en_US: 'Presentation Studio', zh_Hans: '演示文稿工作室' },
    description: {
      en_US: 'Create, validate, collaborate on, version, and export DashiAI presentations.',
      zh_Hans: '创建、校验、协作、版本化并导出 DashiAI 演示文稿。'
    },
    icon: { type: 'svg', value: PRESENTATION_ICON, color: '#7c3aed' },
    features: [PRESENTATION_FEATURE, PRESENTATION_GENERATION_CAPABILITY, PRESENTATION_WORKBENCH_CAPABILITY, PRESENTATION_EXPORT_CAPABILITY],
    configSchema: { type: 'object', properties: {} }
  }

  constructor(
    private readonly service: PresentationStudioService,
    private readonly catalog: PresentationCatalogService,
    private readonly debugLogger: PresentationDebugService
  ) {}

  async createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): Promise<AgentMiddleware> {
    const baseScope = scopeFromContext(context)
    const currentWorkbenchContext = await this.service.getWorkbenchAgentContext(baseScope).catch(() => null)
    const scope = {
      ...baseScope,
      assistantDisplayName: currentWorkbenchContext?.assistantDisplayName ?? baseScope.assistantDisplayName
    }
    const currentDeckHint = currentDeckToolHint(currentWorkbenchContext)
    return {
      name: PRESENTATION_MIDDLEWARE_NAME,
      tools: [
        tool((input) => compact(this.service.createDeck(scope, input)), {
          name: 'presentation_create_deck',
          description: toolDescription(currentDeckHint, 'Create a new presentation deck before searching layouts or adding slides. Use this only when the user explicitly asks for a new deck or there is no current Presentation Studio deck to modify. Use one themePack for the whole deck.'),
          schema: createDeckSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.service.searchDecks(scope, input)), {
          name: 'presentation_search_decks', description: toolDescription(currentDeckHint, 'Search presentation decks in the current scoped workspace.'), schema: searchDecksSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.service.getDeck(scope, input.deckId, input.includeSlides !== false)), {
          name: 'presentation_get_deck', description: toolDescription(currentDeckHint, 'Read deck revision, immutable versions, exports, assets, and optionally slide content. Prefer the current deckId from context when the user says current deck or this presentation.'), schema: getDeckSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.catalog.searchLayouts({
          theme: input.themePack, role: input.role, keyword: input.keyword, needsMedia: input.needsMedia,
          mediaCount: input.mediaCount, mediaKind: input.mediaKind, requireInitialMedia: input.requireInitialMedia, limit: input.limit, seed: input.seed
        })), {
          name: 'presentation_search_layouts', description: toolDescription(currentDeckHint, 'Search up to 12 layouts by role, keyword, theme, and media requirements. Call before inspecting layouts. Use the current themePack from context when modifying the current deck unless the user explicitly asks for a different new deck.'), schema: searchLayoutsSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.catalog.inspectLayouts(input.layouts)), {
          name: 'presentation_inspect_layouts', description: toolDescription(currentDeckHint, 'HARD LIMIT: inspect 1-8 candidate layouts per call. If more than 8 layouts are selected, split them into sequential batches of at most 8. Returns fill plans, copy budgets, controls, prop shapes, media slots, and strict array-item authoring contracts. This is a read-only planning tool: it does not change the deck, theme, active slide, or Workbench UI.'), schema: inspectLayoutsSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.service.addSlide(scope, input)), {
          name: 'presentation_add_slide', description: toolDescription(currentDeckHint, 'Add one slide to an existing deck after inspecting its layout contract. Construct nested arrays from authoringContract.arrayItemContracts exactly: array items may contain only allowedKeys, and top-level fields such as desc or en must not be copied into array items unless explicitly allowed. Each active slide must use a unique layout. Prefer the current deckId from context when the user asks to continue or modify the current presentation.'), schema: addSlideSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.service.patchSlide(scope, input)), {
          name: 'presentation_patch_slide', description: toolDescription(currentDeckHint, 'Patch one existing slide at field level, including plain-text editor IDs, props, layout within the same theme, or status. Arrays are atomically replaced; layout changes and deletion require expectedRevision. Prefer current deckId/slideId when the user asks to edit the current slide.'), schema: patchSlideSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.service.reorderSlides(scope, input.deckId, input.slideIds, input.expectedRevision)), {
          name: 'presentation_reorder_slides', description: toolDescription(currentDeckHint, 'Replace the complete slide order. Pass every slide id exactly once and the current expectedRevision.'), schema: reorderSchema, verboseParsingErrors: true
        }),
        tool(async (input) => {
          const files = context.runtime.capabilities?.require(WorkspaceFilesRuntimeCapability)
          if (!files) throw new Error('Platform workspace files capability is not available.')
          const locator = assetLocator(input)
          const file = await files.readRuntimeBuffer(locator)
          return compact(this.service.registerRuntimeAsset(scope, {
            deckId: input.deckId, role: input.role, slideId: input.slideId, evidence: input.evidence
          }, file))
        }, {
          name: 'presentation_add_asset', description: toolDescription(currentDeckHint, 'Register a workspace image or video and return an asset:// reference for slide props. Never pass raw base64. Prefer the current deckId/slideId from context when the user adds media to the current presentation.'), schema: addAssetSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.service.finalizeDeck(scope, input.deckId, input.expectedRevision, 'agent', input.changeSummary)), {
          name: 'presentation_finalize_deck', description: toolDescription(currentDeckHint, 'Validate copy, layout, media, page count, theme, and defaults, then create an immutable version. Call only when the user explicitly asks to save/finalize a version or after all slides are complete.'), schema: finalizeSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.service.requestExport(scope, input)), {
          name: 'presentation_request_export', description: toolDescription(currentDeckHint, 'Queue a reproducible HTML, PDF, or PPTX export. If versionId is omitted, snapshot the current working revision for export without creating a version; expectedRevision is required.'), schema: requestExportSchema, verboseParsingErrors: true
        }),
        tool(async (input) => {
          const result = await this.service.getExport(scope, input.exportId)
          const text = JSON.stringify(result)
          if (result.status !== 'succeeded' || !result.workspacePath) return [text, { files: [] }]
          return [text, { files: [{
            fileName: result.fileName ?? `presentation.${result.kind}`,
            filePath: result.workspacePath,
            fileUrl: result.fileUrl ?? '',
            mimeType: result.mimeType ?? 'application/octet-stream',
            extension: result.kind
          }] }]
        }, {
          name: 'presentation_get_export', description: toolDescription(currentDeckHint, 'Get export progress and return the generated workspace file artifact when it succeeds.'),
          schema: getExportSchema, responseFormat: 'content_and_artifact', verboseParsingErrors: true
        }),
        tool(async (input) => {
          const result = await this.service.shareDeckHtmlExport(scope, {
            deckId: input.deckId,
            versionMode: 'version',
            accessMode: input.accessMode,
            allowDownload: false,
            actor: 'agent'
          })
          const shareUrl = 'publicUrl' in result && typeof result.publicUrl === 'string'
            ? result.publicUrl
            : 'shareUrl' in result && typeof result.shareUrl === 'string'
              ? result.shareUrl
              : undefined
          return shareUrl ? { shareUrl } : { status: 'pending' as const, exportId: result.exportId }
        }, {
          name: 'presentation_share_html',
          description: toolDescription(currentDeckHint, 'Create or reuse a fixed-version interactive HTML share link only when the user explicitly asks to share the presentation. Omit accessMode to use the organization policy default; requested modes are validated against that policy. The link never enables download. If pending, poll presentation_get_export with exportId and call this tool again after the HTML export succeeds. Returns only shareUrl when ready.'),
          schema: shareHtmlSchema,
          verboseParsingErrors: true
        }),
        tool((input) => this.service.revokeDeckHtmlShare(scope, input.deckId, 'agent'), {
          name: 'presentation_revoke_html_share',
          description: toolDescription(currentDeckHint, 'Revoke the active interactive HTML share link for this presentation when the user explicitly asks to stop sharing it.'),
          schema: revokeHtmlShareSchema,
          verboseParsingErrors: true
        }),
        tool((input) => compact(this.service.updateStatus(scope, input.deckId, input.status, input.reason)), {
          name: 'presentation_update_status', description: toolDescription(currentDeckHint, 'Update a deck to draft, reviewed, archived, or failed after user confirmation.'), schema: updateStatusSchema, verboseParsingErrors: true
        }),
        tool((input) => compact(this.service.reportFailure(scope, input)), {
          name: 'presentation_report_failure', description: toolDescription(currentDeckHint, 'Record an unrecoverable or recoverable presentation workflow failure with compact evidence.'), schema: failureSchema, verboseParsingErrors: true
        })
      ],
      wrapToolCall: async (request, handler) => {
        const startedAt = Date.now()
        const createdAt = new Date(startedAt)
        const toolName = request.toolCall.name
        const changeSummary = CHANGE_SUMMARY_EVENT_TOOL_NAMES.has(toolName)
          ? readChangeSummaryMessage(request.toolCall.args)
          : undefined
        const target = await resolveAgentPresenceTarget(this.service, scope, toolName, request.toolCall.args)
        const actor = target ? this.service.createAgentCollabActor(target.scope, target.deckId) : null
        this.debugLogger.info('tool.started', { toolName })
        if (target && actor) {
          await publishAgentPresence(this.service, target.scope, target, actor, AGENT_EDITING_TOOL_NAMES.has(toolName) ? 'editing' : 'thinking')
        }
        if (changeSummary) {
          await dispatchPresentationToolStepEvent({ request, message: changeSummary, status: 'running', createdAt })
        }
        try {
          const result = await handler(request)
          if (target && actor) await publishAgentPresence(this.service, target.scope, target, actor, 'done')
          if (changeSummary) {
            await dispatchPresentationToolStepEvent({
              request,
              message: changeSummary,
              status: 'success',
              createdAt,
              output: readToolMessageOutput(result)
            })
          }
          this.debugLogger.info('tool.completed', { toolName, durationMs: Date.now() - startedAt })
          return result
        } catch (error) {
          if (target && actor) await publishAgentPresence(this.service, target.scope, target, actor, 'failed')
          if (changeSummary) {
            await dispatchPresentationToolStepEvent({
              request,
              message: changeSummary,
              status: 'fail',
              createdAt,
              error: error instanceof Error ? error.message : 'Tool execution failed.'
            })
          }
          this.debugLogger.error('tool.failed', {
            toolName,
            durationMs: Date.now() - startedAt,
            message: error instanceof Error ? error.message : 'Tool execution failed.'
          })
          throw error
        }
      }
    }
  }
}

function readChangeSummaryMessage(args: unknown) {
  const value = objectFromUnknown(args).changeSummary
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

type PresentationToolStepStatus = 'running' | 'success' | 'fail'

async function dispatchPresentationToolStepEvent({
  request,
  message,
  status,
  createdAt,
  output,
  error
}: {
  request: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
  message: string
  status: PresentationToolStepStatus
  createdAt: Date
  output?: string
  error?: string
}) {
  const toolCall = request.toolCall
  const runtimeMetadata = request.runtime && typeof request.runtime === 'object'
    ? Reflect.get(request.runtime, 'metadata')
    : undefined
  const metadata = objectFromUnknown(runtimeMetadata)
  const toolName = toolCall.name
  const toolCallId = stringValue(toolCall.id) ?? `${toolName}:${stableStringify(toolCall.args)}`
  const toolset = stringValue(metadata.toolset) ?? PRESENTATION_MIDDLEWARE_NAME
  const toolsetId = stringValue(metadata.toolsetId)
  const title = stringValue(metadata.toolName) ?? toolName
  const event = {
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
    ...(output !== undefined ? { output } : {}),
    ...(error ? { error } : {})
  }

  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, event)
  } catch {
    // Tool timeline events are best-effort and must never fail the underlying mutation.
  }
}

function readToolMessageOutput(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const content = Reflect.get(value, 'content')
    if (typeof content === 'string') return content
  }
  return stableStringify(value)
}

function stableStringify(value: unknown) {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value ?? '')
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): PresentationScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    xpertId: context.xpertId ?? null,
    assistantId: context.xpertId ?? null,
    assistantDisplayName: stringValue(context.node.title) ?? null,
    agentKey: context.agentKey ?? null,
    conversationId: context.conversationId ?? null
  }
}

type AgentPresenceTarget = {
  deckId: string
  scope: PresentationScope
  toolName: string
  operationLabel: string
  slideId?: string
  focus?: PresentationAwarenessV2['focus']
}

async function publishAgentPresence(
  service: PresentationStudioService,
  scope: PresentationScope,
  target: AgentPresenceTarget,
  actor: ReturnType<PresentationStudioService['createAgentCollabActor']>,
  status: NonNullable<PresentationAwarenessV2['status']>
) {
  try {
    await service.publishAgentAwareness(scope, target.deckId, actor, {
      protocolVersion: 2,
      mode: 'edit',
      status,
      toolName: target.toolName,
      operationLabel: target.operationLabel,
      slideId: target.slideId ?? null,
      focus: target.focus ?? null
    })
  } catch {
    // Agent presence is best-effort runtime state and must never fail the tool call.
  }
}

async function resolveAgentPresenceTarget(
  service: PresentationStudioService,
  scope: PresentationScope,
  toolName: string,
  rawArgs: unknown
): Promise<AgentPresenceTarget | null> {
  const explicit = agentPresenceTarget(scope, toolName, rawArgs)
  if (explicit) return explicit
  if (!AGENT_PRESENCE_TOOL_NAMES.has(toolName)) return null
  const currentContext = await service.getWorkbenchAgentContext(scope).catch(() => null)
  if (!currentContext?.deckId) return null
  const scoped = { ...scope, assistantDisplayName: currentContext.assistantDisplayName ?? scope.assistantDisplayName }
  return {
    deckId: currentContext.deckId,
    scope: scoped,
    toolName,
    operationLabel: TOOL_OPERATION_LABELS[toolName] ?? toolName,
    ...(currentContext.slideId ? { slideId: currentContext.slideId } : {}),
    focus: currentContext.slideId ? { kind: 'slide' } : undefined
  }
}

function agentPresenceTarget(scope: PresentationScope, toolName: string, rawArgs: unknown): AgentPresenceTarget | null {
  if (!AGENT_PRESENCE_TOOL_NAMES.has(toolName)) return null
  const args = objectFromUnknown(rawArgs)
  const deckId = stringValue(args.deckId)
  if (!deckId) return null
  const slideId = stringValue(args.slideId)
  const focus = focusFromToolArgs(toolName, args, slideId)
  return {
    deckId,
    scope,
    toolName,
    operationLabel: TOOL_OPERATION_LABELS[toolName] ?? toolName,
    ...(slideId ? { slideId } : {}),
    focus
  }
}

function focusFromToolArgs(toolName: string, args: Record<string, unknown>, slideId?: string): PresentationAwarenessV2['focus'] | undefined {
  const textPatch = objectFromUnknown(args.textPatch)
  const textKey = Object.keys(textPatch).find((key) => key.startsWith('text:'))
  if (textKey) return { kind: 'text', key: textKey }

  const propsPatch = objectFromUnknown(args.propsPatch)
  const movedElements = objectFromUnknown(propsPatch[STUDIO_ELEMENT_POSITIONS_KEY])
  const movedElementKey = Object.keys(movedElements).find(Boolean)
  if (movedElementKey) return { kind: 'element', key: movedElementKey }

  const propKey = Object.keys(propsPatch).find((key) => key !== STUDIO_ELEMENT_POSITIONS_KEY)
  if (propKey) return { kind: 'control', key: propKey }

  if (toolName === 'presentation_add_asset') {
    const role = stringValue(args.role)
    return role ? { kind: 'control', key: role } : slideId ? { kind: 'slide' } : undefined
  }

  return slideId ? { kind: 'slide' } : undefined
}

function objectFromUnknown(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function currentDeckToolHint(context: PresentationWorkbenchAgentContext | null) {
  if (!context?.deckId) return ''
  const parts = [
    `currentDeckId=${context.deckId}`,
    context.slideId ? `currentSlideId=${context.slideId}` : '',
    context.deckTitle ? `currentDeckTitle=${context.deckTitle}` : '',
    context.themePack ? `currentThemePack=${context.themePack}` : '',
    typeof context.activeIndex === 'number' && typeof context.slideCount === 'number' ? `currentSlide=${context.activeIndex + 1}/${context.slideCount}` : '',
    context.slideLayout ? `currentSlideLayout=${context.slideLayout}` : ''
  ].filter(Boolean)
  return `Current Presentation Studio context: ${parts.join(', ')}. When the user asks to modify, continue, export, save, or edit the current presentation, use this currentDeckId/currentSlideId and do not create a new deck unless the user explicitly requests a new presentation.`
}

function toolDescription(contextHint: string, description: string) {
  return contextHint ? `${contextHint}\n\n${description}` : description
}

function assetLocator(input: z.infer<typeof addAssetSchema>): WorkspaceFileLocator {
  if (input.fileRef) return input.fileRef as WorkspacePortableFileReference
  const path = input.path ?? input.filePath ?? input.workspacePath
  if (!path) throw new Error('Asset path, filePath, workspacePath, or fileRef is required.')
  return { path, filePath: input.filePath, workspacePath: input.workspacePath, originalName: input.originalName, name: input.name, mimeType: input.mimeType, size: input.size }
}

async function compact(value: Promise<unknown> | unknown) {
  return JSON.stringify(await value)
}
