import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { build } from 'esbuild'
import vm from 'node:vm'
import { createRemoteI18n, normalizeViewLocale, RemoteI18nProvider, useUiText } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from '../remote/locales/en.json'
import zh from '../remote/locales/zh-Hans.json'
import type { I18nObject } from '@xpert-ai/contracts'
import { implementationSchema, useCatalogLabel } from '../remote/catalog'
import { i18n as catalogI18n } from '../remote/i18n'
import { artifactTypeName, itemSchema } from '../remote/model'

test('Artifact type metadata survives collection parsing and stays distinct from reference titles', () => {
  const item = itemSchema.parse({ id: 'content', title: 'A user supplied title', version: 1,
    presentation: { kind: 'artifact', referenceId: '9a90b756-b32e-468e-8e59-b5983ca660a7',
      type: { pluginName: 'example', resourceType: 'custom', title: { en_US: 'Shared conversation', zh_Hans: '分享会话' } } } })
  const initialLocale = catalogI18n.getLocale()
  try {
    catalogI18n.setLocale('zh-Hans')
    assert.equal(artifactTypeName(item.presentation?.type), '分享会话')
    assert.equal(artifactTypeName(), '成果')
    catalogI18n.setLocale('en-US')
    assert.equal(artifactTypeName(item.presentation?.type), 'Shared conversation')
    assert.equal(artifactTypeName({ pluginName: 'example', resourceType: 'unknown' }), 'Artifact')
  } finally { catalogI18n.setLocale(initialLocale) }
})

const parameters = (message: string) => [...message.matchAll(/{{\s*([\w.]+)\s*}}/g)].map(match => match[1]).sort()
test('content metadata accepts I18nObject translations and uses the shared English fallback', () => {
  const title: I18nObject = { en_US: 'Slides', zh_Hans: '幻灯片', zh_Hant: '投影片' }
  const parsed = implementationSchema.parse({ typeId: 'xpert.presentation', providerKey: 'slides',
    implementationKey: 'slides', title, implementationTitle: { en_US: 'Presentation Studio' } })
  assert.deepEqual(parsed.title, title)
  const Label = ({ value }: { value: I18nObject }) => createElement('span', null, useCatalogLabel()(value))
  const initialLocale = catalogI18n.getLocale()
  try {
    catalogI18n.setLocale('zh-Hans')
    assert.equal(renderToStaticMarkup(createElement(Label, { value: parsed.title })), '<span>幻灯片</span>')
    assert.equal(renderToStaticMarkup(createElement(Label, { value: parsed.implementationTitle })), '<span>Presentation Studio</span>')
    catalogI18n.setLocale('en-US')
    assert.equal(renderToStaticMarkup(createElement(Label, { value: parsed.title })), '<span>Slides</span>')
  } finally { catalogI18n.setLocale(initialLocale) }
  assert.equal(implementationSchema.safeParse({ ...parsed, title: { zh_Hans: '幻灯片' } }).success, false)
})

test('view catalogs have complete keys and matching named parameters; no inline UI copy', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    assert.ok(en[key].trim(), key)
    assert.deepEqual(parameters(en[key]), parameters(zh[key]), key)
  }
  for (const file of readdirSync('remote').filter(file => /\.tsx?$/.test(file))) {
    const path = 'remote/' + file, source = readFileSync(path, 'utf8')
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    function inspect(node: ts.Node) {
      if (ts.isJsxText(node)) assert.doesNotMatch(node.text, /[A-Za-z\p{Script=Han}]/u, path + ': inline JSX copy')
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) assert.doesNotMatch(node.text, /\p{Script=Han}/u, path + ': inline translation')
      if (ts.isCallExpression(node) && ['t', 'i18n.t', 'i18n.message', 'i18n.error'].includes(node.expression.getText(ast)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]))
        assert.ok(node.arguments[0].text in en, path + ': missing key ' + node.arguments[0].text)
      ts.forEachChild(node, inspect)
    }
    inspect(ast)
  }
})

