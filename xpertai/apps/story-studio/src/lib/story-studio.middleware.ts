import { Injectable } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
  ChatMessageEventTypeEnum,
  ChatMessageStepCategory,
  type TAgentMiddlewareMeta
} from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  RequestContext,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type PromiseOrValue,
  type WorkspaceFilesApi,
  type WorkspaceRuntimeFileBuffer
} from '@xpert-ai/plugin-sdk'
import {
  STORY_CREATE_PROJECT_TOOL_NAME,
  STORY_CREATE_ADAPTATION_SUGGESTION_TOOL_NAME,
  STORY_DELETE_ADAPTATION_SUGGESTION_TOOL_NAME,
  STORY_ATTACH_GENERATED_ASSET_IMAGE_TOOL_NAME,
  STORY_ATTACH_GENERATED_VIDEO_TOOL_NAME,
  STORY_GET_PRODUCTION_TOOL_NAME,
  STORY_GET_PRODUCTION_CONTEXT_TOOL_NAME,
  STORY_LIST_ADAPTATION_SUGGESTIONS_TOOL_NAME,
  STORY_GET_CUT_HANDOFF_TOOL_NAME,
  STORY_GET_PROJECT_REVISION_TOOL_NAME,
  STORY_GET_PROJECT_SUMMARY_TOOL_NAME,
  STORY_REPORT_FAILURE_TOOL_NAME,
  STORY_RECORD_CUT_HANDOFF_TOOL_NAME,
  STORY_LIST_VIDEO_TASKS_TOOL_NAME,
  STORY_GET_VIDEO_TASK_TOOL_NAME,
  STORY_REFRESH_VIDEO_TASK_TOOL_NAME,
  STORY_CANCEL_VIDEO_TASK_TOOL_NAME,
  STORY_RETRY_VIDEO_TASK_TOOL_NAME,
  STORY_SELECT_SHOT_VIDEO_TOOL_NAME,
  STORY_SEARCH_PROJECTS_TOOL_NAME,
  STORY_INITIALIZE_PRODUCTION_TOOL_NAME,
  STORY_UPDATE_PRODUCTION_BRIEF_TOOL_NAME,
  STORY_UPSERT_PRODUCTION_CHARACTER_TOOL_NAME,
  STORY_UPSERT_PRODUCTION_EPISODE_TOOL_NAME,
  STORY_UPSERT_PRODUCTION_ASSET_TOOL_NAME,
  STORY_UPSERT_PRODUCTION_SCENE_TOOL_NAME,
  STORY_UPSERT_PRODUCTION_SHOT_TOOL_NAME,
  STORY_VALIDATE_PRODUCTION_TOOL_NAME,
  STORY_PREPARE_CUT_HANDOFF_TOOL_NAME,
  STORY_STUDIO_AGENT_CAPABILITY,
  STORY_STUDIO_FEATURE,
  STORY_STUDIO_ICON,
  STORY_STUDIO_MIDDLEWARE_NAME,
  STORY_STUDIO_MUTATION_TOOL_NAMES,
  STORY_STUDIO_WORKBENCH_CAPABILITY,
  STORY_UPDATE_PROJECT_STATUS_TOOL_NAME,
  STORY_UPDATE_PROJECT_TOOL_NAME,
  STORY_UPDATE_ADAPTATION_SUGGESTION_TOOL_NAME
} from './constants.js'
import { stringifyStoryAgentResult } from './story-agent-response.js'
import { defineStoryAgentTool } from './story-agent-tool.factory.js'
import {
  createStoryProjectSchema,
  getStoryProjectRevisionSchema,
  getStoryProjectSummarySchema,
  reportStoryFailureSchema,
  searchStoryProjectsSchema,
  updateStoryProjectSchema,
  updateStoryProjectStatusSchema
} from './story-agent-tool.schemas.js'
import { StoryStudioService } from './story-studio.service.js'
import { StoryAdaptationSuggestionService } from './story-adaptation-suggestion.service.js'
import { StoryProductionService } from './story-production.service.js'
import { StoryProductionAgentService } from './story-production-agent.service.js'
import { StoryGeneratedMediaService } from './story-generated-media.service.js'
import { StoryCutHandoffService } from './story-cut-handoff.service.js'
import {
  getStoryCutHandoffSchema,
  prepareStoryCutHandoffSchema,
  recordStoryCutHandoffDeliverySchema
} from './story-cut-handoff.schemas.js'
import type {
  GetStoryCutHandoffInput,
  PrepareStoryCutHandoffInput,
  RecordStoryCutHandoffDeliveryInput
} from './story-cut-handoff.types.js'
import {
  attachGeneratedAssetImageSchema,
  attachGeneratedVideoSchema,
  getStoryProductionSchema,
  upsertStoryProductionShotSchema
} from './story-production.schemas.js'
import {
  getStoryProductionContextSchema,
  initializeStoryProductionSchema,
  updateStoryProductionBriefSchema,
  upsertStoryProductionAssetSchema,
  upsertStoryProductionCharacterSchema,
  upsertStoryProductionEpisodeSchema,
  upsertStoryProductionSceneMetadataSchema,
  validateStoryProductionSchema
} from './story-production-agent.schemas.js'
import type {
  AttachGeneratedAssetImageInput,
  AttachGeneratedVideoInput,
  GetStoryProductionInput,
  GetStoryProductionContextInput,
  InitializeStoryProductionInput,
  StoryAssetReference,
  UpdateStoryProductionBriefInput,
  UpsertStoryProductionAssetInput,
  UpsertStoryProductionCharacterInput,
  UpsertStoryProductionEpisodeInput,
  UpsertStoryProductionSceneMetadataInput,
  ValidateStoryProductionInput,
  UpsertStoryProductionShotInput
} from './production-types.js'
import type {
  CreateStoryAdaptationSuggestionInput,
  DeleteStoryAdaptationSuggestionInput,
  ListStoryAdaptationSuggestionsInput,
  UpdateStoryAdaptationSuggestionInput
} from './production-types.js'
import {
  createStoryAdaptationSuggestionSchema,
  deleteStoryAdaptationSuggestionSchema,
  listStoryAdaptationSuggestionsSchema,
  updateStoryAdaptationSuggestionSchema
} from './story-adaptation-suggestion.schemas.js'
import type {
  CreateStoryProjectInput,
  GetStoryProjectRevisionInput,
  GetStoryProjectSummaryInput,
  ReportStoryFailureInput,
  SearchStoryProjectsInput,
  StoryScope,
  UpdateStoryProjectInput,
  UpdateStoryProjectStatusInput
} from './types.js'
import { StoryVideoGenerationService } from './story-video-generation.service.js'
import {
  getStoryVideoTaskSchema,
  listStoryVideoTasksSchema,
  manageStoryVideoTaskSchema,
  selectStoryShotVideoSchema
} from './story-video-generation.schemas.js'
import type {
  GetStoryVideoTaskInput,
  ListStoryVideoTasksInput,
  ManageStoryVideoTaskInput,
  SelectStoryShotVideoInput
} from './story-video-generation.types.js'

