import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { KlingPluginModule } from './kling.module.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({}).strict()

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="4" fill="#111827"/><path d="M7 5h3v5l4-5h4l-5 6 5 8h-4l-4-7v7H7V5z" fill="white"/></svg>'
    },
    displayName: 'Kling AI',
    description: 'Official Kling AI video generation for Xpert',
    keywords: ['kling', 'video', 'aigc'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  register() {
    return { module: KlingPluginModule, global: true }
  }
}

export { KlingVideoStrategy } from './strategy.js'
export { KlingProviderStrategy } from './provider.strategy.js'
export { KlingVideoToolset } from './toolset.js'
export default plugin
