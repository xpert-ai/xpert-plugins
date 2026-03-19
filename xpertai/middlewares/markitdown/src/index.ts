import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { MarkItDownPluginModule } from './lib/markitdown.module.js'
import { MarkItDownIcon } from './lib/types.js'

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
      value: MarkItDownIcon
    },
    displayName: 'MarkItDown',
    description: 'Installs Microsoft MarkItDown in the sandbox and provides skills for converting files (PDF, DOCX, PPTX, images, audio, etc.) to Markdown.',
    keywords: ['markitdown', 'markdown', 'pdf', 'docx', 'conversion', 'document'],
    author: 'XpertAI Team'
  },
  register(ctx) {
    ctx.logger.log('register markitdown plugin')
    return { module: MarkItDownPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('markitdown plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('markitdown plugin stopped')
  }
}

export default plugin
