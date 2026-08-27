import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import {
  mapAgent,
  mapDepartment,
  mapDepartmentList,
  mapDepartmentMembers,
  mapMedia,
  mapMember,
  mapMessageReceipt,
  mapTagList,
  mapTagMembers
} from './api/mappers.js'
import type { WeComRuntimeCredential } from './api/types.js'
import { WeComApiClient } from './api/wecom-api.client.js'
import { WeComConnectorError } from './errors.js'
import { prepareWorkspaceFile } from './middlewares/workspace-file.js'
import { WeComConfirmationStore } from './tools/confirmation-store.js'
import { defineAgentTool } from './tools/define-agent-tool.js'
import {
  getContextSchema,
  getDepartmentSchema,
  getMemberSchema,
  getTagMembersSchema,
  listDepartmentMembersSchema,
  listDepartmentsSchema,
  listTagsSchema,
  recallMessageSchema,
  sendFileMessageSchema,
  sendMarkdownMessageSchema,
  sendTextMessageSchema,
  type GetContextInput,
  type GetDepartmentInput,
  type GetMemberInput,
  type GetTagMembersInput,
  type ListDepartmentMembersInput,
  type ListDepartmentsInput,
  type ListTagsInput,
  type RecallMessageInput,
  type SendFileMessageInput,
  type SendMarkdownMessageInput,
  type SendTextMessageInput
} from './tools/schemas.js'
import {
  WECOM_CONNECTOR_ICON_DEFINITION,
  WECOM_CONNECTOR_PROVIDER,
  WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
  readString
} from './types.js'

type WeComConnectorRuntimeConfig = {
  provider?: string
  connectorId?: string
}

type HiddenAgentMiddlewareMeta = TAgentMiddlewareMeta & { builtin: true }
type ConfirmableInput = { confirmation_handle?: string; confirmed?: true }

@Injectable()
@AgentMiddlewareStrategy(WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME)
export class WeComConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<WeComConnectorRuntimeConfig> {
  readonly meta: HiddenAgentMiddlewareMeta = {
    name: WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'WeCom connector runtime', zh_Hans: '企业微信连接器运行时' },
    description: {
      en_US: 'Hidden runtime implementation for bounded WeCom Agent tools.',
      zh_Hans: '为企业微信受限 Agent 工具提供隐藏运行时实现。'
    },
    icon: WECOM_CONNECTOR_ICON_DEFINITION,
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(
    private readonly api: WeComApiClient,
    private readonly confirmations: WeComConfirmationStore
  ) {}

