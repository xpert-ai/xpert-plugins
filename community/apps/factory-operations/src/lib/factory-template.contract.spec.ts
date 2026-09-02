import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  AGENT_KEYS,
  FACTORY_ARTIFACT_NAMESPACE,
  FACTORY_CASE_WORKSPACE_REMOTE_ENTRY_KEY,
  FACTORY_CASE_WORKSPACE_VIEW_KEY,
  FACTORY_MIDDLEWARE,
  FACTORY_MANAGER_TEMPLATE_KEY,
  FACTORY_PLUGIN_LEVEL,
  FACTORY_PLUGIN_NAME,
  FACTORY_TEMPLATE_KEY
} from './constants.js'
import { FACTORY_ROLE_ASSISTANTS } from './factory-assistant-definitions.js'
import {
  FACTORY_MANAGER_TEMPLATE_DEFINITION,
  FACTORY_TEMPLATE_DEFINITION,
  factoryOperationsTemplates
} from './factory-templates.js'

const root = resolve(import.meta.dirname, '../..')

const PLATFORM_EMOJI_AVATARS = new Map([
  ['factory', '1f3ed'],
  ['rotating_light', '1f6a8'],
  ['wrench', '1f527'],
  ['shield', '1f6e1-fe0f'],
  ['calendar', '1f4c6'],
  ['package', '1f4e6'],
  ['compass', '1f9ed'],
  ['construction_worker', '1f477'],
  ['white_check_mark', '2705'],
  ['bar_chart', '1f4ca']
])

