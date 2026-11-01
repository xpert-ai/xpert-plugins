const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { dashboardApp, DASHBOARD_PROJECT_TYPE } = require('../dist/lib/project')
const { dashboardTemplates } = require('../dist/lib/templates')

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
  assert.deepEqual(author.dependencies.skills, [{componentKey:'live-dashboard',targetAgentKey:'Agent_Dashboard'}])
  const graph = JSON.parse(author.dslContent)
  assert.deepEqual(graph.team.options.workspaceScope, {mode:'project-required',projectType:DASHBOARD_PROJECT_TYPE})
  assert.equal(graph.team.features.sandbox.enabled, true)
  assert.ok(dashboardTemplates.find(t=>t.key==='live-dashboard-monitor'))
})

test('App cover is declared in the package screenshot allowlist', () => {
  const manifest = require('../.xpertai-plugin/plugin.json')
  assert.deepEqual(dashboardApp.appConfig.presentation.screenshots, manifest.assets.screenshots)
  for (const asset of manifest.assets.screenshots) {
    assert.ok(fs.statSync(path.resolve(__dirname, '..', asset)).isFile(), asset)
  }
})