  createMiddleware(options: WeComConnectorRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const resolveRuntime = () => resolveRuntimeContext(options, context)

    return {
      name: WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
      tools: [
        defineAgentTool<GetContextInput>(
          async () => {
            const runtime = await resolveRuntime()
            const application = mapAgent(await this.api.getAgent(runtime.accessToken, runtime.agentId))
            return {
              connectorId: runtime.connectorId,
              connectedIdentity: compact({
                userId: runtime.profile.userId,
                name: runtime.profile.name
              }),
              application
            }
          },
          toolFields(
            'wecom_get_context',
            'Read the connected WeCom identity, application metadata, and visible-scope counts. Returns no access token or app secret.',
            'Get WeCom context',
            '获取企业微信上下文',
            getContextSchema
          )
        ),
        defineAgentTool<ListDepartmentsInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return mapDepartmentList(
              await this.api.listDepartments(runtime.accessToken, input.parent_department_id),
              input.parent_department_id,
              input.limit
            )
          },
          toolFields(
            'wecom_list_departments',
            'List a bounded page of direct child department IDs visible to the connected WeCom application. Use wecom_get_department to resolve one department name.',
            'List WeCom departments',
            '列出企业微信部门',
            listDepartmentsSchema
          )
        ),
        defineAgentTool<GetDepartmentInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return mapDepartment(await this.api.getDepartment(runtime.accessToken, input.department_id))
          },
          toolFields(
            'wecom_get_department',
            'Read one exact visible WeCom department by department ID.',
            'Get WeCom department',
            '获取企业微信部门',
            getDepartmentSchema
          )
        ),
        defineAgentTool<ListDepartmentMembersInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return mapDepartmentMembers(
              await this.api.listDepartmentMembers(runtime.accessToken, input.department_id),
              input.limit
            )
          },
          toolFields(
            'wecom_list_department_members',
            'List a bounded page of member summaries in one exact visible WeCom department. This does not recurse into child departments.',
            'List department members',
            '列出部门成员',
            listDepartmentMembersSchema
          )
        ),
        defineAgentTool<GetMemberInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return mapMember(await this.api.getMember(runtime.accessToken, input.user_id))
          },
          toolFields(
            'wecom_get_member',
            'Read an allowlisted business profile for one exact visible WeCom user ID. Mobile, email, address, and raw provider fields are omitted.',
            'Get WeCom member',
            '获取企业微信成员',
            getMemberSchema
          )
        ),
        defineAgentTool<ListTagsInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return mapTagList(await this.api.listTags(runtime.accessToken), input.limit)
          },
          toolFields(
            'wecom_list_tags',
            'List a bounded page of tags visible to the connected WeCom application.',
            'List WeCom tags',
            '列出企业微信标签',
            listTagsSchema
          )
        ),
        defineAgentTool<GetTagMembersInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return mapTagMembers(await this.api.getTagMembers(runtime.accessToken, input.tag_id), input.limit)
          },
          toolFields(
            'wecom_get_tag_members',
            'Read bounded member and department membership for one exact visible WeCom tag.',
            'Get tag members',
            '获取标签成员',
            getTagMembersSchema
          )
        ),
        defineAgentTool<SendTextMessageInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            const operationArguments = { userIds: input.to_user_ids, content: input.content }
            return this.executeMutation({
              runtime,
              operation: 'send_text_message',
              input,
              arguments: operationArguments,
              summary: { recipients: input.to_user_ids, messageType: 'text', content: input.content },
              execute: async () =>
                mapMessageReceipt(
                  await this.api.sendMessage({
                    accessToken: runtime.accessToken,
                    agentId: runtime.agentId,
                    userIds: input.to_user_ids,
                    message: { type: 'text', content: input.content }
                  }),
                  'send_text_message'
                )
            })
          },
          toolFields(
            'wecom_send_text_message',
            'Prepare or send one WeCom application text message to explicit user IDs only. The first call returns confirmation_required; repeat the exact call with its confirmation_handle and confirmed=true only after explicit user confirmation.',
            'Send WeCom text',
            '发送企业微信文本',
            sendTextMessageSchema
          )
        ),
        defineAgentTool<SendMarkdownMessageInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            const operationArguments = { userIds: input.to_user_ids, content: input.content }
            return this.executeMutation({
              runtime,
              operation: 'send_markdown_message',
              input,
              arguments: operationArguments,
              summary: { recipients: input.to_user_ids, messageType: 'markdown', content: input.content },
              execute: async () =>
                mapMessageReceipt(
                  await this.api.sendMessage({
                    accessToken: runtime.accessToken,
                    agentId: runtime.agentId,
                    userIds: input.to_user_ids,
                    message: { type: 'markdown', content: input.content }
                  }),
                  'send_markdown_message'
                )
            })
          },
          toolFields(
            'wecom_send_markdown_message',
            'Prepare or send one WeCom application Markdown message to explicit user IDs only. The first call requires confirmation and does not send.',
            'Send WeCom Markdown',
            '发送企业微信 Markdown',
            sendMarkdownMessageSchema
          )
        ),
        defineAgentTool<SendFileMessageInput>(
          async (input) => {
            const source = await prepareWorkspaceFile(context, input.file)
            const runtime = await resolveRuntime()
            const operationArguments = {
              userIds: input.to_user_ids,
              file: {
                name: source.fileName,
                size: source.size,
                sha256: source.sha256,
                workspacePath: source.workspacePath
              }
            }
            return this.executeMutation({
              runtime,
              operation: 'send_file_message',
              input,
              arguments: operationArguments,
              summary: { recipients: input.to_user_ids, messageType: 'file', file: operationArguments.file },
              execute: async () => {
                const media = mapMedia(
                  await this.api.uploadFile({
                    accessToken: runtime.accessToken,
                    fileName: source.fileName,
                    mimeType: source.mimeType,
                    buffer: source.buffer
                  })
                )
                if (!media.mediaId) {
                  throw new WeComConnectorError('PROVIDER_REJECTED', 'WeCom did not return a media ID for the file.')
                }
                return {
                  ...mapMessageReceipt(
                    await this.api.sendMessage({
                      accessToken: runtime.accessToken,
                      agentId: runtime.agentId,
                      userIds: input.to_user_ids,
                      message: { type: 'file', mediaId: media.mediaId }
                    }),
                    'send_file_message'
                  ),
                  file: operationArguments.file
                }
              }
            })
          },
          toolFields(
            'wecom_send_file_message',
            'Prepare or send one Workspace Files object as a WeCom file message to explicit user IDs. Reads at most 20 MiB, binds confirmation to the SHA-256 digest, and never exposes Base64.',
            'Send WeCom file',
            '发送企业微信文件',
            sendFileMessageSchema
          )
        ),
        defineAgentTool<RecallMessageInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            const operationArguments = { messageId: input.message_id }
            return this.executeMutation({
              runtime,
              operation: 'recall_message',
              input,
              arguments: operationArguments,
              summary: { messageId: input.message_id },
              execute: async () => ({
                ...mapMessageReceipt(
                  await this.api.recallMessage(runtime.accessToken, input.message_id),
                  'recall_message'
                ),
                messageId: input.message_id
              })
            })
          },
          toolFields(
            'wecom_recall_message',
            'Prepare or recall one application message by exact message ID. WeCom only permits recall within its provider time window. The first call does not recall.',
            'Recall WeCom message',
            '撤回企业微信消息',
            recallMessageSchema
          )
        )
      ]
    }
  }

  private async executeMutation(input: {
    runtime: WeComRuntimeCredential
    operation: string
    input: ConfirmableInput
    arguments: Record<string, unknown>
    summary: Record<string, unknown>
    execute: () => Promise<unknown>
  }) {
    if (!input.input.confirmation_handle) {
      const confirmation = this.confirmations.create({
        connectorId: input.runtime.connectorId,
        operation: input.operation,
        arguments: input.arguments
      })
      return {
        status: 'confirmation_required',
        errorCode: 'CONFIRMATION_REQUIRED',
        confirmationHandle: confirmation.handle,
        expiresAt: confirmation.expiresAt,
        operationSummary: input.summary,
        nextAction:
          'Request explicit user confirmation through Xpert structured human input, then repeat the exact tool call with confirmation_handle and confirmed=true.'
      }
    }
    if (input.input.confirmed !== true) {
      throw new WeComConnectorError('CONFIRMATION_INVALID', 'Explicit structured user confirmation is required.')
    }
    this.confirmations.take({
      handle: input.input.confirmation_handle,
      connectorId: input.runtime.connectorId,
      operation: input.operation,
      arguments: input.arguments
    })
    return input.execute()
  }
}

