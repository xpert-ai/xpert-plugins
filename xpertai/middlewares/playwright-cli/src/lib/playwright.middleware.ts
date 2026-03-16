import { SystemMessage } from '@langchain/core/messages'
import { TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  AgentBuiltInState,
  BaseSandbox,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  Runtime,
  ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { PlaywrightBootstrapService } from './playwright-bootstrap.service.js'
import {
  DEFAULT_PLAYWRIGHT_OPEN_TIMEOUT_SEC,
  PLAYWRIGHT_CLI_SKILL_MIDDLEWARE_NAME,
  PlaywrightConfig,
  PlaywrightConfigFormSchema
} from './playwright.types.js'
import { PlaywrightIcon } from './types.js'

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

@Injectable()
@AgentMiddlewareStrategy(PLAYWRIGHT_CLI_SKILL_MIDDLEWARE_NAME)
export class PlaywrightCLISkillMiddleware implements IAgentMiddlewareStrategy<Partial<PlaywrightConfig>> {
  constructor(private readonly playwrightBootstrapService: PlaywrightBootstrapService) {}

  meta: TAgentMiddlewareMeta = {
    name: PLAYWRIGHT_CLI_SKILL_MIDDLEWARE_NAME,
    label: {
      en_US: 'Playwright CLI Skill',
      zh_Hans: 'Playwright CLI 技能'
    },
    description: {
      en_US: 'Bootstraps Playwright into the sandbox workspace and teaches the agent how to run it through sandbox_shell.',
      zh_Hans: '将 Playwright 引导安装到 sandbox 工作区，并指导智能体通过 sandbox_shell 使用它。'
    },
    icon: {
      type: 'image',
      value: PlaywrightIcon
    },
    configSchema: PlaywrightConfigFormSchema
  }

  createMiddleware(options: Partial<PlaywrightConfig>, _context: IAgentMiddlewareContext): AgentMiddleware {
    const config = this.playwrightBootstrapService.resolveConfig(options)

    return {
      name: PLAYWRIGHT_CLI_SKILL_MIDDLEWARE_NAME,
      tools: [],
      beforeAgent: async (_state, runtime) => {
        const backend = getSandboxBackend(runtime)
        await this.playwrightBootstrapService.ensureBootstrap(backend, config)
      },
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const prompt = this.playwrightBootstrapService.buildSystemPrompt(config)
        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        const content = [baseContent, prompt].filter(Boolean).join('\n\n')

        return handler({
          ...request,
          systemMessage: new SystemMessage({
            content
          })
        })
      },
      wrapToolCall: async (
        request: ToolCallRequest<AgentBuiltInState>,
        handler
      ) => {
        if (!isSandboxShellTool(request.tool)) {
          return handler(request)
        }

        const command = getSandboxShellCommand(request)
        if (!this.playwrightBootstrapService.isPlaywrightCommand(command)) {
          return handler(request)
        }

        const backend = getSandboxBackend(request.runtime)
        if (backend) {
          await this.playwrightBootstrapService.ensureBootstrap(backend, config)
        }

        let args = getSandboxShellArgs(request)
        const effectiveCommand = this.playwrightBootstrapService.injectManagedConfig(command)
        const isOpenCommand = this.playwrightBootstrapService.isPlaywrightOpenCommand(effectiveCommand)
        if (args && (effectiveCommand !== command || isOpenCommand)) {
          const timeoutSec = getPlaywrightOpenTimeout(args['timeout_sec'])
          args = {
            ...args,
            command: effectiveCommand,
            ...(isOpenCommand ? { timeout_sec: timeoutSec } : {})
          }
          request = {
            ...request,
            toolCall: {
              ...request.toolCall,
              args
            }
          }
        }

        return handler(request)
      }
    }
  }
}

function getSandboxBackend(runtime: Runtime | undefined) {
  const backend = runtime?.configurable?.sandbox?.backend
  if (backend && typeof (backend as BaseSandbox).execute === 'function') {
    return backend as BaseSandbox
  }
  return null
}

function isSandboxShellTool(tool: { name?: string } | Record<string, any>) {
  return tool?.name === SANDBOX_SHELL_TOOL_NAME
}

function getSandboxShellCommand(request: ToolCallRequest<AgentBuiltInState>) {
  const args = request.toolCall?.args
  if (!args || typeof args !== 'object') {
    return ''
  }
  const command = (args as Record<string, unknown>)['command']
  return typeof command === 'string' ? command : ''
}

function getSandboxShellArgs(request: ToolCallRequest<AgentBuiltInState>) {
  const args = request.toolCall?.args
  if (!args || typeof args !== 'object') {
    return null
  }
  return args as Record<string, unknown>
}

function getPlaywrightOpenTimeout(timeoutSec: unknown) {
  if (typeof timeoutSec !== 'number' || !Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    return DEFAULT_PLAYWRIGHT_OPEN_TIMEOUT_SEC
  }

  return Math.min(timeoutSec, DEFAULT_PLAYWRIGHT_OPEN_TIMEOUT_SEC)
}
