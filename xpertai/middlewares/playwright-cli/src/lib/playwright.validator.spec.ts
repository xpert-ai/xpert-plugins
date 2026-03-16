jest.mock('@metad/contracts', () => ({
  getAgentMiddlewareNodes: jest.fn((graph, agentKey) =>
    (graph.connections ?? [])
      .filter((connection) => connection.type === 'workflow' && connection.from === agentKey)
      .map((connection) => graph.nodes.find((node) => node.key === connection.to))
      .filter(Boolean)
  )
}))

import { PlaywrightCLISkillValidator } from './playwright.validator.js'
import { PLAYWRIGHT_CLI_SKILL_MIDDLEWARE_NAME } from './playwright.types.js'

describe('PlaywrightCLISkillValidator', () => {
  const validator = new PlaywrightCLISkillValidator()

  function createDraft(options?: { sandboxEnabled?: boolean; includeSandboxShell?: boolean }) {
    const sandboxEnabled = options?.sandboxEnabled ?? true
    const includeSandboxShell = options?.includeSandboxShell ?? true

    return {
      team: {
        features: {
          sandbox: {
            enabled: sandboxEnabled
          }
        }
      },
      nodes: [
        {
          key: 'agent-1',
          type: 'agent',
          entity: {}
        },
        {
          key: 'playwright-skill',
          type: 'workflow',
          entity: {
            type: 'middleware',
            provider: PLAYWRIGHT_CLI_SKILL_MIDDLEWARE_NAME
          }
        },
        ...(includeSandboxShell
          ? [
              {
                key: 'sandbox-shell',
                type: 'workflow',
                entity: {
                  type: 'middleware',
                  provider: 'SandboxShell'
                }
              }
            ]
          : [])
      ],
      connections: [
        {
          key: 'connection-playwright',
          from: 'agent-1',
          to: 'playwright-skill',
          type: 'workflow'
        },
        ...(includeSandboxShell
          ? [
              {
                key: 'connection-shell',
                from: 'agent-1',
                to: 'sandbox-shell',
                type: 'workflow'
              }
            ]
          : [])
      ]
    }
  }

  it('warns when the Playwright skill is used without sandbox support', () => {
    const items = validator.handle({
      draft: createDraft({
        sandboxEnabled: false,
        includeSandboxShell: true
      })
    } as any)

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'PLAYWRIGHT_SKILL_SANDBOX_DISABLED',
          level: 'warning'
        })
      ])
    )
  })

  it('warns when SandboxShell is missing on the same agent', () => {
    const items = validator.handle({
      draft: createDraft({
        sandboxEnabled: true,
        includeSandboxShell: false
      })
    } as any)

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'PLAYWRIGHT_SKILL_SANDBOX_SHELL_MISSING',
          level: 'warning'
        })
      ])
    )
  })

  it('returns no warnings when sandbox and SandboxShell are both available', () => {
    const items = validator.handle({
      draft: createDraft({
        sandboxEnabled: true,
        includeSandboxShell: true
      })
    } as any)

    expect(items).toEqual([])
  })
})
