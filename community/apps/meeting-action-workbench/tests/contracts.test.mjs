import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { parse } from 'yaml'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const constants = await import(pathToFileURL(join(packageRoot, 'dist/lib/constants.js')).href)
const middlewareModule = await import(pathToFileURL(join(packageRoot, 'dist/lib/meeting.middleware.js')).href)
const viewModule = await import(pathToFileURL(join(packageRoot, 'dist/lib/meeting-view.provider.js')).href)

test('plugin metadata uses one stable system namespace', async () => {
  const [packageJson, manifest] = await Promise.all([
    readFile(join(packageRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(join(packageRoot, '.xpertai-plugin/plugin.json'), 'utf8').then(JSON.parse)
  ])
  assert.equal(packageJson.name, '@xpert-ai/plugin-meeting-action-workbench')
  assert.equal(manifest.version, packageJson.version)
  assert.equal(packageJson.xpert.plugin.level, 'system')
  assert.equal(packageJson.xpert.plugin.artifactNamespace, 'meeting_action_workbench')
  assert.equal(manifest.level, packageJson.xpert.plugin.level)
  assert.equal(manifest.artifactNamespace, packageJson.xpert.plugin.artifactNamespace)
})

test('middleware tools are strict, localized, and expose parsing diagnostics', () => {
  const service = {
    getContext: async () => ({}),
    beginExtraction: async () => ({}),
    upsertDecision: async () => ({}),
    upsertActionItem: async () => ({}),
    finalizeExtraction: async () => ({}),
    reportFailure: async () => ({}),
    getExecutionContext: async () => ({}),
    beginExecutionReview: async () => ({}),
    upsertRiskSignal: async () => ({}),
    finalizeExecutionReview: async () => ({}),
    reportExecutionReviewFailure: async () => ({})
  }
  const middleware = new middlewareModule.MeetingMiddleware(service).createMiddleware({}, {
    tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', xpertId: 'assistant-1'
  })
  assert.deepEqual(middleware.tools.map((item) => item.name), Object.values(constants.MEETING_TOOL_NAMES))
  for (const tool of middleware.tools) {
    assert.equal(tool.schema.safeParse({ unexpected: true }).success, false)
    assert.equal(tool.verboseParsingErrors, true)
    assert.equal(typeof tool.metadata.toolName.zh_Hans, 'string')
  }
  assert.equal(middlewareModule.beginExtractionSchema.safeParse({
    operationId: 'meeting-op-001', title: '周会', sourceText: '太短'
  }).success, false)
  assert.equal(middlewareModule.riskSignalSchema.safeParse({
    operationId: 'risk-op-001',
    reviewId: '80000000-0000-4000-8000-000000000101',
    signalKey: 'ambiguous-owner',
    riskType: 'ambiguous_commitment',
    severity: 'medium',
    title: '负责人表述不明确',
    rationale: '原文使用“团队”作为负责人，无法落实到个人。',
    evidenceQuote: '团队负责跟进。',
    recommendation: '由人工指定唯一负责人。',
    actionItemId: '70000000-0000-4000-8000-000000000101',
    confidence: 0.88,
    baseRevision: 1
  }).success, false)
  assert.equal(middlewareModule.riskSignalSchema.safeParse({
    operationId: 'risk-op-002',
    reviewId: '80000000-0000-4000-8000-000000000101',
    signalKey: 'ambiguous-owner',
    riskType: 'ambiguous_commitment',
    severity: 'medium',
    title: '负责人表述不明确',
    rationale: '原文使用“团队”作为负责人，无法落实到个人。',
    evidenceQuote: '团队负责跟进。',
    recommendation: '由人工指定唯一负责人。',
    meetingId: '50000000-0000-4000-8000-000000000101',
    actionItemId: '70000000-0000-4000-8000-000000000101',
    confidence: 0.88,
    baseRevision: 1
  }).success, true)
  assert.equal(middlewareModule.beginExtractionSchema.safeParse({
    operationId: 'meeting-op-002',
    title: '产品周会',
    sourceText: '会议决定在本周完成中文工作台验收，并由张敏负责补齐失败重试。'
  }).success, true)
  assert.equal(middlewareModule.beginExtractionSchema.safeParse({
    operationId: 'meeting-op-003',
    meetingId: '50000000-0000-4000-8000-000000000101',
    title: '不允许覆盖'
  }).success, false)
})

test('view manifest exposes human review actions and AI retry command', () => {
  const provider = new viewModule.MeetingViewProvider({})
  const [manifest] = provider.getViewManifests({ hostType: 'agent' }, 'agent.workbench.main')
  assert.equal(manifest.view.type, 'remote_component')
  assert.equal(manifest.activation.requiredFeatures.includes(constants.MEETING_FEATURE), true)
  assert.deepEqual(manifest.clientCommands.map((item) => item.key), ['assistant.chat.send_message'])
  assert.deepEqual(manifest.actions.map((item) => item.key), [
    'refresh', 'import_meeting_file', 'update_decision', 'update_action_item', 'confirm_meeting',
    'update_execution_action', 'update_risk_signal_status'
  ])
  assert.equal(manifest.actions.find((item) => item.key === 'import_meeting_file').transport, 'file')
  assert.deepEqual(manifest.hostEvents.subscriptions[0].filter.toolNames, [...constants.MEETING_MUTATION_TOOL_NAMES])
})

test('assistant template connects required middleware and preserves human authority', async () => {
  const [source, built] = await Promise.all([
    readFile(join(packageRoot, 'src/xpert-meeting-action-workbench-assistant.yaml'), 'utf8'),
    readFile(join(packageRoot, 'dist/xpert-meeting-action-workbench-assistant.yaml'), 'utf8')
  ])
  const dsl = parse(source)
  const middlewareNode = dsl.nodes.find((node) => node.type === 'workflow')
  assert.equal(middlewareNode.entity.provider, constants.MEETING_MIDDLEWARE_NAME)
  assert.equal(dsl.team.version, '4')
  assert.equal(dsl.team.copilotModel.model, 'deepseek-v4-flash')
  assert.equal(built, source)
  assert.match(source, /meeting_begin_extraction/)
  assert.match(source, /meeting_report_extraction_failure/)
  assert.match(source, /meeting_get_execution_context/)
  assert.match(source, /meeting_finalize_execution_review/)
  assert.match(source, /不能代表用户确认会议结果/)
  assert.match(source, /不能代替用户修改行动项状态、接受风险或确认任务完成/)
})

test('remote view uses generated shared-theme assets without browser storage', async () => {
  const sourceRoot = join(packageRoot, 'src/lib/remote-components/meeting-action-workbench/src')
  const [bridge, main, workbench, app, css] = await Promise.all([
    readFile(join(sourceRoot, 'bridge.ts'), 'utf8'),
    readFile(join(sourceRoot, 'main.tsx'), 'utf8'),
    readFile(join(sourceRoot, 'workbench.tsx'), 'utf8'),
    readFile(join(packageRoot, 'src/lib/remote-components/meeting-action-workbench/app.js'), 'utf8'),
    readFile(join(packageRoot, 'src/lib/remote-components/meeting-action-workbench/app.css'), 'utf8')
  ])
  assert.match(main, /@xpert-ai\/plugin-shadcn-ui\/style\.css/)
  assert.match(bridge, /installShadcnThemeVars/)
  assert.match(workbench, /assistant\.chat\.send_message/)
  assert.match(workbench, /import_meeting_file/)
  assert.match(bridge, /executeFileAction/)
  assert.match(workbench, /confirm_meeting/)
  assert.match(workbench, /update_execution_action/)
  assert.match(workbench, /update_risk_signal_status/)
  assert.match(workbench, /meeting_get_execution_context/)
  assert.doesNotMatch([bridge, main, workbench].join('\n'), /localStorage|sessionStorage/)
  assert.match(app, /xpert-shadcn-ui-theme-vars/)
  assert.match(css, /grid-cols-/)
})

test('Mintlify navigation resolves to existing pages', async () => {
  const nav = JSON.parse(await readFile(join(packageRoot, 'docs/docs.json'), 'utf8'))
  const pages = nav.navigation.tabs.flatMap((tab) => tab.groups.flatMap((group) => group.pages))
  for (const page of pages) await readFile(join(packageRoot, 'docs', page + '.mdx'), 'utf8')
})