test('locale fallback, interpolation and stored errors follow an isolated view locale', () => {
  assert.equal(normalizeViewLocale('zh_CN'), 'zh-Hans')
  assert.equal(normalizeViewLocale('zh-Hans'), 'zh-Hans')
  assert.equal(normalizeViewLocale('en-US'), 'en')
  assert.equal(normalizeViewLocale('invalid_!'), 'en')
  const view = createRemoteI18n({ en: { count: '{{count}} items', count_one: '{{count}} item', count_other: '{{count}} items', failure: 'Cannot open {{title}}' }, 'zh-Hans': { count: '{{count}} 项', count_one: '{{count}} 项', count_other: '{{count}} 项', failure: '无法打开 {{title}}' } }, 'en-US')
  const other = createRemoteI18n({ en, 'zh-Hans': zh }, 'en-US')
  const error = view.error('failure', { title: '<document>' }), message = view.message('count', { count: 2 })
  assert.equal(view.t('count', { count: 1 }), '1 item')
  assert.equal(view.t('count', { count: 2 }), '2 items')
  let updates = 0; const stop = view.subscribe(() => updates++)
  view.setLocale('zh_CN')
  assert.equal(view.format(message), '2 项')
  assert.equal(error.message, '无法打开 <document>')
  assert.equal(error.key, 'failure')
  assert.equal(other.getLocale(), 'en')
  assert.equal(view.label({ zh_Hans: '飞书', en_US: 'Feishu' }), '飞书')
  assert.equal(view.date('bad-date'), '')
  const chineseDate = view.date('2026-10-24T00:00:00Z', { month: 'long', day: 'numeric', timeZone: 'UTC' })
  view.setLocale('fr-FR')
  assert.equal(view.getLocale(), 'en')
  assert.notEqual(view.date('2026-10-24T00:00:00Z', { month: 'long', day: 'numeric', timeZone: 'UTC' }), chineseDate)
  assert.equal(error.message, 'Cannot open <document>')
  assert.equal(view.label({ zh_Hans: '飞书', en_US: 'Feishu' }), 'Feishu')
  const UiLabel = () => createElement('span', null, useUiText()('close'))
  assert.match(renderToStaticMarkup(createElement(RemoteI18nProvider, { i18n: view, children: createElement(UiLabel) })), /Close/)
  view.setLocale('zh-Hans')
  assert.match(renderToStaticMarkup(createElement(RemoteI18nProvider, { i18n: view, children: createElement(UiLabel) })), /关闭/)
  assert.equal(updates, 3); stop(); view.setLocale('en'); assert.equal(updates, 3)
})

test('a trusted locale-only init updates text without reloading data or cancelling an in-flight request', async () => {
  const output = await build({ stdin: { contents: "export * from './remote/bridge'; export { i18n } from './remote/i18n'", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'view', define: { 'process.env.NODE_ENV': '"production"' } })
  const sent: Array<Record<string, unknown>> = []
  let receive: ((event: { source: object; data: object }) => void) | undefined
  const parent = { postMessage: (message: Record<string, unknown>) => sent.push(message) }
  const documentElement = { lang: '', style: { setProperty() {} }, dataset: {}, classList: { toggle() {} } }
  const context = vm.createContext({ window: { parent, innerHeight: 800, addEventListener: (_: string, handler: typeof receive) => { receive = handler }, removeEventListener() {} }, document: { documentElement, getElementById: () => ({ textContent: '' }), head: { appendChild() {} } }, setTimeout, clearTimeout, DOMException })
  vm.runInContext(output.outputFiles[0].text, context)
  vm.runInContext('var initCount = 0; var disconnect = view.connect(() => initCount++)', context)
  const send = (locale: string, source = parent) => receive?.({ source, data: { channel: 'xpertai.remote_component', protocolVersion: 1, type: 'init', instanceId: 'view', scopeRevision: 1, locale, initialQuery: { selectionId: 'unchanged-document' } } })
  send('zh-Hans')
  const pending = vm.runInContext("view.action('test.read', {})", context) as Promise<unknown>
  const request = sent.find(message => message.type === 'executeAction')!
  send('en-US')
  assert.equal(documentElement.lang, 'en')
  assert.equal(vm.runInContext('initCount', context), 1)
  assert.equal(vm.runInContext("view.i18n.ui('close')", context), 'Close')
  send('zh-Hans', { postMessage() {} })
  assert.equal(documentElement.lang, 'en')
  receive?.({ source: parent, data: { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'view', scopeRevision: 1, type: 'actionResult', requestId: request.requestId, result: { success: true, data: 'preserved' } } })
  assert.equal(await pending, 'preserved')
  vm.runInContext('disconnect()', context)
})

test('catalog actions interpolate resource names and optional Traditional Chinese catalogs stay isolated', () => {
  const view = createRemoteI18n({ en, 'zh-Hans': zh }, 'zh-Hans')
  assert.equal(view.t('catalog.create', { type: '幻灯片' }), '新建幻灯片')
  assert.ok(view.t('catalog.recycleDescription', { title: '验收文档' }).includes('验收文档'))
  view.setLocale('en'); assert.equal(view.t('catalog.create', { type: 'Slides' }), 'Create Slides')
  view.setLocale('zh-TW'); assert.equal(view.getLocale(), 'zh-Hans')
  const traditional = createRemoteI18n({ en: { label: 'File' }, 'zh-Hans': { label: '文件' }, 'zh-Hant': { label: '檔案' } }, 'zh-TW')
  assert.equal(traditional.t('label'), '檔案'); assert.equal(traditional.ui('close'), '關閉')
  assert.equal(view.getLocale(), 'zh-Hans')
})
