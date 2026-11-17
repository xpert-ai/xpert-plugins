import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PdfFormat } from './lib/format.js'
import { PdfResourceEditor } from './lib/resource-editor.js'
import { PdfFiles } from './lib/files.js'
import { PdfView } from './lib/view.js'

@XpertServerPlugin({ providers: [PdfFormat, PdfResourceEditor, PdfFiles, PdfView] })
export class PdfViewerPlugin {}
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string; version: string; xpert: { plugin: { level: 'system'; artifactNamespace: string } }
}
const plugin: XpertPlugin = {
  meta: { name: pkg.name, version: pkg.version, level: pkg.xpert.plugin.level, artifactNamespace: pkg.xpert.plugin.artifactNamespace,
    category: 'middleware', author: 'XpertAI', displayName: { en_US: 'PDF Preview', zh_Hans: 'PDF 预览' },
    description: { en_US: 'Read PDF project files and collaboration-space resources.', zh_Hans: '预览项目和协作空间中的 PDF 文件。' },
    targetApps: ['xpert', 'data-xpert'] },
  config: { schema: z.object({}).strict() },
  register: () => ({ module: PdfViewerPlugin })
}
export default plugin
