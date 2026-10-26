import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'node:fs'
import { AgentRuntimesModule } from './lib/agent-runtimes.module.js'

const packageJson: {
  version: string
  xpert: { plugin: { level: XpertPlugin['meta']['level']; artifactNamespace: string } }
} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const plugin: XpertPlugin = {
  meta: {
    author: 'XpertAI',
    name: '@xpert-ai/plugin-agent-runtimes',
    version: packageJson.version,
    level: packageJson.xpert.plugin.level,
    artifactNamespace: packageJson.xpert.plugin.artifactNamespace,
    category: 'integration',
    displayName: 'Agent Runtimes',
    description:
      'Governed coding runtimes with Computer support for OpenCode, Codex, Qwen Code, CodeBuddy, Kimi Code and Claude Code'
  },
  register() {
    return { module: AgentRuntimesModule, global: true }
  }
}
export default plugin
export * from './lib/opencode.strategy.js'
