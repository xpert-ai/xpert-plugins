import { Buffer } from 'node:buffer'
import { posix as path } from 'node:path'
import { SystemMessage } from '@langchain/core/messages'
import { Injectable } from '@nestjs/common'
import { type TAgentMiddlewareMeta, type TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  type BaseSandbox,
  ConnectorRuntimeCapability,
  type AgentBuiltInState,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type ConnectorRuntimeCredential,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { DingTalkConnectorApiClient } from '../api/dingtalk-connector-api.client.js'
import { DINGTALK_CONNECTOR_ICON } from '../branding.js'
import { DINGTALK_CONNECTOR_PROVIDER } from '../dingtalk-connector.strategy.js'
import { DingTalkConfirmationStore } from '../tools/confirmation-store.js'
import { defineAgentTool } from '../tools/define-agent-tool.js'
import {
  getAccountSchema,
  getUserSchema,
  listConversationsSchema,
  listDepartmentMembersSchema,
  listDepartmentsSchema,
  sendMessageSchema,
  type GetAccountInput,
  type GetUserInput,
  type ListConversationsInput,
  type ListDepartmentMembersInput,
  type ListDepartmentsInput,
  type SendMessageInput
} from '../tools/schemas.js'

export const DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${DINGTALK_CONNECTOR_PROVIDER}`

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'
const DEFAULT_WORKSPACE_ROOT = '/workspace'
const DINGTALK_CONNECTOR_SYSTEM_PROMPT = [
  'DingTalk workspace access is available through the active connector credential.',
  'Prefer the bounded `dingtalk_*` tools for account, contact, conversation, and message operations.',
  'Use `sandbox_shell` only for unsupported DingTalk APIs, and rely on `DINGTALK_ACCESS_TOKEN` when building requests.',
  'The credential is provisioned through a temporary protected environment file and removed after each command.',
  'Never print, inspect, or return DINGTALK_ACCESS_TOKEN, the credential file, or app secrets.'
].join('\n')

type DingTalkSandboxBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles' | 'workingDirectory'>

type DingTalkRuntimePaths = {
  workspaceRoot: string
  connectorEnvDir: string
}

type DingTalkCredentialPaths = {
  envDir: string
  envPath: string
}

type DingTalkToolRuntime = {
  connectorId: string
  userAccessToken: string
  appAccessToken?: string
  appId?: string
  robotCode?: string
  scopes: string[]
  profile: ConnectorRuntimeCredentialV2['profile']
}

@Injectable()
@AgentMiddlewareStrategy(DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME)
export class DingTalkConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<{ connectorId?: string }> {
  readonly meta: TAgentMiddlewareMeta & { builtin: true } = {
    name: DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
    label: {
      en_US: 'DingTalk connector runtime',
      zh_Hans: '钉钉连接器运行时'
    },
    description: {
      en_US: 'Hidden runtime implementation used by the DingTalk workspace connector.',
      zh_Hans: '供钉钉工作区连接器使用的隐藏运行时实现。'
    },
    icon: DINGTALK_CONNECTOR_ICON,
    builtin: true,
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(
    private readonly api: DingTalkConnectorApiClient,
    private readonly confirmations: DingTalkConfirmationStore
  ) {}

  createMiddleware(options: { connectorId?: string } = {}, context: IAgentMiddlewareContext): AgentMiddleware {
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability) as
      | ConnectorRuntimeApi
      | undefined
    const workspaceId = context.workspaceId
    let runtimePromise: Promise<DingTalkToolRuntime> | undefined
    const resolveRuntime = () => {
      runtimePromise ??= resolveDingTalkToolRuntime(options, workspaceId, connectorRuntime)
      return runtimePromise
    }

    return {
      name: DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
      tools: [
        defineAgentTool<GetAccountInput>(
          async () => {
            const runtime = await resolveRuntime()
            const account = await this.api.getCurrentUser(runtime.userAccessToken)
            return {
              provider: DINGTALK_CONNECTOR_PROVIDER,
              connectorId: runtime.connectorId,
              appId: runtime.appId,
              profile: {
                name: account.name ?? runtime.profile?.name ?? undefined,
                avatarUrl: account.avatarUrl ?? runtime.profile?.avatarUrl ?? undefined,
                openId: account.openId ?? runtime.profile?.openId ?? undefined,
                unionId: account.unionId ?? runtime.profile?.unionId ?? undefined,
                corpId: account.corpId ?? runtime.profile?.corpId ?? undefined
              },
              scopes: runtime.scopes,
              capabilities: {
                account: true,
                organizationContacts: !!runtime.appAccessToken,
                robotMessaging: !!runtime.robotCode
              }
            }
          },
          {
            name: 'dingtalk_get_account',
            description:
              'Read the connected DingTalk identity, OAuth scopes, and configured connector capabilities. Returns no access token or application secret.',
            schema: getAccountSchema,
            verboseParsingErrors: true,
            metadata: { toolName: { en_US: 'Read DingTalk account', zh_Hans: '读取钉钉账户' } }
          }
        ),
        defineAgentTool<ListDepartmentsInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return this.api.listDepartments({
              appAccessToken: requireAppAccessToken(runtime),
              parentDepartmentId: input.parent_department_id,
              language: input.language
            })
          },
          {
            name: 'dingtalk_list_departments',
            description:
              'List direct child departments under one DingTalk department. Start with parent_department_id=1 and use returned IDs for member lookup.',
            schema: listDepartmentsSchema,
            verboseParsingErrors: true,
            metadata: { toolName: { en_US: 'List DingTalk departments', zh_Hans: '列出钉钉部门' } }
          }
        ),
        defineAgentTool<ListDepartmentMembersInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return this.api.listDepartmentMembers({
              appAccessToken: requireAppAccessToken(runtime),
              departmentId: input.department_id,
              cursor: input.cursor,
              limit: input.limit,
              language: input.language
            })
          },
          {
            name: 'dingtalk_list_department_members',
            description:
              'List bounded DingTalk member summaries for one exact department with provider-side cursor pagination. Sensitive mobile fields are omitted.',
            schema: listDepartmentMembersSchema,
            verboseParsingErrors: true,
            metadata: { toolName: { en_US: 'List DingTalk members', zh_Hans: '列出钉钉成员' } }
          }
        ),
        defineAgentTool<GetUserInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return this.api.getUser({
              appAccessToken: requireAppAccessToken(runtime),
              userId: input.user_id,
              language: input.language
            })
          },
          {
            name: 'dingtalk_get_user',
            description:
              'Get one DingTalk organization member by an exact user ID returned by dingtalk_list_department_members. Mobile is never returned.',
            schema: getUserSchema,
            verboseParsingErrors: true,
            metadata: { toolName: { en_US: 'Get DingTalk user', zh_Hans: '获取钉钉成员' } }
          }
        ),
        defineAgentTool<ListConversationsInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            return this.api.listConversations({
              appAccessToken: requireAppAccessToken(runtime),
              cursor: input.cursor,
              limit: input.limit
            })
          },
          {
            name: 'dingtalk_list_conversations',
            description:
              'List DingTalk group conversations visible to the configured application with cursor pagination. Use returned openConversationId values for sending.',
            schema: listConversationsSchema,
            verboseParsingErrors: true,
            metadata: { toolName: { en_US: 'List DingTalk conversations', zh_Hans: '列出钉钉群聊' } }
          }
        ),
        defineAgentTool<SendMessageInput>(
          async (input) => {
            const runtime = await resolveRuntime()
            const robotCode = requireRobotCode(runtime)
            const operation = messageOperation(input)
            if (!input.confirmation_handle || input.confirmed !== true) {
              const confirmation = this.confirmations.create(runtime.connectorId, operation)
              return {
                status: 'confirmation_required',
                errorCode: 'CONFIRMATION_REQUIRED',
                confirmationHandle: confirmation.handle,
                expiresAt: confirmation.expiresAt,
                operationSummary: {
                  recipientType: input.recipient_type,
                  recipientId: input.recipient_id,
                  format: input.format,
                  title: input.title,
                  contentPreview: preview(input.content),
                  contentLength: input.content.length
                }
              }
            }

            this.confirmations.take(input.confirmation_handle, runtime.connectorId, operation)
            const result = await this.api.sendMessage({
              appAccessToken: requireAppAccessToken(runtime),
              robotCode,
              recipientType: input.recipient_type,
              recipientId: input.recipient_id,
              format: input.format,
              title: input.title,
              content: input.content
            })
            return {
              status: 'completed',
              recipientType: input.recipient_type,
              recipientId: input.recipient_id,
              messageId: result.messageId
            }
          },
          {
            name: 'dingtalk_send_message',
            description:
              'Prepare or send one DingTalk robot message to an exact user ID or openConversationId. The first call returns confirmation_required; send only after explicit user confirmation.',
            schema: sendMessageSchema,
            verboseParsingErrors: true,
            metadata: { toolName: { en_US: 'Send DingTalk message', zh_Hans: '发送钉钉消息' } }
          }
        )
      ],
      wrapModelCall: async (request, handler) => {
        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        const content = [baseContent, DINGTALK_CONNECTOR_SYSTEM_PROMPT].filter(Boolean).join('\n\n')
        return handler({
          ...request,
          systemMessage: new SystemMessage({ content })
        })
      },
      wrapToolCall: async (request: ToolCallRequest<AgentBuiltInState>, handler) => {
        if (!isSandboxShellTool(request.tool)) {
          return handler(request)
        }

        const command = getSandboxShellCommand(request)
        if (!isDingTalkCommand(command)) {
          return handler(request)
        }

        if (!workspaceId) {
          throw new Error('DingTalk connector runtime requires workspaceId')
        }
        if (!connectorRuntime?.getConnector && !connectorRuntime?.getConnectorCredential) {
          throw new Error('DingTalk connector runtime requires connector runtime support')
        }

        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          throw new Error('DingTalk connector runtime requires SandboxShell')
        }

        const credential = await resolveConnectorCredential(connectorRuntime, {
          workspaceId,
          provider: DINGTALK_CONNECTOR_PROVIDER,
          ...(options.connectorId ? { connectorId: options.connectorId } : {})
        })

        const paths = getDingTalkCredentialPaths(credential, getDingTalkRuntimePaths(request.runtime))
        const operationResult = await (async () => {
          try {
            await syncConnectorCredential(backend, credential, paths)
            return { ok: true as const, value: await handler(withConnectorCommand(request, paths.envPath, command)) }
          } catch (error) {
            return { ok: false as const, error }
          }
        })()
        const cleanupResult = await (async () => {
          try {
            await removeConnectorCredential(backend, paths.envPath)
            return { ok: true as const }
          } catch (error) {
            return { ok: false as const, error }
          }
        })()

        if (!operationResult.ok) {
          if (!cleanupResult.ok) {
            throw new AggregateError(
              [operationResult.error, cleanupResult.error],
              'DingTalk connector command failed and its credential file could not be removed'
            )
          }
          throw operationResult.error
        }
        if (!cleanupResult.ok) {
          throw cleanupResult.error
        }
        return operationResult.value
      }
    }
  }
}

function getSandboxBackend(runtime: ToolCallRequest<AgentBuiltInState>['runtime']): DingTalkSandboxBackend | null {
  const backend = runtime?.configurable?.sandbox?.backend
  if (backend && typeof (backend as BaseSandbox).execute === 'function') {
    return backend as DingTalkSandboxBackend
  }
  return null
}

function isSandboxShellTool(toolValue: { name?: string } | Record<string, unknown>) {
  return toolValue?.name === SANDBOX_SHELL_TOOL_NAME
}

function getSandboxShellCommand(request: ToolCallRequest<AgentBuiltInState>) {
  const args = request.toolCall?.args
  if (!args || typeof args !== 'object') {
    return ''
  }
  const command = Reflect.get(args, 'command')
  return typeof command === 'string' ? command : ''
}

function isDingTalkCommand(command: string) {
  return /dingtalk|DINGTALK_/i.test(command)
}

function withConnectorCommand(
  request: ToolCallRequest<AgentBuiltInState>,
  envPath: string,
  command: string
): ToolCallRequest<AgentBuiltInState> {
  const redactedCommand = [
    'set -o pipefail',
    `{ ${command}; } 2>&1 | while IFS= read -r line; do printf '%s\\n' "\${line//"$DINGTALK_ACCESS_TOKEN"/[REDACTED]}"; done`
  ].join('; ')

  return {
    ...request,
    toolCall: {
      ...request.toolCall,
      args: {
        ...((request.toolCall?.args as Record<string, unknown>) ?? {}),
        command: `. ${shellQuote(envPath)} && /bin/bash -c ${shellQuote(redactedCommand)}`
      }
    }
  }
}

async function resolveConnectorCredential(
  connectorRuntime: ConnectorRuntimeApi,
  input: Parameters<ConnectorRuntimeApi['getConnector']>[0]
): Promise<ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2> {
  if (connectorRuntime.getConnectorCredential) {
    return connectorRuntime.getConnectorCredential(input)
  }
  return connectorRuntime.getConnector(input)
}

async function resolveDingTalkToolRuntime(
  options: { connectorId?: string },
  workspaceId: string | undefined,
  connectorRuntime: ConnectorRuntimeApi | undefined
): Promise<DingTalkToolRuntime> {
  if (!workspaceId) {
    throw new Error('DingTalk connector runtime requires workspaceId')
  }
  if (!connectorRuntime?.getConnector && !connectorRuntime?.getConnectorCredential) {
    throw new Error('DingTalk connector runtime requires connector runtime support')
  }
  const credential = await resolveConnectorCredential(connectorRuntime, {
    workspaceId,
    provider: DINGTALK_CONNECTOR_PROVIDER,
    ...(options.connectorId ? { connectorId: options.connectorId } : {})
  })
  return {
    connectorId: credential.connectorId,
    userAccessToken: readCredentialAccessToken(credential),
    appAccessToken: readCredentialValue(credential, 'appAccessToken') ?? undefined,
    appId: readCredentialValue(credential, 'appId') ?? undefined,
    robotCode: readCredentialValue(credential, 'robotCode') ?? undefined,
    scopes: credential.scopes ?? [],
    profile: credential.profile
  }
}

function requireAppAccessToken(runtime: DingTalkToolRuntime) {
  if (!runtime.appAccessToken) {
    throw new Error(
      'DingTalk organization tools require an app access token. Reconnect after configuring Client ID and Client Secret in the DingTalk system integration.'
    )
  }
  return runtime.appAccessToken
}

function requireRobotCode(runtime: DingTalkToolRuntime) {
  if (!runtime.robotCode) {
    throw new Error(
      'DingTalk Robot Code is not configured. Add it to the connector-owned DingTalk OAuth system integration before sending messages.'
    )
  }
  return runtime.robotCode
}

function messageOperation(input: SendMessageInput): Record<string, unknown> {
  return {
    recipientType: input.recipient_type,
    recipientId: input.recipient_id,
    format: input.format,
    ...(input.title ? { title: input.title } : {}),
    content: input.content
  }
}

function preview(value: string) {
  return value.length <= 500 ? value : `${value.slice(0, 500)}...`
}

function getDingTalkRuntimePaths(runtime: ToolCallRequest<AgentBuiltInState>['runtime']): DingTalkRuntimePaths {
  const configurable = runtime?.configurable as TAgentRunnableConfigurable | Record<string, unknown> | undefined
  const sandbox = configurable?.['sandbox']
  const sandboxRecord = isRecord(sandbox) ? sandbox : {}
  const backend = sandboxRecord['backend']
  const backendWorkingDirectory = isRecord(backend) ? readString(backend['workingDirectory']) : undefined
  const workspaceRoot =
    normalizeAbsolutePath(sandboxRecord['workspaceRoot']) ??
    normalizeAbsolutePath(sandboxRecord['workingDirectory']) ??
    normalizeAbsolutePath(backendWorkingDirectory) ??
    DEFAULT_WORKSPACE_ROOT

  return {
    workspaceRoot,
    connectorEnvDir: path.join(workspaceRoot, '.xpert', 'secrets', 'dingtalk-connectors')
  }
}

function getDingTalkCredentialPaths(
  credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2,
  runtimePaths: DingTalkRuntimePaths
): DingTalkCredentialPaths {
  if (!credential.connectorId) {
    throw new Error('DingTalk connector runtime credential is missing connectorId')
  }

  const envDir = path.join(runtimePaths.connectorEnvDir, safePathSegment(credential.connectorId))
  return {
    envDir,
    envPath: path.join(envDir, `env-${randomUUID()}`)
  }
}

async function syncConnectorCredential(
  backend: DingTalkSandboxBackend,
  credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2,
  paths: DingTalkCredentialPaths
) {
  if (typeof backend.uploadFiles !== 'function') {
    throw new Error('DingTalk connector runtime requires secure sandbox uploads')
  }

  const accessToken = readCredentialAccessToken(credential)
  const prepared = await backend.execute(
    `mkdir -p ${shellQuote(paths.envDir)} && chmod 700 ${shellQuote(paths.envDir)}`
  )
  if (prepared.exitCode !== 0) {
    throw new Error(`Failed to prepare DingTalk connector credential directory: ${prepared.output || 'Unknown error'}`)
  }

  const uploaded = await backend.uploadFiles([
    [toUploadPath(backend, paths.envPath), Buffer.from(buildConnectorEnv(credential, accessToken), 'utf8')]
  ])
  if (!Array.isArray(uploaded) || uploaded.length !== 1 || uploaded[0]?.error) {
    throw new Error('Failed to upload DingTalk connector credential file')
  }

  const protectedFile = await backend.execute(`chmod 600 ${shellQuote(paths.envPath)}`)
  if (protectedFile.exitCode !== 0) {
    throw new Error(`Failed to protect DingTalk connector credential file: ${protectedFile.output || 'Unknown error'}`)
  }
}

async function removeConnectorCredential(backend: DingTalkSandboxBackend, envPath: string) {
  const removed = await backend.execute(`rm -f ${shellQuote(envPath)}`)
  if (removed.exitCode !== 0) {
    throw new Error(`Failed to remove DingTalk connector credential file: ${removed.output || 'Unknown error'}`)
  }
}

function buildConnectorEnv(credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2, accessToken: string) {
  const profile = credential.profile
  const appId = readCredentialValue(credential, 'appId')
  const brand = readCredentialValue(credential, 'brand')
  const values = [
    `export DINGTALK_ACCESS_TOKEN=${shellQuote(accessToken)}`,
    ...(appId ? [`export DINGTALK_APP_ID=${shellQuote(appId)}`] : []),
    ...(brand ? [`export DINGTALK_BRAND=${shellQuote(brand)}`] : []),
    ...(profile?.openId ? [`export DINGTALK_OPEN_ID=${shellQuote(profile.openId)}`] : []),
    ...(profile?.unionId ? [`export DINGTALK_UNION_ID=${shellQuote(profile.unionId)}`] : []),
    ...(profile?.userId ? [`export DINGTALK_USER_ID=${shellQuote(profile.userId)}`] : []),
    ''
  ]
  return values.join('\n')
}

function readCredentialAccessToken(credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2) {
  const accessToken = readCredentialValue(credential, 'accessToken')
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('DingTalk connector runtime credential is missing accessToken')
  }
  return accessToken.trim()
}

function readCredentialValue(credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2, key: string) {
  if ('credentials' in credential) {
    return readString(credential.credentials[key])
  }
  return readString(Reflect.get(credential, key))
}

function toUploadPath(backend: DingTalkSandboxBackend, targetPath: string) {
  const normalizedTargetPath = path.normalize(targetPath)
  const workingDirectory = normalizeAbsolutePath(backend.workingDirectory)
  if (!path.isAbsolute(normalizedTargetPath) || !workingDirectory) {
    return normalizedTargetPath
  }

  const relativePath = path.relative(workingDirectory, normalizedTargetPath)
  if (!relativePath || path.isAbsolute(relativePath)) {
    return normalizedTargetPath
  }

  return path.normalize(path.join(workingDirectory, relativePath)) === normalizedTargetPath
    ? relativePath
    : normalizedTargetPath
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeAbsolutePath(value: unknown) {
  const normalized = readString(value)
  return normalized && path.isAbsolute(normalized) ? path.normalize(normalized) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_') || 'connector'
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\'"'"'`)}'`
}
