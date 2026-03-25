jest.mock('@metad/contracts', () => ({
  getAgentMiddlewareNodes: jest.fn((graph, agentKey) =>
    (graph.connections ?? [])
      .filter((connection) => connection.type === 'workflow' && connection.from === agentKey)
      .map((connection) => graph.nodes.find((node) => node.key === connection.to))
      .filter(Boolean)
  )
}))

import { ZipUnzipCLISkillValidator } from './zip-unzip.validator.js'
import { ZIP_UNZIP_SKILL_MIDDLEWARE_NAME } from './zip-unzip.types.js'

describe('ZipUnzipCLISkillValidator', () => {
  const validator = new ZipUnzipCLISkillValidator()

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
          key: 'zip-unzip-skill',
          type: 'workflow',
          entity: {
            type: 'middleware',
            provider: ZIP_UNZIP_SKILL_MIDDLEWARE_NAME
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
          key: 'connection-zip-unzip',
          from: 'agent-1',
          to: 'zip-unzip-skill',
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
          ruleCode: 'ZIP_UNZIP_SKILL_SANDBOX_DISABLED',
          level: 'warning'
        })
      ])
    )
  })

  it('warns when SandboxShell is missing', () => {
    const items = validator.handle({
      draft: createDraft({
        sandboxEnabled: true,
        includeSandboxShell: false
      })
    } as any)

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'ZIP_UNZIP_SKILL_SANDBOX_SHELL_MISSING',
          level: 'warning'
        })
      ])
    )
  })

  it('returns no warnings when sandbox and SandboxShell are present', () => {
    const items = validator.handle({
      draft: createDraft({
        sandboxEnabled: true,
        includeSandboxShell: true
      })
    } as any)

    expect(items).toEqual([])
  })
})
