import type { TAgentMiddlewareMeta, TAgentRunnableConfigurable } from '@xpert-ai/contracts'
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
import { GITHUB_CONNECTOR_PROVIDER, GITHUB_CONNECTOR_RUNTIME_MIDDLEWARE_NAME } from './github-connector.strategy.js'

type GitHubConnectorRuntimeConfig = {
  provider?: string
  connectorId?: string
}

type HiddenAgentMiddlewareMeta = TAgentMiddlewareMeta & {
  builtin: true
}

type GitHubSandboxBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles' | 'workingDirectory'>

type GitHubRuntimePaths = {
  workspaceRoot: string
  connectorEnvDir: string
}

type GitHubCredentialPaths = {
  envDir: string
  envPath: string
  configDir: string
}

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'
const DEFAULT_WORKSPACE_ROOT = '/workspace'
const GITHUB_CLI_SYSTEM_PROMPT = [
  'GitHub access is available through the GitHub CLI (`gh`) and Git (`git`) in `sandbox_shell`.',
  'For GitHub connection checks, run `gh auth status` or `gh api user`; do not search the filesystem for connector configuration or credential files.',
  'Connector credentials are injected only for matching `gh` or `git` commands and removed after each command.',
  'Never print, inspect, or return `GH_TOKEN`, `GITHUB_TOKEN`, credential files, or full authentication tokens.'
].join('\n')

@Injectable()
@AgentMiddlewareStrategy(GITHUB_CONNECTOR_RUNTIME_MIDDLEWARE_NAME)
export class GitHubConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<GitHubConnectorRuntimeConfig> {
  readonly meta: HiddenAgentMiddlewareMeta = {
    name: GITHUB_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
    label: {
      en_US: 'GitHub connector runtime',
      zh_Hans: 'GitHub 连接器运行时'
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

  createMiddleware(options: GitHubConnectorRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const workspaceId = context.workspaceId
    const connectorId = readString(options?.connectorId)
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability) as
      | ConnectorRuntimeApi
      | undefined

    return {
      name: GITHUB_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
      tools: [],
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        const content = [baseContent, GITHUB_CLI_SYSTEM_PROMPT].filter(Boolean).join('\n\n')

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
        if (!isGitHubCommand(command)) {
          return handler(request)
        }

        if (!workspaceId) {
          throw new Error('GitHub connector CLI mode requires workspaceId')
        }
        if (!connectorRuntime?.getConnectorCredential) {
          throw new Error('GitHub connector CLI mode requires Xpert plugin SDK 3.15.15 or later')
        }

        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          throw new Error('GitHub connector CLI mode requires SandboxShell')
        }

        const credential = await connectorRuntime.getConnectorCredential({
          workspaceId,
          provider: GITHUB_CONNECTOR_PROVIDER,
          ...(connectorId ? { connectorId } : {})
        })
        const credentialPaths = getGitHubCredentialPaths(credential, getGitHubRuntimePaths(request.runtime))
        let operationFailed = false
        let operationError: unknown

        try {
          await syncConnectorCredential(backend, credential, credentialPaths)
          return await handler(withConnectorCommand(request, command, credentialPaths.envPath))
        } catch (error) {
          operationFailed = true
          operationError = error
          throw error
        } finally {
          try {
            await removeConnectorCredential(backend, credentialPaths.envPath)
          } catch (cleanupError) {
            if (operationFailed) {
              throw new AggregateError(
                [operationError, cleanupError],
                'GitHub connector command failed and its credential file could not be removed'
              )
            }
            throw cleanupError
          }
        }
      }
    }
  }
}

function getSandboxBackend(runtime: Runtime | undefined): GitHubSandboxBackend | null {
  const backend = runtime?.configurable?.sandbox?.backend
  if (backend && typeof (backend as BaseSandbox).execute === 'function') {
    return backend as BaseSandbox
  }
  return null
}

