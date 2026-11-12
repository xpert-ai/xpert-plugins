import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import plugin from '../dist/index.js'
import { TOOL_NAMES, NAMESPACE, PLUGIN_NAME, RECOGNITION_MODEL, RECOGNITION_OPTIONS, VIEW_KEY, VIEW_PROVIDER } from '../dist/contracts.js'
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(plugin.meta.name, PLUGIN_NAME)
assert.equal(plugin.meta.version, pkg.version)
assert.equal(plugin.meta.level, 'system')
assert.equal(plugin.meta.artifactNamespace, NAMESPACE)
assert.equal(new Set(TOOL_NAMES).size, 4)
for (const file of ['../dist/remote/app.js', '../dist/remote/app.css']) assert((await readFile(new URL(file, import.meta.url))).length > 0)
const template = await readFile(new URL('../templates/manufacturing-assistant.yaml', import.meta.url), 'utf8')
assert.equal(template.trim(), plugin.templates[0].dslContent.trim())
const dsl = JSON.parse(template)
assert.equal(dsl.team.version, '2')
assert.equal(dsl.team.copilotModel.model, RECOGNITION_MODEL)
assert.deepEqual(dsl.team.copilotModel.options, RECOGNITION_OPTIONS)
assert.equal(dsl.team.options.workbench.defaultViewKey, `${VIEW_PROVIDER}__${VIEW_KEY}`)
assert.equal(dsl.team.options.workbench.initialLayout, 'workbench-maximized')
assert.equal(dsl.team.features.opener.enabled, true)
assert.ok(dsl.team.features.opener.questions.includes('请打开询价报价工作台，创建一条演示询价。'))
assert.deepEqual(plugin.templates[0].startPrompts, dsl.team.features.opener.questions)
const primaryAgent = dsl.nodes.find((node) => node.type === 'agent' && node.key === dsl.team.agent.key)
const middlewares = dsl.nodes.filter((node) => node.entity?.type === 'middleware')
assert.deepEqual(middlewares.map((node) => node.entity.provider), ['ManufacturingQuotationMiddleware'])
const [middleware] = middlewares
assert.equal(middleware.entity.required, true)
assert.deepEqual(primaryAgent.entity.options.middlewares.order, [middleware.key])
assert(dsl.connections.some((edge) => edge.type === 'workflow' && edge.required === true &&
  edge.from === primaryAgent.key && edge.to === middleware.key))
assert(dsl.connections.every((edge) => dsl.nodes.some((node) => node.key === edge.from) && dsl.nodes.some((node) => node.key === edge.to)))
console.log('Manufacturing quotation package metadata, assets and Assistant template verified')