const MUTATION_TOOL_NAMES = new Set<string>(STORY_STUDIO_MUTATION_TOOL_NAMES)

@Injectable()
@AgentMiddlewareStrategy(STORY_STUDIO_MIDDLEWARE_NAME)
export class StoryStudioMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta: TAgentMiddlewareMeta = {
    name: STORY_STUDIO_MIDDLEWARE_NAME,
    label: {
      en_US: 'Story Studio',
      zh_Hans: 'Story Studio 故事工作室'
    },
    description: {
      en_US:
        'Create and manage scoped, revision-safe story-production projects with explicit review stages.',
      zh_Hans: '创建和管理带作用域、版本保护及明确审核阶段的故事制作项目。'
    },
    icon: {
      type: 'svg',
      value: STORY_STUDIO_ICON,
      color: '#7c3aed'
    },
    features: [
      STORY_STUDIO_FEATURE,
      STORY_STUDIO_AGENT_CAPABILITY,
      STORY_STUDIO_WORKBENCH_CAPABILITY
    ],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(
    private readonly service: StoryStudioService,
    private readonly production: StoryProductionService,
    private readonly productionAgent: StoryProductionAgentService,
    private readonly suggestions: StoryAdaptationSuggestionService,
    private readonly generatedMedia: StoryGeneratedMediaService,
    private readonly cutHandoffs: StoryCutHandoffService,
    private readonly videoGeneration: StoryVideoGenerationService
  ) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: STORY_STUDIO_MIDDLEWARE_NAME,
      tools: [
        defineStoryAgentTool(
          async (input: CreateStoryProjectInput) =>
            stringifyStoryAgentResult(
              (await this.service.createProject(scope, input)).receipt
            ),
          {
            name: STORY_CREATE_PROJECT_TOOL_NAME,
            description:
              'Create one scoped Story Studio project after the user approves its title and production format. Search first when a duplicate may exist. This creates project metadata only and does not prove that source material, scripts, storyboards, media, or exports exist.',
            schema: createStoryProjectSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: SearchStoryProjectsInput) =>
            stringifyStoryAgentResult(
              await this.service.searchProjects(scope, input)
            ),
          {
            name: STORY_SEARCH_PROJECTS_TOOL_NAME,
            description:
              'Search scoped Story Studio projects with server-side filtering and pagination. Returns compact project summaries only.',
            schema: searchStoryProjectsSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: GetStoryProjectSummaryInput) =>
            stringifyStoryAgentResult(
              await this.service.getProjectSummary(scope, input)
            ),
          {
            name: STORY_GET_PROJECT_SUMMARY_TOOL_NAME,
            description:
              'Read one exact Story Studio project summary for metadata, status, counts, and planning context. Do not call this only to obtain a revision; use Workbench context, a mutation receipt, or story_get_project_revision instead.',
            schema: getStoryProjectSummarySchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: GetStoryProjectRevisionInput) =>
            stringifyStoryAgentResult(
              await this.service.getProjectRevision(scope, input)
            ),
          {
            name: STORY_GET_PROJECT_REVISION_TOOL_NAME,
            description:
              'Return only {projectId, revision} for lightweight optimistic-concurrency synchronization. Prefer the Workbench revision for the first mutation and each successful mutation receipt for the next one. Call this only when no trusted revision is available or a conflict response did not expose currentRevision.',
            schema: getStoryProjectRevisionSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpdateStoryProjectInput) =>
            stringifyStoryAgentResult(
              (await this.service.updateProject(scope, input)).receipt
            ),
          {
            name: STORY_UPDATE_PROJECT_TOOL_NAME,
            description:
              'Update bounded Story Studio project metadata using the current baseRevision from Workbench context, the latest mutation receipt, or story_get_project_revision. Reuse operationId only when retrying the identical payload.',
            schema: updateStoryProjectSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpdateStoryProjectStatusInput) =>
            stringifyStoryAgentResult(
              (await this.service.updateProjectStatus(scope, input)).receipt
            ),
          {
            name: STORY_UPDATE_PROJECT_STATUS_TOOL_NAME,
            description:
              'Move a Story Studio project through an allowed lifecycle transition using its current baseRevision. Enter review, completed, failed, or archived only after explicit human approval.',
            schema: updateStoryProjectStatusSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: ReportStoryFailureInput) =>
            stringifyStoryAgentResult(
              (await this.service.reportFailure(scope, input)).receipt
            ),
          {
            name: STORY_REPORT_FAILURE_TOOL_NAME,
            description:
              'Record a stable Story Studio project failure code, recoverability, and bounded error message. This moves the project to failed and requires its current baseRevision.',
            schema: reportStoryFailureSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: GetStoryProductionContextInput) =>
            stringifyStoryAgentResult(
              await this.productionAgent.getContext(scope, input)
            ),
          {
            name: STORY_GET_PRODUCTION_CONTEXT_TOOL_NAME,
            description:
              'Read only production existence, current revision, counts, entity-id indexes, and available next tools. Use this before deciding whether to initialize or continue an existing production. This does not return the complete script or production document.',
            schema: getStoryProductionContextSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: GetStoryProductionInput) =>
            stringifyStoryAgentResult(
              await this.production.getProduction(scope, input)
            ),
          {
            name: STORY_GET_PRODUCTION_TOOL_NAME,
            description:
              'Read the complete saved Story Studio production document, shot counts, candidate counts, and total duration for one scoped project.',
            schema: getStoryProductionSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: InitializeStoryProductionInput) =>
            stringifyStoryAgentResult(
              await this.productionAgent.initialize(scope, input)
            ),
          {
            name: STORY_INITIALIZE_PRODUCTION_TOOL_NAME,
            description:
              'Initialize one Story Studio production draft from its synopsis, adaptation goal, visual style, and optional audience. Call only when story_get_production_context returns exists=false. The service automatically seeds episode-1 using the project title and synopsis so the Workbench immediately has a first episode. Do not include characters, episodes, assets, scenes, or shots in this call; update episode-1 and add other entities one item at a time with the bounded tools.',
            schema: initializeStoryProductionSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpdateStoryProductionBriefInput) =>
            stringifyStoryAgentResult(
              await this.productionAgent.updateBrief(scope, input)
            ),
          {
            name: STORY_UPDATE_PRODUCTION_BRIEF_TOOL_NAME,
            description:
              'Update only the production synopsis, adaptation goal, visual style, or audience. Use the latest mutation receipt revision as baseRevision. Never resubmit characters, scenes, shots, or media.',
            schema: updateStoryProductionBriefSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpsertStoryProductionCharacterInput) =>
            stringifyStoryAgentResult(
              await this.productionAgent.upsertCharacter(scope, input)
            ),
          {
            name: STORY_UPSERT_PRODUCTION_CHARACTER_TOOL_NAME,
            description:
              'Create or update exactly one complete character asset (identity, description, generation prompt, continuity fields, and role). This is the only character record used by the Asset page and dialogue speaker ids. For a new id, baseRevision may be omitted and multiple independent creates may be submitted together; the service serializes them on authoritative revisions. For an existing id, pass the exact current baseRevision. Never predict future revisions. Existing voice and image media are preserved.',
            schema: upsertStoryProductionCharacterSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpsertStoryProductionEpisodeInput) =>
            stringifyStoryAgentResult(
              await this.productionAgent.upsertEpisode(scope, input)
            ),
          {
            name: STORY_UPSERT_PRODUCTION_EPISODE_TOOL_NAME,
            description:
              'Create or replace exactly one episode script. Initialization already creates episode-1; update that exact id for the first episode instead of creating another order=1 episode. The script field is a JSON string: never put raw ASCII double quotes inside it. Use typographic quotes such as “…” or 「…」 for dialogue; newlines must remain valid JSON escapes. targetDurationSeconds must be an integer number of seconds, never a string. Omit baseRevision for a new id; pass the exact current revision for an existing-id update. Never predict future revisions.',
            schema: upsertStoryProductionEpisodeSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpsertStoryProductionAssetInput) =>
            stringifyStoryAgentResult(
              await this.productionAgent.upsertAsset(scope, input)
            ),
          {
            name: STORY_UPSERT_PRODUCTION_ASSET_TOOL_NAME,
            description:
              'Create or update exactly one location, prop, or style asset. Characters are accepted only by story_upsert_production_character so identity and media cannot diverge. Omit baseRevision for a new id; pass the exact current revision for an update. Existing generated/uploaded media candidates are preserved.',
            schema: upsertStoryProductionAssetSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpsertStoryProductionSceneMetadataInput) =>
            stringifyStoryAgentResult(
              await this.productionAgent.upsertSceneMetadata(scope, input)
            ),
          {
            name: STORY_UPSERT_PRODUCTION_SCENE_TOOL_NAME,
            description:
              'Create or update exactly one scene header: id, episode, order, title, summary, location, and time of day. Do not include shots. Omit baseRevision for a new id; pass the exact current revision for an update. Add or patch shots separately; existing shots are preserved.',
            schema: upsertStoryProductionSceneMetadataSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpsertStoryProductionShotInput) =>
            stringifyStoryAgentResult(
              await this.productionAgent.upsertShot(scope, input)
            ),
          {
            name: STORY_UPSERT_PRODUCTION_SHOT_TOOL_NAME,
            description:
              'Create or patch one shot inside an existing saved Story Studio scene. Omit baseRevision for a new shot id; pass the exact current revision when patching an existing shot. The service serializes independent creates and never requires predicting revisions. For dialogue, speakerId is the id of a character asset; pass dialogue=null to clear speech.',
            schema: upsertStoryProductionShotSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: ValidateStoryProductionInput) =>
            stringifyStoryAgentResult(
              await this.productionAgent.validate(scope, input)
            ),
          {
            name: STORY_VALIDATE_PRODUCTION_TOOL_NAME,
            description:
              'Validate the current production for complete character references, ordered scenes, non-empty shot lists, required shot fields, and total duration. This read does not mutate or approve the production.',
            schema: validateStoryProductionSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: ListStoryAdaptationSuggestionsInput) =>
            stringifyStoryAgentResult(
              await this.suggestions.list(scope, input)
            ),
          {
            name: STORY_LIST_ADAPTATION_SUGGESTIONS_TOOL_NAME,
            description:
              'List bounded AI adaptation suggestions for one exact Story Studio project. Use filters and pagination; this read does not mutate the script.',
            schema: listStoryAdaptationSuggestionsSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: CreateStoryAdaptationSuggestionInput) =>
            stringifyStoryAgentResult(
              await this.suggestions.create(scope, input)
            ),
          {
            name: STORY_CREATE_ADAPTATION_SUGGESTION_TOOL_NAME,
            description:
              'Create one reviewable AI adaptation suggestion for an exact episode and optional scene/shot. Use projectRevision from the production read or the latest mutation receipt as baseRevision. This writes only the suggestion card; it never rewrites or accepts the script automatically.',
            schema: createStoryAdaptationSuggestionSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpdateStoryAdaptationSuggestionInput) =>
            stringifyStoryAgentResult(
              await this.suggestions.update(scope, input)
            ),
          {
            name: STORY_UPDATE_ADAPTATION_SUGGESTION_TOOL_NAME,
            description:
              'Update the text, reason, or review status of one exact adaptation suggestion using the latest mutation receipt revision or story_get_project_revision when needed. Do not claim the episode script changed unless a separate production save succeeds.',
            schema: updateStoryAdaptationSuggestionSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: DeleteStoryAdaptationSuggestionInput) =>
            stringifyStoryAgentResult(
              await this.suggestions.delete(scope, input)
            ),
          {
            name: STORY_DELETE_ADAPTATION_SUGGESTION_TOOL_NAME,
            description:
              'Delete one exact adaptation suggestion after explicit user intent. Use the latest mutation receipt revision or story_get_project_revision when needed, and provide a concise user-visible changeSummary.',
            schema: deleteStoryAdaptationSuggestionSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: AttachGeneratedAssetImageInput) => {
            const parsedInput = attachGeneratedAssetImageSchema.parse(input)
            const normalizedInput: AttachGeneratedAssetImageInput = {
              ...input,
              assetReference: normalizeParsedAssetReference(
                parsedInput.assetReference
              ),
              replaceReference:
                parsedInput.replaceReference ??
                parsedInput.assetReference.type !== 'general'
            }
            const files = context.runtime.capabilities?.require(
              WorkspaceFilesRuntimeCapability
            )
            if (!files) {
              throw new Error(
                'Workspace Files capability is required for story_attach_generated_asset_image.'
              )
            }
            const file = await files.readRuntimeBuffer(
              normalizedInput.file as Parameters<
                typeof files.readRuntimeBuffer
              >[0]
            )
            const durableFile = await persistGeneratedAssetImage(
              files,
              normalizedInput,
              file
            )
            const { file: _file, ...attachment } = normalizedInput
            const result = await this.production.attachAssetImage(
              scope,
              attachment,
              durableFile
            )
            return stringifyStoryAgentResult(
              compactAssetImageMutationReceipt(result, attachment)
            )
          },
          {
            name: STORY_ATTACH_GENERATED_ASSET_IMAGE_TOOL_NAME,
            description:
              'Attach exactly one completed Seedream image from the current Agent Workspace to one exact Story Studio asset-bible slot. assetReference is required and must be a nested object, never a JSON-encoded string. For a four-view or four-expression job, call this tool four times sequentially with four distinct slot references and use each successful receipt.revision as the next call baseRevision; do not fetch the project summary between calls. Use the workspacePath generated for that same slot only. Set replaceReference=true for named continuity_view or expression slots. Example: {"assetReference":{"type":"continuity_view","key":"front"},"select":true,"replaceReference":true}. Use select=true only for the primary continuity view and select=false for all other views and expressions. On a revision conflict, use currentRevision from the error or call story_get_project_revision once, then retry only the failed slot. Never pass base64, a provider URL, or one contact-sheet image for multiple slots.',
            schema: attachGeneratedAssetImageSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: AttachGeneratedVideoInput) => {
            const files = context.runtime.capabilities?.require(
              WorkspaceFilesRuntimeCapability
            )
            if (!files) {
              throw new Error(
                'Workspace Files capability is required for story_attach_generated_video.'
              )
            }
            const file = await files.readRuntimeBuffer(
              input.file as Parameters<typeof files.readRuntimeBuffer>[0]
            )
            const durableFile = await persistGeneratedVideo(files, input, file)
            return stringifyStoryAgentResult(
              await this.generatedMedia.attachGeneratedVideo(
                scope,
                input,
                durableFile
              )
            )
          },
          {
            name: STORY_ATTACH_GENERATED_VIDEO_TOOL_NAME,
            description:
              'Attach one completed Seedance MP4 from the current Agent Workspace to an exact production shot. Use the Workbench revision for the first attachment and each successful receipt revision for the next; do not read the project summary only for revision. Pass the workspacePath returned by seedance_video_query, its task id/model/status receipt, and select=true to make this video the shot render source. Never pass base64 or a provider URL.',
            schema: attachGeneratedVideoSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: ListStoryVideoTasksInput) =>
            stringifyStoryAgentResult(
              await this.videoGeneration.listTasks(scope, input)
            ),
          {
            name: STORY_LIST_VIDEO_TASKS_TOOL_NAME,
            description:
              'List the durable video-generation tasks for one Story Studio project, optionally filtered by scene, shot, or status. Use this instead of relying on previous chat messages. This is read-only and never submits paid work.',
            schema: listStoryVideoTasksSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: GetStoryVideoTaskInput) =>
            stringifyStoryAgentResult(
              await this.videoGeneration.getTask(scope, input)
            ),
          {
            name: STORY_GET_VIDEO_TASK_TOOL_NAME,
            description:
              'Get one exact durable video-generation task after discovering its business task id. Completion is authoritative only when status is completed and resultCandidateId is present.',
            schema: getStoryVideoTaskSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: ManageStoryVideoTaskInput) =>
            stringifyStoryAgentResult(
              await this.videoGeneration.refreshTask(scope, input)
            ),
          {
            name: STORY_REFRESH_VIDEO_TASK_TOOL_NAME,
            description:
              'Request an immediate status refresh for one existing video task. This does not create another paid generation task.',
            schema: manageStoryVideoTaskSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: ManageStoryVideoTaskInput) =>
            stringifyStoryAgentResult(
              await this.videoGeneration.cancelTask(scope, input)
            ),
          {
            name: STORY_CANCEL_VIDEO_TASK_TOOL_NAME,
            description:
              'Stop tracking one existing active video task after explicit user instruction. Some generators cannot cancel upstream work; the result states whether generation may continue there.',
            schema: manageStoryVideoTaskSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: ManageStoryVideoTaskInput) =>
            stringifyStoryAgentResult(
              await this.videoGeneration.retryTask(scope, input)
            ),
          {
            name: STORY_RETRY_VIDEO_TASK_TOOL_NAME,
            description:
              'Create one paid retry from an existing failed or stopped task. Call only after the user explicitly asks to retry; never retry autonomously from a status query.',
            schema: manageStoryVideoTaskSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: SelectStoryShotVideoInput) =>
            stringifyStoryAgentResult(
              await this.videoGeneration.selectShotVideo(scope, input)
            ),
          {
            name: STORY_SELECT_SHOT_VIDEO_TOOL_NAME,
            description:
              'Lock one completed video candidate for an exact scene and shot after explicit user selection. This narrowly updates selection and does not replace the production document.',
            schema: selectStoryShotVideoSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: PrepareStoryCutHandoffInput) =>
            stringifyStoryAgentResult(
              await this.cutHandoffs.prepare(scope, input)
            ),
          {
            name: STORY_PREPARE_CUT_HANDOFF_TOOL_NAME,
            description:
              'Freeze the exact selected Story Studio shot videos into a versioned StoryCutHandoff v1 contract. Every shot must have exactly one selected scoped Workspace MP4. The first contract targets Cut project creation; later Story revisions target a reviewable Cut proposal and never overwrite the timeline.',
            schema: prepareStoryCutHandoffSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: GetStoryCutHandoffInput) =>
            stringifyStoryAgentResult(await this.cutHandoffs.get(scope, input)),
          {
            name: STORY_GET_CUT_HANDOFF_TOOL_NAME,
            description:
              'Read one exact or the latest StoryCutHandoff v1 contract for delivery to Cut. This explicit handoff read returns at most 24 ordered shots with bounded timing and scoped Workspace paths; use it only with cut_accept_story_handoff.',
            schema: getStoryCutHandoffSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: RecordStoryCutHandoffDeliveryInput) =>
            stringifyStoryAgentResult(
              await this.cutHandoffs.recordDelivery(scope, input)
            ),
          {
            name: STORY_RECORD_CUT_HANDOFF_TOOL_NAME,
            description:
              'Record the authoritative result returned by cut_accept_story_handoff. Initial delivery must record delivered with the created Cut project; later delivery must record proposal_ready with the reviewable proposal id. Record a stable failure instead of claiming delivery when Cut fails.',
            schema: recordStoryCutHandoffDeliverySchema,
            verboseParsingErrors: true
          }
        )
      ],
      wrapToolCall: async (request, handler) => {
        const toolName = request.toolCall.name
        const changeSummary = readChangeSummary(request.toolCall.args)
        if (!changeSummary || !MUTATION_TOOL_NAMES.has(toolName)) {
          return handler(request)
        }

        const createdAt = new Date()
        await dispatchStoryToolEvent(
          request,
          changeSummary,
          'running',
          createdAt
        )
        try {
          const result = await handler(request)
          await dispatchStoryToolEvent(
            request,
            changeSummary,
            'success',
            createdAt,
            {
              output: summarizeToolOutput(result)
            }
          )
          return result
        } catch (error) {
          await dispatchStoryToolEvent(
            request,
            changeSummary,
            'fail',
            createdAt,
            {
              error: error instanceof Error ? error.message : String(error)
            }
          )
          throw error
        }
      }
    }
  }
}