function getGitHubRuntimePaths(runtime: Runtime | undefined): GitHubRuntimePaths {
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
    connectorEnvDir: path.join(workspaceRoot, '.xpert', 'secrets', 'github-connectors')
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

function isGitHubCommand(command: string) {
  return /(^|[\s;&|()])(?:gh|git)(?=$|[\s;&|()])/i.test(command)
}

async function syncConnectorCredential(
  backend: GitHubSandboxBackend,
  credential: ConnectorRuntimeCredentialV2,
  paths: GitHubCredentialPaths
) {
  if (typeof backend.uploadFiles !== 'function') {
    throw new Error('Sandbox backend does not support secure uploads required for GitHub connector credentials')
  }

  const accessToken = readRuntimeAccessToken(credential.credentials)
  const prepared = await backend.execute(
    `mkdir -p ${shellQuote(paths.envDir)} ${shellQuote(paths.configDir)} && chmod 700 ${shellQuote(
      paths.envDir
    )} ${shellQuote(
      paths.configDir
    )}`
  )
  if (prepared.exitCode !== 0) {
    throw new Error(`Failed to prepare GitHub connector credential directory: ${prepared.output || 'Unknown error'}`)
  }

  const uploaded = await backend.uploadFiles([
    [toUploadPath(backend, paths.envPath), Buffer.from(buildConnectorEnv(accessToken, paths.configDir), 'utf8')]
  ])
  if (!Array.isArray(uploaded) || uploaded.length !== 1 || uploaded[0]?.error) {
    throw new Error('Failed to upload GitHub connector credential file')
  }

  const protectedFile = await backend.execute(`chmod 600 ${shellQuote(paths.envPath)}`)
  if (protectedFile.exitCode !== 0) {
    throw new Error(`Failed to protect GitHub connector credential file: ${protectedFile.output || 'Unknown error'}`)
  }
}

function getGitHubCredentialPaths(
  credential: ConnectorRuntimeCredentialV2,
  paths: GitHubRuntimePaths
): GitHubCredentialPaths {
  if (!credential.connectorId) {
    throw new Error('GitHub connector runtime credential is missing connectorId')
  }

  const envDir = path.join(paths.connectorEnvDir, safePathSegment(credential.connectorId))
  return {
    envDir,
    envPath: path.join(envDir, `env-${randomUUID()}`),
    configDir: path.join(envDir, 'config')
  }
}

async function removeConnectorCredential(backend: GitHubSandboxBackend, envPath: string) {
  const removed = await backend.execute(`rm -f ${shellQuote(envPath)}`)
  if (removed.exitCode !== 0) {
    throw new Error(`Failed to remove GitHub connector credential file: ${removed.output || 'Unknown error'}`)
  }
}

function buildConnectorEnv(accessToken: string, configDir: string) {
  return [
    `export GH_TOKEN=${shellQuote(accessToken)}`,
    `export GITHUB_TOKEN=${shellQuote(accessToken)}`,
    `export GH_HOST=github.com`,
    `export GH_CONFIG_DIR=${shellQuote(configDir)}`,
    `export GH_PROMPT_DISABLED=1`,
    `export GIT_TERMINAL_PROMPT=0`,
    `export GIT_SSH_COMMAND=false`,
    `export GIT_CONFIG_COUNT=3`,
    `export GIT_CONFIG_KEY_0=credential.helper`,
    `export GIT_CONFIG_VALUE_0=''`,
    `export GIT_CONFIG_KEY_1=credential.https://github.com.helper`,
    `export GIT_CONFIG_VALUE_1=${shellQuote('!gh auth git-credential')}`,
    `export GIT_CONFIG_KEY_2=url.https://github.com/.insteadOf`,
    `export GIT_CONFIG_VALUE_2=${shellQuote('git@github.com:')}`,
    ''
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

function toUploadPath(backend: GitHubSandboxBackend, targetPath: string) {
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

function readRuntimeAccessToken(credentials: Record<string, unknown>) {
  const accessToken = readString(credentials.accessToken)
  if (!accessToken) {
    throw new Error('GitHub connector runtime credential is missing accessToken')
  }
  return accessToken
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
