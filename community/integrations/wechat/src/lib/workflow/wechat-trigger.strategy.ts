import type { ChecklistItem, IIntegration, TWorkflowTriggerMeta } from '@xpert-ai/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import path from 'node:path'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  IWorkflowTriggerStrategy,
  type PluginContext,
  RequestContext,
  TWorkflowTriggerParams,
  WorkflowTriggerStrategy
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID, WECHAT_ICON, WECHAT_PROVIDER_KEY } from '../constants.js'
import {
  WechatAccountEntity,
  WechatMessageFileEntity,
  WechatMessageLogEntity,
  WechatMessageLogStatus,
  WechatTriggerBindingEntity
} from '../entities/index.js'
import { WechatChatDispatchInput, WechatChatDispatchService } from '../handoff/wechat-chat-dispatch.service.js'
import { WechatMessage } from '../message.js'
import { WECHAT_PLUGIN_CONTEXT } from '../tokens.js'
import {
  DEFAULT_GROUP_JOIN_WELCOME_PROMPT,
  normalizeChatFilterMode,
  normalizeGroupJoinWelcomePrompt,
  normalizeGroupTriggerOverrides,
  normalizeGroupTriggerMode,
  normalizeIdList,
  normalizeKeywords,
  normalizeSelfMessagePolicy,
  normalizeString,
  shouldDispatchWechatBatch,
  TIntegrationWechatOptions,
  WechatBatchTriggerItem,
  WechatInboundTriggerOptions,
  type WechatInboundFile,
  type WechatPendingInboundFile
} from '../types.js'
import { WechatChannelStrategy } from '../wechat-channel.strategy.js'
import { WechatClient } from '../wechat.client.js'
import {
  WechatTriggerAggregatePayload,
  WechatTriggerAggregationState,
  WechatTriggerFlushPayload
} from './wechat-trigger-aggregation.types.js'
import { WechatTriggerAggregationService } from './wechat-trigger-aggregation.service.js'
import { TWechatTriggerConfig, WechatTrigger } from './wechat-trigger.types.js'

const DEFAULT_SESSION_TIMEOUT_SECONDS = 3600
const DEFAULT_SUMMARY_WINDOW_SECONDS = 0
const DEFAULT_HISTORY_CONTEXT_LIMIT = 20
const DEFAULT_HISTORY_CONTEXT_WINDOW_SECONDS = 3600
const MAX_HISTORY_CONTEXT_LIMIT = 100
const ATTACHMENT_ONLY_AGGREGATE_INPUT = '[理解附件]'
const PENDING_FILE_MATERIALIZE_RETRY_DELAYS_MS = [2_000, 5_000, 10_000]
const MAX_PENDING_FILE_MATERIALIZE_RETRIES = PENDING_FILE_MATERIALIZE_RETRY_DELAYS_MS.length
const XPERT_RUNTIME_CAPABILITIES_TOKEN = 'XPERT_RUNTIME_CAPABILITIES'
const WORKSPACE_FILES_RUNTIME_CAPABILITY = 'platform.workspace.files'
const SELF_MESSAGE_POLICY_ENUM_LABELS = {
  history_only: { en_US: 'History only', zh_Hans: '只写入历史' },
  ignore: { en_US: 'Ignore', zh_Hans: '忽略' },
  dispatch: { en_US: 'Dispatch to Agent', zh_Hans: '触发 Agent' }
}
const CHAT_FILTER_MODE_ENUM_LABELS = {
  all: { en_US: 'All chats', zh_Hans: '全部会话' },
  private_only: { en_US: 'Private chats only', zh_Hans: '仅私聊' },
  group_only: { en_US: 'Group chats only', zh_Hans: '仅群聊' }
}
const GROUP_TRIGGER_MODE_ENUM_LABELS = {
  mention_or_keywords: { en_US: '@ mention or keywords', zh_Hans: '@ 或关键词' },
  all: { en_US: 'All group messages', zh_Hans: '全部群消息' },
  mentions: { en_US: '@ mentions only', zh_Hans: '仅 @ 消息' },
  keywords: { en_US: 'Keywords only', zh_Hans: '仅关键词' },
  off: { en_US: 'Off', zh_Hans: '关闭' }
}

type WechatTenantScope = {
  tenantId?: string | null
  organizationId?: string | null
}

type RuntimeCapabilityRegistry = {
  get<T>(key: string): T | undefined
}

type PendingFileMergeResult = {
  files?: WechatPendingInboundFile[]
  duplicateLogIds: string[]
}

type WorkspaceFileHandle = {
  name?: string
  originalName?: string
  filePath: string
  workspacePath?: string
  fileUrl?: string
  url?: string
  mimeType?: string
  size?: number
}

type WorkspaceUnderstoodFileHandle = WorkspaceFileHandle & {
  id: string
  fileId: string
  fileAssetId: string
  storageFileId?: string
  status?: string
  parseStatus?: string
  capabilities?: string[]
}

type WorkspaceFilesApi = {
  uploadBuffer(input: {
    tenantId?: string | null
    userId?: string | null
    catalog: 'xperts'
    xpertId: string
    isolateByUser: boolean
    folder: string
    fileName: string
    originalName: string
    mimeType?: string | null
    size?: number | null
    buffer: Buffer
    metadata?: Record<string, unknown>
  }): Promise<WorkspaceFileHandle>
  understandFile(input: {
    tenantId?: string | null
    userId?: string | null
    catalog: 'xperts'
    xpertId: string
    isolateByUser: boolean
    filePath: string
    originalName: string
    mimeType?: string | null
    size?: number | null
    fileUrl?: string
    purpose: 'chat_attachment'
    parseMode: 'auto'
    conversationId?: string
    threadId?: string
    projectId?: string
    metadata?: Record<string, unknown>
    runInline?: boolean
  }): Promise<WorkspaceUnderstoodFileHandle>
}

export type WechatInboundHandleResult = {
  accepted: boolean
  queued: boolean
  dispatched: boolean
  error?: string
}

@Injectable()
@WorkflowTriggerStrategy(WechatTrigger)
export class WechatTriggerStrategy implements IWorkflowTriggerStrategy<TWechatTriggerConfig> {
  private readonly logger = new Logger(WechatTriggerStrategy.name)
  private readonly callbacks = new Map<string, (payload: any) => void>()
  private _integrationPermissionService: IntegrationPermissionService
  private _workspaceFiles: WorkspaceFilesApi | null | undefined