type ParsedGeneratedAssetReference = ReturnType<
  typeof attachGeneratedAssetImageSchema.parse
>['assetReference']

function normalizeParsedAssetReference(
  reference: ParsedGeneratedAssetReference
): StoryAssetReference {
  if (reference.type === 'general') return { type: 'general' }
  if (reference.type === 'continuity_view' && reference.key) {
    return { type: 'continuity_view', key: reference.key }
  }
  if (reference.type === 'expression' && reference.key) {
    return { type: 'expression', key: reference.key }
  }
  throw new Error('Generated assetReference was not normalized correctly.')
}

async function persistGeneratedAssetImage(
  files: WorkspaceFilesApi,
  input: AttachGeneratedAssetImageInput,
  source: WorkspaceRuntimeFileBuffer
): Promise<WorkspaceRuntimeFileBuffer> {
  const extension = imageExtension(
    source.mimeType ?? source.reference.mimeType ?? '',
    source.reference.originalName ?? source.reference.name ?? source.name
  )
  const mimeType =
    extension === 'jpg'
      ? 'image/jpeg'
      : extension === 'webp'
      ? 'image/webp'
      : 'image/png'
  const fileName = `${input.candidateId}.${extension}`
  const written = await files.writeRuntimeBuffer({
    buffer: source.buffer,
    folder: `files/story-studio/${input.projectId}/generated-assets`,
    fileName,
    originalName: fileName,
    mimeType,
    size: source.buffer.length,
    metadata: {
      source: 'story-studio',
      provider: input.providerReceipt.provider,
      providerTaskId: input.providerReceipt.taskId,
      assetId: input.assetId,
      candidateId: input.candidateId
    }
  })
  return {
    ...source,
    ...written,
    buffer: source.buffer,
    name: written.name,
    mimeType: written.mimeType ?? mimeType,
    size: written.size ?? source.buffer.length,
    reference: written.reference
  }
}

