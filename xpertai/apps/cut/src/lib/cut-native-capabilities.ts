import type { StructuredToolInterface } from '@langchain/core/tools'
import type { IXpertToolset } from '@xpert-ai/contracts'
import {
  type AnyXpertToolDefinition,
  BuiltinToolset,
  DefaultRuntimeCapabilityRegistry,
  type McpCapabilityDefinitions,
  type McpPromptDefinition,
  type McpResourceTemplateDefinition,
  type ToolExecutionContext,
  WorkspaceFilesRuntimeCapability,
  type TBuiltinToolsetParams,
  type XpertToolResult
} from '@xpert-ai/plugin-sdk'
import type { ZodTypeAny } from 'zod/v3'
import { z } from 'zod/v3'
import { CUT_PACKAGE_METADATA } from '../package-metadata.js'
import {
  CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME,
  CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME,
  CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME,
  CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME,
  CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_CREATE_PROJECT_TOOL_NAME,
  CUT_CREATE_SPEECH_CLEANUP_PROPOSAL_TOOL_NAME,
  CUT_DELETE_CLIPS_TOOL_NAME,
  CUT_FINALIZE_VERSION_TOOL_NAME,
  CUT_GET_ANALYSIS_JOB_TOOL_NAME,
  CUT_GET_CAPTION_DRAFT_TOOL_NAME,
  CUT_GET_CLIP_TOOL_NAME,
  CUT_GET_EDIT_PROPOSAL_TOOL_NAME,
  CUT_GET_MEDIA_ASSET_TOOL_NAME,
  CUT_GET_MEDIA_SEGMENT_TOOL_NAME,
  CUT_GET_PROJECT_TOOL_NAME,
  CUT_IMPORT_MEDIA_TOOL_NAME,
  CUT_IMPORT_SUBTITLE_TOOL_NAME,
  CUT_LIST_CLIPS_TOOL_NAME,
  CUT_LIST_MEDIA_ASSETS_TOOL_NAME,
  CUT_LIST_PROJECT_RESOURCES_TOOL_NAME,
  CUT_LIST_TRACKS_TOOL_NAME,
  CUT_LIST_TRANSCRIPT_SEGMENTS_TOOL_NAME,
  CUT_MIDDLEWARE_TOOL_NAMES,
  CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_REPORT_FAILURE_TOOL_NAME,
  CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_RIPPLE_DELETE_RANGES_TOOL_NAME,
  CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME,
  CUT_START_HEADLESS_EXPORT_TOOL_NAME,
  CUT_START_TRANSCRIPTION_TOOL_NAME
} from './constants.js'
import { CutMiddleware, type CutToolExecutionContext } from './cut.middleware.js'
import { workspacePortableFileReferenceSchema } from './workspace-file-reference.js'

export type CutNativeCapabilityDefinitions = McpCapabilityDefinitions & {
  instructions: string
  tools: readonly AnyXpertToolDefinition[]
  resourceTemplates: readonly McpResourceTemplateDefinition[]
  prompts: readonly McpPromptDefinition[]
}

const REQUIRED_CONTEXT = ['tenant', 'principal', 'execution'] as const
const RESOURCE_TOOL_NAMES = new Set<string>([
  CUT_GET_PROJECT_TOOL_NAME,
  CUT_GET_CLIP_TOOL_NAME,
  CUT_GET_MEDIA_ASSET_TOOL_NAME,
  CUT_GET_ANALYSIS_JOB_TOOL_NAME,
  CUT_GET_MEDIA_SEGMENT_TOOL_NAME,
  CUT_GET_EDIT_PROPOSAL_TOOL_NAME,
  CUT_GET_CAPTION_DRAFT_TOOL_NAME
])
const READ_TOOL_NAMES = new Set<string>([
  CUT_LIST_TRACKS_TOOL_NAME,
  CUT_LIST_CLIPS_TOOL_NAME,
  CUT_LIST_MEDIA_ASSETS_TOOL_NAME,
  CUT_LIST_PROJECT_RESOURCES_TOOL_NAME,
  CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME,
  CUT_LIST_TRANSCRIPT_SEGMENTS_TOOL_NAME
])
const FILE_INPUT_TOOL_NAMES = new Set<string>([CUT_IMPORT_MEDIA_TOOL_NAME, CUT_IMPORT_SUBTITLE_TOOL_NAME])
const TASK_TOOL_NAMES = new Set<string>([CUT_START_TRANSCRIPTION_TOOL_NAME, CUT_START_HEADLESS_EXPORT_TOOL_NAME])
const PROJECT_OPTIONAL_TOOL_NAMES = new Set<string>([
  CUT_CREATE_PROJECT_TOOL_NAME,
  CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME,
  CUT_REPORT_FAILURE_TOOL_NAME
])
const DESTRUCTIVE_TOOL_NAMES = new Set<string>([
  CUT_DELETE_CLIPS_TOOL_NAME,
  CUT_RIPPLE_DELETE_RANGES_TOOL_NAME,
  CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME,
  CUT_FINALIZE_VERSION_TOOL_NAME
])
const IDEMPOTENT_TOOL_NAMES = new Set<string>([
  CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME,
  CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME,
  CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME,
  CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME,
  CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_CREATE_SPEECH_CLEANUP_PROPOSAL_TOOL_NAME,
  CUT_IMPORT_SUBTITLE_TOOL_NAME,
  CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_START_HEADLESS_EXPORT_TOOL_NAME,
  CUT_START_TRANSCRIPTION_TOOL_NAME
])

