import { tool } from '@langchain/core/tools'
import { DockyardWorkspaceService } from './workspace.service.js'
import { scopeFromAgent } from './scope.js'
import { DockyardError } from './domain/contracts.js'
import { EDIT_FILE_TOOL, editFileSchema } from './domain/edit-file.js'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { FEATURE, MIDDLEWARE_NAME } from './constants.js'

// Preserve the provider identity so existing assistants can update from the template.
@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class DockyardLayoutMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Dockyard workbench', zh_Hans: 'Dockyard 工作台' },
    description: { en_US: 'Enable the workbench, chat references and guarded file edits.', zh_Hans: '启用工作台、聊天引用和带冲突检查的文件修改。' },
    icon: { type: 'font', value: 'ri-layout-4-line' }, features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
  constructor(private readonly service: DockyardWorkspaceService) {}
  getToolNames() { return [EDIT_FILE_TOOL] }
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope = scopeFromAgent(context)
    return { name: MIDDLEWARE_NAME, tools: [tool(async (input) => {
      try {
        return JSON.stringify(await this.service.editFile(scope, input))
      } catch (error) {
        if (error instanceof DockyardError) return JSON.stringify({ success: false, code: error.code,
          message: 'No change saved. Preserve local edits, reload the saved version and create a fresh Help me edit reference. Never guess a new revision.' })
        throw error
      }
    }, {
      name: EDIT_FILE_TOOL,
      description: 'Replace one exact, unique passage in an existing saved Dockyard file and persist it. Use only after the user explicitly requests a concrete edit to a Help me edit reference carrying a buffers revision. Never use for Explain. Do not guess revisions, paths or original text. On success tell the user to reload only after preserving any local unsaved edits. A stale open editor must not be saved over the new server version.',
      schema: editFileSchema
    })] }
  }
}