function imageExtension(mimeType: string, name: string) {
  const normalized = mimeType.toLowerCase()
  const lowerName = name.toLowerCase()
  if (
    normalized.includes('jpeg') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg')
  ) {
    return 'jpg'
  }
  if (normalized.includes('webp') || lowerName.endsWith('.webp')) {
    return 'webp'
  }
  return 'png'
}

async function persistGeneratedVideo(
  files: WorkspaceFilesApi,
  input: AttachGeneratedVideoInput,
  source: WorkspaceRuntimeFileBuffer
): Promise<WorkspaceRuntimeFileBuffer> {
  const fileName = `${input.candidateId}.mp4`
  const written = await files.writeRuntimeBuffer({
    buffer: source.buffer,
    folder: `files/story-studio/${input.projectId}/generated`,
    fileName,
    originalName: fileName,
    mimeType: 'video/mp4',
    size: source.buffer.length,
    metadata: {
      source: 'story-studio',
      provider: input.providerReceipt.provider,
      providerTaskId: input.providerReceipt.taskId,
      sceneId: input.sceneId,
      shotId: input.shotId,
      candidateId: input.candidateId
    }
  })
  return {
    ...source,
    ...written,
    buffer: source.buffer,
    name: written.name,
    mimeType: written.mimeType ?? 'video/mp4',
    size: written.size ?? source.buffer.length,
    reference: written.reference
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): StoryScope {
  return {
    tenantId: context.tenantId,
    organizationId:
      context.organizationId === undefined
        ? RequestContext.getOrganizationId()
        : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    hostProjectId: context.projectId ?? null,
    userId: context.userId ?? null,
    assistantId: context.xpertId ?? null,
    conversationId: context.conversationId ?? null,
    actorType: 'agent'
  }
}

type StoryToolRequest = Parameters<
  NonNullable<AgentMiddleware['wrapToolCall']>
>[0]
type StoryToolArgs = StoryToolRequest['toolCall']['args']
type StoryToolStepStatus = 'running' | 'success' | 'fail'

function readChangeSummary(args: StoryToolArgs) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return null
  }
  const value = Reflect.get(args, 'changeSummary')
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function dispatchStoryToolEvent(
  request: StoryToolRequest,
  message: string,
  status: StoryToolStepStatus,
  createdAt: Date,
  details: {
    output?: Record<string, unknown>
    error?: string
  } = {}
) {
  const toolCall = request.toolCall
  const runtimeMetadata =
    request.runtime && typeof request.runtime === 'object'
      ? Reflect.get(request.runtime, 'metadata')
      : null
  const toolset =
    readMetadataString(runtimeMetadata, 'toolset') ??
    STORY_STUDIO_MIDDLEWARE_NAME
  const toolsetId = readMetadataString(runtimeMetadata, 'toolsetId')
  const payload = {
    id:
      typeof toolCall.id === 'string' && toolCall.id.trim()
        ? toolCall.id
        : `${toolCall.name}:${createdAt.getTime()}`,
    tool_call_id: toolCall.id,
    category: 'Tool',
    type: ChatMessageStepCategory.Program,
    toolset,
    ...(toolsetId ? { toolset_id: toolsetId } : {}),
    tool: toolCall.name,
    title: message,
    message,
    status,
    created_date: createdAt,
    input: summarizeToolInput(toolCall.args),
    ...(details.output ? { output: details.output } : {}),
    ...(status === 'running' ? { end_date: null } : { end_date: new Date() }),
    ...(details.error ? { error: details.error } : {})
  }
  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, payload)
  } catch {
    // Event delivery must never fail the authoritative project mutation.
  }
}