  readonly meta: TWorkflowTriggerMeta = {
    name: WechatTrigger,
    label: {
      en_US: 'WeChat Trigger',
      zh_Hans: '微信触发器'
    },
    icon: {
      type: 'svg',
      value: WECHAT_ICON
    },
    configSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          title: {
            en_US: 'Enabled',
            zh_Hans: '启用'
          },
          default: true
        },
        integrationId: {
          type: 'string',
          title: {
            en_US: 'WeChat Integration',
            zh_Hans: '微信集成'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/wechat/integration-select-options'
          } as any
        },
        accountUuid: {
          type: 'string',
          title: {
            en_US: 'WeChat Account UUID',
            zh_Hans: '微信账号设备号'
          },
          description: {
            en_US:
              'Optional wx2.0 device key such as SDxxxx. Leave empty to keep the default binding for accounts without an exact binding.',
            zh_Hans: '可选 wx2.0 设备号，例如 SDxxxx。留空表示默认绑定，仅处理没有精确绑定的账号。'
          }
        },
        sessionTimeoutSeconds: {
          type: 'number',
          title: {
            en_US: 'Session Timeout (seconds)',
            zh_Hans: '会话超时时间（秒）'
          },
          default: DEFAULT_SESSION_TIMEOUT_SECONDS
        },
        summaryWindowSeconds: {
          type: 'number',
          title: {
            en_US: 'Message Debounce Window (seconds)',
            zh_Hans: '消息聚合/防抖时间（秒）'
          },
          description: {
            en_US: 'Messages received in this window are merged before dispatching to the agent.',
            zh_Hans: '窗口内收到的连续文本会合并后再发送给 Agent。'
          },
          default: DEFAULT_SUMMARY_WINDOW_SECONDS
        },
        historyContextLimit: {
          type: 'number',
          title: {
            en_US: 'History Context Limit',
            zh_Hans: '历史上下文条数'
          },
          description: {
            en_US: 'Recent inbound messages and sent agent replies to prepend as context. Set to 0 to disable.',
            zh_Hans: '作为上下文附加的最近入站消息和已发送 Agent 回复条数。设为 0 表示关闭。'
          },
          default: DEFAULT_HISTORY_CONTEXT_LIMIT,
          minimum: 0,
          maximum: MAX_HISTORY_CONTEXT_LIMIT
        },
        historyContextWindowSeconds: {
          type: 'number',
          title: {
            en_US: 'History Context Window (seconds)',
            zh_Hans: '历史上下文时间窗口（秒）'
          },
          description: {
            en_US:
              'Only messages newer than this window are prepended as context. Set to 0 to disable time filtering.',
            zh_Hans: '只把该时间窗口内的消息附加为上下文。设为 0 表示不按时间过滤。'
          },
          default: DEFAULT_HISTORY_CONTEXT_WINDOW_SECONDS,
          minimum: 0
        },
        ignoreSelfMessages: {
          type: 'boolean',
          title: {
            en_US: 'Ignore Self Messages',
            zh_Hans: '忽略自己发出的消息'
          },
          description: {
            en_US: 'Skip messages sent by the same wx2.0 account.',
            zh_Hans: '跳过由同一个 wx2.0 账号自己发出的消息。'
          },
          default: true
        },
        selfMessagePolicy: {
          type: 'string',
          title: {
            en_US: 'Self Message Policy',
            zh_Hans: '自己发出消息处理方式'
          },
          description: {
            en_US:
              'history_only stores messages from the current wx2.0 account as context without triggering the agent.',
            zh_Hans: 'history_only 会把当前账号自己发出的消息写入历史上下文，但不触发 Agent。'
          },
          enum: ['history_only', 'ignore', 'dispatch'],
          'x-ui': {
            enumLabels: SELF_MESSAGE_POLICY_ENUM_LABELS
          } as any,
          default: 'history_only'
        },
        chatFilterMode: {
          type: 'string',
          title: {
            en_US: 'Chat Filter Mode',
            zh_Hans: '会话过滤方式'
          },
          enum: ['all', 'private_only', 'group_only'],
          'x-ui': {
            enumLabels: CHAT_FILTER_MODE_ENUM_LABELS
          } as any,
          default: 'all'
        },
        allowedContactIds: {
          type: 'array',
          title: {
            en_US: 'Allowed Contact IDs',
            zh_Hans: '允许的联系人/群 ID'
          },
          description: {
            en_US: 'Optional allowlist for contactId. Applies to private contact ids and group room ids.',
            zh_Hans: '可选 contactId 白名单，适用于私聊联系人 ID 和群 roomId。'
          },
          items: {
            type: 'string'
          }
        },
        blockedContactIds: {
          type: 'array',
          title: {
            en_US: 'Blocked Contact IDs',
            zh_Hans: '排除的联系人/群 ID'
          },
          items: {
            type: 'string'
          }
        },
        allowedGroupIds: {
          type: 'array',
          title: {
            en_US: 'Allowed Group IDs',
            zh_Hans: '允许的群 ID'
          },
          description: {
            en_US: 'Optional group room id allowlist. Example: 12345@chatroom.',
            zh_Hans: '可选群 roomId 白名单。例如：12345@chatroom。'
          },
          items: {
            type: 'string'
          }
        },
        blockedGroupIds: {
          type: 'array',
          title: {
            en_US: 'Blocked Group IDs',
            zh_Hans: '排除的群 ID'
          },
          items: {
            type: 'string'
          }
        },
        allowedSenderIds: {
          type: 'array',
          title: {
            en_US: 'Allowed Sender IDs',
            zh_Hans: '允许的发送人 ID'
          },
          items: {
            type: 'string'
          }
        },
        blockedSenderIds: {
          type: 'array',
          title: {
            en_US: 'Blocked Sender IDs',
            zh_Hans: '排除的发送人 ID'
          },
          items: {
            type: 'string'
          }
        },
        allowedKeywords: {
          type: 'array',
          title: {
            en_US: 'Allowed Keywords',
            zh_Hans: '处理关键词'
          },
          description: {
            en_US:
              'Optional message keyword allowlist. When set, only messages containing at least one keyword are processed.',
            zh_Hans: '可选消息关键词白名单。配置后，只有包含任一关键词的消息才会继续处理。'
          },
          items: {
            type: 'string'
          }
        },
        groupTriggerMode: {
          type: 'string',
          title: {
            en_US: 'Group Trigger Mode',
            zh_Hans: '群聊触发方式'
          },
          enum: ['mention_or_keywords', 'all', 'mentions', 'keywords', 'off'],
          'x-ui': {
            enumLabels: GROUP_TRIGGER_MODE_ENUM_LABELS
          } as any,
          default: 'mention_or_keywords'
        },
        groupKeywords: {
          type: 'array',
          title: {
            en_US: 'Group Keywords',
            zh_Hans: '群聊关键词'
          },
          items: {
            type: 'string'
          }
        },
        mentionFallbackNames: {
          type: 'array',
          title: {
            en_US: 'Mention Fallback Names',
            zh_Hans: '@ 昵称兜底名称'
          },
          description: {
            en_US:
              'Optional display names used only when wx2.0 does not provide atuserlist. Example: bot nickname in the group.',
            zh_Hans: '可选，仅在 wx2.0 未提供 atuserlist 时用于匹配 @ 昵称，例如机器人在群里的显示名。'
          },
          items: {
            type: 'string'
          }
        },
        groupTriggerOverrides: {
          type: 'array',
          title: {
            en_US: 'Per-group Trigger Overrides',
            zh_Hans: '按群触发配置'
          },
          description: {
            en_US:
              'Optional per-group overrides. When a group id matches, these values override the global group trigger mode, group keywords, and mention fallback names.',
            zh_Hans:
              '可选的按群覆盖配置。群 ID 命中时，将覆盖全局的群聊触发方式、群聊关键词和 @ 昵称兜底名称。'
          },
          items: {
            type: 'object',
            properties: {
              groupId: {
                type: 'string',
                title: {
                  en_US: 'Group ID',
                  zh_Hans: '群 ID'
                },
                description: {
                  en_US: 'WeChat room id, for example 12345@chatroom.',
                  zh_Hans: '微信群 roomId，例如 12345@chatroom。'
                }
              },
              groupTriggerMode: {
                type: 'string',
                title: {
                  en_US: 'Group Trigger Mode',
                  zh_Hans: '群聊触发方式'
                },
                enum: ['mention_or_keywords', 'all', 'mentions', 'keywords', 'off'],
                'x-ui': {
                  enumLabels: GROUP_TRIGGER_MODE_ENUM_LABELS
                } as any
              },
              groupKeywords: {
                type: 'array',
                title: {
                  en_US: 'Group Keywords',
                  zh_Hans: '群聊关键词'
                },
                items: {
                  type: 'string'
                }
              },
              mentionFallbackNames: {
                type: 'array',
                title: {
                  en_US: 'Mention Fallback Names',
                  zh_Hans: '@ 昵称兜底名称'
                },
                items: {
                  type: 'string'
                }
              }
            },
            required: ['groupId']
          }
        } as any,
        groupJoinWelcomeEnabled: {
          type: 'boolean',
          title: {
            en_US: 'Welcome New Group Members',
            zh_Hans: '欢迎新入群成员'
          },
          description: {
            en_US:
              'When enabled, recognized group-join system messages are sent to the agent as a welcome request independently of normal group mention or keyword rules.',
            zh_Hans:
              '开启后，识别到新成员入群系统消息时，会独立触发 Agent 生成欢迎语，不受普通群 @ 或关键词规则影响。'
          },
          default: false
        },
        groupJoinWelcomePrompt: {
          type: 'string',
          title: {
            en_US: 'Welcome Prompt',
            zh_Hans: '欢迎提示词'
          },
          description: {
            en_US: 'Prompt template used for group-join welcome requests. Supports {names}, {groupName}, {roomId}, and {rawText}.',
            zh_Hans: '新成员入群欢迎提示词模板，支持 {names}、{groupName}、{roomId} 和 {rawText}。'
          },
          'x-ui': {
            component: 'textarea',
            span: 2
          },
          default: DEFAULT_GROUP_JOIN_WELCOME_PROMPT
        } as any
      },
      required: ['enabled', 'integrationId']
    }
  }

  readonly bootstrap = {
    mode: 'replay_publish' as const,
    critical: false
  }

  constructor(
    private readonly dispatchService: WechatChatDispatchService,
    private readonly aggregationService: WechatTriggerAggregationService,
    private readonly wechatChannel: WechatChannelStrategy,
    private readonly wechatClient: WechatClient,
    @InjectRepository(WechatTriggerBindingEntity)
    private readonly bindingRepository: Repository<WechatTriggerBindingEntity>,
    @InjectRepository(WechatAccountEntity)
    private readonly accountRepository: Repository<WechatAccountEntity>,
    @InjectRepository(WechatMessageFileEntity)
    private readonly messageFileRepository: Repository<WechatMessageFileEntity>,
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    @InjectRepository(WechatMessageLogEntity)
    private readonly messageLogRepository?: Repository<WechatMessageLogEntity>
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  private get workspaceFiles(): WorkspaceFilesApi {
    if (this._workspaceFiles === undefined) {
      const registry = this.pluginContext.resolve<RuntimeCapabilityRegistry>(XPERT_RUNTIME_CAPABILITIES_TOKEN)
      this._workspaceFiles = registry?.get<WorkspaceFilesApi>(WORKSPACE_FILES_RUNTIME_CAPABILITY) ?? null
    }
    if (!this._workspaceFiles) {
      throw new Error('platform.workspace.files capability is not available')
    }
    return this._workspaceFiles
  }

  async validate(payload: TWorkflowTriggerParams<TWechatTriggerConfig>) {
    const { xpertId, node, config } = payload
    const items: ChecklistItem[] = []
    const nodeKey = node?.key

    if (!config?.integrationId) {
      items.push({
        node: nodeKey,
        ruleCode: 'TRIGGER_WECHAT_INTEGRATION_REQUIRED',
        field: 'integrationId',
        value: '',
        message: {
          en_US: 'WeChat integration is required',
          zh_Hans: '需要选择微信集成'
        },
        level: 'error'
      })
      return items
    }

    const accountUuid = this.normalizeTriggerAccountUuid(config.accountUuid)
    if (this.isReservedAccountUuid(config.accountUuid)) {
      items.push({
        node: nodeKey,
        ruleCode: 'TRIGGER_WECHAT_ACCOUNT_UUID_RESERVED',
        field: 'accountUuid',
        value: config.accountUuid,
        message: {
          en_US: 'The reserved WeChat account UUID "*" cannot be used in trigger config',
          zh_Hans: '微信账号设备号不能填写保留值 "*"'
        },
        level: 'error'
      })
    }

    try {
      const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(
        config.integrationId
      )
      if (!integration || integration.provider !== WECHAT_PROVIDER_KEY) {
        items.push({
          node: nodeKey,
          ruleCode: 'TRIGGER_WECHAT_INTEGRATION_NOT_FOUND',
          field: 'integrationId',
          value: config.integrationId,
          message: {
            en_US: `WeChat integration "${config.integrationId}" not found`,
            zh_Hans: `微信集成 "${config.integrationId}" 不存在`
          },
          level: 'error'
        })
      }
    } catch (error) {
      this.logger.warn(
        `Validate integration "${config.integrationId}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }

    if (!config.enabled) {
      return items
    }

    if (accountUuid !== WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID) {
      const accountExists = await this.accountExistsForBinding(config.integrationId, accountUuid)
      if (!accountExists) {
        items.push({
          node: nodeKey,
          ruleCode: 'TRIGGER_WECHAT_ACCOUNT_NOT_FOUND',
          field: 'accountUuid',
          value: accountUuid,
          message: {
            en_US: `WeChat account "${accountUuid}" is not found under this integration`,
            zh_Hans: `微信账号 "${accountUuid}" 不在当前集成下`
          },
          level: 'error'
        })
      }
    }

    const existingXpertId = await this.getBoundXpertId(config.integrationId, accountUuid)
    if (existingXpertId && existingXpertId !== xpertId) {
      items.push({
        node: nodeKey,
        ruleCode: 'TRIGGER_WECHAT_ACCOUNT_CONFLICT',
        field: accountUuid === WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID ? 'integrationId' : 'accountUuid',
        value: accountUuid === WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID ? config.integrationId : accountUuid,
        message: {
          en_US:
            accountUuid === WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID
              ? `Integration "${config.integrationId}" default binding is already bound to another xpert`
              : `WeChat account "${accountUuid}" is already bound to another xpert`,
          zh_Hans:
            accountUuid === WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID
              ? `微信集成 "${config.integrationId}" 默认绑定已绑定到其他专家`
              : `微信账号 "${accountUuid}" 已绑定到其他专家`
        },
        level: 'error'
      })
    }

    return items
  }

  async publish(
    payload: TWorkflowTriggerParams<TWechatTriggerConfig>,
    callback: (payload: any) => Promise<void> | void
  ): Promise<void> {
    const { xpertId, config } = payload
    if (!config?.enabled || !config.integrationId) {
      return
    }

    const integrationId = config.integrationId
    const accountUuid = this.normalizeTriggerAccountUuid(config.accountUuid)
    if (this.isReservedAccountUuid(config.accountUuid)) {
      throw new Error('The reserved WeChat account UUID "*" cannot be used in trigger config')
    }
    if (accountUuid !== WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID) {
      await this.assertAccountExistsForBinding(integrationId, accountUuid)
    }

    const existingXpertId = await this.getBoundXpertId(integrationId, accountUuid)
    if (existingXpertId && existingXpertId !== xpertId) {
      throw new Error(
        accountUuid === WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID
          ? `WeChat trigger integration "${integrationId}" default binding is already bound to xpert "${existingXpertId}"`
          : `WeChat account "${accountUuid}" is already bound to xpert "${existingXpertId}"`
      )
    }

    const context = await this.resolveBindingContext(integrationId)
    await this.bindingRepository.upsert(
      {
        integrationId,
        accountUuid,
        xpertId,
        sessionTimeoutSeconds: this.normalizePositiveSeconds(
          config.sessionTimeoutSeconds,
          DEFAULT_SESSION_TIMEOUT_SECONDS
        ),
        summaryWindowSeconds: this.normalizeNonNegativeSeconds(
          config.summaryWindowSeconds,
          DEFAULT_SUMMARY_WINDOW_SECONDS
        ),
        historyContextLimit: this.normalizeHistoryContextLimit(config.historyContextLimit),
        historyContextWindowSeconds: this.normalizeHistoryContextWindowSeconds(
          config.historyContextWindowSeconds,
          config.sessionTimeoutSeconds
        ),
        ignoreSelfMessages: config.ignoreSelfMessages !== false,
        selfMessagePolicy: normalizeSelfMessagePolicy(config.selfMessagePolicy, config.ignoreSelfMessages),
        chatFilterMode: normalizeChatFilterMode(config.chatFilterMode),
        allowedContactIds: normalizeIdList(config.allowedContactIds),
        blockedContactIds: normalizeIdList(config.blockedContactIds),
        allowedGroupIds: normalizeIdList(config.allowedGroupIds),
        blockedGroupIds: normalizeIdList(config.blockedGroupIds),
        allowedSenderIds: normalizeIdList(config.allowedSenderIds),
        blockedSenderIds: normalizeIdList(config.blockedSenderIds),
        allowedKeywords: normalizeKeywords(config.allowedKeywords),
        groupTriggerMode: normalizeGroupTriggerMode(config.groupTriggerMode),
        groupKeywords: normalizeKeywords(config.groupKeywords),
        mentionFallbackNames: normalizeKeywords(config.mentionFallbackNames),
        groupTriggerOverrides: normalizeGroupTriggerOverrides(config.groupTriggerOverrides),
        groupJoinWelcomeEnabled: config.groupJoinWelcomeEnabled === true,
        groupJoinWelcomePrompt: normalizeGroupJoinWelcomePrompt(config.groupJoinWelcomePrompt),
        tenantId: context.tenantId ?? null,
        organizationId: context.organizationId ?? null,
        createdById: context.createdById ?? null,
        updatedById: context.updatedById ?? null
      },
      ['integrationId', 'accountUuid']
    )

    this.callbacks.set(this.bindingCallbackKey(integrationId, accountUuid), callback)
  }

  async stop(payload: TWorkflowTriggerParams<TWechatTriggerConfig>): Promise<void> {
    const { xpertId, config } = payload
    const integrationId = config?.integrationId
    if (integrationId) {
      const accountUuid = this.normalizeTriggerAccountUuid(config.accountUuid)
      this.callbacks.delete(this.bindingCallbackKey(integrationId, accountUuid))
      await this.removeBindingFromStore(integrationId, xpertId, accountUuid)
      return
    }

    const scope = this.resolveRequestTenantScope()
    const persistedBindings = await this.bindingRepository.find({
      where: this.scopedWhere({ xpertId }, scope)
    })
    for (const binding of persistedBindings) {
      this.callbacks.delete(this.bindingCallbackKey(binding.integrationId, binding.accountUuid))
    }
    await this.removeBindingsByXpertId(xpertId)
  }

  async getBinding(
    integrationId: string,
    scope?: WechatTenantScope | null,
    accountUuid: string = WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID
  ): Promise<WechatTriggerBindingEntity | null> {
    if (!integrationId) {
      return null
    }
    const resolvedScope = scope ?? (await this.resolveQueryTenantScope(integrationId))
    return this.bindingRepository.findOne({
      where: this.scopedWhere({ integrationId, accountUuid: this.normalizeTriggerAccountUuid(accountUuid) }, resolvedScope)
    })
  }

  async getBindingForAccount(
    integrationId: string,
    accountUuid?: string | null,
    scope?: WechatTenantScope | null
  ): Promise<WechatTriggerBindingEntity | null> {
    const normalizedAccountUuid = this.normalizeTriggerAccountUuid(accountUuid)
    if (normalizedAccountUuid !== WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID) {
      const exactBinding = await this.getBinding(integrationId, scope, normalizedAccountUuid)
      if (exactBinding) {
        return exactBinding
      }
    }
    return this.getBinding(integrationId, scope, WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID)
  }

  async getBindings(
    integrationId: string,
    scope?: WechatTenantScope | null
  ): Promise<WechatTriggerBindingEntity[]> {
    if (!integrationId) {
      return []
    }
    const resolvedScope = scope ?? (await this.resolveQueryTenantScope(integrationId))
    return this.bindingRepository.find({
      where: this.scopedWhere({ integrationId }, resolvedScope),
      order: {
        updatedAt: 'DESC'
      }
    })
  }

  async getBoundXpertId(integrationId: string, accountUuid = WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID): Promise<string | null> {
    const binding = await this.getBinding(integrationId, undefined, accountUuid)
    return binding?.xpertId ?? null
  }

  async getBindingByXpertId(xpertId: string): Promise<WechatTriggerBindingEntity | null> {
    const bindings = await this.getBindingsByXpertId(xpertId)
    return bindings[0] ?? null
  }

  async getBindingsByXpertId(xpertId: string): Promise<WechatTriggerBindingEntity[]> {
    if (!xpertId) {
      return []
    }
    const scope = this.resolveRequestTenantScope()
    return this.bindingRepository.find({
      where: this.scopedWhere({ xpertId }, scope),
      order: {
        updatedAt: 'DESC'
      }
    })
  }

  async getBoundIntegrationId(xpertId: string): Promise<string | null> {
    const bindings = await this.getBindingsByXpertId(xpertId)
    const integrationIds = Array.from(
      new Set(bindings.map((binding) => normalizeString(binding.integrationId)).filter(Boolean))
    )
    return integrationIds.length === 1 ? integrationIds[0] : null
  }

  async clearBufferedConversation(conversationUserKey: string): Promise<void> {
    const aggregateKey = this.normalizeAggregateKey(conversationUserKey)
    if (!aggregateKey) {
      return
    }
    const scope = this.resolveRequestTenantScope()
    const [integrationId] = aggregateKey.split(':')
    await this.aggregationService.clear(aggregateKey, {
      integrationId,
      tenantId: scope.tenantId ?? undefined,
      organizationId: scope.organizationId ?? undefined
    })
  }

  async handleInboundMessage(params: {
    integrationId: string
    accountUuid?: string
    input?: string
    files?: WechatInboundFile[]
    pendingFiles?: WechatPendingInboundFile[]
    item?: WechatBatchTriggerItem
    wechatMessage: WechatMessage
    conversationUserKey?: string
    historyContext?: string
    integrationOptions?: Pick<TIntegrationWechatOptions, 'agentCallbackIntermediateTextEnabled'>
    currentInboundLogIds?: string[]
    triggerOptions?: WechatInboundTriggerOptions
    tenantId: string
    organizationId?: string
    endUserId?: string
  }): Promise<WechatInboundHandleResult> {
    const binding = await this.getBindingForAccount(params.integrationId, params.accountUuid, params)
    if (!binding?.xpertId) {
      this.logger.debug(
        `[wechat-trigger] binding miss integrationId=${params.integrationId} accountUuid=${params.accountUuid || ''}`
      )
      return this.createHandleResult(false)
    }
    const accountUuid = this.normalizeTriggerAccountUuid(binding.accountUuid)

    const aggregateKey = this.normalizeAggregateKey(params.conversationUserKey)
    if (!aggregateKey) {
      this.logger.warn(`[wechat-trigger] aggregation key missing integrationId=${params.integrationId}`)
      return this.createHandleResult(false)
    }

    const summaryWindowSeconds = this.normalizeNonNegativeSeconds(
      binding.summaryWindowSeconds,
      DEFAULT_SUMMARY_WINDOW_SECONDS
    )
    if (summaryWindowSeconds <= 0) {
      const materialized = await this.materializePendingFiles({
        integrationId: params.integrationId,
        xpertId: binding.xpertId,
        tenantId: params.tenantId,
        organizationId: params.organizationId,
        conversationUserKey: aggregateKey,
        pendingFiles: params.pendingFiles
      })
      if (materialized.success === false) {
        await this.markInboundLogs(params.currentInboundLogIds, params, 'failed', materialized.error)
        return this.createHandleResult(false, { error: materialized.error })
      }
      const files = [...(params.files ?? []), ...(materialized.files ?? [])]
      const input = params.input || (files.length ? ATTACHMENT_ONLY_AGGREGATE_INPUT : '')
      await this.dispatchInboundMessage({
        integrationId: params.integrationId,
        accountUuid,
        xpertId: binding.xpertId,
        dispatchMode: 'immediate',
        dispatchPayload: {
          xpertId: binding.xpertId,
          input: this.composeDispatchInput(input, params.historyContext),
          files,
          wechatMessage: params.wechatMessage,
          conversationUserKey: aggregateKey,
          tenantId: params.tenantId,
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          currentInboundLogIds: params.currentInboundLogIds,
          integrationOptions: params.integrationOptions
        }
      })
      return this.createHandleResult(true, { dispatched: true })
    }

    await this.aggregationService.enqueueAggregate({
      aggregateKey,
      integrationId: params.integrationId,
      accountUuid,
      xpertId: binding.xpertId,
      input: params.input || '',
      item: params.item ?? this.createLegacyBatchItem(params.input),
      triggerOptions: params.triggerOptions,
      files: params.files,
      pendingFiles: params.pendingFiles,
      historyContext: params.historyContext,
      agentCallbackIntermediateTextEnabled: params.integrationOptions?.agentCallbackIntermediateTextEnabled === true,
      currentInboundLogIds: params.currentInboundLogIds,
      summaryWindowSeconds,
      sessionTimeoutSeconds: this.normalizePositiveSeconds(
        binding.sessionTimeoutSeconds,
        DEFAULT_SESSION_TIMEOUT_SECONDS
      ),
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      endUserId: params.endUserId,
      latestMessage: {
        integrationId: params.wechatMessage.integrationId,
        uuid: params.wechatMessage.uuid,
        ownerWxid: params.wechatMessage.ownerWxid,
        contactId: params.wechatMessage.contactId,
        chatType: params.wechatMessage.chatType,
        senderId: params.wechatMessage.senderId,
        senderName: params.wechatMessage.senderName,
        language: params.wechatMessage.language,
        messageId: params.wechatMessage.messageId
      }
    })

    return this.createHandleResult(true, { queued: true })
  }

  async processInboundAggregateJob(payload: WechatTriggerAggregatePayload): Promise<void> {
    const aggregateKey = this.normalizeAggregateKey(payload.aggregateKey)
    if (!aggregateKey) {
      throw new Error('Missing aggregateKey in WeChat inbound aggregate payload')
    }

    const summaryWindowSeconds = this.normalizeNonNegativeSeconds(
      payload.summaryWindowSeconds,
      DEFAULT_SUMMARY_WINDOW_SECONDS
    )
    if (summaryWindowSeconds <= 0) {
      return
    }

    await this.aggregationService.withAggregateLock(aggregateKey, async () => {
      const currentState = await this.aggregationService.get(aggregateKey, payload)
      const sameRoutingTarget =
        currentState?.integrationId === payload.integrationId &&
        currentState?.accountUuid === payload.accountUuid &&
        currentState?.xpertId === payload.xpertId
      const nextVersion = (currentState?.version ?? 0) + 1
      const nextItem = payload.item ?? this.createLegacyBatchItem(payload.input)
      const pendingFileMerge = sameRoutingTarget
        ? this.mergePendingFilesWithDuplicateLogIds(currentState?.pendingFiles, payload.pendingFiles)
        : this.mergePendingFilesWithDuplicateLogIds(undefined, payload.pendingFiles)
      const aggregateState: WechatTriggerAggregationState = {
        aggregateKey,
        integrationId: payload.integrationId,
        accountUuid: this.normalizeTriggerAccountUuid(payload.accountUuid),
        conversationUserKey: aggregateKey,
        xpertId: payload.xpertId,
        version: nextVersion,
        inputParts: [...(sameRoutingTarget ? currentState?.inputParts ?? [] : []), payload.input || ''],
        items: [
          ...(sameRoutingTarget ? currentState?.items ?? [] : []),
          ...(nextItem ? [nextItem] : [])
        ],
        triggerOptions: sameRoutingTarget
          ? currentState?.triggerOptions ?? payload.triggerOptions
          : payload.triggerOptions,
        files: [...(sameRoutingTarget ? currentState?.files ?? [] : []), ...(payload.files ?? [])],
        pendingFiles: pendingFileMerge.files,
        currentInboundLogIds: [
          ...(sameRoutingTarget ? currentState?.currentInboundLogIds ?? [] : []),
          ...(payload.currentInboundLogIds ?? [])
        ],
        duplicateInboundLogIds: this.uniqueLogIds([
          ...(sameRoutingTarget ? currentState?.duplicateInboundLogIds ?? [] : []),
          ...pendingFileMerge.duplicateLogIds
        ]),
        historyContext: sameRoutingTarget ? currentState?.historyContext ?? payload.historyContext : payload.historyContext,
        agentCallbackIntermediateTextEnabled: payload.agentCallbackIntermediateTextEnabled === true,
        lastMessageAt: Date.now(),
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        endUserId: payload.endUserId,
        latestMessage: payload.latestMessage
      }

      const ttlSeconds = Math.max(
        DEFAULT_SESSION_TIMEOUT_SECONDS,
        this.normalizePositiveSeconds(payload.sessionTimeoutSeconds, DEFAULT_SESSION_TIMEOUT_SECONDS),
        summaryWindowSeconds * 3
      )
      await this.aggregationService.save(aggregateState, ttlSeconds)
      await this.aggregationService.enqueueFlush(aggregateState, summaryWindowSeconds * 1000)
    }, undefined, payload)
  }

  async flushBufferedConversation(payload: WechatTriggerFlushPayload): Promise<boolean> {
    const aggregateKey = this.normalizeAggregateKey(payload.aggregateKey)
    if (!aggregateKey) {
      return false
    }

    const state = await this.aggregationService.get(aggregateKey, payload)
    if (!state || state.version !== payload.version) {
      return false
    }

    const decision = shouldDispatchWechatBatch(
      state.items ?? state.inputParts.map((input) => this.createLegacyBatchItem(input)).filter(Boolean),
      state.triggerOptions
    )
    if (!decision) {
      await this.markInboundLogs(state.currentInboundLogIds, state, 'skipped', 'filtered_by_trigger_policy')
      await this.aggregationService.clear(aggregateKey, state)
      return false
    }

    const pendingFileMerge = this.mergePendingFilesWithDuplicateLogIds(undefined, state.pendingFiles)
    const pendingFiles = pendingFileMerge.files
    const activePendingLogIds = this.uniqueLogIds(
      (pendingFiles ?? []).map((pending) => pending.messageLogId).filter(Boolean) as string[]
    )
    const duplicateLogIds = this.uniqueLogIds([
      ...(state.duplicateInboundLogIds ?? []),
      ...pendingFileMerge.duplicateLogIds
    ]).filter((id) => !activePendingLogIds.includes(id))
    const dispatchLogIds = this.uniqueLogIds([
      ...(state.currentInboundLogIds ?? []),
      ...activePendingLogIds
    ]).filter((id) => !duplicateLogIds.includes(id))

    const materialized = await this.materializePendingFiles({
      integrationId: state.integrationId,
      xpertId: state.xpertId,
      tenantId: state.tenantId,
      organizationId: state.organizationId,
      conversationUserKey: state.conversationUserKey,
      pendingFiles,
      markFailures: false
    })
    if (materialized.success === false) {
      if (materialized.recoverable && this.canRetryPendingFileMaterialize(state)) {
        await this.schedulePendingFileMaterializeRetry(aggregateKey, state, materialized.error)
        return false
      }
      await this.markPendingFilesFailed(pendingFiles, state, materialized.error)
      await this.markInboundLogs(state.currentInboundLogIds, state, 'failed', materialized.error)
      await this.aggregationService.clear(aggregateKey, state)
      return false
    }

    const files = [...(state.files ?? []), ...(materialized.files ?? [])]
    const aggregatedInput = this.composeAggregatedInput(decision.inputParts, files)
    const dispatchInput = this.composeDispatchInput(aggregatedInput, state.historyContext)

    await this.dispatchInboundMessage({
      integrationId: state.integrationId,
      accountUuid: this.normalizeTriggerAccountUuid(state.accountUuid),
      xpertId: state.xpertId,
      dispatchMode: `buffered version=${state.version}`,
      dispatchPayload: {
        xpertId: state.xpertId,
        input: dispatchInput,
        files,
        wechatMessage: new WechatMessage(
          {
            integrationId: state.latestMessage.integrationId,
            uuid: state.latestMessage.uuid,
            ownerWxid: state.latestMessage.ownerWxid,
            contactId: state.latestMessage.contactId,
            chatType: state.latestMessage.chatType,
            senderId: state.latestMessage.senderId,
            senderName: state.latestMessage.senderName,
            wechatChannel: this.wechatChannel
          },
          {
            status: 'thinking',
            language: state.latestMessage.language,
            messageId: state.latestMessage.messageId
          }
        ),
        conversationUserKey: state.conversationUserKey,
        tenantId: state.tenantId,
        organizationId: state.organizationId,
        endUserId: state.endUserId,
        currentInboundLogIds: dispatchLogIds,
        integrationOptions: {
          agentCallbackIntermediateTextEnabled: state.agentCallbackIntermediateTextEnabled === true
        }
      }
    })

    await this.markInboundLogs(dispatchLogIds, state, 'dispatched')
    await this.markInboundLogs(duplicateLogIds, state, 'skipped', 'duplicate_file_event')
    await this.aggregationService.clear(aggregateKey, state)
    return true
  }

  private async dispatchInboundMessage(params: {
    integrationId: string
    accountUuid: string
    xpertId: string
    dispatchMode: string
    dispatchPayload: WechatChatDispatchInput
  }): Promise<void> {
    const callback = this.callbacks.get(this.bindingCallbackKey(params.integrationId, params.accountUuid))
    if (!callback) {
      this.logger.debug(
        `[wechat-trigger] runtime callback miss, enqueue dispatch integrationId=${params.integrationId} accountUuid=${params.accountUuid} xpertId=${params.xpertId} mode=${params.dispatchMode}`
      )
      await this.dispatchService.enqueueDispatch(params.dispatchPayload)
      return
    }

    const handoffMessage = await this.dispatchService.buildDispatchMessage(params.dispatchPayload)
    await Promise.resolve(
      callback({
        from: WechatTrigger,
        xpertId: params.xpertId,
        handoffMessage
      })
    )
  }

  private async resolveBindingContext(integrationId: string): Promise<{
    tenantId: string | null
    organizationId: string | null
    createdById: string | null
    updatedById: string | null
  }> {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = RequestContext.currentUserId()

    if (tenantId && organizationId) {
      return {
        tenantId,
        organizationId,
        createdById: userId,
        updatedById: userId
      }
    }

    const integration = await this.integrationPermissionService.read<any>(integrationId)
    return {
      tenantId: tenantId ?? integration?.tenantId ?? null,
      organizationId: organizationId ?? integration?.organizationId ?? null,
      createdById: userId ?? integration?.createdById ?? null,
      updatedById: userId ?? integration?.updatedById ?? userId ?? null
    }
  }

  private normalizeTriggerAccountUuid(value?: string | null): string {
    if (typeof value !== 'string') {
      return WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID
    }
    const normalized = value.trim()
    return normalized || WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID
  }

  private isReservedAccountUuid(value?: string | null): boolean {
    return typeof value === 'string' && value.trim() === WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID
  }

  private bindingCallbackKey(integrationId: string, accountUuid?: string | null): string {
    return `${integrationId}:${this.normalizeTriggerAccountUuid(accountUuid)}`
  }

  private async accountExistsForBinding(integrationId: string, accountUuid: string): Promise<boolean> {
    if (!integrationId || !accountUuid || accountUuid === WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID) {
      return true
    }
    const scope = await this.resolveQueryTenantScope(integrationId)
    const account = await this.accountRepository.findOne({
      where: this.scopedWhere({ integrationId, uuid: accountUuid }, scope)
    })
    return Boolean(account)
  }

  private async assertAccountExistsForBinding(integrationId: string, accountUuid: string): Promise<void> {
    if (await this.accountExistsForBinding(integrationId, accountUuid)) {
      return
    }
    throw new Error(`WeChat account "${accountUuid}" is not found under integration "${integrationId}"`)
  }

  private normalizeAggregateKey(value?: string | null): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const normalized = value.trim()
    return normalized || undefined
  }

  private normalizePositiveSeconds(value: unknown, defaultValue: number): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value)
    }
    return defaultValue
  }

  private normalizeNonNegativeSeconds(value: unknown, defaultValue: number): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value)
    }
    return defaultValue
  }

  private normalizeHistoryContextLimit(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.min(Math.floor(value), MAX_HISTORY_CONTEXT_LIMIT)
    }
    return DEFAULT_HISTORY_CONTEXT_LIMIT
  }

  private normalizeHistoryContextWindowSeconds(value: unknown, legacySessionTimeoutSeconds?: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value)
    }
    return this.normalizePositiveSeconds(legacySessionTimeoutSeconds, DEFAULT_HISTORY_CONTEXT_WINDOW_SECONDS)
  }

  private composeDispatchInput(input: string, historyContext?: string): string {
    const history = typeof historyContext === 'string' ? historyContext.trim() : ''
    if (!history) {
      return input
    }
    return `${history}\n\n[本次用户消息]\n${input}`
  }

  private composeAggregatedInput(inputParts: string[], files?: WechatInboundFile[]): string {
    const input = (Array.isArray(inputParts) ? inputParts : [])
      .map((part) => (typeof part === 'string' ? part : ''))
      .filter((part) => part.trim())
      .join('\n')
    if (input.trim()) {
      return input
    }
    return Array.isArray(files) && files.length > 0 ? ATTACHMENT_ONLY_AGGREGATE_INPUT : ''
  }

  private createLegacyBatchItem(input?: string): WechatBatchTriggerItem {
    return {
      input: typeof input === 'string' ? input : '',
      messageKind: input ? 'text' : 'image',
      chatType: 'private'
    }
  }

  private mergePendingFiles(
    existing?: WechatPendingInboundFile[],
    incoming?: WechatPendingInboundFile[]
  ): WechatPendingInboundFile[] | undefined {
    return this.mergePendingFilesWithDuplicateLogIds(existing, incoming).files
  }

  private mergePendingFilesWithDuplicateLogIds(
    existing?: WechatPendingInboundFile[],
    incoming?: WechatPendingInboundFile[]
  ): PendingFileMergeResult {
    const merged: WechatPendingInboundFile[] = []
    const indexByKey = new Map<string, number>()
    const duplicateLogIds: string[] = []
    for (const pending of [...(existing ?? []), ...(incoming ?? [])]) {
      const key = this.pendingFileMergeKey(pending)
      const index = indexByKey.get(key)
      if (index === undefined) {
        indexByKey.set(key, merged.length)
        merged.push(pending)
        continue
      }
      const current = merged[index]
      const replace = this.pendingFileCompletenessScore(pending) >= this.pendingFileCompletenessScore(current)
      const dropped = replace ? current : pending
      if (dropped.kind === 'file' && dropped.messageLogId) {
        duplicateLogIds.push(dropped.messageLogId)
      }
      if (replace) {
        merged[index] = pending
      }
    }
    return {
      files: merged.length ? merged : undefined,
      duplicateLogIds: this.uniqueLogIds(duplicateLogIds)
    }
  }

  private pendingFileMergeKey(pending: WechatPendingInboundFile): string {
    const name = this.normalizePendingFileIdentity(
      pending.originalName || pending.fileRef?.originalName || pending.imageRef?.originalName
    )
    const size = pending.size ?? pending.fileRef?.size ?? 0
    if (pending.kind === 'file' && name) {
      return [pending.kind, pending.contactId, pending.senderId || '', name].join(':')
    }
    const stableAttachmentKey = this.pendingFileStableAttachmentKey(pending)
    if (name && size) {
      return [pending.kind, pending.contactId, pending.senderId || '', name, size].join(':')
    }
    if (stableAttachmentKey) {
      return [pending.kind, pending.contactId, pending.senderId || '', stableAttachmentKey].join(':')
    }
    return [pending.kind, pending.contactId, pending.senderId || '', pending.messageId || pending.messageLogId || 'unknown'].join(':')
  }

  private pendingFileCompletenessScore(pending: WechatPendingInboundFile): number {
    const fileRef = pending.fileRef
    const imageRef = pending.imageRef
    const stableAttachmentKey = this.pendingFileStableAttachmentKey(pending)
    const hasAppAttach = /<appattach\b/i.test(normalizeString(fileRef?.msgContent))
    const values: unknown[] = [
      pending.messageLogId,
      pending.messageId,
      pending.originalName,
      pending.size,
      fileRef?.attachId,
      fileRef?.cdnAttachUrl,
      fileRef?.aesKey,
      stableAttachmentKey,
      hasAppAttach,
      imageRef?.fileKey,
      fileRef?.msgContent && fileRef.msgContent.length > 0 ? fileRef.msgContent.length : undefined,
      imageRef?.msgContent && imageRef.msgContent.length > 0 ? imageRef.msgContent.length : undefined
    ]
    return values.reduce<number>((score, value) => score + (value ? 1 : 0), 0)
  }

  private pendingFileStableAttachmentKey(pending: WechatPendingInboundFile): string {
    const fileRef = pending.fileRef
    const directKey = normalizeString(fileRef?.attachId || fileRef?.cdnAttachUrl)
    if (directKey) {
      return directKey
    }
    const fileKey = normalizeString(fileRef?.fileKey)
    const messageKey = normalizeString(fileRef?.newMsgId || pending.messageId)
    return fileKey && fileKey !== messageKey ? fileKey : ''
  }

  private createHandleResult(
    accepted: boolean,
    options: { queued?: boolean; dispatched?: boolean; error?: string } = {}
  ): WechatInboundHandleResult {
    return {
      accepted,
      queued: Boolean(options.queued),
      dispatched: Boolean(options.dispatched),
      error: options.error
    }
  }

  private async materializePendingFiles(params: {
    integrationId: string
    xpertId: string
    tenantId?: string | null
    organizationId?: string | null
    conversationUserKey?: string
    pendingFiles?: WechatPendingInboundFile[]
    markFailures?: boolean
  }): Promise<{ success: true; files?: WechatInboundFile[] } | { success: false; error: string; recoverable: boolean }> {
    const pendingFiles = this.mergePendingFiles(undefined, params.pendingFiles) ?? []
    if (!pendingFiles.length) {
      return { success: true }
    }

    let integration: IIntegration<TIntegrationWechatOptions> | null = null
    const files: WechatInboundFile[] = []
    for (const pending of pendingFiles) {
      try {
        integration ??= await this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(
          params.integrationId,
          {
            relations: ['tenant']
          }
        )
        if (!integration) {
          throw new Error('wechat integration not found')
        }
        const materialized = pending.kind === 'file'
          ? await this.materializePendingWechatFile(integration, pending, params)
          : await this.materializePendingWechatImage(integration, pending, params)
        if (materialized) {
          files.push(materialized)
        }
      } catch (error) {
        const message = this.truncateError(
          `inbound_${pending.kind}_materialize_failed: ${this.describeError(error)}`
        )
        const recoverable = this.isRecoverablePendingFileMaterializeError(message)
        if (params.markFailures !== false || !recoverable) {
          await this.markPendingFileFailed(pending, params, message)
        }
        return { success: false, error: message, recoverable }
      }
    }

    return {
      success: true,
      files: files.length ? files : undefined
    }
  }

  private async materializePendingWechatFile(
    integration: IIntegration<TIntegrationWechatOptions>,
    pending: WechatPendingInboundFile,
    context: {
      xpertId: string
      tenantId?: string | null
      organizationId?: string | null
      conversationUserKey?: string
    }
  ): Promise<WechatInboundFile> {
    if (!pending.fileRef) {
      throw new Error('inbound_file_ref_missing')
    }

    const row = await this.savePendingFileRow(pending, integration, context, 'processing')
    const downloaded = await this.wechatClient.downloadFile(integration, pending.fileRef)
    if (!downloaded.success || !downloaded.file) {
      throw new Error(`inbound_file_download_failed${downloaded.error ? `: ${downloaded.error}` : ''}`)
    }

    const userId = RequestContext.currentUserId() ?? (integration as { createdById?: string | null }).createdById ?? undefined
    const metadata = {
      source: 'wechat_file_message',
      integrationId: integration.id,
      uuid: pending.uuid,
      messageId: pending.messageId,
      messageLogId: pending.messageLogId,
      conversationUserKey: context.conversationUserKey,
      contactId: pending.contactId,
      senderId: pending.senderId,
      fileKey: downloaded.file.fileKey,
      originalWechatFileName: pending.fileRef.originalName
    }
    const uploaded = await this.workspaceFiles.uploadBuffer({
      tenantId: context.tenantId ?? integration.tenantId ?? undefined,
      userId,
      catalog: 'xperts',
      xpertId: context.xpertId,
      isolateByUser: false,
      folder: this.buildInboundWorkspaceFolder(integration.id, pending),
      fileName: this.normalizeWorkspaceFileName(downloaded.file.originalName),
      originalName: downloaded.file.originalName,
      mimeType: downloaded.file.mimeType,
      size: downloaded.file.size,
      buffer: downloaded.file.data,
      metadata
    })
    const understood = await this.workspaceFiles.understandFile({
      tenantId: context.tenantId ?? integration.tenantId ?? undefined,
      userId,
      catalog: 'xperts',
      xpertId: context.xpertId,
      isolateByUser: false,
      filePath: uploaded.filePath,
      originalName: downloaded.file.originalName,
      mimeType: downloaded.file.mimeType,
      size: downloaded.file.size,
      fileUrl: uploaded.fileUrl ?? uploaded.url,
      purpose: 'chat_attachment',
      parseMode: 'auto',
      metadata
    })

    const handle: WechatInboundFile = {
      id: understood.id,
      fileId: understood.fileId,
      fileAssetId: understood.fileAssetId,
      storageFileId: understood.storageFileId,
      filePath: understood.filePath,
      workspacePath: understood.workspacePath,
      fileUrl: understood.fileUrl,
      url: understood.url,
      mimeType: understood.mimeType,
      mimetype: understood.mimeType,
      originalName: understood.originalName || downloaded.file.originalName,
      name: understood.name || understood.originalName || downloaded.file.originalName,
      fileKey: downloaded.file.fileKey,
      size: understood.size ?? downloaded.file.size,
      extension: downloaded.file.extension
    }
    await this.updatePendingFileRow(row?.id, context, {
      status: 'ready',
      fileAssetId: handle.fileAssetId,
      fileId: handle.fileId,
      workspacePath: handle.workspacePath,
      filePath: handle.filePath,
      fileUrl: handle.fileUrl || handle.url,
      originalName: handle.originalName || handle.name,
      mimeType: handle.mimeType || handle.mimetype,
      size: handle.size,
      error: null
    })
    return handle
  }

  private async materializePendingWechatImage(
    integration: IIntegration<TIntegrationWechatOptions>,
    pending: WechatPendingInboundFile,
    context: {
      xpertId: string
      tenantId?: string | null
      organizationId?: string | null
      conversationUserKey?: string
    }
  ): Promise<WechatInboundFile> {
    if (!pending.imageRef) {
      throw new Error('inbound_image_ref_missing')
    }

    const row = await this.savePendingFileRow(pending, integration, context, 'processing')
    const result = await this.wechatClient.downloadImage(integration, pending.imageRef)
    if (!result.success || !result.file) {
      throw new Error(`inbound_image_download_failed${result.error ? `: ${result.error}` : ''}`)
    }
    await this.updatePendingFileRow(row?.id, context, {
      status: 'ready',
      fileId: result.file.fileId,
      fileAssetId: result.file.fileAssetId,
      workspacePath: result.file.workspacePath,
      filePath: result.file.filePath,
      fileUrl: result.file.fileUrl || result.file.url,
      originalName: result.file.originalName || result.file.name,
      mimeType: result.file.mimeType || result.file.mimetype,
      size: result.file.size,
      error: null
    })
    return result.file
  }

  private async savePendingFileRow(
    pending: WechatPendingInboundFile,
    integration: IIntegration<TIntegrationWechatOptions>,
    context: {
      xpertId: string
      tenantId?: string | null
      organizationId?: string | null
      conversationUserKey?: string
    },
    status: WechatMessageFileEntity['status']
  ): Promise<WechatMessageFileEntity | null> {
    if (!pending.messageLogId) {
      return null
    }
    const where = this.scopedWhere(
      {
        messageLogId: pending.messageLogId,
        integrationId: integration.id
      },
      context
    )
    const existing = await this.messageFileRepository.findOne({ where })
    if (existing?.id) {
      await this.messageFileRepository.update(where, {
        conversationUserKey: context.conversationUserKey,
        xpertId: context.xpertId,
        messageId: pending.messageId,
        originalName: pending.originalName,
        mimeType: pending.mimeType,
        size: pending.size,
        status,
        error: null
      })
      return existing
    }
    return this.messageFileRepository.save({
      messageLogId: pending.messageLogId,
      integrationId: integration.id,
      conversationUserKey: context.conversationUserKey,
      xpertId: context.xpertId,
      messageId: pending.messageId,
      originalName: pending.originalName,
      mimeType: pending.mimeType,
      size: pending.size,
      status,
      tenantId: context.tenantId ?? integration.tenantId ?? null,
      organizationId: context.organizationId ?? integration.organizationId ?? null,
      createdById: (integration as { createdById?: string | null }).createdById ?? null,
      updatedById: (integration as { updatedById?: string | null }).updatedById ?? null
    })
  }

  private async markPendingFilesFailed(
    pendingFiles: WechatPendingInboundFile[] | undefined,
    context: {
      integrationId: string
      xpertId: string
      tenantId?: string | null
      organizationId?: string | null
      conversationUserKey?: string
    },
    error: string
  ): Promise<void> {
    for (const pending of Array.isArray(pendingFiles) ? pendingFiles : []) {
      await this.markPendingFileFailed(pending, context, error)
    }
  }

  private canRetryPendingFileMaterialize(state: WechatTriggerAggregationState): boolean {
    return (state.fileMaterializeRetryCount ?? 0) < MAX_PENDING_FILE_MATERIALIZE_RETRIES
  }

  private async schedulePendingFileMaterializeRetry(
    aggregateKey: string,
    state: WechatTriggerAggregationState,
    error: string
  ): Promise<void> {
    const retryCount = (state.fileMaterializeRetryCount ?? 0) + 1
    const retryState: WechatTriggerAggregationState = {
      ...state,
      fileMaterializeRetryCount: retryCount,
      fileMaterializeLastError: error,
      lastMessageAt: Date.now()
    }
    const delayMs = this.resolvePendingFileMaterializeRetryDelay(retryCount)
    const ttlSeconds = Math.max(
      DEFAULT_SESSION_TIMEOUT_SECONDS,
      Math.ceil(delayMs / 1000) * (MAX_PENDING_FILE_MATERIALIZE_RETRIES + 2)
    )
    this.logger.warn(
      `[wechat-trigger] pending file materialization retry ${retryCount}/${MAX_PENDING_FILE_MATERIALIZE_RETRIES} ` +
        `integrationId=${state.integrationId} aggregateKey=${aggregateKey} delayMs=${delayMs} error=${error}`
    )
    await this.aggregationService.save(retryState, ttlSeconds)
    await this.aggregationService.enqueueFlush(retryState, delayMs)
  }

  private resolvePendingFileMaterializeRetryDelay(retryCount: number): number {
    return PENDING_FILE_MATERIALIZE_RETRY_DELAYS_MS[
      Math.min(Math.max(retryCount, 1), PENDING_FILE_MATERIALIZE_RETRY_DELAYS_MS.length) - 1
    ]
  }

  private isRecoverablePendingFileMaterializeError(error: string): boolean {
    return /无法从应用消息提取附件|文件尚未就绪|提取附件|appmsg|appattach|attach|not ready/i.test(error)
  }

  private async updatePendingFileRow(
    id: string | undefined,
    scope: WechatTenantScope,
    patch: any
  ): Promise<void> {
    if (!id) {
      return
    }
    await this.messageFileRepository.update(
      this.scopedWhere({ id }, scope),
      patch
    )
  }

  private async markPendingFileFailed(
    pending: WechatPendingInboundFile,
    context: {
      integrationId: string
      xpertId: string
      tenantId?: string | null
      organizationId?: string | null
      conversationUserKey?: string
    },
    error: string
  ): Promise<void> {
    if (!pending.messageLogId) {
      return
    }
    const where = this.scopedWhere(
      {
        messageLogId: pending.messageLogId,
        integrationId: context.integrationId
      },
      context
    )
    const existing = await this.messageFileRepository.findOne({ where })
    if (existing?.id) {
      await this.messageFileRepository.update(where, {
        status: 'failed',
        error
      })
      return
    }
    await this.messageFileRepository.save({
      messageLogId: pending.messageLogId,
      integrationId: context.integrationId,
      conversationUserKey: context.conversationUserKey,
      xpertId: context.xpertId,
      messageId: pending.messageId,
      originalName: pending.originalName,
      mimeType: pending.mimeType,
      size: pending.size,
      status: 'failed',
      error,
      tenantId: context.tenantId ?? null,
      organizationId: context.organizationId ?? null
    })
  }

  private buildInboundWorkspaceFolder(integrationId: string, pending: WechatPendingInboundFile): string {
    return [
      'files',
      'wechat',
      this.normalizeWorkspaceSegment(integrationId),
      this.normalizeWorkspaceSegment(pending.uuid),
      this.normalizeWorkspaceSegment(pending.messageId || pending.messageLogId || 'message')
    ].join('/')
  }

  private normalizeWorkspaceFileName(value: string): string {
    const name = path.posix.basename(normalizeString(value).replace(/\\/g, '/')) || 'wechat-file'
    return name
      .replace(/[<>:"|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'wechat-file'
  }

  private normalizeWorkspaceSegment(value?: string | null): string {
    return normalizeString(value)
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 96) || 'unknown'
  }

  private normalizePendingFileIdentity(value?: string | null): string {
    return normalizeString(value)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }

  private truncateError(error: string): string {
    return normalizeString(error).slice(0, 512) || 'inbound_file_materialize_failed'
  }

  private uniqueLogIds(ids: Array<string | undefined | null>): string[] {
    return Array.from(new Set(ids.map((id) => normalizeString(id)).filter(Boolean)))
  }

  private async markInboundLogs(
    ids: string[] | undefined,
    scope: WechatTenantScope,
    status: WechatMessageLogStatus,
    error?: string
  ): Promise<void> {
    if (!this.messageLogRepository || !Array.isArray(ids) || ids.length === 0) {
      return
    }
    const uniqueIds = Array.from(new Set(ids.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)))
    for (const id of uniqueIds) {
      await this.messageLogRepository.update(
        this.scopedWhere({ id }, scope),
        {
          status,
          error
        }
      )
    }
  }

  private async removeBindingFromStore(
    integrationId: string,
    expectedXpertId?: string,
    accountUuid = WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID
  ): Promise<void> {
    if (!integrationId) {
      return
    }
    const scope = await this.resolveQueryTenantScope(integrationId)
    const where = {
      integrationId,
      accountUuid: this.normalizeTriggerAccountUuid(accountUuid),
      ...(expectedXpertId ? { xpertId: expectedXpertId } : {})
    }
    await this.bindingRepository.delete(this.scopedWhere(where, scope))
  }

  private async removeBindingsByXpertId(xpertId: string): Promise<void> {
    if (!xpertId) {
      return
    }
    await this.bindingRepository.delete(this.scopedWhere({ xpertId }, this.resolveRequestTenantScope()))
  }

  private resolveRequestTenantScope(): WechatTenantScope {
    return {
      tenantId: RequestContext.currentTenantId() ?? null,
      organizationId: RequestContext.getOrganizationId() ?? null
    }
  }

  private async resolveQueryTenantScope(
    integrationId?: string | null,
    fallback?: WechatTenantScope | null
  ): Promise<WechatTenantScope> {
    const requestScope = this.resolveRequestTenantScope()
    if (requestScope.tenantId || requestScope.organizationId || fallback?.tenantId || fallback?.organizationId) {
      return {
        tenantId: fallback?.tenantId ?? requestScope.tenantId ?? null,
        organizationId: fallback?.organizationId ?? requestScope.organizationId ?? null
      }
    }

    if (!integrationId) {
      return requestScope
    }

    const bindingContext = await this.resolveBindingContext(integrationId)
    return {
      tenantId: bindingContext.tenantId,
      organizationId: bindingContext.organizationId
    }
  }

  private scopedWhere<T extends Record<string, unknown>>(
    where: T,
    scope?: WechatTenantScope | null
  ): T & WechatTenantScope {
    const scoped = { ...where } as T & WechatTenantScope
    if (scope?.tenantId) {
      scoped.tenantId = scope.tenantId
    }
    if (scope?.organizationId) {
      scoped.organizationId = scope.organizationId
    }
    return scoped
  }
}
