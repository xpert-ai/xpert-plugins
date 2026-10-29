import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeXpertToolProvider } from '@xpert-ai/plugin-sdk'
import plugin, {
  ComplaintTriageTools,
  COMPLAINT_TRIAGE_TEMPLATE_KEY,
  COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY
} from '../dist/index.js'

test('registers the minimal Complaint Triage plugin', () => {
  const messages = []
  const module = plugin.register({ logger: { log: (message) => messages.push(message) } })

  assert.equal(plugin.meta.name, '@xpert-ai/plugin-complaint-triage-workbench')
  assert.equal(plugin.meta.level, 'system')
  assert.equal(plugin.meta.artifactNamespace, 'complaint_triage')
  assert.equal(module.module.name, 'ComplaintTriagePlugin')
  assert.equal(module.global, true)
  assert.deepEqual(messages, ['register complaint triage workbench plugin'])
})

test('contributes a Complaint Triage Assistant template with the required middleware', () => {
  assert.ok(Array.isArray(plugin.templates))
  const template = plugin.templates.find((item) => item.key === COMPLAINT_TRIAGE_TEMPLATE_KEY)
  assert.ok(template)
  assert.equal(template.primaryAgentKey, 'Agent_ComplaintTriage')
  assert.match(template.dslContent, /provider: complaint_triage/)
  assert.match(template.dslContent, /complaint_submit_triage_result/)
  assert.match(template.dslContent, /never ask\s+the user to type caseId or attemptId/)
  assert.match(template.dslContent, new RegExp(`defaultViewKey: complaint_triage__${COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY}`))
})

test('registers the result tool for Agent middleware without exposing an external MCP write endpoint', () => {
  const descriptor = describeXpertToolProvider(new ComplaintTriageTools({}))
  assert.equal(descriptor.options.componentKey, 'complaint-triage')
  assert.equal(descriptor.tools.length, 1)
  assert.equal(descriptor.tools[0].options.name, 'complaint_submit_triage_result')
  assert.equal(descriptor.tools[0].middlewareProvider, 'complaint_triage')
  assert.equal(descriptor.tools[0].options.mcp, false)
})
