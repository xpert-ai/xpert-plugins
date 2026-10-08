import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { AgentRuntimesModule } from './lib/agent-runtimes.module.js'
import { ConfigSchema, RUNTIME_CONFIGURATION, type RuntimeConfiguration } from './lib/config.js'

const plugin: XpertPlugin<RuntimeConfiguration> = {
  meta: {
    author: 'XpertAI',
    name: '@xpert-ai/plugin-agent-runtimes',
    version: '0.2.0',
    level: 'system',
    artifactNamespace: 'agent_runtimes',
    category: 'integration',
    displayName: 'Agent Runtimes',
    description: 'Governed coding runtimes with Computer support for OpenCode, Codex, Qwen Code, CodeBuddy, Kimi Code and Claude Code'
  },
  config: { schema: ConfigSchema },
  register(context) {
    return {
      module: AgentRuntimesModule,
      global: true,
      providers: [{ provide: RUNTIME_CONFIGURATION, useValue: ConfigSchema.parse(context.config ?? {}) }],
      exports: [RUNTIME_CONFIGURATION]
    }
  }
}
export default plugin
export * from './lib/codex.strategy.js'
export * from './lib/pi.strategy.js'
export * from './lib/claude.strategy.js'
export * from './lib/opencode.strategy.js'
