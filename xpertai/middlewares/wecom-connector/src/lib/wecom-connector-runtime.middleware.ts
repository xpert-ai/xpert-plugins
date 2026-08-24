import { SystemMessage } from '@langchain/core/messages'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { posix as path } from 'node:path'
import {
  type AgentBuiltInState,
  AgentMiddlewareStrategy,
  type BaseSandbox,
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type Runtime,
  type ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { WECOM_CONNECTOR_PROVIDER, WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME } from './types.js'

type WeComConnectorRuntimeConfig = {
  provider?: string
  connectorId?: string
}

type HiddenAgentMiddlewareMeta = {
  name: string
  label: { en_US: string; zh_Hans: string }
  description: { en_US: string; zh_Hans: string }
  builtin: true
  configSchema: {
    type: 'object'
    properties: Record<string, never>
  }
}

type WeComSandboxBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles' | 'workingDirectory'>

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'
const DEFAULT_WORKSPACE_ROOT = '/workspace'
const WECOM_SYSTEM_PROMPT = [
  'WeCom access is available in `sandbox_shell` through environment variables.',
  'Use `curl` or your own scripts against `qyapi.weixin.qq.com` and read `WECOM_ACCESS_TOKEN` from the environment.',
  'Never print, inspect, or return `WECOM_ACCESS_TOKEN` or connector app secrets.'
].join('\n')

@Injectable()
@AgentMiddlewareStrategy(WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME)
export class WeComConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<WeComConnectorRuntimeConfig> {
  readonly meta: HiddenAgentMiddlewareMeta = {
    name: WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
    label: {
      en_US: 'WeCom connector runtime',
      zh_Hans: '企业微信连接器运行时'
    },
    description: {
      en_US: 'Hidden runtime implementation used by the platform connector middleware.',
      zh_Hans: '供平台连接器中间件调用的隐藏运行时实现。'
    },
    builtin: true,
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(options: WeComConnectorRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const workspaceId = context.workspaceId
    const connectorId = readString(options?.connectorId)
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability) as
      | ConnectorRuntimeApi
      | undefined

    return {
      name: WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
      tools: [],
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        const content = [baseContent, WECOM_SYSTEM_PROMPT].filter(Boolean).join('\n\n')

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
        if (!isWeComCommand(command)) {
          return handler(request)
        }

        if (!workspaceId) {
          throw new Error('WeCom connector CLI mode requires workspaceId')
        }
        if (!connectorRuntime?.getConnectorCredential) {
          throw new Error('WeCom connector CLI mode requires Xpert plugin SDK 3.15.15 or later')
        }

        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          throw new Error('WeCom connector CLI mode requires SandboxShell')
        }

        const credential = await connectorRuntime.getConnectorCredential({
          workspaceId,
          provider: WECOM_CONNECTOR_PROVIDER,
          ...(connectorId ? { connectorId } : {})
        })

        const paths = getWeComCredentialPaths(credential, getWeComRuntimePaths(request.runtime))
        let operationFailed = false
        let operationError: unknown
        let cleanupFailed = false
        let cleanupError: unknown
        let result: Awaited<ReturnType<typeof handler>> | undefined

        try {
          await syncConnectorCredential(backend, credential, paths)
          result = await handler(withConnectorCommand(request, command, paths.envPath))
        } catch (error) {
          operationFailed = true
          operationError = error
        }

        try {
          await removeConnectorCredential(backend, paths.envPath)
        } catch (error) {
          cleanupFailed = true
          cleanupError = error
        }

        if (operationFailed && cleanupFailed) {
          throw new AggregateError(
            [operationError, cleanupError],
            'WeCom connector command failed and its credential file could not be removed'
          )
        }
        if (operationFailed) {
          throw operationError
        }
        if (cleanupFailed) {
          throw cleanupError
        }
        return result
      }
    }
  }
}

function getSandboxBackend(runtime: Runtime | undefined): WeComSandboxBackend | null {
  const backend = runtime?.configurable?.sandbox?.backend
  if (backend && typeof (backend as BaseSandbox).execute === 'function') {
    return backend as BaseSandbox
  }
  return null
}

function getWeComRuntimePaths(runtime: Runtime | undefined) {
  const configurable = runtime?.configurable as Record<string, unknown> | undefined
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
    connectorEnvDir: path.join(workspaceRoot, '.xpert', 'secrets', 'wecom-connectors')
  }
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

