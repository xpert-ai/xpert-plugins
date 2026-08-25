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
import { DINGTALK_CONNECTOR_PROVIDER } from '../dingtalk-connector.strategy.js'

export const DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${DINGTALK_CONNECTOR_PROVIDER}`

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'
const DEFAULT_WORKSPACE_ROOT = '/workspace'
const DINGTALK_CONNECTOR_SYSTEM_PROMPT = [
  'DingTalk workspace access is available through the active connector credential.',
  'Use `sandbox_shell` to call DingTalk APIs, and rely on `DINGTALK_ACCESS_TOKEN` when building requests.',
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
    builtin: true,
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(
    options: { connectorId?: string } = {},
    context: IAgentMiddlewareContext
  ): AgentMiddleware {
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability) as
      | ConnectorRuntimeApi
      | undefined
    const workspaceId = context.workspaceId

    return {
      name: DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
      tools: [],
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
        let operationError: unknown
        try {
          await syncConnectorCredential(backend, credential, paths)
          return await handler(withConnectorCommand(request, paths.envPath, command))
        } catch (error) {
          operationError = error
          throw error
        } finally {
          try {
            await removeConnectorCredential(backend, paths.envPath)
          } catch (cleanupError) {
            if (operationError) {
              throw new AggregateError(
                [operationError, cleanupError],
                'DingTalk connector command failed and its credential file could not be removed'
              )
            }
            throw cleanupError
          }
        }
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
    `{ ${command}; } 2>&1 | while IFS= read -r line; do printf '%s\\n' "\${line//\"\$DINGTALK_ACCESS_TOKEN\"/[REDACTED]}"; done`
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

function buildConnectorEnv(
  credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2,
  accessToken: string
) {
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
