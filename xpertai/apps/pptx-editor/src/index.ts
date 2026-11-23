import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
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
      xpert: { types: ['middleware', 'workbench-view'], capabilities: ['pptx-editor'] },
      'data-xpert': { types: ['middleware', 'workbench-view'], capabilities: ['pptx-editor'] }
    } },
  config: { schema: z.object({}) },
  templates: [{ key: 'pptx-editor-assistant', name: 'PPTX Editor Assistant', title: 'PPTX 制作与编辑助手',
    description: '结构化生成原生 PPTX，与人工共同维护同一项目稿件。', category: 'Productivity', type: XpertTypeEnum.Agent,
    targetApps: ['xpert', 'data-xpert'], dependencies: { plugins: [PPTX_PLUGIN] },
    dslContent: readFileSync(new URL('./pptx-editor-assistant.yaml', import.meta.url), 'utf8'),
    providerKey: 'pptx-editor', default: false,
    startPrompts: ['请制作一份含目录、章节页、流程图与备注的企业演示稿', '请读取这份 PPTX，只修改我指定的页面内容'] }],
  register() { return { module: PptxEditorPlugin, global: true } }
}
export default plugin
