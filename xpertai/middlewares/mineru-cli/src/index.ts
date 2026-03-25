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
      'Bootstraps the MinerU Python CLI skill into the sandbox, securely provisions MINERU_TOKEN through a managed secret file, and teaches the agent how to convert documents to Markdown through sandbox_shell.',
    keywords: ['mineru', 'middleware', 'sandbox', 'markdown', 'document', 'pdf', 'ocr'],
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
