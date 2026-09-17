import { CUT_EXPORT_RESOURCE_OPTIONS, readCutExport } from './cut-export-resource.js'
import {
  XpertToolProvider,
  XpertTool,
  XpertResourceTemplate,
  XpertPrompt,
  type XpertBusinessToolContext,
  type XpertToolOptions,
  type IAgentMiddlewareContext,
  type XpertToolProviderInstance,
  type ResourceReadContext,
  type ToolExecutionContext
} from '@xpert-ai/plugin-sdk'
import { CUT_ICON, CUT_MIDDLEWARE_NAME, CUT_TOOLSET_PROVIDER_KEY } from './constants.js'
import { CutMiddleware, CUT_MIDDLEWARE_META } from './cut.middleware.js'
import { CutService } from './cut.service.js'
import { cutOperationDefinition } from './cut-operation-definitions.js'
import {
  CUT_MCP_INSTRUCTIONS,
  REQUIRED_CONTEXT,
  TASK_TOOL_NAMES,
  nativeInputSchema,
  toolBehavior,
  humanize,
  cutResourceOptions,
  readCutResource,
  cutPromptOptions,
  getCutPrompt,
  executionContext,
  invokeCutTool
} from './cut-native-capabilities.js'
import {
  cutProfileTools,
  cutDiscoverySchema,
  cutExecutionSchema,
  CUT_DISCOVER_TOOLS,
  CUT_EXECUTE_TOOL
} from './cut-tool-profiles.js'

const base = new Set(cutProfileTools('base'))
function operationOptions(name: string): XpertToolOptions {
  const definition = cutOperationDefinition(name)
  return {
    name,
    title: humanize(name),
    description: definition.description,
    inputSchema: definition.schema,
    resultFormat: 'tool_result',
    middleware: base.has(name),
    mcp: {
      inputSchema: nativeInputSchema(name, definition.schema),
      behavior: toolBehavior(name),
      requiredContext: REQUIRED_CONTEXT,
      defaultApprovalMode: 'allow',
      ...(TASK_TOOL_NAMES.has(name) ? { task: { mode: 'optional', maxLifetimeMs: 3_600_000 } } : {})
    }
  }
}

// Public registration is owned solely by these decorators. Internal operations remain reusable.
@XpertToolProvider({
  provider: CUT_TOOLSET_PROVIDER_KEY,
  componentKey: 'cut',
  name: 'Cut',
  description: 'Cut project, media, timeline, caption, proposal and export capabilities.',
  instructions: CUT_MCP_INSTRUCTIONS,
  author: 'XpertAI Team',
  tags: ['cut', 'video', 'timeline', 'mcp'],
  label: { en_US: 'Cut', zh_Hans: 'Cut 视频剪辑' },
  icon: { type: 'svg', value: CUT_ICON, color: '#0ea5e9' },
  defaultMiddleware: CUT_MIDDLEWARE_NAME,
  middlewares: [{ provider: CUT_MIDDLEWARE_NAME, meta: CUT_MIDDLEWARE_META }]
})
export class CutToolProvider implements XpertToolProviderInstance {
  constructor(
    private readonly middleware: CutMiddleware,
    private readonly cut: CutService
  ) {}

  getMiddlewareExtensions(_provider: string, _options: unknown, context: IAgentMiddlewareContext) {
    const { name, tools, ...extensions } = this.middleware.createMiddleware({}, context)
    return extensions
  }

  @XpertResourceTemplate(cutResourceOptions('cut_get_project'))
  cut_get_project(args: Record<string, string>, context: ResourceReadContext) {
    return readCutResource(this.middleware, 'cut_get_project', args, context)
  }

  @XpertResourceTemplate(cutResourceOptions('cut_get_clip'))
  cut_get_clip(args: Record<string, string>, context: ResourceReadContext) {
    return readCutResource(this.middleware, 'cut_get_clip', args, context)
  }

  @XpertResourceTemplate(cutResourceOptions('cut_get_media_asset'))
  cut_get_media_asset(args: Record<string, string>, context: ResourceReadContext) {
    return readCutResource(this.middleware, 'cut_get_media_asset', args, context)
  }

  @XpertResourceTemplate(cutResourceOptions('cut_get_analysis_job'))
  cut_get_analysis_job(args: Record<string, string>, context: ResourceReadContext) {
    return readCutResource(this.middleware, 'cut_get_analysis_job', args, context)
  }

  @XpertResourceTemplate(cutResourceOptions('cut_get_media_segment'))
  cut_get_media_segment(args: Record<string, string>, context: ResourceReadContext) {
    return readCutResource(this.middleware, 'cut_get_media_segment', args, context)
  }

