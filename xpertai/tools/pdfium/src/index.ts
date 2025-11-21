import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { z } from 'zod'
import { icon } from './lib/types.js'
import { PdfiumModule } from './lib/pdfium.js'

const __filename = fileURLToPath(import.meta.url)
const dir_name = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(dir_name, '../package.json'), 'utf8')) as { name: string; version: string }

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'tools',
    icon: { type: 'svg', value: icon },
    displayName: 'PDF to Markdown',
    description: 'Convert PDF files to markdown with extracted text and page images',
    keywords: ['pdf', 'markdown', 'convert', 'extract', 'images'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  register(ctx) {
    ctx.logger.log('register pdfium plugin')
    return { module: PdfiumModule, global: true }
  },
  async onStart(ctx) { ctx.logger.log('pdfium plugin started') },
  async onStop(ctx) { ctx.logger.log('pdfium plugin stopped') }
}
export default plugin