function isWeComCommand(command: string) {
  return /(?:qyapi\.weixin\.qq\.com|open\.work\.weixin\.qq\.com|\bwecom\b)/i.test(command)
}

async function syncConnectorCredential(
  backend: WeComSandboxBackend,
  credential: ConnectorRuntimeCredentialV2,
  paths: { envDir: string; envPath: string }
) {
  if (typeof backend.uploadFiles !== 'function') {
    throw new Error('Sandbox backend does not support secure uploads required for WeCom connector credentials')
  }

  const accessToken = readRuntimeAccessToken(credential.credentials)
  const prepared = await backend.execute(
    `mkdir -p ${shellQuote(paths.envDir)} && chmod 700 ${shellQuote(paths.envDir)}`
  )
  if (prepared.exitCode !== 0) {
    throw new Error(`Failed to prepare WeCom connector credential directory: ${prepared.output || 'Unknown error'}`)
  }

  const uploaded = await backend.uploadFiles([
    [toUploadPath(backend, paths.envPath), Buffer.from(buildConnectorEnv(credential, accessToken), 'utf8')]
  ])
  if (!Array.isArray(uploaded) || uploaded.length !== 1 || uploaded[0]?.error) {
    throw new Error('Failed to upload WeCom connector credential file')
  }

  const protectedFile = await backend.execute(`chmod 600 ${shellQuote(paths.envPath)}`)
  if (protectedFile.exitCode !== 0) {
    throw new Error(`Failed to protect WeCom connector credential file: ${protectedFile.output || 'Unknown error'}`)
  }
}

function getWeComCredentialPaths(credential: ConnectorRuntimeCredentialV2, paths: { connectorEnvDir: string }) {
  if (!credential.connectorId) {
    throw new Error('WeCom connector runtime credential is missing connectorId')
  }

  const envDir = path.join(paths.connectorEnvDir, safePathSegment(credential.connectorId))
  return {
    envDir,
    envPath: path.join(envDir, `env-${randomUUID()}`)
  }
}

async function removeConnectorCredential(backend: WeComSandboxBackend, envPath: string) {
  const removed = await backend.execute(`rm -f ${shellQuote(envPath)}`)
  if (removed.exitCode !== 0) {
    throw new Error(`Failed to remove WeCom connector credential file: ${removed.output || 'Unknown error'}`)
  }
}

function buildConnectorEnv(credential: ConnectorRuntimeCredentialV2, accessToken: string) {
  const data = credential.credentials as Record<string, unknown>
  const profile = credential.profile as Record<string, unknown> | undefined

  return [
    `export WECOM_ACCESS_TOKEN=${shellQuote(accessToken)}`,
    `export WECOM_CORP_ID=${shellQuote(readString(data.corpId) ?? '')}`,
    `export WECOM_AGENT_ID=${shellQuote(readString(data.agentId) ?? '')}`,
    `export WECOM_USER_ID=${shellQuote(readString(profile?.userId) ?? '')}`,
    `export WECOM_OPEN_ID=${shellQuote(readString(profile?.openId) ?? '')}`,
    `export WECOM_UNION_ID=${shellQuote(readString(profile?.unionId) ?? '')}`,
    `export WECOM_API_BASE=${shellQuote('https://qyapi.weixin.qq.com')}`
  ].join('\n')
}

function withConnectorCommand(
  request: ToolCallRequest<AgentBuiltInState>,
  command: string,
  envPath: string
): ToolCallRequest<AgentBuiltInState> {
  return {
    ...request,
    toolCall: {
      ...request.toolCall,
      args: {
        ...((request.toolCall?.args as Record<string, unknown>) ?? {}),
        command: `. ${shellQuote(envPath)} && ${command}`
      }
    }
  }
}

function readRuntimeAccessToken(value: Record<string, unknown>) {
  return requireString(value.accessToken, 'WeCom connector access token is missing')
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function toUploadPath(backend: WeComSandboxBackend, envPath: string) {
  const normalizedTargetPath = path.normalize(envPath)
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

function normalizeAbsolutePath(value: unknown) {
  const normalized = readString(value)
  return normalized && normalized.startsWith('/') ? normalized : undefined
}

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireString(value: unknown, message: string) {
  const result = readString(value)
  if (!result) {
    throw new Error(message)
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