  @XpertResourceTemplate(cutResourceOptions('cut_get_edit_proposal'))
  cut_get_edit_proposal(args: Record<string, string>, context: ResourceReadContext) {
    return readCutResource(this.middleware, 'cut_get_edit_proposal', args, context)
  }

  @XpertResourceTemplate(cutResourceOptions('cut_get_caption_draft'))
  cut_get_caption_draft(args: Record<string, string>, context: ResourceReadContext) {
    return readCutResource(this.middleware, 'cut_get_caption_draft', args, context)
  }

  @XpertResourceTemplate(CUT_EXPORT_RESOURCE_OPTIONS)
  cut_get_export(args: Record<string, string>, context: ResourceReadContext) {
    return readCutExport(this.cut, args, context)
  }

  @XpertPrompt(cutPromptOptions('cut_plan_rough_cut'))
  cut_plan_rough_cut(args: Record<string, string>, context: ToolExecutionContext) {
    return getCutPrompt('cut_plan_rough_cut', args, context)
  }

  @XpertPrompt(cutPromptOptions('cut_review_edit_proposal'))
  cut_review_edit_proposal(args: Record<string, string>, context: ToolExecutionContext) {
    return getCutPrompt('cut_review_edit_proposal', args, context)
  }

  @XpertPrompt(cutPromptOptions('cut_translate_captions'))
  cut_translate_captions(args: Record<string, string>, context: ToolExecutionContext) {
    return getCutPrompt('cut_translate_captions', args, context)
  }

  @XpertPrompt(cutPromptOptions('cut_prepare_export'))
  cut_prepare_export(args: Record<string, string>, context: ToolExecutionContext) {
    return getCutPrompt('cut_prepare_export', args, context)
  }

  @XpertTool(operationOptions('cut_list_tracks'))
  cut_list_tracks(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_list_tracks', input, context)
  }

  @XpertTool(operationOptions('cut_list_clips'))
  cut_list_clips(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_list_clips', input, context)
  }

  @XpertTool(operationOptions('cut_list_media_assets'))
  cut_list_media_assets(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_list_media_assets', input, context)
  }

  @XpertTool(operationOptions('cut_list_project_resources'))
  cut_list_project_resources(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_list_project_resources', input, context)
  }

  @XpertTool(operationOptions('cut_create_project'))
  cut_create_project(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_create_project', input, context)
  }

  @XpertTool(operationOptions('cut_accept_story_handoff'))
  cut_accept_story_handoff(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_accept_story_handoff', input, context)
  }

  @XpertTool(operationOptions('cut_import_media'))
  cut_import_media(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_import_media', input, context)
  }

  @XpertTool(operationOptions('cut_start_transcription'))
  cut_start_transcription(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_start_transcription', input, context)
  }

  @XpertTool(operationOptions('cut_search_media_segments'))
  cut_search_media_segments(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_search_media_segments', input, context)
  }

  @XpertTool(operationOptions('cut_list_transcript_segments'))
  cut_list_transcript_segments(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_list_transcript_segments', input, context)
  }

  @XpertTool(operationOptions('cut_add_clip'))
  cut_add_clip(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_add_clip', input, context)
  }

  @XpertTool(operationOptions('cut_delete_clips'))
  cut_delete_clips(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_delete_clips', input, context)
  }

  @XpertTool(operationOptions('cut_duplicate_clips'))
  cut_duplicate_clips(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_duplicate_clips', input, context)
  }

  @XpertTool(operationOptions('cut_update_clip_timing'))
  cut_update_clip_timing(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_clip_timing', input, context)
  }

  @XpertTool(operationOptions('cut_ripple_delete_ranges'))
  cut_ripple_delete_ranges(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_ripple_delete_ranges', input, context)
  }

  @XpertTool(operationOptions('cut_manage_track'))
  cut_manage_track(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_manage_track', input, context)
  }

  @XpertTool(operationOptions('cut_update_transform'))
  cut_update_transform(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_transform', input, context)
  }

  @XpertTool(operationOptions('cut_update_effects'))
  cut_update_effects(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_effects', input, context)
  }

  @XpertTool(operationOptions('cut_update_mask'))
  cut_update_mask(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_mask', input, context)
  }

  @XpertTool(operationOptions('cut_update_transition'))
  cut_update_transition(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_transition', input, context)
  }

  @XpertTool(operationOptions('cut_update_audio'))
  cut_update_audio(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_audio', input, context)
  }

  @XpertTool(operationOptions('cut_update_text'))
  cut_update_text(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_text', input, context)
  }

