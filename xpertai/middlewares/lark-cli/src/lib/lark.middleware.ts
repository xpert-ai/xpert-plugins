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
import { LarkBootstrapService } from './lark-bootstrap.service.js'
import {
  LARK_CLI_SKILL_MIDDLEWARE_NAME,
  LarkAuthMode,
  LarkCliConfig,
  LarkCliConfigFormSchema
} from './lark-cli.types.js'
import { LarkIcon } from './types.js'

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

@Injectable()
@AgentMiddlewareStrategy(LARK_CLI_SKILL_MIDDLEWARE_NAME)
export class LarkCLISkillMiddleware implements IAgentMiddlewareStrategy<Partial<LarkCliConfig>> {
  constructor(private readonly larkBootstrapService: LarkBootstrapService) {}

  meta: TAgentMiddlewareMeta = {
    name: LARK_CLI_SKILL_MIDDLEWARE_NAME,
    label: {
      en_US: 'Lark CLI Skill',
      zh_Hans: 'Lark CLI 技能'
    },
    description: {
      en_US: 'Bootstraps the Lark CLI tool into the sandbox, downloads AI Agent Skills from GitHub, and teaches the agent how to interact with Lark/Feishu through sandbox_shell.',
      zh_Hans: '将 Lark CLI 工具写入 sandbox，从 GitHub 下载 AI Agent Skills，并指导智能体通过 sandbox_shell 与飞书交互。'
    },
    icon: {
      type: 'svg',
      value: LarkIcon
    },
    configSchema: LarkCliConfigFormSchema
  }

  createMiddleware(options: Partial<LarkCliConfig>, _context: IAgentMiddlewareContext): AgentMiddleware {
    const config = this.larkBootstrapService.resolveConfig(options)

    return {
      name: LARK_CLI_SKILL_MIDDLEWARE_NAME,
      tools: [],
      beforeAgent: async (_state, runtime) => {
        const backend = getSandboxBackend(runtime)
        if (backend) {
          await this.larkBootstrapService.ensureBootstrap(backend)
          if (config.authMode === LarkAuthMode.BOT) {
            await this.larkBootstrapService.syncBotCredentials(backend, config)
          }
        }
      },
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const prompt = this.larkBootstrapService.buildSystemPrompt()
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
        if (!this.larkBootstrapService.isLarkCliCommand(command)) {
          return handler(request)
        }

        const backend = getSandboxBackend(request.runtime)
        if (backend) {
          await this.larkBootstrapService.ensureBootstrap(backend)
          if (config.authMode === LarkAuthMode.BOT) {
            await this.larkBootstrapService.syncBotCredentials(backend, config)
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
