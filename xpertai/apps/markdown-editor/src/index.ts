import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { MarkdownDocumentModel } from './model.js'
import { MarkdownEditorView } from './view.js'
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string; version: string; xpert: { plugin: { level: 'system'; artifactNamespace: string } }
}
@XpertServerPlugin({ providers: [MarkdownDocumentModel, MarkdownEditorView] })
export class MarkdownEditorPlugin {}
const plugin: XpertPlugin = {
  meta: { author: 'XpertAI', name: manifest.name, version: manifest.version, level: manifest.xpert.plugin.level,
    artifactNamespace: manifest.xpert.plugin.artifactNamespace, displayName: 'Markdown editor',
    category: 'integration', description: 'Tiptap collaborative Markdown editor backed by Project files', targetApps: ['xpert'],
    targetAppMeta: { xpert: { types: ['workbench-view'], runtime: { viewProviders: ['markdown.views'] } } } },
  register() { return { module: MarkdownEditorPlugin, global: true } }
}
export default plugin
