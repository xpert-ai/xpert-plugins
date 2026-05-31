import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { FileMemoryPluginModule } from './lib/file-memory.module.js'
import { FileMemorySystemIcon } from './lib/types.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'middleware',
    displayName: 'File Memory Runtime (Deprecated)',
    description:
      'Deprecated: 使用内置文件记忆中间件功能。Single-plugin file memory runtime with recall and writeback middleware.',
    deprecated: true,
    deprecationMessage: {
      en_US: 'Use the built-in file memory middleware feature instead.',
      zh_Hans: '推荐使用内置文件记忆中间件功能。'
    },
    keywords: ['memory', 'file-memory', 'middleware', 'runtime'],
    author: 'XpertAI Team',
    icon: {
      type: 'svg',
      value: FileMemorySystemIcon
    }
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register file-memory plugin')
    return { module: FileMemoryPluginModule, global: true }
  }
}

export default plugin
