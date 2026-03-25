import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ZipUnzipCliPluginModule } from './lib/zip-unzip-cli.module.js'
import { ZipUnzipIcon } from './lib/types.js'

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
      value: ZipUnzipIcon
    },
    displayName: 'Zip/Unzip CLI',
    description: 'Checks and installs zip/unzip in the sandbox and teaches the agent to use them through sandbox_shell.',
    keywords: ['zip', 'unzip', 'archive', 'sandbox', 'middleware', 'cli'],
    author: 'XpertAI Team'
  },
  register(ctx) {
    ctx.logger.log('register zip/unzip cli plugin')
    return { module: ZipUnzipCliPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('zip/unzip cli plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('zip/unzip cli plugin stopped')
  }
}

export default plugin
