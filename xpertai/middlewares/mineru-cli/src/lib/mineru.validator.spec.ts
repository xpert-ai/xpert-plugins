jest.mock('@xpert-ai/plugin-sdk', () => ({}))
jest.mock('@metad/contracts', () => ({
  getAgentMiddlewareNodes: jest.fn((draft: any, agentKey: string) => {
    const connections = draft.graph?.connections ?? []
    return connections
      .filter((c: any) => c.from === agentKey && c.type === 'middleware')
      .map((c: any) => draft.nodes.find((n: any) => n.key === c.to))
      .filter(Boolean)
  })
}))

import { MINERU_CLI_SKILL_MIDDLEWARE_NAME } from './mineru-cli.types.js'
import { MinerUSkillValidator } from './mineru.validator.js'

describe('MinerUSkillValidator', () => {
  let validator: MinerUSkillValidator

  beforeEach(() => {
    validator = new MinerUSkillValidator()
  })

  function makeDraft(options: {
    sandboxEnabled?: boolean
    middlewares?: string[]
  }) {
    const { sandboxEnabled = false, middlewares = [] } = options
    const agentKey = 'agent-1'
    const middlewareNodes = middlewares.map((provider, i) => ({
      key: `mw-${i}`,
      type: 'workflow' as const,
      entity: { provider } as any
    }))
    return {
      draft: {
        team: {
          features: {
            sandbox: { enabled: sandboxEnabled }
          }
        },
        nodes: [
          { key: agentKey, type: 'agent' as const },
          ...middlewareNodes
        ],
        graph: {
          nodes: [
            { key: agentKey, type: 'agent' },
            ...middlewareNodes.map((node) => ({ key: node.key, type: node.type }))
          ],
          connections: middlewareNodes.map((node) => ({
            from: agentKey,
            to: node.key,
            type: 'middleware'
          }))
        }
      } as any
    }
  }

  it('returns no items when MinerUCLISkill is absent', () => {
    const items = validator.handle(makeDraft({ sandboxEnabled: true, middlewares: ['SandboxShell'] }))
    expect(items).toEqual([])
  })

  it('warns when sandbox is disabled', () => {
    const items = validator.handle(
      makeDraft({ sandboxEnabled: false, middlewares: [MINERU_CLI_SKILL_MIDDLEWARE_NAME, 'SandboxShell'] })
    )
    expect(items.find((item) => item.ruleCode === 'MINERU_CLI_SKILL_SANDBOX_DISABLED')).toBeDefined()
  })

  it('warns when SandboxShell is missing', () => {
    const items = validator.handle(
      makeDraft({ sandboxEnabled: true, middlewares: [MINERU_CLI_SKILL_MIDDLEWARE_NAME] })
    )
    expect(items.find((item) => item.ruleCode === 'MINERU_CLI_SKILL_SANDBOX_SHELL_MISSING')).toBeDefined()
  })

  it('returns no warnings when properly configured', () => {
    const items = validator.handle(
      makeDraft({ sandboxEnabled: true, middlewares: [MINERU_CLI_SKILL_MIDDLEWARE_NAME, 'SandboxShell'] })
    )
    expect(items).toEqual([])
  })
})
