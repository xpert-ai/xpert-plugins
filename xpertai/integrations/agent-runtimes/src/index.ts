import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { AgentRuntimesModule } from './lib/agent-runtimes.module.js'
import { ConfigSchema, RUNTIME_CONFIGURATION, type RuntimeConfiguration } from './lib/config.js'

const plugin: XpertPlugin<RuntimeConfiguration> = {
  meta: {
    author: 'XpertAI',
    name: '@xpert-ai/plugin-agent-runtimes',
    version: '0.1.0',
    level: 'system',
    category: 'integration',
    displayName: 'Agent Runtimes',
    description: 'Codex, Pi, Claude Code and OpenCode invocation strategies'
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