const RESOURCE_SPECS = [
  resourceSpec(CUT_GET_PROJECT_TOOL_NAME, 'cut://projects/{projectId}', ['projectId']),
  resourceSpec(
    CUT_GET_CLIP_TOOL_NAME,
    'cut://projects/{projectId}/clips/{clipId}',
    ['projectId', 'clipId', 'expectedRevision'],
    ['expectedRevision']
  ),
  resourceSpec(
    CUT_GET_MEDIA_ASSET_TOOL_NAME,
    'cut://projects/{projectId}/media/{mediaAssetId}',
    ['projectId', 'mediaAssetId', 'expectedRevision'],
    ['expectedRevision']
  ),
  resourceSpec(CUT_GET_ANALYSIS_JOB_TOOL_NAME, 'cut://projects/{projectId}/jobs/{jobId}', ['projectId', 'jobId']),
  resourceSpec(CUT_GET_MEDIA_SEGMENT_TOOL_NAME, 'cut://projects/{projectId}/segments/{segmentId}', [
    'projectId',
    'segmentId'
  ]),
  resourceSpec(CUT_GET_EDIT_PROPOSAL_TOOL_NAME, 'cut://projects/{projectId}/proposals/{proposalId}', [
    'projectId',
    'proposalId'
  ]),
  resourceSpec(
    CUT_GET_CAPTION_DRAFT_TOOL_NAME,
    'cut://projects/{projectId}/captions/{draftId}',
    ['projectId', 'draftId', 'page', 'pageSize'],
    ['page', 'pageSize']
  )
] as const

export class CutNativeToolset extends BuiltinToolset<StructuredToolInterface, Record<string, never>> {
  readonly #definitions: CutNativeCapabilityDefinitions

  constructor(
    toolset: IXpertToolset,
    params: TBuiltinToolsetParams | undefined,
    private readonly middleware: CutMiddleware
  ) {
    super('cut', toolset, params)
    this.tools = []
    this.#definitions = createCutNativeCapabilityDefinitions(middleware, {
      tenantId: params?.tenantId ?? toolset.tenantId ?? 'capability-discovery',
      organizationId: params?.organizationId ?? toolset.organizationId ?? null,
      userId: params?.userId ?? 'capability-discovery',
      workspaceId: toolset.workspaceId ?? undefined,
      projectId: params?.projectId,
      conversationId: params?.conversationId,
      xpertId: params?.xpertId,
      xpertFeatures: null,
      runtime: {}
    })
  }

  override async _validateCredentials(): Promise<void> {}

  override async initTools(): Promise<StructuredToolInterface[]> {
    return this.tools
  }

  override getMcpCapabilityDefinitions(): Readonly<CutNativeCapabilityDefinitions> {
    return this.#definitions
  }

  override getMcpCapabilitySource() {
    return {
      pluginName: CUT_PACKAGE_METADATA.name,
      pluginVersion: CUT_PACKAGE_METADATA.version
    }
  }
}

