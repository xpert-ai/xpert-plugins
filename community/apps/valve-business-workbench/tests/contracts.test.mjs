import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'
import { ValveDataXpertClient } from '../dist/lib/data-xpert-client.service.js'
import { ValveMiddleware } from '../dist/lib/valve.middleware.js'
import { ValveViewProvider } from '../dist/lib/valve-view.provider.js'
import { ValveBusinessService } from '../dist/lib/valve-business.service.js'
import { buildValveActionDescriptors, normalizeActionInput } from '../dist/lib/valve-demo-actions.js'
import { resolveValvePluginConfig } from '../dist/lib/config.js'
import { valveTemplates } from '../dist/lib/templates.js'
import {
  VALVE_AGENT_KEY,
  VALVE_SKILL_KEY,
  VALVE_TOOL_NAMES,
  VALVE_TOOL_TITLES
} from '../dist/lib/constants.js'
import {
  VALVE_ONTOLOGY_MANIFEST,
  VALVE_ONTOLOGY_RESOURCE_ID,
  buildValveOntologyDefinitionDraft
} from '../dist/lib/domain/valve-ontology/index.js'

const packageRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const config = {
  enabled: true,
  demo: { enabled: true, includeFallbackActions: true },
  dataXpert: {
    apiBaseUrl: 'http://localhost:3001',
    rootEntityTypeCode: 'valve',
    resourceIds: ['resource-valve', 'resource-other'],
    timeoutMs: 15000,
    resultLimit: 30
  }
}
const configResolver = { resolve: () => config }
const scope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'user-1',
  actorTokenProvider: async () => 'actor-token'
}

