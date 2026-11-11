import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import pluginModule from '../dist/index.js'
import { roadEventAssistantTemplate } from '../dist/lib/templates.js'
import { RoadEventCommandCenterMiddleware } from '../dist/lib/road-event-command-center.middleware.js'
import { RoadEventCommandCenterViewProvider } from '../dist/lib/road-event-command-center-view.provider.js'
import { FEATURE, MIDDLEWARE_NAME, TEMPLATE_KEY } from '../dist/lib/constants.js'

const plugin = pluginModule.default ?? pluginModule

const context = {
  hostType: 'agent',
  hostId: 'assistant-test',
  tenantId: 'tenant-test',
  organizationId: 'organization-test',
  workspaceId: 'workspace-test',
  userId: 'user-test',
  slots: []
}

test('plugin exposes the road event workbench provider', () => {
  assert.equal(plugin.meta.name, '@community/apps-road-event-command-center')
  assert.equal(plugin.meta.level, 'tenant')
  assert.equal(plugin.meta.artifactNamespace, 'road_event_command_center')
  assert.deepEqual(plugin.meta.targetAppMeta?.xpert?.runtime?.viewProviders, ['road-event-command-center.workbench'])
})

test('plugin exposes an Assistant template that enables the road-event workbench', () => {
  assert.deepEqual(plugin.meta.targetAppMeta?.xpert?.runtime?.middlewareProviders, [MIDDLEWARE_NAME])
  assert.deepEqual(plugin.meta.targetAppMeta?.xpert?.runtime?.templateProviders, ['road-event-command-center.templates'])
  assert.equal(plugin.templates?.[0]?.key, TEMPLATE_KEY)
  assert.equal(roadEventAssistantTemplate.targetAppMeta?.xpert?.capabilities?.includes(FEATURE), true)

  const dsl = JSON.parse(roadEventAssistantTemplate.dslContent)
  const middlewareNode = dsl.nodes.find((node) => node.type === 'workflow' && node.entity?.type === 'middleware')
  assert.equal(middlewareNode?.entity?.provider, MIDDLEWARE_NAME)
  assert.ok(dsl.connections.some((connection) => connection.to === middlewareNode?.key))

  const middleware = new RoadEventCommandCenterMiddleware({ get: async () => ({ revision: 0, draft: null, updatedAt: null }) })
  assert.deepEqual(middleware.meta.features, [FEATURE])
  assert.deepEqual(middleware.getToolNames(), ['generate_road_event_recommendation'])
  const runtimeMiddleware = middleware.createMiddleware({}, {
    tenantId: 'tenant-test', organizationId: 'organization-test', workspaceId: 'workspace-test', userId: 'user-test', xpertId: 'assistant-test', runtime: {}
  })
  assert.deepEqual(runtimeMiddleware.tools.map((registeredTool) => registeredTool.name), ['generate_road_event_recommendation'])
  assert.match(roadEventAssistantTemplate.startPrompts.join(' '), /AI 处置建议/)
  assert.match(dsl.nodes.find((node) => node.type === 'agent').entity.prompt, /明确要求重试/)
})

test('recommendation tool calls the configured Assistant model and persists structured output', async () => {
  const currentDraft = {
    title: 'G312 road collision',
    eventType: 'accident',
    severity: 'medium',
    locationDescription: 'G312 kilometer 126',
    description: 'Two vehicles collided and are blocking the right lane.',
    occurredAt: '2026-11-10T01:30:00.000Z',
    coordinates: { longitude: 118.96, latitude: 32.15 }
  }
  let stored = { revision: 1, draft: currentDraft, updatedAt: '2026-11-10T01:30:00.000Z' }
  const saves = []
  const middleware = new RoadEventCommandCenterMiddleware({
    get: async () => stored,
    save: async (_scope, input) => {
      saves.push(input)
      stored = { revision: 2, draft: input.draft, updatedAt: '2026-11-10T01:31:00.000Z' }
      return { revision: 2, updatedAt: stored.updatedAt }
    }
  }).createMiddleware({}, {
    tenantId: 'tenant-test', organizationId: 'organization-test', workspaceId: 'workspace-test', userId: 'user-test', xpertId: 'assistant-test',
    runtime: {
      createModelClient: async (copilotModel, options) => {
        assert.equal(copilotModel.model, 'test-chat-model')
        assert.deepEqual(options, { purpose: 'invoke' })
        return {
          withStructuredOutput: () => ({ invoke: async () => ({
            summary: 'Secure the scene and verify the reported lane obstruction.',
            severity: 'high',
            actions: [{ title: 'Protect the scene', details: 'Coordinate traffic control and keep responders clear of the affected lane.', priority: 'immediate' }],
            cautions: ['Confirm injuries and current traffic conditions with an on-scene report.']
          }) })
        }
      }
    }
  })
  const result = await middleware.tools[0].invoke({}, { configurable: { copilotModel: { model: 'test-chat-model' } } })
  assert.equal(saves.length, 1)
  assert.equal(saves[0].expectedRevision, 1)
  assert.equal(stored.revision, 2)
  assert.equal(stored.draft.coordinates.longitude, 118.96)
  assert.equal(stored.draft.recommendation.severity, 'high')
  assert.equal(stored.draft.recommendation.model, 'test-chat-model')
  assert.match(result, /duty officer must review/i)
})