export function createCutNativeCapabilityDefinitions(
  middleware: CutMiddleware,
  discoveryContext: CutToolExecutionContext
): CutNativeCapabilityDefinitions {
  const metadataTools = middlewareTools(middleware, discoveryContext)
  const metadataByName = new Map(metadataTools.map((item) => [item.name, item]))
  const tools = CUT_MIDDLEWARE_TOOL_NAMES.filter((name) => !RESOURCE_TOOL_NAMES.has(name)).map((name) => {
    const metadata = requireTool(metadataByName, name)
    const inputSchema = nativeInputSchema(name, requireZodSchema(metadata.schema, name))
    return {
      name,
      title: humanize(name),
      description: metadata.description,
      inputSchema,
      exposure: { mcp: { eligible: true } },
      behavior: toolBehavior(name),
      requiredContext: [...REQUIRED_CONTEXT],
      ...(TASK_TOOL_NAMES.has(name) ? { task: { mode: 'optional' as const, maxLifetimeMs: 3_600_000 } } : {}),
      execute: (input: unknown, context: ToolExecutionContext) => invokeCutTool(middleware, name, input, context)
    }
  })
  const resourceTemplates = RESOURCE_SPECS.map((spec) => {
    const metadata = requireTool(metadataByName, spec.toolName)
    return {
      key: spec.toolName,
      uriTemplate: spec.uriTemplate,
      title: humanize(spec.toolName),
      description: metadata.description,
      mimeType: 'application/json',
      arguments: Object.fromEntries(
        spec.arguments.map((name) => [
          name,
          {
            required: !spec.optionalArguments.includes(name),
            description: `${humanizeArgument(name)} used by ${spec.toolName}.`
          }
        ])
      ),
      requiredContext: [...REQUIRED_CONTEXT],
      read: async (arguments_: Record<string, string>, context: ToolExecutionContext) => {
        const input = Object.fromEntries(
          Object.entries(arguments_).map(([name, value]) => [
            name,
            spec.numberArguments.includes(name) ? Number(value) : value
          ])
        )
        const result = await invokeCutTool(middleware, spec.toolName, input, context)
        return {
          contents: [
            {
              uri: expandUri(spec.uriTemplate, arguments_),
              mimeType: 'application/json',
              text: firstTextContent(result) ?? '{}'
            }
          ]
        }
      }
    }
  })

  return {
    instructions:
      'Cut capabilities operate on tenant- or organization-scoped Cut projects. External callers must pass projectId explicitly. File imports require a portable platform.workspace.files reference; no current workspace is inferred.',
    tools,
    resourceTemplates,
    prompts: createCutPrompts()
  }
}

async function invokeCutTool(
  middleware: CutMiddleware,
  name: string,
  input: unknown,
  context: ToolExecutionContext
): Promise<XpertToolResult> {
  const toolContext = executionContext(context)
  const tool = requireTool(new Map(middlewareTools(middleware, toolContext).map((item) => [item.name, item])), name)
  const normalizedInput = requireObjectInput(input, name)
  const result = await tool.invoke(normalizedInput, {
    configurable: {
      tool_call_id: context.requestId,
      toolExecutionContext: context
    }
  })
  const text = typeof result === 'string' ? result : JSON.stringify(result)
  return {
    content: [{ type: 'text', text }],
    ...(parseJson(text) === undefined ? {} : { structuredContent: parseJson(text) })
  }
}

function executionContext(context: ToolExecutionContext): CutToolExecutionContext {
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  if (context.host.files) {
    capabilities.register(WorkspaceFilesRuntimeCapability, context.host.files)
  }
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    userId: context.principal.userId ?? context.principal.id,
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    conversationId: context.conversationId,
    xpertId: context.xpertId,
    xpertFeatures: null,
    runtime: { capabilities }
  }
}

function middlewareTools(middleware: CutMiddleware, context: CutToolExecutionContext) {
  const value = middleware.createMiddleware({}, context)
  if (isPromiseLike(value)) {
    throw new Error('Cut middleware tool declaration must remain synchronous.')
  }
  return (value.tools ?? []).filter(isStructuredTool)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'then') === 'function'
}

function isStructuredTool(value: unknown): value is StructuredToolInterface {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'name') === 'string' &&
    typeof Reflect.get(value, 'description') === 'string' &&
    typeof Reflect.get(value, 'invoke') === 'function'
  )
}

function requireTool(tools: Map<string, StructuredToolInterface>, name: string) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`Cut tool '${name}' is not registered.`)
  return tool
}

function requireZodSchema(value: unknown, name: string): ZodTypeAny {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'parseAsync') !== 'function' ||
    !Reflect.get(value, '_def')
  ) {
    throw new Error(`Cut tool '${name}' does not expose a Zod input schema.`)
  }
  return value as ZodTypeAny
}

