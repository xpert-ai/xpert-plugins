jest.mock('@metad/contracts', () => ({
  getAgentMiddlewareNodes: jest.fn((graph, agentKey) =>
    (graph.connections ?? [])
      .filter((connection) => connection.type === 'workflow' && connection.from === agentKey)
      .map((connection) => graph.nodes.find((node) => node.key === connection.to))
      .filter(Boolean)
  )
}))

import { ViewImageValidator } from './view-image.validator.js'
import { VIEW_IMAGE_MIDDLEWARE_NAME } from './view-image.types.js'

describe('ViewImageValidator', () => {
  const validator = new ViewImageValidator()

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
          key: 'view-image',
          type: 'workflow',
          entity: {
            type: 'middleware',
            provider: VIEW_IMAGE_MIDDLEWARE_NAME
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
          key: 'connection-view-image',
          from: 'agent-1',
          to: 'view-image',
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

  it('warns when sandbox support is disabled', () => {
    const items = validator.handle({
      draft: createDraft({
        sandboxEnabled: false,
        includeSandboxShell: true
      })
    } as any)

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'VIEW_IMAGE_SANDBOX_DISABLED',
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
          ruleCode: 'VIEW_IMAGE_SANDBOX_SHELL_MISSING',
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
