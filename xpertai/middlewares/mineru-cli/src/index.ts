import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { MinerUCliPluginModule } from './lib/mineru-cli.module.js'
import { MinerUIcon } from './lib/types.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    category: 'middleware',
    icon: {
      type: 'svg',
      value: MinerUIcon
    },
    displayName: 'MinerU CLI',
    description:
      'Bootstraps a managed MinerU wrapper into the sandbox, injects skill assets, and guides the agent to parse documents through sandbox_shell.',
    keywords: ['mineru', 'middleware', 'sandbox', 'pdf', 'markdown'],
    author: 'XpertAI Team'
  },
  register(ctx) {
    ctx.logger.log('register mineru cli plugin')
    return { module: MinerUCliPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('mineru cli plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('mineru cli plugin stopped')
  }
}

export default plugin