function nativeInputSchema(name: string, schema: ZodTypeAny) {
  let result = PROJECT_OPTIONAL_TOOL_NAMES.has(name)
    ? schema
    : z.intersection(z.object({ projectId: z.string().uuid() }), schema)
  if (FILE_INPUT_TOOL_NAMES.has(name)) {
    result = z.intersection(z.object({ file: workspacePortableFileReferenceSchema }), result)
  }
  if (name === CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME) {
    result = z.intersection(
      z.object({
        handoff: z
          .object({
            shots: z.array(
              z
                .object({
                  file: z.object({ reference: workspacePortableFileReferenceSchema }).passthrough()
                })
                .passthrough()
            )
          })
          .passthrough()
      }),
      result
    )
  }
  return result
}

function toolBehavior(name: string): AnyXpertToolDefinition['behavior'] {
  if (READ_TOOL_NAMES.has(name)) {
    return { risk: 'read', sideEffect: 'none', idempotency: 'safe' }
  }
  return {
    risk: DESTRUCTIVE_TOOL_NAMES.has(name) ? 'dangerous' : 'write',
    sideEffect: 'reversible',
    idempotency: IDEMPOTENT_TOOL_NAMES.has(name) ? 'idempotent' : 'non_idempotent'
  }
}

function firstTextContent(result: XpertToolResult) {
  const content = result.content?.[0]
  return content?.type === 'text' ? content.text : undefined
}

function requireObjectInput(value: unknown, toolName: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Cut tool '${toolName}' input must be an object.`)
  }
  return Object.fromEntries(Object.entries(value))
}

function parseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function resourceSpec(
  toolName: string,
  uriTemplate: string,
  arguments_: readonly string[],
  numberArguments: readonly string[] = []
) {
  return {
    toolName,
    uriTemplate,
    arguments: arguments_,
    numberArguments,
    optionalArguments: numberArguments
  }
}

function expandUri(template: string, arguments_: Record<string, string>) {
  return Object.entries(arguments_).reduce(
    (uri, [name, value]) => uri.replace(`{${name}}`, encodeURIComponent(value)),
    template
  )
}

function createCutPrompts(): McpPromptDefinition[] {
  return [
    prompt('cut_plan_rough_cut', 'Plan a rough cut', 'Plan a revision-safe rough cut from available media.'),
    prompt('cut_review_edit_proposal', 'Review an edit proposal', 'Review proposal evidence before applying it.'),
    prompt('cut_translate_captions', 'Translate captions', 'Prepare synchronized multilingual caption review.'),
    prompt('cut_prepare_export', 'Prepare an export', 'Check the project revision and prepare bounded export variants.')
  ]
}

function prompt(key: string, title: string, description: string): McpPromptDefinition {
  return {
    key,
    name: key,
    title,
    description,
    arguments: {
      projectId: { required: true, description: 'Cut project UUID.' },
      goal: { required: false, description: 'Desired editing or review outcome.' },
      language: { required: false, description: 'Response language, for example zh-Hans or en.' }
    },
    requiredContext: [...REQUIRED_CONTEXT],
    get: (arguments_) => {
      const language = arguments_['language']?.toLowerCase()
      const chinese = language?.startsWith('zh')
      const projectId = arguments_['projectId']
      const goal = arguments_['goal']?.trim()
      const text = chinese
        ? `针对 Cut 项目 ${projectId}，${descriptionZh(key)}${
            goal ? `目标：${goal}。` : ''
          }先读取项目和相关资源，再提出修改；任何写操作都必须使用最新 revision。`
        : `For Cut project ${projectId}, ${description}${
            goal ? ` Goal: ${goal}.` : ''
          } Read the project and relevant resources first, then propose changes; every write must use the latest revision.`
      return {
        description,
        messages: [{ role: 'user', content: { type: 'text', text } }]
      }
    }
  }
}

function descriptionZh(key: string) {
  switch (key) {
    case 'cut_plan_rough_cut':
      return '基于现有素材规划一个可审阅、版本安全的粗剪。'
    case 'cut_review_edit_proposal':
      return '在应用编辑提案之前检查证据和影响范围。'
    case 'cut_translate_captions':
      return '准备多语种字幕翻译和同步审阅。'
    default:
      return '检查当前版本并准备有界的导出方案。'
  }
}

function humanize(value: string) {
  return value
    .replace(/^cut_/, '')
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function humanizeArgument(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}