function summarizeToolInput(args: StoryToolArgs) {
  return pickCompactFields(args, [
    'projectId',
    'suggestionId',
    'episodeId',
    'sceneId',
    'shotId',
    'handoffId',
    'operationId',
    'baseRevision',
    'status',
    'productionFormat'
  ])
}

function summarizeToolOutput(value: unknown) {
  const candidates = collectToolOutputObjects(value)
  let statusOnlySummary: Record<string, unknown> | undefined
  for (const candidate of candidates) {
    const summary = pickCompactFields(candidate, [
      'success',
      'duplicate',
      'operationId',
      'projectId',
      'suggestionId',
      'deletedSuggestionId',
      'handoffId',
      'cutProjectId',
      'cutProposalId',
      'sceneId',
      'shotId',
      'documentRevision',
      'previousRevision',
      'revision',
      'status'
    ])
    const keys = Object.keys(summary)
    if (keys.some((key) => key !== 'status')) {
      return summary
    }
    if (keys.length && !statusOnlySummary) {
      statusOnlySummary = summary
    }
  }
  return statusOnlySummary
}

function compactAssetImageMutationReceipt(
  result: Awaited<ReturnType<StoryProductionService['attachAssetImage']>>,
  input: Pick<
    AttachGeneratedAssetImageInput,
    'operationId' | 'assetId' | 'candidateId' | 'assetReference' | 'select'
  >
) {
  return {
    success: result.success,
    duplicate: result.duplicate,
    operationId: input.operationId,
    projectId: result.projectId,
    revision: result.revision,
    documentRevision: result.production.documentRevision,
    assetId: input.assetId,
    candidateId: input.candidateId,
    assetReference: input.assetReference,
    selected: input.select ?? true
  }
}

