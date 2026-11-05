const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { dashboardApp, DASHBOARD_PROJECT_TYPE } = require('../dist/lib/project')
const { dashboardTemplates } = require('../dist/lib/templates')
const root = path.resolve(__dirname, '../skills/live-dashboard/examples')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json')))

test('App links one project-required author template with runnable file and skill dependencies', () => {
  const app = dashboardApp.appConfig
  const author = dashboardTemplates.find(template => template.key === app.assistantTemplateKey)
  assert.ok(author)
  assert.equal(app.workspace.sharing, 'private')
  assert.equal(app.modelRequirements.primary, true)
  assert.equal(app.modelRequirements.embedding, undefined)
  assert.deepEqual(app.knowledgebases, [])
  assert.equal(app.entry.type, 'assistant-chat')
  assert.deepEqual(author.dependencies.plugins, ['@xpert-ai/plugin-live-dashboard', '@xpert-ai/plugin-analytics-files'])
  assert.deepEqual(author.dependencies.skills, ['live-dashboard', 'bpc', 'bpc-cost-expense', 'bpc-financial-planning'].map(componentKey => ({
    componentKey, targetAgentKey: 'Agent_Dashboard'
  })))
  const bundle = require('../.xpertai-plugin/plugin.json')
  for (const { componentKey } of author.dependencies.skills) {
    const skill = path.resolve(__dirname, '..', bundle.skills, componentKey)
    assert.ok(fs.statSync(path.join(skill, 'SKILL.md')).isFile(), componentKey)
    assert.ok(fs.statSync(path.join(skill, 'agents/xpertai.yaml')).isFile(), componentKey)
  }
  assert.deepEqual(dashboardTemplates.find(template => template.key === 'live-dashboard-monitor').dependencies.skills, [])
  const graph = JSON.parse(author.dslContent)
  assert.deepEqual(graph.team.options.workspaceScope, {mode:'project-required',projectType:DASHBOARD_PROJECT_TYPE})
  assert.equal(graph.team.features.sandbox.enabled, true)
  assert.equal(graph.team.agentConfig.recursionLimit, 300)
  assert.equal(graph.nodes.find(n=>n.entity.provider==='LiveDashboard').entity.options.maxModelCalls, 64)
  assert.equal(author.startPrompts.length, 5)
  const uiPrompts = require('../src/remote/locales/zh-Hans.json')
  assert.deepEqual(author.startPrompts.slice(0,3), [uiPrompts.regionalPrompt,uiPrompts.salesPrompt,uiPrompts.qualityPrompt])
  assert.equal(author.startPrompts[3], uiPrompts.superstorePrompt)
  assert.equal(graph.team.features.opener.enabled, true)
  assert.deepEqual(graph.team.features.opener.questions.map(item => item.prompt), author.startPrompts)
  assert.deepEqual(graph.team.features.opener.questions.map(item => item.label), [
    uiPrompts.regionalTitle, uiPrompts.salesTitle, uiPrompts.qualityTitle, uiPrompts.superstoreTitle, uiPrompts.realDataTitle
  ])
  assert.ok(dashboardTemplates.find(t=>t.key==='live-dashboard-monitor'))
})

test('catalog packages complete recipes and declared screenshot assets', () => {
  assert.deepEqual(catalog.examples.map(x=>x.key), ['regional-sales','sales-overview','production-quality','superstore'])
  for (const recipe of catalog.examples.filter(recipe=>recipe.dataMode==='synthetic-demo')) {
    for (const file of [recipe.recipe, recipe.source, recipe.preview, ...['definition.json','query.json','expected.json','demo.csv','demo.json'].map(f=>recipe.key+'/'+f)])
      assert.ok(fs.statSync(path.join(root,file)).isFile(), file)
    assert.equal(recipe.dataMode, 'synthetic-demo')
    const definition = JSON.parse(fs.readFileSync(path.join(root,recipe.key,'definition.json')))
    assert.ok(!('file' in definition), 'no copied scope identifiers')
    assert.ok(!JSON.stringify(definition).includes('dataSourceId'))
  }
  const manifest = require('../.xpertai-plugin/plugin.json')
  assert.deepEqual(dashboardApp.appConfig.presentation.screenshots,manifest.assets.screenshots)
})
