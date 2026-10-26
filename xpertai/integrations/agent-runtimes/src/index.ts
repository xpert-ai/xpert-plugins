import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'node:fs'
import { AgentRuntimesModule } from './lib/agent-runtimes.module.js'
import { ConfigSchema, RUNTIME_CONFIGURATION, type RuntimeConfiguration } from './lib/config.js'

const packageJson: {
  version: string
  xpert: { plugin: { level: XpertPlugin['meta']['level']; artifactNamespace: string } }
} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const plugin: XpertPlugin<RuntimeConfiguration> = {
  meta: {
    author: 'XpertAI',
    name: '@xpert-ai/plugin-agent-runtimes',
    version: packageJson.version,
    level: packageJson.xpert.plugin.level,
    artifactNamespace: packageJson.xpert.plugin.artifactNamespace,
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
