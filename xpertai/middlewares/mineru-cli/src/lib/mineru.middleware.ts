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
import { MinerUBootstrapService } from './mineru-bootstrap.service.js'
import {
  DEFAULT_MINERU_BATCH_TIMEOUT_SEC,
  DEFAULT_MINERU_FILE_TIMEOUT_SEC,
  MINERU_SKILL_MIDDLEWARE_NAME,
  MinerUConfig,
  MinerUConfigFormSchema
} from './mineru.types.js'
import { MinerUIcon } from './types.js'

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

@Injectable()
@AgentMiddlewareStrategy(MINERU_SKILL_MIDDLEWARE_NAME)
export class MinerUSkillMiddleware implements IAgentMiddlewareStrategy<Partial<MinerUConfig>> {
  constructor(private readonly mineruBootstrapService: MinerUBootstrapService) {}

  meta: TAgentMiddlewareMeta = {
    name: MINERU_SKILL_MIDDLEWARE_NAME,
    label: {
      en_US: 'MinerU Skill',
      zh_Hans: 'MinerU 技能'
    },
    description: {
      en_US:
        'Bootstraps a managed MinerU wrapper and embedded skill assets into the sandbox so the agent can parse local documents through sandbox_shell.',
      zh_Hans:
        '将托管的 MinerU wrapper 和内置 skill 资产写入 sandbox，使智能体可以通过 sandbox_shell 解析本地文档。'
    },
    icon: {
      type: 'svg',
      value: MinerUIcon
    },
    configSchema: MinerUConfigFormSchema
  }

  createMiddleware(options: Partial<MinerUConfig>, _context: IAgentMiddlewareContext): AgentMiddleware {
    const config = this.mineruBootstrapService.resolveConfig(options)

    return {
      name: MINERU_SKILL_MIDDLEWARE_NAME,
      tools: [],
      beforeAgent: async (_state, runtime) => {
        const backend = getSandboxBackend(runtime)
        await this.mineruBootstrapService.ensureBootstrap(backend, config)
      },
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const prompt = this.mineruBootstrapService.buildSystemPrompt(config)
        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        const content = [baseContent, prompt].filter(Boolean).join('\n\n')

        return handler({
          ...request,
          systemMessage: new SystemMessage({
            content
          })
        })
      },
      wrapToolCall: async (request: ToolCallRequest<AgentBuiltInState>, handler) => {
        if (!isSandboxShellTool(request.tool)) {
          return handler(request)
        }

        const command = getSandboxShellCommand(request)
        if (!this.mineruBootstrapService.isMinerUCommand(command)) {
          return handler(request)
        }

        const backend = getSandboxBackend(request.runtime)
        if (backend) {
          await this.mineruBootstrapService.ensureBootstrap(backend, config)
        }

        const args = getSandboxShellArgs(request)
        if (!args) {
          return handler(request)
        }

        const rewrittenCommand = this.mineruBootstrapService.rewriteCommand(command, config.wrapperPath)
        const timeoutSec = getTimeoutForCommand(command, args['timeout_sec'])
        return handler({
          ...request,
          toolCall: {
            ...request.toolCall,
            args: {
              ...args,
              command: rewrittenCommand,
              ...(timeoutSec ? { timeout_sec: timeoutSec } : {})
            }
          }
        })
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

function getTimeoutForCommand(command: string, timeoutSec: unknown) {
  const minimum = /\s--dir(?:\s|$)|^mineru\s+--dir(?:\s|$)|\/mineru\s+--dir(?:\s|$)/.test(command)
    ? DEFAULT_MINERU_BATCH_TIMEOUT_SEC
    : /\s--file(?:\s|$)|^mineru\s+--file(?:\s|$)|\/mineru\s+--file(?:\s|$)/.test(command)
      ? DEFAULT_MINERU_FILE_TIMEOUT_SEC
      : 0

  if (!minimum) {
    return typeof timeoutSec === 'number' && Number.isFinite(timeoutSec) && timeoutSec > 0
      ? timeoutSec
      : undefined
  }

  if (typeof timeoutSec !== 'number' || !Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    return minimum
  }

  return Math.max(timeoutSec, minimum)
}