describe('Factory Operations plugin contracts', () => {
  it('keeps package, bundle, and runtime identities aligned', () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    const manifest = JSON.parse(readFileSync(resolve(root, '.xpertai-plugin/plugin.json'), 'utf8'))
    expect(manifest.name).toBe(FACTORY_PLUGIN_NAME)
    expect(manifest.name).toBe(packageJson.name)
    expect(manifest.version).toBe(packageJson.version)
    expect(manifest.level).toBe(FACTORY_PLUGIN_LEVEL)
    expect(manifest.artifactNamespace).toBe(FACTORY_ARTIFACT_NAMESPACE)
    expect(manifest.targetAppMeta['data-xpert'].runtime.middlewareProviders).toEqual(Object.values(FACTORY_MIDDLEWARE))
  })

  it('declares one independent Orchestrator and eight single-Agent role Assistant templates', () => {
    const yaml = parse(readFileSync(resolve(root, 'src/factory-operations-assistant.yaml'), 'utf8'))
    expect(yaml.team.options.templateKey).toBe(FACTORY_TEMPLATE_KEY)
    expect(yaml.team.options.workspaceScope).toEqual({ mode: 'project-required' })
    expect(yaml.team.version).toBe('4')
    expect(yaml.team.agent.key).toBe(AGENT_KEYS.coordinator)
    expect(yaml.team.features.opener.questions).toEqual([...FACTORY_TEMPLATE_DEFINITION.startPrompts])

    const agents = yaml.nodes.filter((node: { type: string }) => node.type === 'agent')
    expect(agents).toHaveLength(1)
    expect(agents[0].entity.leaderKey).toBeNull()

    const coordinator = agents.find((node: { entity: { key: string } }) => node.entity.key === AGENT_KEYS.coordinator)
    expect(coordinator.entity.prompt).toContain('independently installed Assistant')

    const middlewareNodes = yaml.nodes.filter((node: { entity?: { type?: string } }) => node.entity?.type === 'middleware')
    expect(middlewareNodes.map((node: { entity: { provider: string } }) => node.entity.provider).sort()).toEqual([
      FACTORY_MIDDLEWARE.coordination,
      FACTORY_MIDDLEWARE.execution
    ].sort())
    expect(yaml.connections.filter((edge: { type: string }) => edge.type === 'agent')).toHaveLength(0)

    const roleTemplates = factoryOperationsTemplates.filter((template) =>
      FACTORY_ROLE_ASSISTANTS.some((definition) => definition.key === template.key)
    )
    expect(roleTemplates).toHaveLength(8)
    for (const definition of FACTORY_ROLE_ASSISTANTS) {
      const contribution = roleTemplates.find((template) => template.key === definition.key)
      expect(contribution?.title).toBe(definition.title)
      expect(contribution?.avatar).toEqual(definition.avatar)
      expect(contribution?.primaryAgentKey).toBe(definition.agentKey)
      expect(contribution?.startPrompts).toEqual([...definition.startPrompts])
      const roleDsl = parse(contribution?.dslContent ?? '')
      expect(roleDsl.team.options.workspaceScope).toEqual({ mode: 'project-required' })
      expect(roleDsl.team.version).toBe('2')
      const roleAgents = roleDsl.nodes.filter((node: { type: string }) => node.type === 'agent')
      expect(roleAgents).toHaveLength(1)
      expect(roleAgents[0].entity.key).toBe(definition.agentKey)
      expect(roleAgents[0].entity.leaderKey).toBeNull()
      expect(roleAgents[0].entity.prompt).toContain('caseId: {{caseId}}')
      expect(roleAgents[0].entity.prompt).toContain('baseRevision: {{baseRevision}}')
      expect(roleAgents[0].entity.prompt).toContain('operationId: {{operationId}}')
      expect(roleAgents[0].entity.prompt).toContain('caseContext: {{caseContext}}')
      expect(roleDsl.connections.filter((edge: { type: string }) => edge.type === 'agent')).toHaveLength(0)
    }
    const suite = JSON.parse(readFileSync(resolve(root, 'blueprints/factory-operations-assistant-suite-v4.json'), 'utf8'))
    expect(suite.schemaVersion).toBe('xpert-assistant-suite@1')
    expect(suite.roles.map((role: { templateKey: string }) => role.templateKey)).toEqual(FACTORY_ROLE_ASSISTANTS.map(({ key }) => key))
    expect(suite.orchestrator.externalRoleKeys).toEqual(suite.roles.map((role: { key: string }) => role.key))
  })

  it('publishes an organization-scoped appConfig for the management Assistant', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, '.xpertai-plugin/plugin.json'), 'utf8'))
    const app = manifest.targetAppMeta['data-xpert'].marketplace.contents.find((item: { type: string; name: string }) => item.type === 'app' && item.name === 'factory-operations')
    const screenshots = ['./assets/screenshot-01.jpg']
    expect(app.appConfig.scope).toBe('organization')
    expect(app.appConfig.assistantTemplateKey).toBe(FACTORY_MANAGER_TEMPLATE_KEY)
    expect(app.appConfig.workspace).toMatchObject({ mode: 'dedicated', sharing: 'organization' })
    expect(app.appConfig.presentation.features).toHaveLength(3)
    expect(app.appConfig.presentation.screenshots).toEqual(screenshots)
    expect(manifest.interface.screenshots).toEqual(screenshots)
    expect(manifest.assets.screenshots).toEqual(screenshots)
    expect(() => readFileSync(resolve(root, screenshots[0]))).not.toThrow()
    expect(app.appConfig.entry).toEqual({ type: 'assistant-chat' })
  })

  it('uses platform-renderable emoji metadata for every Assistant avatar', () => {
    const avatars = [
      FACTORY_TEMPLATE_DEFINITION.avatar,
      FACTORY_MANAGER_TEMPLATE_DEFINITION.avatar,
      ...FACTORY_ROLE_ASSISTANTS.map(({ avatar }) => avatar)
    ]
    for (const { emoji } of avatars) {
      expect(PLATFORM_EMOJI_AVATARS.get(emoji.id)).toBe(emoji.unified)
    }

    const orchestrator = parse(readFileSync(resolve(root, 'src/factory-operations-assistant.yaml'), 'utf8'))
    const manager = parse(readFileSync(resolve(root, 'src/factory-operations-manager.yaml'), 'utf8'))
    expect(orchestrator.team.avatar).toEqual(FACTORY_TEMPLATE_DEFINITION.avatar)
    expect(manager.team.avatar).toEqual(FACTORY_MANAGER_TEMPLATE_DEFINITION.avatar)
  })

  it('declares a separate read-only manager Assistant with the dashboard as its default view', () => {
    const yaml = parse(readFileSync(resolve(root, 'src/factory-operations-manager.yaml'), 'utf8'))
    expect(yaml.team.options.templateKey).toBe(FACTORY_MANAGER_TEMPLATE_KEY)
    expect(yaml.team.options.workspaceScope).toBeUndefined()
    expect(yaml.team.options.workbench).toEqual({
      initialLayout: 'workbench-maximized',
      defaultViewKey: 'factory_ops__factory-operations-dashboard'
    })
    expect(yaml.team.features.opener.questions).toEqual([...FACTORY_MANAGER_TEMPLATE_DEFINITION.startPrompts])
    expect(yaml.nodes.filter((node: { type: string }) => node.type === 'agent')).toHaveLength(1)
    const providers = yaml.nodes
      .filter((node: { entity?: { type?: string } }) => node.entity?.type === 'middleware')
      .map((node: { entity: { provider: string } }) => node.entity.provider)
      .sort()
    expect(providers).toEqual([
      FACTORY_MIDDLEWARE.coordination,
      FACTORY_MIDDLEWARE.monitoring
    ].sort())
    expect(yaml.team.agent.key).toBe('Agent_FactoryOperationsManager')
    expect(yaml.nodes[0].entity.prompt).toContain('read-only Factory Operations Manager')
    expect(yaml.nodes[0].entity.prompt).toContain('Never approve or reject a plan')
  })

  it('registers the dedicated Case workspace in the fixed Workbench slot', () => {
    const providerSource = readFileSync(resolve(root, 'src/lib/factory-view.provider.ts'), 'utf8')
    const manifest = JSON.parse(readFileSync(resolve(root, '.xpertai-plugin/plugin.json'), 'utf8'))
    const view = manifest.targetAppMeta['data-xpert'].marketplace.contents.find(
      (item: { type: string; name: string }) => item.type === 'view' && item.name === FACTORY_CASE_WORKSPACE_VIEW_KEY
    )
    expect(view?.metadata).toMatchObject({ app: 'factory-operations', supportingView: true })
    expect(providerSource).toMatch(/if \(fixed\)[\s\S]*workspaceManifest\(slot\)[\s\S]*dashboardManifest\(slot\)/)
    expect(providerSource).toContain(`view: remoteView(${FACTORY_CASE_WORKSPACE_REMOTE_ENTRY_KEY === 'factory-case-workspace' ? 'FACTORY_CASE_WORKSPACE_REMOTE_ENTRY_KEY' : 'unexpected'})`)
  })
})