function collectToolOutputObjects(value: unknown) {
  const result: object[] = []
  const pending: unknown[] = [value]
  const seen = new Set<object>()
  while (pending.length && result.length < 16) {
    const current = pending.shift()
    if (typeof current === 'string') {
      const parsed = parseJsonObject(current)
      if (parsed) {
        pending.push(parsed)
      }
      continue
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      continue
    }
    if (seen.has(current)) {
      continue
    }
    seen.add(current)
    result.push(current)
    for (const key of [
      'content',
      'receipt',
      'data',
      'result',
      'project',
      'handoff'
    ]) {
      pending.push(Reflect.get(current, key))
    }
  }
  return result
}

function pickCompactFields(value: unknown, keys: readonly string[]) {
  const result: Record<string, unknown> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result
  }
  for (const key of keys) {
    const field = Reflect.get(value, key)
    if (
      typeof field === 'string' ||
      typeof field === 'number' ||
      typeof field === 'boolean'
    ) {
      result[key] = field
    }
  }
  return result
}

function parseJsonObject(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null
  } catch {
    return null
  }
}

function readMetadataString(value: object | null, key: string) {
  if (!value) {
    return null
  }
  const field = Reflect.get(value, key)
  return typeof field === 'string' && field.trim() ? field.trim() : null
}