test('recommendation tool persists retryable failure without dropping the saved draft', async () => {
  const currentDraft = {
    title: 'G312 road collision',
    eventType: 'accident',
    severity: 'medium',
    locationDescription: 'G312 kilometer 126',
    description: 'Two vehicles collided and are blocking the right lane.',
    occurredAt: '2026-11-10T01:30:00.000Z',
    coordinates: { longitude: 118.96, latitude: 32.15 }
  }
  let stored = { revision: 4, draft: currentDraft, updatedAt: '2026-11-10T01:30:00.000Z' }
  const middleware = new RoadEventCommandCenterMiddleware({
    get: async () => stored,
    save: async (_scope, input) => {
      stored = { revision: 5, draft: input.draft, updatedAt: '2026-11-10T01:31:00.000Z' }
      return { revision: 5, updatedAt: stored.updatedAt }
    }
  }).createMiddleware({}, {
    tenantId: 'tenant-test', organizationId: 'organization-test', workspaceId: 'workspace-test', userId: 'user-test', xpertId: 'assistant-test',
    runtime: { createModelClient: async () => { throw new Error('provider unavailable') } }
  })
  const result = JSON.parse(await middleware.tools[0].invoke({}, { configurable: { copilotModel: { model: 'test-chat-model' } } }))
  assert.equal(result.success, false)
  assert.equal(result.retryable, true)
  assert.equal(result.code, 'model_error')
  assert.equal(stored.revision, 5)
  assert.equal(stored.draft.title, currentDraft.title)
  assert.deepEqual(stored.draft.coordinates, currentDraft.coordinates)
  assert.equal(stored.draft.recommendationAttempt.status, 'failed')
  assert.match(result.message, /explicitly ask to retry/i)
})

test('provider scopes draft reads and saves by trusted host context', async () => {
  const calls = []
  const provider = new RoadEventCommandCenterViewProvider({
    get: async (scope) => {
      calls.push(['get', scope])
      return { revision: 0, draft: null, updatedAt: null }
    },
    save: async (scope, input) => {
      calls.push(['save', scope, input])
      return { revision: 1, updatedAt: '2026-11-10T01:30:00.000Z' }
    }
  })
  assert.deepEqual(await provider.getViewData(context, 'road-event-command-center.command-center', { parameters: {} }), {
    item: { revision: 0, draft: null, updatedAt: null }
  })
  assert.deepEqual(calls[0][1], {
    tenantId: 'tenant-test',
    organizationId: 'organization-test',
    workspaceId: 'workspace-test',
    userId: 'user-test',
    xpertId: 'assistant-test'
  })
  const saved = await provider.executeViewAction(context, 'road-event-command-center.command-center', 'save_draft', {
    input: {
      expectedRevision: 0,
      draft: {
        title: 'G312 道路追尾事故',
        eventType: 'accident',
        severity: 'medium',
        locationDescription: 'G312 国道 126 公里处',
        description: '两辆小型车辆发生追尾，占用右侧车道，尚无人员伤亡报告。',
        occurredAt: '2026-11-10T01:30:00.000Z'
      }
    }
  })
  assert.equal(saved.success, true)
  assert.equal(saved.data.revision, 1)
  assert.deepEqual(await provider.executeViewAction(context, 'road-event-command-center.command-center', 'save_draft', {
    input: { expectedRevision: -1, draft: {} }
  }), { success: false, data: { code: 'invalid_input' } })
})

test('provider returns an isolated Vue remote component', async () => {
  const provider = new RoadEventCommandCenterViewProvider({ get: async () => ({ revision: 0, draft: null, updatedAt: null }) })
  const manifest = provider.getViewManifests(context, 'agent.workbench.fixed')[0]
  assert.equal(manifest.view.type, 'remote_component')
  assert.equal(manifest.view.runtime, 'esm')
  assert.equal(manifest.view.component.isolation, 'iframe')
  const remote = await provider.getRemoteComponentEntry(context, manifest.key, manifest.view.component)
  assert.match(remote.html, /id="app"/)
  assert.match(remote.html, /xpertai\.remote_component/)
  assert.doesNotMatch(remote.html, /process\.env/)
  assert.doesNotMatch(remote.html, /localStorage|sessionStorage/)
})

test('local preview mounts the Vue entry through an HTML document', () => {
  const preview = readFileSync(new URL('../preview.html', import.meta.url), 'utf8')
  const frame = readFileSync(new URL('../preview-view.html', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/lib/remote/App.vue', import.meta.url), 'utf8')
  assert.match(preview, /src="\/preview-view\.html"/)
  assert.match(frame, /<div id="app"><\/div>/)
  assert.match(frame, /<script type="module" src="\/src\/lib\/remote\/main\.ts"><\/script>/)
  assert.doesNotMatch(preview, /src="\/src\/lib\/remote\/main\.ts"/)
  assert.match(app, /<div[^>]*role="form"[^>]*@keydown\.enter\.prevent="saveDraft"/)
  assert.match(app, /<Button type="button"[^>]*@click="saveDraft"/)
  assert.match(app, /<div ref="mapTarget" class="location-map"/)
  assert.match(app, /setCoordinates\(geographic\[0\], geographic\[1\]\)/)
  assert.match(app, /v-model="latitude"/)
  assert.match(app, /v-model="longitude"/)
  assert.match(app, /VITE_TIANDITU_TOKEN/)
  assert.match(app, /https:\/\/t0\.tianditu\.gov\.cn\//)
  assert.doesNotMatch(app, /tile\.openstreetmap\.org/)
  assert.match(app, /DEFAULT_MAP_CENTER: \[number, number\] = \[118\.96, 32\.15\]/)
  assert.doesNotMatch(app, /<form\b/)
})
