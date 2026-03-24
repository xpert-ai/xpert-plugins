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

import { MarkItDownSkillValidator } from './markitdown.validator.js'
import { MARKITDOWN_SKILL_MIDDLEWARE_NAME } from './markitdown.types.js'

describe('MarkItDownSkillValidator', () => {
  let validator: MarkItDownSkillValidator

  beforeEach(() => {
    validator = new MarkItDownSkillValidator()
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
            ...middlewareNodes.map((n) => ({ key: n.key, type: n.type }))
          ],
          connections: middlewareNodes.map((n) => ({
            from: agentKey,
            to: n.key,
            type: 'middleware'
          }))
        }
      } as any
    }
  }

  it('should return no items when no MarkItDownSkill middleware is present', () => {
    const event = makeDraft({ sandboxEnabled: true, middlewares: ['SandboxShell'] })
    const items = validator.handle(event)
    expect(items).toEqual([])
  })

  it('should warn when sandbox is disabled', () => {
    const event = makeDraft({
      sandboxEnabled: false,
      middlewares: [MARKITDOWN_SKILL_MIDDLEWARE_NAME, 'SandboxShell']
    })
    const items = validator.handle(event)
    const sandboxWarning = items.find((i) => i.ruleCode === 'MARKITDOWN_SKILL_SANDBOX_DISABLED')
    expect(sandboxWarning).toBeDefined()
    expect(sandboxWarning!.level).toBe('warning')
  })

  it('should warn when SandboxShell is missing', () => {
    const event = makeDraft({
      sandboxEnabled: true,
      middlewares: [MARKITDOWN_SKILL_MIDDLEWARE_NAME]
    })
    const items = validator.handle(event)
    const shellWarning = items.find((i) => i.ruleCode === 'MARKITDOWN_SKILL_SANDBOX_SHELL_MISSING')
    expect(shellWarning).toBeDefined()
    expect(shellWarning!.level).toBe('warning')
  })

  it('should return both warnings when sandbox disabled and shell missing', () => {
    const event = makeDraft({
      sandboxEnabled: false,
      middlewares: [MARKITDOWN_SKILL_MIDDLEWARE_NAME]
    })
    const items = validator.handle(event)
    expect(items.length).toBe(2)
  })

  it('should return no warnings when properly configured', () => {
    const event = makeDraft({
      sandboxEnabled: true,
      middlewares: [MARKITDOWN_SKILL_MIDDLEWARE_NAME, 'SandboxShell']
    })
    const items = validator.handle(event)
    expect(items).toEqual([])
  })
})
