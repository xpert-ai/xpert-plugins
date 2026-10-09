import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { CodexpertConnectorPlugin } from './lib/codexpert-connector.module.js'
import { CodexpertConnectorConfigSchema } from './lib/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin<z.infer<typeof CodexpertConnectorConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'middleware',
    displayName: 'Codexpert Connector',
    description: 'A middleware connector that exposes Codexpert context tools and runs Codexpert coding tasks with user-visible output projection.',
    keywords: ['codexpert', 'coding', 'connector', 'middleware'],
    author: 'XpertAI Team',
  },
  config: {
    schema: CodexpertConnectorConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register codexpert connector middleware plugin')
    return { module: CodexpertConnectorPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('codexpert connector middleware plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('codexpert connector middleware plugin stopped')
  },
}

export default plugin
export * from './lib/types.js'
export * from './lib/codexpert-connector.middleware.js'
