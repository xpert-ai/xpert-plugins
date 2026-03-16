import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PlaywrightCliPluginModule } from './lib/playwright-cli.module.js'
import { PlaywrightIcon } from './lib/types.js'

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
    category: 'tools',
    icon: {
      type: 'image',
      value: PlaywrightIcon
    },
    displayName: 'Playwright CLI',
    description: 'Installs @playwright/cli globally in the sandbox and provides embedded skills for browser automation.',
    keywords: ['playwright', 'cli', 'browser', 'automation'],
    author: 'XpertAI Team'
  },
  register(ctx) {
    ctx.logger.log('register playwright cli plugin')
    return { module: PlaywrightCliPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('playwright cli plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('playwright cli plugin stopped')
  }
}

export default plugin
