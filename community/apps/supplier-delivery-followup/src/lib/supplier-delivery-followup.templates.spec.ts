import 'reflect-metadata'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IWFNMiddleware, TXpertTeamDraft } from '@xpert-ai/contracts'
import { AGENT_MIDDLEWARE_STRATEGY, type PluginContext } from '@xpert-ai/plugin-sdk'
import plugin from '../index'
import {
  DELIVERY_FEATURE,
  DELIVERY_MIDDLEWARE_NAME,
  DELIVERY_TEMPLATE_KEY,
  DELIVERY_TOOL_NAMES,
  DELIVERY_WORKBENCH_KEY,
  PLUGIN_NAME
} from './constants'
import { SupplierDeliveryFollowupPlugin } from './supplier-delivery-followup.plugin'
import { SupplierDeliveryFollowupMiddleware } from './supplier-delivery-followup.middleware'
import { SupplierDeliveryFollowupService } from './supplier-delivery-followup.service'

// Use the YAML parser supplied for the installed SDK's declared peer dependency in this test only.
const sdkRequire = createRequire(require.resolve('@xpert-ai/plugin-sdk/package.json'))
const { parse } = sdkRequire('yaml') as { parse(source: string): TXpertTeamDraft }

it('tools: template loads with matching identity, opener, scope-free dependencies and default model', () => {
  expect(plugin.templates).toHaveLength(1)
  const template = plugin.templates[0]
  const dsl = parse(template.dslContent!)
  expect(template.key).toBe(DELIVERY_TEMPLATE_KEY)
  expect(template.dslContent).toBe(
    readFileSync(join(__dirname, '..', 'xpert-supplier-delivery-followup-assistant.yaml'), 'utf8')
  )
  expect(dsl.team).toMatchObject({
    name: template.key,
    title: template.title,
    description: template.description,
    type: 'agent',
    version: '1',
    options: { workbench: { defaultViewKey: DELIVERY_WORKBENCH_KEY } }
  })
  expect(dsl.team.features?.opener).toMatchObject({ enabled: true, questions: template.startPrompts })
  expect(template.startPrompts).toHaveLength(3)
  expect(template.targetApps).toEqual(['xpert', 'data-xpert'])
  expect(template.dependencies).toEqual({ plugins: [PLUGIN_NAME] })
  for (const target of template.targetApps!) {
    expect(template.targetAppMeta?.[target]).toMatchObject({
      types: expect.any(Array),
      capabilities: [DELIVERY_FEATURE],
      requiredPlugins: [PLUGIN_NAME]
    })
  }
  expect(dsl.team.copilotModel).toBeUndefined()
  expect(template.dslContent).not.toMatch(/tenantId:|organizationId:|userId:|model:|referencedId:|appConfig:/)
})

it('tools: template graph directly connects required defaults and exact business tools', () => {
  const dsl = parse(plugin.templates[0].dslContent!)
  const agents = dsl.nodes.filter((node) => node.type === 'agent')
  expect(agents).toHaveLength(1)
  expect(agents[0].key).toBe(dsl.team.agent?.key)
  const middlewareNodes = dsl.nodes.filter((node) => node.type === 'workflow')
  const middlewares = middlewareNodes.map((node) => node.entity as IWFNMiddleware)
  expect(middlewares.map((entity) => entity.provider)).toEqual([
    'ContextCompressionMiddleware',
    'todoListMiddleware',
    DELIVERY_MIDDLEWARE_NAME
  ])
  expect(agents[0].entity.options?.middlewares?.order).toEqual(middlewareNodes.map((node) => node.key))
  expect(middlewares[0].options).toEqual({
    threshold: 0.7,
    preserveFraction: 0.3,
    enableTwoPhaseCompression: true,
    protectedUserTurns: 2
  })
  expect(middlewares[1].options).toEqual({})
  expect(middlewares[2].tools).toEqual(Object.fromEntries(DELIVERY_TOOL_NAMES.map((name) => [name, true])))
  expect(dsl.connections).toHaveLength(3)
  for (const node of middlewareNodes) {
    expect((node.entity as IWFNMiddleware).required).toBe(true)
    expect(dsl.connections).toContainEqual({
      key: `${agents[0].key}/${node.key}`,
      type: 'workflow',
      from: agents[0].key,
      to: node.key,
      required: true
    })
  }
  for (const toolName of DELIVERY_TOOL_NAMES) expect(agents[0].entity.prompt).toContain(toolName)
  expect(agents[0].entity.prompt).toContain('"reply:<replyId> attempt:<parseAttempt>"')
  expect(agents[0].entity.prompt).toContain('解析供应商回复（11月11日 09:03 收到，第 1 次）')
  expect(agents[0].entity.prompt).toContain('Write every message to the buyer in the language of the workbench message')
  expect(agents[0].entity.prompt).toContain('use as few steps as possible')
  expect(agents[0].entity.prompt).toContain('Confirmation, rejection and order edits belong exclusively to the human')
})

it('tools: plugin registers the decorated middleware and reports loaded templates during initialization', () => {
  const providers: unknown[] = Reflect.getMetadata('providers', SupplierDeliveryFollowupPlugin)
  expect(providers).toContain(SupplierDeliveryFollowupMiddleware)
  expect(providers).toContain(SupplierDeliveryFollowupService)
  expect(Reflect.getMetadata(AGENT_MIDDLEWARE_STRATEGY, SupplierDeliveryFollowupMiddleware)).toBe(
    DELIVERY_MIDDLEWARE_NAME
  )
  const middleware = new SupplierDeliveryFollowupMiddleware({} as SupplierDeliveryFollowupService)
  const resolve = jest.fn().mockReturnValue(middleware)
  const log = jest.fn()
  plugin.onInit({ resolve, logger: { log } } as unknown as PluginContext)
  expect(resolve).toHaveBeenCalledWith(SupplierDeliveryFollowupMiddleware)
  expect(log).toHaveBeenCalledWith(expect.stringContaining(DELIVERY_MIDDLEWARE_NAME))
  expect(log).toHaveBeenCalledWith(expect.stringContaining(DELIVERY_TEMPLATE_KEY))
})