async function resolveRuntimeContext(
  options: WeComConnectorRuntimeConfig,
  context: IAgentMiddlewareContext
): Promise<WeComRuntimeCredential> {
  if (!context.workspaceId) {
    throw new WeComConnectorError('RUNTIME_UNAVAILABLE', 'The WeCom connector requires a workspace ID.')
  }
  const connectorRuntime = context.runtime.capabilities?.get(ConnectorRuntimeCapability) as
    | ConnectorRuntimeApi
    | undefined
  if (!connectorRuntime?.getConnectorCredential) {
    throw new WeComConnectorError(
      'RUNTIME_UNAVAILABLE',
      'The WeCom connector requires the multi-auth connector runtime capability.'
    )
  }
  const stored = await connectorRuntime.getConnectorCredential({
    workspaceId: context.workspaceId,
    provider: WECOM_CONNECTOR_PROVIDER,
    ...(options.connectorId ? { connectorId: options.connectorId } : {})
  })
  return readRuntimeCredential(stored)
}

function readRuntimeCredential(value: ConnectorRuntimeCredentialV2): WeComRuntimeCredential {
  const accessToken = readString(value.credentials.accessToken)
  const corpId = readString(value.credentials.corpId)
  const agentId = readString(value.credentials.agentId)
  if (!value.connectorId || !accessToken || !corpId || !agentId) {
    throw new WeComConnectorError('TOKEN_EXPIRED', 'The WeCom runtime credential is incomplete. Reconnect and retry.')
  }
  const profile = value.profile as Record<string, unknown> | undefined
  return {
    connectorId: value.connectorId,
    accessToken,
    corpId,
    agentId,
    profile: compact({
      userId: readString(profile?.userId),
      name: readString(profile?.name)
    })
  }
}

function toolFields(
  name: string,
  description: string,
  en_US: string,
  zh_Hans: string,
  schema: Parameters<typeof defineAgentTool>[1]['schema']
) {
  return {
    name,
    description,
    schema,
    verboseParsingErrors: true as const,
    metadata: { toolName: { en_US, zh_Hans } }
  }
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
