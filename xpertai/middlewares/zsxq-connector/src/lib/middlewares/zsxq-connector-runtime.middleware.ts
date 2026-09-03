import { Inject, Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'
import { ZSXQ_ICON } from '../branding.js'
import { ZsxqCliService } from '../cli/zsxq-cli.service.js'
import {
  ZSXQ_AUTH_METHOD_ID,
  ZSXQ_CONNECTOR_PROVIDER,
  ZSXQ_PLUGIN_CONFIG_TOKEN,
  ZSXQ_RUNTIME_MIDDLEWARE_NAME
} from '../constants.js'
import { ZsxqConnectorError } from '../errors.js'
import { attachmentDisplayNames, stageWorkspaceFiles } from '../files/zsxq-file-transfer.js'
import {
  mapAccount,
  mapComments,
  mapGroups,
  mapHashtags,
  mapMembers,
  mapMutationReceipt,
  mapNoteDetail,
  mapNotes,
  mapScheduledJobs,
  mapTopicDetail,
  mapTopics
} from '../mappers/zsxq-mappers.js'
import type { ZsxqPluginConfig } from '../plugin-config.js'
import { ZsxqConfirmationStore } from '../tools/confirmation-store.js'
import { defineAgentTool } from '../tools/define-agent-tool.js'
import {
  answerQuestionSchema,
  createCommentSchema,
  createNoteSchema,
  createTopicSchema,
  deleteNoteSchema,
  editNoteSchema,
  editTopicSchema,
  emptySchema,
  groupIdSchema,
  listCommentsSchema,
  listFootprintsSchema,
  listGroupsSchema,
  listNotesSchema,
  listScheduledTopicsSchema,
  listTopicsSchema,
  noteIdSchema,
  searchGroupsSchema,
  searchMembersSchema,
  searchTopicsSchema,
  scheduleTopicSchema,
  setTopicStateSchema,
  setTopicTagsSchema,
  unscheduleTopicSchema,
  topicIdSchema,
  type AnswerQuestionInput,
  type CreateCommentInput,
  type CreateNoteInput,
  type CreateTopicInput,
  type DeleteNoteInput,
  type EditNoteInput,
  type EditTopicInput,
  type GroupIdInput,
  type ListCommentsInput,
  type ListFootprintsInput,
  type ListGroupsInput,
  type ListNotesInput,
  type ListScheduledTopicsInput,
  type ListTopicsInput,
  type NoteIdInput,
  type SearchGroupsInput,
  type SearchMembersInput,
  type SearchTopicsInput,
  type ScheduleTopicInput,
  type SetTopicStateInput,
  type SetTopicTagsInput,
  type TopicIdInput,
  type UnscheduleTopicInput,
  type WorkspaceFileInput
} from '../tools/schemas.js'

type ZsxqRuntimeConfig = { provider?: string; connectorId?: string }
type HiddenAgentMiddlewareMeta = TAgentMiddlewareMeta & { builtin: true }
type RuntimeContext = { connectorId: string; handle: string; scopes: string[] }
type ConfirmableInput = { confirmed?: boolean; confirmationHandle?: string }

@Injectable()
@AgentMiddlewareStrategy(ZSXQ_RUNTIME_MIDDLEWARE_NAME)
export class ZsxqConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<ZsxqRuntimeConfig> {
  readonly meta: HiddenAgentMiddlewareMeta = {
    name: ZSXQ_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'Knowledge Planet connector runtime', zh_Hans: '知识星球连接器运行时' },
    description: {
      en_US: 'Bounded Knowledge Planet account, group, topic, comment, hashtag, note, and publishing tools.',
      zh_Hans: '受限的知识星球账户、星球、主题、评论、标签、笔记和发布工具。'
    },
    icon: ZSXQ_ICON,
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(
    private readonly cli: ZsxqCliService,
    private readonly confirmations: ZsxqConfirmationStore,
    @Inject(ZSXQ_PLUGIN_CONFIG_TOKEN) private readonly config: ZsxqPluginConfig
  ) {}

  createMiddleware(options: ZsxqRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const resolveRuntime = () => resolveRuntimeContext(options, context)
    const readTools: NonNullable<AgentMiddleware['tools']> = [
      defineAgentTool(async () => {
        const runtime = await resolveRuntime()
        return {
          status: 'connected',
          connectorId: runtime.connectorId,
          provider: ZSXQ_CONNECTOR_PROVIDER,
          scopes: runtime.scopes
        }
      }, toolFields('zsxq_connection_status', 'Check the selected Knowledge Planet connector binding without exposing its local session handle or OAuth token.', emptySchema, 'Check Knowledge Planet connection', '检查知识星球连接')),
      defineAgentTool(async () => {
        const runtime = await resolveRuntime()
        return mapAccount(await this.cli.runJson(runtime.handle, ['user', '+info', '--json'], { retryRead: true }))
      }, toolFields('zsxq_get_account', 'Get the connected Knowledge Planet account profile. Use this to verify the active identity.', emptySchema, 'Get Knowledge Planet account', '获取知识星球账户')),
      defineAgentTool<ListGroupsInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapGroups(
          await this.cli.runJson(
            runtime.handle,
            ['group', '+list', '--limit', String(input.limit), '--scope', input.scope, '--json'],
            { retryRead: true }
          )
        )
      }, toolFields('zsxq_list_groups', 'List a bounded set of Knowledge Planet groups joined or created by the connected account.', listGroupsSchema, 'List Knowledge Planet groups', '列出知识星球')),
      defineAgentTool<SearchGroupsInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapGroups(await this.apiCall(runtime, 'search_groups', { keyword: input.keyword }, true))
      }, toolFields('zsxq_search_groups', 'Search accessible Knowledge Planet groups by a bounded keyword.', searchGroupsSchema, 'Search Knowledge Planet groups', '搜索知识星球')),
      defineAgentTool<SearchMembersInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapMembers(
          await this.apiCall(
            runtime,
            'search_group_members',
            {
              group_id: input.groupId,
              keyword: input.keyword,
              limit: input.limit
            },
            true
          )
        )
      }, toolFields('zsxq_search_group_members', 'Search members visible in one exact Knowledge Planet group by a bounded keyword.', searchMembersSchema, 'Search group members', '搜索星球成员')),
      defineAgentTool<ListTopicsInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapTopics(
          await this.cli.runJson(
            runtime.handle,
            compactArgs([
              'group',
              '+topics',
              '--group-id',
              input.groupId,
              '--limit',
              String(input.limit),
              input.cursor ? '--end-time' : undefined,
              input.cursor,
              '--json'
            ]),
            { retryRead: true }
          )
        )
      }, toolFields('zsxq_list_group_topics', 'List one page of recent topics in an exact group. Reuse nextCursor unchanged and deduplicate the boundary topic ID between pages.', listTopicsSchema, 'List group topics', '列出星球主题')),
      defineAgentTool<SearchTopicsInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapTopics(
          await this.cli.runJson(
            runtime.handle,
            ['topic', '+search', '--group-id', input.groupId, '--query', input.query, '--json'],
            { retryRead: true }
          )
        )
      }, toolFields('zsxq_search_topics', 'Semantically search topics inside one exact group. Results are provider-ranked and may contain weak matches or omissions.', searchTopicsSchema, 'Search topics', '搜索主题')),
      defineAgentTool<TopicIdInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapTopicDetail(
          await this.cli.runJson(runtime.handle, ['topic', '+detail', '--topic-id', input.topicId, '--json'], {
            retryRead: true
          })
        )
      }, toolFields('zsxq_get_topic', 'Get allowlisted full details for one exact topic ID returned by a list or search tool. Comments are listed separately.', topicIdSchema, 'Get topic details', '获取主题详情')),
      defineAgentTool<ListCommentsInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapComments(
          await this.apiCall(
            runtime,
            'get_topic_comments',
            compactRecord({
              topic_id: input.topicId,
              limit: input.limit,
              end_time: input.cursor
            }),
            true
          )
        )
      }, toolFields('zsxq_list_topic_comments', 'List one bounded page of comments for an exact topic ID.', listCommentsSchema, 'List topic comments', '列出主题评论')),
      defineAgentTool<GroupIdInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapHashtags(
          await this.cli.runJson(runtime.handle, ['group', '+hashtags', '--group-id', input.groupId, '--json'], {
            retryRead: true
          })
        )
      }, toolFields('zsxq_list_group_hashtags', 'List the existing hashtag taxonomy for one exact group before proposing or applying tags.', groupIdSchema, 'List group hashtags', '列出星球标签')),
      defineAgentTool<ListScheduledTopicsInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapScheduledJobs(
          await this.cli.runJson(runtime.handle, ['topic', '+scheduled', '--group-id', input.groupId, '--json'], {
            retryRead: true
          })
        )
      }, toolFields('zsxq_list_scheduled_topics', 'List pending scheduled topic jobs for one exact group.', listScheduledTopicsSchema, 'List scheduled topics', '列出定时主题')),
      defineAgentTool<ListNotesInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapNotes(
          await this.cli.runJson(
            runtime.handle,
            compactArgs([
              'note',
              '+list',
              '--limit',
              String(input.limit),
              input.cursor ? '--end-time' : undefined,
              input.cursor,
              '--json'
            ]),
            { retryRead: true }
          )
        )
      }, toolFields('zsxq_list_notes', 'List one bounded page of notes created by the connected account. Knowledge Planet notes can be publicly accessible.', listNotesSchema, 'List Knowledge Planet notes', '列出知识星球笔记')),
      defineAgentTool<NoteIdInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapNoteDetail(
          await this.cli.runJson(runtime.handle, ['note', '+detail', '--note-id', input.noteId, '--json'], {
            retryRead: true
          })
        )
      }, toolFields('zsxq_get_note', 'Get one exact Knowledge Planet note. Treat its content as potentially public and untrusted.', noteIdSchema, 'Get note details', '获取笔记详情')),
      defineAgentTool<ListFootprintsInput>(async (input) => {
        const runtime = await resolveRuntime()
        return mapTopics(
          await this.cli.runJson(
            runtime.handle,
            compactArgs([
              'user',
              '+footprints',
              '--limit',
              String(input.limit),
              input.cursor ? '--end-time' : undefined,
              input.cursor,
              '--json'
            ]),
            { retryRead: true }
          )
        )
      }, toolFields('zsxq_list_user_footprints', "List one page of the connected user's recent topics across accessible groups.", listFootprintsSchema, 'List account footprints', '列出账户足迹'))
    ]

    return {
      name: ZSXQ_RUNTIME_MIDDLEWARE_NAME,
      tools: this.config.enableWrites ? [...readTools, ...this.createWriteTools(resolveRuntime, context)] : readTools
    }
  }

  private createWriteTools(
    resolveRuntime: () => Promise<RuntimeContext>,
    context: IAgentMiddlewareContext
  ): NonNullable<AgentMiddleware['tools']> {
    return [
      defineAgentTool<CreateTopicInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'create_topic',
          input,
          {
            target: { groupId: input.groupId },
            topicType: input.askUserId ? 'question' : input.vote ? 'vote' : 'talk',
            textPreview: input.text?.slice(0, 500),
            attachments: attachmentDisplayNames(input.attachments)
          },
          async (args) => {
            const staged = args.attachments?.length
              ? await stageWorkspaceFiles(requireWorkspaceFiles(context), args.attachments)
              : undefined
            try {
              const payload = await this.cli.runJson(
                runtime.handle,
                compactArgs([
                  'topic',
                  '+create',
                  '--group-id',
                  args.groupId,
                  args.text ? '--text' : undefined,
                  args.text,
                  staged?.paths.length ? '--files' : undefined,
                  staged?.paths.join(','),
                  args.markdown ? '--markdown' : undefined,
                  '--ai-mode',
                  args.aiMode,
                  args.askUserId ? '--ask' : undefined,
                  args.askUserId,
                  args.anonymous ? '--anonymous' : undefined,
                  args.vote ? '--vote-title' : undefined,
                  args.vote?.title,
                  args.vote ? '--vote-options' : undefined,
                  args.vote?.options.join(','),
                  args.checkinId ? '--checkin-id' : undefined,
                  args.checkinId,
                  '--json'
                ])
              )
              const receipt = mapMutationReceipt(payload, 'create_topic', ['topic_id', 'id'])
              const verified = receipt.id ? await this.tryGetTopic(runtime, receipt.id) : undefined
              return { ...receipt, verified: !!verified, topic: verified }
            } finally {
              await staged?.cleanup()
            }
          }
        )
      }, toolFields('zsxq_create_topic', 'Prepare or publish one topic. First call without confirmation fields to receive an exact preview and single-use handle. After explicit human approval through Xpert HITL, repeat the same arguments with confirmed=true and that handle. This is externally visible and non-idempotent.', createTopicSchema, 'Publish Knowledge Planet topic', '发布知识星球主题')),
      defineAgentTool<CreateCommentInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'create_comment',
          input,
          {
            target: { topicId: input.topicId, replyToCommentId: input.replyToCommentId },
            textPreview: input.text.slice(0, 500),
            attachments: attachmentDisplayNames(input.attachment ? [input.attachment] : undefined)
          },
          async (args) => {
            const staged = args.attachment
              ? await stageWorkspaceFiles(requireWorkspaceFiles(context), [args.attachment], { maxFiles: 1 })
              : undefined
            try {
              return mapMutationReceipt(
                await this.cli.runJson(
                  runtime.handle,
                  compactArgs([
                    'topic',
                    '+reply',
                    '--topic-id',
                    args.topicId,
                    '--text',
                    args.text,
                    args.replyToCommentId ? '--reply-to' : undefined,
                    args.replyToCommentId,
                    staged?.paths.length ? '--files' : undefined,
                    staged?.paths[0],
                    '--json'
                  ])
                ),
                'create_comment',
                ['comment_id', 'id']
              )
            } finally {
              await staged?.cleanup()
            }
          }
        )
      }, toolFields('zsxq_create_comment', 'Prepare or publish one public comment or nested reply. Use the returned confirmation handle only after explicit human approval through Xpert HITL. This operation is non-idempotent.', createCommentSchema, 'Post Knowledge Planet comment', '发布知识星球评论')),
      defineAgentTool<EditTopicInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'edit_topic',
          input,
          {
            target: { topicId: input.topicId },
            textPreview: input.text?.slice(0, 500),
            clearFiles: input.clearFiles,
            attachments: attachmentDisplayNames(input.attachments)
          },
          async (args) => {
            const staged = args.attachments?.length
              ? await stageWorkspaceFiles(requireWorkspaceFiles(context), args.attachments)
              : undefined
            try {
              const payload = await this.cli.runJson(
                runtime.handle,
                compactArgs([
                  'topic',
                  '+edit',
                  '--topic-id',
                  args.topicId,
                  args.text ? '--text' : undefined,
                  args.text,
                  staged?.paths.length ? '--files' : undefined,
                  staged?.paths.join(','),
                  args.clearFiles ? '--clear-files' : undefined,
                  args.aiMode ? '--ai-mode' : undefined,
                  args.aiMode,
                  '--json'
                ])
              )
              const topic = await this.tryGetTopic(runtime, args.topicId)
              return {
                ...mapMutationReceipt(payload, 'edit_topic', ['topic_id', 'id']),
                id: args.topicId,
                verified: !!topic,
                topic
              }
            } finally {
              await staged?.cleanup()
            }
          }
        )
      }, toolFields('zsxq_edit_topic', 'Prepare or replace exact topic text and attachments. The original content is not recoverable; require explicit human approval through Xpert HITL.', editTopicSchema, 'Edit Knowledge Planet topic', '编辑知识星球主题')),
      defineAgentTool<AnswerQuestionInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'answer_question',
          input,
          {
            target: { topicId: input.topicId },
            textPreview: input.text.slice(0, 500),
            scheduledTime: input.scheduledTime,
            silenced: input.silenced,
            attachments: attachmentDisplayNames(input.image ? [input.image] : undefined)
          },
          async (args) => {
            const staged = args.image
              ? await stageWorkspaceFiles(requireWorkspaceFiles(context), [args.image], {
                  imagesOnly: true,
                  maxFiles: 1
                })
              : undefined
            try {
              return mapMutationReceipt(
                await this.cli.runJson(
                  runtime.handle,
                  compactArgs([
                    'topic',
                    '+answer',
                    '--topic-id',
                    args.topicId,
                    '--text',
                    args.text,
                    staged?.paths.length ? '--files' : undefined,
                    staged?.paths[0],
                    args.scheduledTime ? '--scheduled-time' : undefined,
                    args.scheduledTime,
                    args.silenced ? '--silenced' : undefined,
                    '--json'
                  ])
                ),
                'answer_question',
                ['answer_id', 'job_id', 'id']
              )
            } finally {
              await staged?.cleanup()
            }
          }
        )
      }, toolFields('zsxq_answer_question', 'Prepare or publish the single official answer to one q&a topic, optionally scheduled. Use the confirmation handle only after explicit human approval through Xpert HITL. An immediate answer cannot be edited or safely retried after an uncertain result.', answerQuestionSchema, 'Answer Knowledge Planet question', '回答知识星球提问')),
      defineAgentTool<SetTopicStateInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'set_topic_state',
          input,
          {
            target: { topicId: input.topicId },
            digested: input.digested,
            sticky: input.sticky
          },
          async (args) => {
            const payload = await this.cli.runJson(
              runtime.handle,
              compactArgs([
                'topic',
                '+set',
                '--topic-id',
                args.topicId,
                args.digested !== undefined ? '--digested' : undefined,
                args.digested !== undefined ? String(args.digested) : undefined,
                args.sticky !== undefined ? '--sticky' : undefined,
                args.sticky !== undefined ? String(args.sticky) : undefined,
                '--json'
              ])
            )
            const topic = await this.tryGetTopic(runtime, args.topicId)
            const verified =
              !!topic &&
              (args.digested === undefined || topic.digested === args.digested) &&
              (args.sticky === undefined || topic.sticky === args.sticky)
            return {
              ...mapMutationReceipt(payload, 'set_topic_state', ['topic_id', 'id']),
              id: args.topicId,
              verified,
              topic
            }
          }
        )
      }, toolFields('zsxq_set_topic_state', 'Prepare or apply exact digested and sticky state changes to one topic. Requires group management permission and explicit human approval through Xpert HITL.', setTopicStateSchema, 'Update topic state', '更新主题状态')),
      defineAgentTool<SetTopicTagsInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'set_topic_tags',
          input,
          {
            target: { topicId: input.topicId },
            titles: input.titles
          },
          async (args) => ({
            ...mapMutationReceipt(
              await this.apiCall(runtime, 'set_topic_tags', {
                topic_id: args.topicId,
                titles: args.titles
              }),
              'set_topic_tags',
              ['topic_id', 'id']
            ),
            id: args.topicId,
            verified: false
          })
        )
      }, toolFields('zsxq_set_topic_tags', 'Prepare or replace all topic tags with an exact bounded title list. List the group hashtags first and obtain explicit human approval through Xpert HITL.', setTopicTagsSchema, 'Set topic tags', '设置主题标签')),
      defineAgentTool<ScheduleTopicInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'schedule_topic',
          input,
          {
            target: { groupId: input.groupId, jobId: input.jobId },
            scheduledTime: input.scheduledTime,
            textPreview: input.text?.slice(0, 500),
            attachments: attachmentDisplayNames(input.attachments)
          },
          async (args) => {
            const staged = args.attachments?.length
              ? await stageWorkspaceFiles(requireWorkspaceFiles(context), args.attachments)
              : undefined
            try {
              return mapMutationReceipt(
                await this.cli.runJson(
                  runtime.handle,
                  compactArgs([
                    'topic',
                    '+schedule',
                    '--group-id',
                    args.groupId,
                    args.jobId ? '--job-id' : undefined,
                    args.jobId,
                    args.text ? '--text' : undefined,
                    args.text,
                    staged?.paths.length ? '--files' : undefined,
                    staged?.paths.join(','),
                    '--scheduled-time',
                    args.scheduledTime,
                    '--json'
                  ])
                ),
                'schedule_topic',
                ['job_id', 'id']
              )
            } finally {
              await staged?.cleanup()
            }
          }
        )
      }, toolFields('zsxq_schedule_topic', 'Prepare a new or updated scheduled topic post. The provider limits jobs to the next 14 days; require explicit human approval through Xpert HITL.', scheduleTopicSchema, 'Schedule Knowledge Planet topic', '定时发布知识星球主题')),
      defineAgentTool<UnscheduleTopicInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'unschedule_topic',
          input,
          {
            target: { groupId: input.groupId, jobId: input.jobId },
            consequence: 'permanent removal of pending job'
          },
          async (args) => ({
            ...mapMutationReceipt(
              await this.cli.runJson(runtime.handle, [
                'topic',
                '+unschedule',
                '--group-id',
                args.groupId,
                '--job-id',
                args.jobId,
                '--json'
              ]),
              'unschedule_topic',
              ['job_id', 'id']
            ),
            id: args.jobId,
            destructive: true,
            verified: false
          })
        )
      }, toolFields('zsxq_unschedule_topic', 'Prepare and permanently remove one pending scheduled job. Read the job first and require explicit human approval through Xpert HITL.', unscheduleTopicSchema, 'Cancel scheduled topic', '取消定时主题', { type: 'font', value: 'ri-delete-bin-line', color: '#dc2626' })),
      defineAgentTool<CreateNoteInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'create_note',
          input,
          {
            visibility: 'public',
            textPreview: input.text.slice(0, 500),
            attachments: attachmentDisplayNames(input.images)
          },
          async (args) => {
            const staged = args.images?.length
              ? await stageWorkspaceFiles(requireWorkspaceFiles(context), args.images, { imagesOnly: true })
              : undefined
            try {
              const receipt = mapMutationReceipt(
                await this.cli.runJson(
                  runtime.handle,
                  compactArgs([
                    'note',
                    '+create',
                    '--text',
                    args.text,
                    staged?.paths.length ? '--files' : undefined,
                    staged?.paths.join(','),
                    '--json'
                  ])
                ),
                'create_note',
                ['note_id', 'id']
              )
              const note = receipt.id ? await this.tryGetNote(runtime, receipt.id) : undefined
              return { ...receipt, verified: !!note, note }
            } finally {
              await staged?.cleanup()
            }
          }
        )
      }, toolFields('zsxq_create_note', 'Prepare or create a Knowledge Planet note. Notes can be publicly accessible; require explicit human approval through Xpert HITL before the confirmed call.', createNoteSchema, 'Create public Knowledge Planet note', '创建公开知识星球笔记')),
      defineAgentTool<EditNoteInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'edit_note',
          input,
          {
            target: { noteId: input.noteId },
            textPreview: input.text?.slice(0, 500),
            clearImages: input.clearImages,
            attachments: attachmentDisplayNames(input.images)
          },
          async (args) => {
            const staged = args.images?.length
              ? await stageWorkspaceFiles(requireWorkspaceFiles(context), args.images, { imagesOnly: true })
              : undefined
            try {
              const payload = await this.cli.runJson(
                runtime.handle,
                compactArgs([
                  'note',
                  '+edit',
                  '--note-id',
                  args.noteId,
                  args.text ? '--text' : undefined,
                  args.text,
                  staged?.paths.length ? '--files' : undefined,
                  staged?.paths.join(','),
                  args.clearImages ? '--clear-files' : undefined,
                  '--json'
                ])
              )
              const note = await this.tryGetNote(runtime, args.noteId)
              return {
                ...mapMutationReceipt(payload, 'edit_note', ['note_id', 'id']),
                id: args.noteId,
                verified: !!note,
                note
              }
            } finally {
              await staged?.cleanup()
            }
          }
        )
      }, toolFields('zsxq_edit_note', 'Prepare or replace note text and/or images. The original content is not recoverable; obtain explicit human approval through Xpert HITL.', editNoteSchema, 'Edit Knowledge Planet note', '编辑知识星球笔记')),
      defineAgentTool<DeleteNoteInput>(async (input) => {
        const runtime = await resolveRuntime()
        return this.withConfirmation(
          runtime,
          context,
          'delete_note',
          input,
          {
            target: { noteId: input.noteId },
            consequence: 'permanent deletion'
          },
          async (args) => ({
            ...mapMutationReceipt(
              await this.cli.runJson(runtime.handle, ['note', '+delete', '--note-id', args.noteId, '--json']),
              'delete_note',
              ['note_id', 'id']
            ),
            id: args.noteId,
            destructive: true,
            verified: false
          })
        )
      }, toolFields('zsxq_delete_note', 'Prepare or permanently delete one note. Read the note first, show the exact consequence, and require explicit human approval through Xpert HITL before the confirmed call.', deleteNoteSchema, 'Delete Knowledge Planet note', '删除知识星球笔记', { type: 'font', value: 'ri-delete-bin-line', color: '#dc2626' }))
    ]
  }

  private async apiCall(runtime: RuntimeContext, name: string, params: Record<string, unknown>, retryRead = false) {
    return this.cli.runJson(runtime.handle, ['api', 'call', name, '--params', JSON.stringify(params)], { retryRead })
  }

  private async withConfirmation<T extends ConfirmableInput, TResult>(
    runtime: RuntimeContext,
    context: IAgentMiddlewareContext,
    operation: string,
    input: T,
    preview: object,
    execute: (args: Omit<T, 'confirmed' | 'confirmationHandle'>) => Promise<TResult>
  ): Promise<TResult | object> {
    if (!this.config.enableWrites)
      throw new ZsxqConnectorError('WRITES_DISABLED', 'Knowledge Planet write tools are disabled.')
    if (!runtime.scopes.includes('zsxq.write'))
      throw new ZsxqConnectorError(
        'PERMISSION_DENIED',
        'Knowledge Planet write scope is not granted for this connection.'
      )
    if (!context.workspaceId)
      throw new ZsxqConnectorError('CONNECTOR_UNAVAILABLE', 'Knowledge Planet writes require an active workspace.')
    const args = stripConfirmation(input)
    const identity = {
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId,
      workspaceId: context.workspaceId,
      connectorId: runtime.connectorId
    }
    if (!input.confirmed || !input.confirmationHandle) {
      const confirmation = this.confirmations.create({ ...identity, operation, arguments: args })
      return {
        status: 'confirmation_required',
        operation,
        preview,
        confirmationHandle: confirmation.handle,
        expiresAt: confirmation.expiresAt,
        nextAction:
          'Obtain explicit user approval through Xpert HITL, then repeat the same tool arguments with confirmed=true and confirmationHandle.'
      }
    }
    this.confirmations.take({
      ...identity,
      operation,
      arguments: args,
      handle: input.confirmationHandle
    })
    return execute(args)
  }

  private async tryGetTopic(runtime: RuntimeContext, topicId: string) {
    try {
      return mapTopicDetail(
        await this.cli.runJson(runtime.handle, ['topic', '+detail', '--topic-id', topicId, '--json'], {
          retryRead: true
        })
      )
    } catch {
      return undefined
    }
  }

  private async tryGetNote(runtime: RuntimeContext, noteId: string) {
    try {
      return mapNoteDetail(
        await this.cli.runJson(runtime.handle, ['note', '+detail', '--note-id', noteId, '--json'], { retryRead: true })
      )
    } catch {
      return undefined
    }
  }
}

