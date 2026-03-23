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
import { ZipUnzipBootstrapService } from './zip-unzip-bootstrap.service.js'
import {
  ZIP_UNZIP_SKILL_MIDDLEWARE_NAME,
  ZipUnzipConfig,
  ZipUnzipConfigFormSchema
} from './zip-unzip.types.js'
import { ZipUnzipIcon } from './types.js'

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

@Injectable()
@AgentMiddlewareStrategy(ZIP_UNZIP_SKILL_MIDDLEWARE_NAME)
export class ZipUnzipCLISkillMiddleware implements IAgentMiddlewareStrategy<Partial<ZipUnzipConfig>> {
  constructor(private readonly zipUnzipBootstrapService: ZipUnzipBootstrapService) {}

  meta: TAgentMiddlewareMeta = {
    name: ZIP_UNZIP_SKILL_MIDDLEWARE_NAME,
    label: {
      en_US: 'Zip/Unzip CLI Skill',
      zh_Hans: 'Zip/Unzip CLI 技能'
    },
    description: {
      en_US: 'Bootstraps zip/unzip into the sandbox and teaches the agent how to use them through sandbox_shell.',
      zh_Hans: '将 zip/unzip 准备到 sandbox 中，并指导智能体通过 sandbox_shell 使用它们。'
    },
    icon: {
      type: 'svg',
      value: ZipUnzipIcon
    },
    configSchema: ZipUnzipConfigFormSchema
  }

  createMiddleware(options: Partial<ZipUnzipConfig>, _context: IAgentMiddlewareContext): AgentMiddleware {
    const config = this.zipUnzipBootstrapService.resolveConfig(options)

    return {
      name: ZIP_UNZIP_SKILL_MIDDLEWARE_NAME,
      tools: [],
      beforeAgent: async (_state, runtime) => {
        const backend = getSandboxBackend(runtime)
        if (backend) {
          await this.zipUnzipBootstrapService.ensureBootstrap(backend, config)
        }
      },
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const prompt = this.zipUnzipBootstrapService.buildSystemPrompt(config)
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
        if (!this.zipUnzipBootstrapService.isZipUnzipCommand(command)) {
          return handler(request)
        }

        const backend = getSandboxBackend(request.runtime)
        if (backend) {
          await this.zipUnzipBootstrapService.ensureBootstrap(backend, config)
        }

        this.zipUnzipBootstrapService.assertSupportedCommand(command)

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
