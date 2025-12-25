import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { TongyiModule } from './tongyi.module.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
    name: string
    version: string
}

const ConfigSchema = z.object({})
const svgIcon: string = readFileSync(join(__dirname, '_assets/qwen-color.svg'), 'utf-8')

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
    meta: {
        name: packageJson.name,
        version: packageJson.version,
        category: 'model',
        icon: {
            type: 'svg',
            value: svgIcon
        },
        displayName: 'Tongyi',
        description: 'Provide adapter for Tongyi models',
        keywords: ['Tongyi', 'model'],
        author: 'XpertAI'
    },
    config: {
        schema: ConfigSchema
    },
    register(ctx) {
        ctx.logger.log('register Tongyi plugin')
        return { module: TongyiModule, global: true }
    },
    async onStart(ctx) {
        ctx.logger.log('Tongyi plugin started')
    },
    async onStop(ctx) {
        ctx.logger.log('Tongyi plugin stopped')
    }
}

export default plugin