async function resolveRuntimeContext(
  options: ZsxqRuntimeConfig,
  context: IAgentMiddlewareContext
): Promise<RuntimeContext> {
  if (options.provider && options.provider !== ZSXQ_CONNECTOR_PROVIDER) {
    throw new ZsxqConnectorError('CONNECTOR_UNAVAILABLE', `Unsupported connector provider '${options.provider}'.`)
  }
  if (!context.workspaceId)
    throw new ZsxqConnectorError('CONNECTOR_UNAVAILABLE', 'Knowledge Planet tools require an active workspace.')
  const connectorRuntime = context.runtime.capabilities?.get(ConnectorRuntimeCapability)
  if (!connectorRuntime?.getConnectorCredential) {
    throw new ZsxqConnectorError('CONNECTOR_UNAVAILABLE', 'Connector runtime capability is unavailable.')
  }
  const value = await connectorRuntime.getConnectorCredential({
    workspaceId: context.workspaceId,
    provider: ZSXQ_CONNECTOR_PROVIDER,
    ...(options.connectorId ? { connectorId: options.connectorId } : {})
  })
  return readRuntimeCredential(value)
}

function readRuntimeCredential(value: ConnectorRuntimeCredentialV2): RuntimeContext {
  const handle = readString(value.credentials.connectionHandle)
  if (
    value.provider !== ZSXQ_CONNECTOR_PROVIDER ||
    value.authMethodId !== ZSXQ_AUTH_METHOD_ID ||
    !value.connectorId ||
    !handle
  ) {
    throw new ZsxqConnectorError('AUTH_EXPIRED', 'Knowledge Planet runtime credential is missing or invalid.')
  }
  return { connectorId: value.connectorId, handle, scopes: value.scopes ?? ['zsxq.read'] }
}

function requireWorkspaceFiles(context: IAgentMiddlewareContext): WorkspaceFilesApi {
  const files = context.runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
  if (!files)
    throw new ZsxqConnectorError('WORKSPACE_FILES_UNAVAILABLE', 'Workspace Files is required for attachments.')
  return files
}

function toolFields(
  name: string,
  description: string,
  schema: z.ZodTypeAny,
  en_US: string,
  zh_Hans: string,
  toolIcon?: { type: 'font'; value: string; color?: string }
) {
  return {
    name,
    description,
    schema,
    verboseParsingErrors: true as const,
    metadata: { toolName: { en_US, zh_Hans }, ...(toolIcon ? { toolIcon } : {}) }
  }
}

function stripConfirmation<T extends ConfirmableInput>(input: T): Omit<T, 'confirmed' | 'confirmationHandle'> {
  const { confirmed: _confirmed, confirmationHandle: _confirmationHandle, ...args } = input
  return args
}

function compactArgs(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => value !== undefined)
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
