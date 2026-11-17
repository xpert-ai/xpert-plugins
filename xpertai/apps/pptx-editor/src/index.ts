import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PptxEditorPlugin } from './lib/plugin.js'
import { PPTX_PLUGIN } from './lib/constants.js'

const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string; version: string; xpert: { plugin: { level: 'system'; artifactNamespace: string } }
}
z.object({ name: z.literal(PPTX_PLUGIN), version: z.string(),
  xpert: z.object({ plugin: z.object({ level: z.literal('system'), artifactNamespace: z.literal('pptx_editor') }) })
}).parse(metadata)
const plugin: XpertPlugin = {
  meta: { name: metadata.name, version: metadata.version, level: metadata.xpert.plugin.level, artifactNamespace: metadata.xpert.plugin.artifactNamespace,
    displayName: 'PPTX Editor', description: 'Native PPTX editing with speaker notes and versioned workspace integration.',
    category: 'middleware', author: 'XpertAI', targetApps: ['xpert', 'data-xpert'],
    targetAppMeta: {
      xpert: { types: ['workbench-view'], capabilities: ['pptx-editor'] },
      'data-xpert': { types: ['workbench-view'], capabilities: ['pptx-editor'] }
    } },
  config: { schema: z.object({}) },
  register() { return { module: PptxEditorPlugin, global: true } }
}
export default plugin