test('client forwards scoped actor identity and keeps exact ready valve resources only', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).endsWith('/list-ontology-resources')) {
      return response({
        taskId: 'list-1',
        items: [
          resource('resource-valve', 'ready'),
          resource('resource-other', 'ready'),
          resource('resource-pending', 'pending')
        ]
      })
    }
    const resourceId = JSON.parse(String(init?.body)).resourceId
    return response(schema(resourceId, resourceId === 'resource-valve' ? ['valve', 'material'] : ['pump']))
  }
  try {
    const client = new ValveDataXpertClient(configResolver)
    const items = await client.listResources(scope)
    assert.deepEqual(items.map((item) => item.resourceId), ['resource-valve'])
    assert.equal(calls[0].init.headers.Authorization, 'Bearer actor-token')
    assert.equal(calls[0].init.headers['organization-id'], 'org-1')
    assert.match(calls[0].url, /^http:\/\/localhost:3001\/api\/uose\/agent-tools\//)
    assert.deepEqual(JSON.parse(String(calls[0].init.body)).healthStatuses, ['ready'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('legacy plugin configuration receives safe Demo defaults during upgrade', () => {
  const resolved = resolveValvePluginConfig({ enabled: true, dataXpert: config.dataXpert })
  assert.deepEqual(resolved.demo, { enabled: true, includeFallbackActions: true })
})

test('plugin-owned valve ontology bundle is valid, bounded, and aligned with Demo Actions', () => {
  const draft = buildValveOntologyDefinitionDraft()
  assert.equal(VALVE_ONTOLOGY_RESOURCE_ID, 'valve-engineering-ontology')
  assert.deepEqual(
    { entityTypes: draft.entityTypes.length, relationTypes: draft.relationTypes.length, actionTypes: draft.actionTypes.length, instances: draft.instances.length, relations: draft.relations.length },
    { entityTypes: 5, relationTypes: 4, actionTypes: 7, instances: 7, relations: 6 }
  )
  assert.equal(draft.entityTypes.some((item) => item.code === 'valve'), true)
  assert.deepEqual(
    draft.actionTypes.map((item) => item.code),
    [
      'create_maintenance_work_order', 'schedule_valve_inspection', 'raise_quality_deviation',
      'request_spare_part', 'request_valve_replacement', 'isolate_valve', 'request_engineering_review'
    ]
  )
  assert.equal(draft.actionTypes.every((item) => item.requiresApproval), true)
  assert.equal(draft.actionTypes.filter((item) => item.riskLevel === 'HIGH' || item.riskLevel === 'CRITICAL').every((item) => item.requiresApproval), true)
  const entityCodes = new Set(draft.entityTypes.map((item) => item.code))
  const instanceKeys = new Set(draft.instances.map((item) => `${item.entityTypeCode}:${item.externalKey}`))
  assert.equal(draft.relationTypes.every((item) => entityCodes.has(item.sourceEntityTypeCode) && entityCodes.has(item.targetEntityTypeCode)), true)
  assert.equal(draft.relations.every((item) => instanceKeys.has(`${item.source.entityTypeCode}:${item.source.externalKey}`) && instanceKeys.has(`${item.target.entityTypeCode}:${item.target.externalKey}`)), true)
  assert.equal(draft.dataBindings.length, 0)
  assert.equal(VALVE_ONTOLOGY_MANIFEST.version.semanticVersion, '1.0.0')
})

test('ontology initialization creates, validates, and publishes the fixed server-owned resource', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const path = new URL(String(url)).pathname
    if (path.endsWith('/resolve-reference')) return response({}, 404)
    if (path.endsWith('/ontology-definitions') && init.method === 'GET') return response({ items: [] })
    if (path.endsWith('/ontology-definitions') && init.method === 'POST') {
      return response({ id: 'definition-1', resourceId: VALVE_ONTOLOGY_RESOURCE_ID, draftRevision: 1 })
    }
    if (path.endsWith('/draft')) return response({ id: 'definition-1', resourceId: VALVE_ONTOLOGY_RESOURCE_ID, draftRevision: 2 })
    if (path.endsWith('/validate')) return response({ valid: true, issues: [] })
    if (path.endsWith('/publish')) {
      return response({
        definition: { id: 'definition-1', resourceId: VALVE_ONTOLOGY_RESOURCE_ID, draftRevision: 2, currentVersionNo: 1 },
        version: { versionNo: 1, semanticVersion: '1.0.0', status: 'published' },
        snapshot: { snapshotId: 'snapshot-1', graphVersion: 'graph-1', ontologyId: 'ontology-1' }
      })
    }
    throw new Error(`Unexpected request: ${init.method} ${url}`)
  }
  try {
    const client = new ValveDataXpertClient(configResolver)
    const result = await client.initializeOntology(scope, { confirmOverwrite: false })
    assert.equal(result.operation, 'created_and_published')
    assert.equal(result.snapshotId, 'snapshot-1')
    assert.deepEqual(calls.map((call) => call.init.method), ['GET', 'GET', 'POST', 'PUT', 'POST', 'POST'])
    const createBody = JSON.parse(String(calls[2].init.body))
    const draftBody = JSON.parse(String(calls[3].init.body))
    const publishBody = JSON.parse(String(calls[5].init.body))
    assert.equal(createBody.resourceId, VALVE_ONTOLOGY_RESOURCE_ID)
    assert.equal(draftBody.draft.instances.length, 7)
    assert.equal(draftBody.draft.actionTypes.length, 7)
    assert.equal(publishBody.semanticVersion, '1.0.0')
    assert.equal(calls[0].init.headers['tenant-id'], 'tenant-1')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('ontology initialization refuses to overwrite an existing unpublished draft without explicit confirmation', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname
    if (path.endsWith('/resolve-reference')) return response({}, 404)
    if (path.endsWith('/ontology-definitions') && init.method === 'GET') {
      return response({ items: [{ id: 'definition-1', resourceId: VALVE_ONTOLOGY_RESOURCE_ID, draftRevision: 4 }] })
    }
    throw new Error(`Unexpected request: ${init.method} ${url}`)
  }
  try {
    const client = new ValveDataXpertClient(configResolver)
    await assert.rejects(
      () => client.initializeOntology(scope, { confirmOverwrite: false }),
      /VALVE_ONTOLOGY_DRAFT_OVERWRITE_CONFIRMATION_REQUIRED/
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('client HTTP failures are status-only and do not expose response secrets', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'secret-token-and-body' })
  try {
    const client = new ValveDataXpertClient(configResolver)
    await assert.rejects(() => client.listResources(scope), (error) => {
      assert.equal(error.message, 'DATA_XPERT_HTTP_401')
      assert.doesNotMatch(error.message, /secret-token/)
      return true
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('middleware publishes action discovery and preflight but no approval or execution tool', () => {
  const service = {
    defaultResourceId: () => 'resource-valve',
    listResources: async () => [], getSchema: async () => ({}), searchObjects: async () => ({}),
    getObject360: async () => ({}), getAvailableActions: async () => ({ items: [] }), preflightAction: async () => ({}),
    listActionProposals: async () => [], createActionProposal: async () => ({}),
    getAuditTrace: async () => []
  }
  const middleware = new ValveMiddleware(service).createMiddleware({}, {
    tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', xpertId: 'assistant-1'
  })
  assert.equal(middleware.tools.length, 9)
  const names = middleware.tools.map((item) => item.name)
  assert.deepEqual(names, [
    'valve_list_resources', 'valve_discover_actions', 'valve_preflight_action', 'valve_get_schema',
    'valve_search_objects', 'valve_get_object_360',
    'valve_list_action_proposals', 'valve_create_action_proposal', 'valve_get_audit_trace'
  ])
  assert.equal(names.some((name) => /approve|execute|complete|reject/.test(name)), false)
  for (const tool of middleware.tools) {
    assert.equal(tool.schema.safeParse({ unexpected: true }).success, false)
    assert.deepEqual(tool.metadata?.toolName, VALVE_TOOL_TITLES[tool.name])
    assert.equal(
      Boolean(tool.schema.shape?.changeSummary),
      tool.name === VALVE_TOOL_NAMES.createActionProposal
    )
  }

  const createProposal = middleware.tools.find((item) => item.name === VALVE_TOOL_NAMES.createActionProposal)
  const proposalInput = {
    kind: 'engineering_review',
    title: 'Review valve leakage',
    summary: 'Review the observed packing leak before deciding the governed action.'
  }
  assert.equal(createProposal.schema.safeParse(proposalInput).success, false)
  assert.equal(
    createProposal.schema.safeParse({ ...proposalInput, changeSummary: '为 VALVE-101 创建泄漏评审草案' }).success,
    true
  )
  assert.equal(
    createProposal.schema.safeParse({ ...proposalInput, changeSummary: 'x'.repeat(201) }).success,
    false
  )
})

test('middleware trusts the active Workbench target and opaque partition over model guesses', async () => {
  let received
  const service = {
    defaultResourceId: () => 'resource-valve',
    listResources: async () => [], getSchema: async () => ({}), searchObjects: async () => ({}),
    getObject360: async () => ({}),
    getAvailableActions: async (_scope, input) => {
      received = input
      return { items: [] }
    },
    preflightAction: async () => ({}), listActionProposals: async () => [],
    createActionProposal: async () => ({}), getAuditTrace: async () => []
  }
  const middleware = new ValveMiddleware(service).createMiddleware({}, {
    tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', xpertId: 'assistant-1'
  })
  const discover = middleware.tools.find((item) => item.name === 'valve_discover_actions')
  const activeContext = {
    valve_business_workbench: {
      version: 1,
      resourceId: 'resource-valve',
      snapshotId: 'snapshot-1',
      graphVersion: 'graph-1',
      entityId: 'valve-1',
      entityTypeCode: 'valve',
      externalKey: 'V-101',
      label: 'Valve V-101'
    }
  }
  await discover.invoke(
    {
      resourceId: 'resource-valve',
      partitionKey: 'invented-from-resource-name',
      entityId: 'valve-1',
      entityTypeCode: 'Valve',
      entityRef: 'V-101'
    },
    { configurable: { context: activeContext } }
  )
  assert.equal(received.partitionKey, undefined)
  assert.deepEqual(received.target, {
    entityId: 'valve-1',
    entityTypeCode: 'valve',
    entityRef: 'V-101'
  })
})

test('view manifests are Studio Workbench views with human-only approval and Demo execution actions', () => {
  const provider = new ValveViewProvider({}, undefined)
  const context = { hostType: 'agent', tenantId: 'tenant-1', organizationId: 'org-1' }
  for (const slot of ['agent.workbench.main', 'agent.workbench.fixed']) {
    const [manifest] = provider.getViewManifests(context, slot)
    assert.equal(manifest.view.type, 'remote_component')
    assert.deepEqual(manifest.clientCommands.map((item) => item.key), [
      'assistant.context.set', 'assistant.chat.send_message'
    ])
    assert.deepEqual(manifest.hostEvents.subscriptions[0].filter.toolNames, ['valve_create_action_proposal'])
    assert.equal(manifest.dataSource.querySchema.supportsPagination, true)
    assert.equal(manifest.dataSource.querySchema.defaultPageSize, 30)
    const actionKeys = manifest.actions.map((action) => action.key)
    assert.equal(actionKeys.includes('create_demo_proposal'), true)
    assert.equal(actionKeys.includes('execute_demo_action'), true)
    assert.equal(actionKeys.includes('initialize_valve_ontology'), true)
  }
})

test('view provider exposes ontology status and targetless user-confirmed initialization', async () => {
  let initializationInput
  const service = {
    getOntologyInitializationStatus: async () => ({ state: 'missing', resourceId: VALVE_ONTOLOGY_RESOURCE_ID }),
    initializeOntology: async (_scope, input) => {
      initializationInput = input
      return { operation: 'created_and_published' }
    }
  }
  const provider = new ValveViewProvider(service, undefined)
  const context = { hostType: 'agent', hostId: 'assistant-1', tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }
  const [manifest] = provider.getViewManifests(context, 'agent.workbench.main')
  const data = await provider.getViewData(context, manifest.key, { parameters: { mode: 'ontology_status' } })
  assert.equal(data.meta.status.resourceId, VALVE_ONTOLOGY_RESOURCE_ID)
  const result = await provider.executeViewAction(context, manifest.key, 'initialize_valve_ontology', {
    input: { confirmOverwrite: true }
  })
  assert.equal(result.success, true)
  assert.deepEqual(initializationInput, { confirmOverwrite: true })
})

test('view provider forwards the submitted object search keyword from stable parameters to data-xpert', async () => {
  let received
  const service = {
    searchObjects: async (_scope, input) => {
      received = input
      return { taskId: 'search-1', resourceId: input.resourceId, items: [] }
    }
  }
  const provider = new ValveViewProvider(service, undefined)
  const context = {
    hostType: 'agent', hostId: 'assistant-1', tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1'
  }
  const [manifest] = provider.getViewManifests(context, 'agent.workbench.main')
  await provider.getViewData(context, manifest.key, {
    pageSize: 40,
    parameters: {
      mode: 'objects',
      resourceId: 'resource-valve',
      entityTypeCode: 'valve',
      search: 'VALVE-11SFCD015-2IN'
    }
  })
  assert.deepEqual(received, {
    resourceId: 'resource-valve',
    entityTypeCode: 'valve',
    partitionKey: undefined,
    query: 'VALVE-11SFCD015-2IN',
    limit: 40
  })
})

test('Demo catalog enriches ontology actions and exposes safe fallback scenarios', () => {
  const object = {
    resourceId: 'resource-valve', snapshotId: 'snapshot-1', graphVersion: 'graph-1', ontologyId: 'ontology-1',
    entity: { entityId: 'valve-1', entityTypeCode: 'valve', externalKey: 'V-101', label: 'Valve V-101', attributes: {}, constraintRefs: [], evidence: {} },
    relationGroups: [], relatedObjects: [], constraints: [], evidence: {}, partitionKey: null,
    availableActions: [{ code: 'create_maintenance_work_order', name: 'Ontology work order', riskLevel: 'HIGH', requiresApproval: true, intentTags: ['maintenance'] }]
  }
  const actions = buildValveActionDescriptors(object, { demoEnabled: true, includeFallbackActions: true })
  assert.equal(actions.length, 7)
  const workOrder = actions.find((action) => action.code === 'create_maintenance_work_order')
  assert.equal(workOrder.source, 'ontology')
  assert.equal(workOrder.targetSystem, 'Demo EAM')
  const isolation = actions.find((action) => action.code === 'isolate_valve')
  assert.equal(isolation.source, 'demo')
  assert.equal(isolation.executionMode, 'simulation_only')
  assert.equal(isolation.riskLevel, 'CRITICAL')
  const invalid = normalizeActionInput(workOrder, { simulateMissingAsset: true })
  assert.equal(invalid.blockingReasons.includes('EAM_ASSET_MAPPING_MISSING'), true)
  const disabled = buildValveActionDescriptors(object, { demoEnabled: false, includeFallbackActions: false })
  assert.equal(disabled.length, 1)
  assert.equal(disabled[0].available, false)
  assert.deepEqual(disabled[0].blockingReasons, ['NO_EXECUTION_ADAPTER'])
})

test('approved proposals execute through the Demo adapter and append a governed timeline', async () => {
  const proposal = {
    id: '50000000-0000-4000-8000-000000000010', tenantId: 'tenant-1', organizationId: 'org-1',
    operationId: 'op-10', requestHash: 'hash', resourceId: 'resource-valve', snapshotId: 'snapshot-1', graphVersion: 'graph-1',
    partitionKey: null, entityId: 'valve-1', entityTypeCode: 'valve', externalKey: 'V-101', entityLabel: 'Valve V-101',
    kind: 'ontology_action', actionTypeCode: 'schedule_valve_inspection', title: 'Inspection', summary: 'Inspect valve',
    expectedEffects: [], evidence: { actionInput: { inspectionType: 'Leak', scheduledDate: '2026-09-05', scope: 'Stem' } },
    status: 'approved', reviewComment: null, outcome: null, createdBy: 'assistant-1', reviewedBy: 'user-1', completedBy: null,
    createdAt: new Date('2026-08-22T00:00:00.000Z'), updatedAt: new Date('2026-08-22T00:00:00.000Z')
  }
  const savedEvents = []
  const proposalRepository = {
    findOne: async () => proposal,
    save: async (value) => value,
    createQueryBuilder: () => chain(proposal)
  }
  const eventRepository = {
    create: (value) => ({ id: `event-${savedEvents.length + 1}`, createdAt: new Date(), ...value }),
    save: async (value) => {
      savedEvents.push(...(Array.isArray(value) ? value : [value]))
      return value
    },
    findOne: async () => null
  }
  const client = {
    getConfig: () => config,
    getObject360: async () => ({
      resourceId: proposal.resourceId, snapshotId: proposal.snapshotId, graphVersion: proposal.graphVersion,
      ontologyId: 'ontology-1', partitionKey: null,
      entity: { entityId: proposal.entityId, entityTypeCode: 'valve', externalKey: proposal.externalKey, label: proposal.entityLabel, attributes: {}, constraintRefs: [], evidence: {} },
      relationGroups: [], relatedObjects: [], constraints: [], evidence: {}, availableActions: []
    })
  }
  const dataSource = {
    transaction: async (work) => work({
      getRepository: (entity) => entity.name === 'ValveActionProposal' ? proposalRepository : eventRepository
    })
  }
  const service = new ValveBusinessService(client, dataSource, proposalRepository, eventRepository)
  const result = await service.executeDemoAction(scope, proposal.id, { demoOutcome: 'success' })
  assert.equal(result.proposal.status, 'completed')
  assert.match(result.receipt.externalReference, /^INS-DEMO-/)
  assert.deepEqual(savedEvents.map((event) => event.eventType), ['execution_queued', 'execution_started', 'execution_completed'])
  assert.equal(savedEvents.at(-1).payload.demo, true)
})

test('Assistant template connects native middleware and contains governance boundaries', async () => {
  const [source, built] = await Promise.all([
    readFile(join(packageRoot, 'src/xpert-valve-business-workbench-assistant.yaml'), 'utf8'),
    readFile(join(packageRoot, 'dist/xpert-valve-business-workbench-assistant.yaml'), 'utf8')
  ])
  const dsl = parse(source)
  const middlewareNode = dsl.nodes.find((node) => node.type === 'workflow')
  assert.equal(middlewareNode.entity.provider, 'ValveBusinessWorkbenchMiddleware')
  assert.equal(dsl.team.version, '3')
  assert.deepEqual(dsl.team.starters, valveTemplates[0].startPrompts)
  assert.equal(dsl.team.starters.length, 4)
  assert.deepEqual(valveTemplates[0].dependencies, {
    plugins: ['@xpert-ai/plugin-valve-business-workbench'],
    skills: [{ pluginName: '@xpert-ai/plugin-valve-business-workbench', componentKey: VALVE_SKILL_KEY, targetAgentKey: VALVE_AGENT_KEY }]
  })
  assert.equal(built, source)
  assert.match(source, /pending_review/)
  assert.match(source, /valve_preflight_action/)
  assert.match(source, /未写入真实 ERP、EAM、QMS、DCS 或 SIS/)
  assert.match(source, /不修改本体 Schema/)
  assert.match(source, /不调用 MCP/)
  assert.doesNotMatch(source, /datax-live-artifacts/)
})

test('plugin bundles a context-aware valve Skill aligned with every middleware tool and human authority boundary', async () => {
  const [packageText, manifestText, skill, metadata, docs, navText] = await Promise.all([
    readFile(join(packageRoot, 'package.json'), 'utf8'),
    readFile(join(packageRoot, '.xpertai-plugin/plugin.json'), 'utf8'),
    readFile(join(packageRoot, 'skills/valve-business-operations/SKILL.md'), 'utf8'),
    readFile(join(packageRoot, 'skills/valve-business-operations/agents/xpertai.yaml'), 'utf8'),
    readFile(join(packageRoot, 'docs/assistant-skill.mdx'), 'utf8'),
    readFile(join(packageRoot, 'docs/docs.json'), 'utf8')
  ])
  const packageJson = JSON.parse(packageText)
  const manifest = JSON.parse(manifestText)
  const agentMetadata = parse(metadata)
  const nav = JSON.parse(navText)
  assert.equal(manifest.skills, './skills/')
  assert.equal(manifest.artifactNamespace, 'valve_business_workbench')
  assert.equal(manifest.targetAppMeta['data-xpert'].marketplace.contents.some((item) => item.type === 'skill' && item.name === VALVE_SKILL_KEY), true)
  assert.equal(packageJson.files.includes('.xpertai-plugin'), true)
  assert.equal(packageJson.files.includes('skills'), true)
  assert.match(skill, /^---\nname: valve-business-operations\n/)
  for (const toolName of Object.values(VALVE_TOOL_NAMES)) assert.match(skill, new RegExp(`\\b${toolName}\\b`))
  assert.match(skill, /only when the user explicitly asks/)
  assert.match(skill, /cannot approve, reject, execute, complete, or fail/)
  assert.equal(agentMetadata.policy.allow_implicit_invocation, true)
  assert.deepEqual(
    agentMetadata.runtime.required_tools.filter((item) => item.provider === 'ValveBusinessWorkbenchMiddleware').map((item) => item.name),
    Object.values(VALVE_TOOL_NAMES)
  )
  assert.match(docs, /team\.starters/)
  assert.equal(nav.navigation.tabs[0].groups[1].pages.includes('assistant-skill'), true)
})

test('remote view uses the shared shadcn theme, Tailwind Studio layout, and collapsible bounded panels', async () => {
  const sourceRoot = join(packageRoot, 'src/lib/remote-components/valve-business-workbench/src')
  const [css, bridge, main, workbench, app, appCss] = await Promise.all([
    readFile(join(sourceRoot, 'styles.css'), 'utf8'),
    readFile(join(sourceRoot, 'bridge.ts'), 'utf8'),
    readFile(join(sourceRoot, 'main.tsx'), 'utf8'),
    readFile(join(sourceRoot, 'workbench.tsx'), 'utf8'),
    readFile(join(packageRoot, 'src/lib/remote-components/valve-business-workbench/app.js'), 'utf8'),
    readFile(join(packageRoot, 'src/lib/remote-components/valve-business-workbench/app.css'), 'utf8')
  ])
  assert.match(css, /@import "tailwindcss" source\(none\)/)
  assert.match(css, /@source "\.\/\*\*\/\*\.\{ts,tsx\}"/)
  assert.match(css, /html,\s*body,\s*#root \{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*overflow: hidden/)
  assert.match(main, /@xpert-ai\/plugin-shadcn-ui\/style\.css/)
  assert.match(bridge, /installShadcnThemeVars/)
  assert.match(bridge, /density: theme\?\.density \?\? 'compact'/)
  assert.match(workbench, /SelectTrigger/)
  assert.match(workbench, /AlertDialog/)
  assert.match(workbench, /ActionCenter/)
  assert.match(workbench, /execute_demo_action/)
  assert.match(workbench, /initialize_valve_ontology/)
  assert.match(workbench, /mode: 'ontology_status'/)
  assert.match(workbench, /ontologyConfirmOpen/)
  assert.match(workbench, /t\.overwriteDescription/)
  assert.match(workbench, /id="valve-object-search"/)
  assert.match(workbench, /form="valve-object-search"/)
  assert.match(workbench, /data-testid="object-search-submit"/)
  assert.match(workbench, /const nextSearch = \(searchInputRef\.current\?\.value \?\? searchDraft\)\.trim\(\)/)
  assert.match(workbench, /onClick=\{submitObjectSearch\}/)
  assert.match(workbench, /loadSchemaAndObjects\(resourceId, entityTypeCode, nextSearch\)/)
  assert.match(workbench, /search: nextSearch[\s\S]*parameters:[\s\S]*search: nextSearch/)
  assert.match(workbench, /FieldValueDisplay value=\{object360\.evidence\}/)
  assert.doesNotMatch(workbench, /JsonBlock value=\{object360\.evidence\}/)
  assert.match(workbench, /fieldLabel\(locale, key\)/)
  assert.match(workbench, /t\[proposal\.kind\]/)
  assert.doesNotMatch(workbench, /aria-label=\{t\.refresh\}[\s\S]{0,220}<RefreshCw/)
  assert.match(workbench, /CardHeader className="border-b"/)
  const sectionSource = workbench.match(/function Section[\s\S]*?(?=\nfunction KeyValueGrid)/)?.[0] ?? ''
  assert.match(sectionSource, /data-section-layout="title-actions-divider-content"/)
  assert.match(sectionSource, /<header/)
  assert.match(sectionSource, /<Separator \/>/)
  assert.doesNotMatch(sectionSource, /<Card/)
  assert.match(workbench, /function ObjectListItem/)
  assert.doesNotMatch(workbench, /function ObjectCard/)
  assert.equal((workbench.match(/<Card(?:\s|>)/g) ?? []).length, 2)
  assert.match(workbench, /data-testid="object-panel-toggle"/)
  assert.match(workbench, /grid-cols-\[18rem_minmax\(0,1fr\)\]/)
  assert.match(workbench, /ScrollArea data-valve-scroll className="min-h-0 flex-1"/)
  assert.doesNotMatch(workbench, /<select|<input|window\.confirm|window\.prompt/)
  assert.doesNotMatch([bridge, main, workbench].join('\n'), /localStorage|sessionStorage/)
  assert.match(app, /xpert-shadcn-ui-theme-vars/)
  assert.match(app, /assistant\.context\.set/)
  assert.match(app, /assistant\.chat\.send_message/)
  assert.match(appCss, /grid-cols-/)
  assert.match(appCss, /overflow-hidden/)
})

test('customer product documentation covers ontology initialization, Action scenarios, Demo boundary, and audit timeline', async () => {
  const [docs, tutorial, initialization, nav] = await Promise.all([
    readFile(join(packageRoot, 'docs/actions.mdx'), 'utf8'),
    readFile(join(packageRoot, 'docs/tutorial.mdx'), 'utf8'),
    readFile(join(packageRoot, 'docs/ontology-initialization.mdx'), 'utf8'),
    readFile(join(packageRoot, 'docs/docs.json'), 'utf8')
  ])
  assert.match(docs, /create_maintenance_work_order/)
  assert.match(docs, /isolate_valve/)
  assert.match(docs, /execution_queued → execution_started → execution_completed/)
  assert.match(docs, /不会写入真实 ERP、EAM、QMS、采购、DCS 或 SIS/)
  assert.match(tutorial, /Split Body Ball Valve 2\\" Class 150/)
  assert.match(tutorial, /让助手分析/)
  assert.match(tutorial, /valve_create_action_proposal/)
  assert.match(tutorial, /proposal_created[\s\S]*proposal_approved[\s\S]*execution_queued[\s\S]*execution_completed/)
  assert.match(tutorial, /失败路径/)
  assert.match(tutorial, /simulation_only/)
  assert.match(initialization, /valve-engineering-ontology/)
  assert.match(initialization, /check fixed resource\/version[\s\S]*validate in data-xpert[\s\S]*publish semantic version/)
  assert.match(initialization, /does not write anything by itself/)
  assert.equal(JSON.parse(nav).navigation.tabs[0].groups[0].pages.includes('actions'), true)
  assert.equal(JSON.parse(nav).navigation.tabs[0].groups[0].pages.includes('tutorial'), true)
  assert.equal(JSON.parse(nav).navigation.tabs[0].groups[0].pages.includes('ontology-initialization'), true)
})

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function resource(resourceId, healthStatus) {
  return {
    resourceId,
    resourceStatus: 'active',
    version: '1',
    healthStatus,
    snapshotId: `snapshot-${resourceId}`,
    graphVersion: `graph-${resourceId}`,
    descriptor: { role: 'definition', displayName: resourceId },
    updatedAt: '2026-08-22T00:00:00.000Z'
  }
}

function schema(resourceId, entityTypeCodes) {
  return {
    taskId: `schema-${resourceId}`,
    resourceId,
    snapshotId: `snapshot-${resourceId}`,
    graphVersion: `graph-${resourceId}`,
    ontologyId: `ontology-${resourceId}`,
    entityTypes: entityTypeCodes.map((code) => ({ code, name: code, aliases: [], attributeCodes: [] })),
    relationTypes: [],
    affordances: []
  }
}

function chain(value) {
  const builder = {
    setLock: () => builder, where: () => builder, andWhere: () => builder,
    getOne: async () => value
  }
  return builder
}