  @XpertTool(operationOptions('cut_update_project_settings'))
  cut_update_project_settings(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_project_settings', input, context)
  }

  @XpertTool(operationOptions('cut_add_cover'))
  cut_add_cover(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_add_cover', input, context)
  }

  @XpertTool(operationOptions('cut_apply_edit'))
  cut_apply_edit(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_apply_edit', input, context)
  }

  @XpertTool(operationOptions('cut_apply_batch'))
  cut_apply_batch(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_apply_batch', input, context)
  }

  @XpertTool(operationOptions('cut_create_edit_proposal'))
  cut_create_edit_proposal(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_create_edit_proposal', input, context)
  }

  @XpertTool(operationOptions('cut_create_speech_cleanup_proposal'))
  cut_create_speech_cleanup_proposal(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_create_speech_cleanup_proposal', input, context)
  }

  @XpertTool(operationOptions('cut_update_edit_proposal'))
  cut_update_edit_proposal(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_edit_proposal', input, context)
  }

  @XpertTool(operationOptions('cut_apply_edit_proposal'))
  cut_apply_edit_proposal(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_apply_edit_proposal', input, context)
  }

  @XpertTool(operationOptions('cut_reject_edit_proposal'))
  cut_reject_edit_proposal(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_reject_edit_proposal', input, context)
  }

  @XpertTool(operationOptions('cut_revert_edit_proposal'))
  cut_revert_edit_proposal(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_revert_edit_proposal', input, context)
  }

  @XpertTool(operationOptions('cut_import_subtitle'))
  cut_import_subtitle(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_import_subtitle', input, context)
  }

  @XpertTool(operationOptions('cut_create_caption_draft'))
  cut_create_caption_draft(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_create_caption_draft', input, context)
  }

  @XpertTool(operationOptions('cut_create_translated_caption_draft'))
  cut_create_translated_caption_draft(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_create_translated_caption_draft', input, context)
  }

  @XpertTool(operationOptions('cut_update_caption_draft'))
  cut_update_caption_draft(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_update_caption_draft', input, context)
  }

  @XpertTool(operationOptions('cut_commit_caption_draft'))
  cut_commit_caption_draft(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_commit_caption_draft', input, context)
  }

  @XpertTool(operationOptions('cut_commit_caption_drafts'))
  cut_commit_caption_drafts(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_commit_caption_drafts', input, context)
  }

  @XpertTool(operationOptions('cut_start_headless_export'))
  cut_start_headless_export(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_start_headless_export', input, context)
  }

  @XpertTool(operationOptions('cut_export_subtitle'))
  cut_export_subtitle(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_export_subtitle', input, context)
  }

  @XpertTool(operationOptions('cut_finalize_version'))
  cut_finalize_version(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_finalize_version', input, context)
  }

  @XpertTool(operationOptions('cut_report_failure'))
  cut_report_failure(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_report_failure', input, context)
  }

  @XpertTool(operationOptions('cut_cancel_analysis_job'))
  cut_cancel_analysis_job(input: object, context: XpertBusinessToolContext) {
    return invokeCutTool(this.middleware, 'cut_cancel_analysis_job', input, context)
  }

  @XpertTool({
    name: CUT_DISCOVER_TOOLS,
    description:
      'Read Cut profile operation descriptions and parameter schemas. Does not execute or authorize changes.',
    inputSchema: cutDiscoverySchema,
    resultFormat: 'tool_result',
    middleware: true,
    mcp: false
  })
  discover(input: object, context: XpertBusinessToolContext) {
    return this.invokeGateway(CUT_DISCOVER_TOOLS, input, context)
  }

  @XpertTool({
    name: CUT_EXECUTE_TOOL,
    description:
      'Execute a discovered Cut operation with its original argument validation, authorization and revision checks.',
    inputSchema: cutExecutionSchema,
    resultFormat: 'tool_result',
    middleware: true,
    mcp: false
  })
  execute(input: object, context: XpertBusinessToolContext) {
    return this.invokeGateway(CUT_EXECUTE_TOOL, input, context)
  }

  private async invokeGateway(name: string, input: object, context: XpertBusinessToolContext) {
    const tool = this.middleware
      .createMiddleware({}, executionContext(context))
      .tools?.find((item) => item.name === name)
    if (!tool) throw new Error(`Unknown Cut gateway: ${name}`)
    const result = await tool.invoke(input, {
      signal: context.signal,
      configurable: { tool_call_id: context.requestId }
    })
    const text = typeof result === 'string' ? result : JSON.stringify(result)
    return { content: [{ type: 'text' as const, text }], structuredContent: JSON.parse(text) }
  }
}
