import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { AgentBehaviorMonitorPlugin } from './lib/agent-behavior-monitor.module.js'
import { AgentBehaviorMonitorIcon } from './lib/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'middleware',
    icon: {
      type: 'svg',
      value: AgentBehaviorMonitorIcon,
    },
    displayName: 'Agent Behavior Monitor Middleware',
    description:
      'Track agent execution traces, detect configurable abnormal behavior, trigger alerts, and persist audit-friendly summaries.',
    keywords: ['agent', 'middleware', 'monitoring', 'audit', 'anomaly'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register agent behavior monitor middleware plugin')
    return { module: AgentBehaviorMonitorPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('agent behavior monitor middleware plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('agent behavior monitor middleware plugin stopped')
  },
}

export default plugin
