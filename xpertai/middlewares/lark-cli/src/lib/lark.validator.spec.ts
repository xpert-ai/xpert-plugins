import type { TXpertTeamDraft } from '@metad/contracts'
import {
  CONNECTOR_MIDDLEWARE_NAME,
  LARK_CONNECTOR_PROVIDER,
  LarkAuthMode,
  LARK_CLI_SKILL_MIDDLEWARE_NAME
} from './lark-cli.types.js'
import { LarkSkillValidator } from './lark.validator.js'

jest.mock('@metad/contracts', () => ({
  getAgentMiddlewareNodes: (draft: TXpertTeamDraft, agentKey: string) =>
    draft.connections
      .filter((connection) => connection.from === agentKey && connection.type === 'agent')
      .map((connection) => draft.nodes.find((node) => node.key === connection.to))
      .filter(Boolean)
}))

describe('LarkSkillValidator', () => {
  it('uses the workspace id from draft.team for connector mode validation', () => {
    const validator = new LarkSkillValidator()

    const items = validator.handle({
      draft: createDraft({
        workspaceId: 'workspace-1',
        larkOptions: {
          authMode: LarkAuthMode.CONNECTOR,
          connectorId: 'connector-1'
        }
      })
    })

    expect(items.map((item) => item.ruleCode)).not.toContain('LARK_CLI_SKILL_CONNECTOR_WORKSPACE_MISSING')
  })

  it('does not require a connector id in connector mode', () => {
    const validator = new LarkSkillValidator()

    const items = validator.handle({
      draft: createDraft({
        workspaceId: 'workspace-1',
        larkOptions: {
          authMode: LarkAuthMode.CONNECTOR
        }
      })
    })

    expect(items.map((item) => item.ruleCode)).not.toContain('LARK_CLI_SKILL_CONNECTOR_ID_MISSING')
  })

  it('validates the generic connector middleware as a Feishu connector runtime', () => {
    const validator = new LarkSkillValidator()

    const items = validator.handle({
      draft: createDraft({
        workspaceId: 'workspace-1',
        connectorOptions: {
          provider: LARK_CONNECTOR_PROVIDER,
          connectorId: 'connector-1'
        }
      })
    })

    expect(items.map((item) => item.ruleCode)).not.toContain('CONNECTOR_MIDDLEWARE_CONNECTOR_WORKSPACE_MISSING')
    expect(items.map((item) => item.ruleCode)).not.toContain('CONNECTOR_MIDDLEWARE_CONNECTOR_ID_MISSING')
  })

  it('does not require a connector id for the generic connector middleware', () => {
    const validator = new LarkSkillValidator()

    const items = validator.handle({
      draft: createDraft({
        workspaceId: 'workspace-1',
        connectorOptions: {
          provider: LARK_CONNECTOR_PROVIDER
        }
      })
    })

    expect(items.map((item) => item.ruleCode)).not.toContain('CONNECTOR_MIDDLEWARE_CONNECTOR_ID_MISSING')
  })

  it('does not validate a connector middleware without an explicit provider as a Feishu runtime', () => {
    const validator = new LarkSkillValidator()

    const items = validator.handle({
      draft: createDraft({
        connectorOptions: {}
      })
    })

    expect(items.map((item) => item.ruleCode)).not.toContain('CONNECTOR_MIDDLEWARE_CONNECTOR_WORKSPACE_MISSING')
  })
})

function createDraft(input: {
  workspaceId?: string
  larkOptions?: Record<string, unknown>
  connectorOptions?: Record<string, unknown>
}): TXpertTeamDraft {
  const nodes: any[] = [
    {
      key: 'agent-1',
      type: 'agent',
      entity: {}
    },
    {
      key: 'sandbox-shell-1',
      type: 'workflow',
      entity: {
        provider: 'SandboxShell'
      }
    }
  ]
  const connections: any[] = [
    {
      from: 'agent-1',
      to: 'sandbox-shell-1',
      type: 'agent'
    }
  ]

  if (input.larkOptions) {
    nodes.push({
      key: 'lark-cli-1',
      type: 'workflow',
      entity: {
        provider: LARK_CLI_SKILL_MIDDLEWARE_NAME,
        options: input.larkOptions
      }
    })
    connections.push({
      from: 'agent-1',
      to: 'lark-cli-1',
      type: 'agent'
    })
  }

  if (input.connectorOptions) {
    nodes.push({
      key: 'connector-1',
      type: 'workflow',
      entity: {
        provider: CONNECTOR_MIDDLEWARE_NAME,
        options: input.connectorOptions
      }
    })
    connections.push({
      from: 'agent-1',
      to: 'connector-1',
      type: 'agent'
    })
  }

  return {
    team: {
      workspaceId: input.workspaceId,
      features: {
        sandbox: {
          enabled: true
        }
      }
    },
    nodes,
    connections
  } as TXpertTeamDraft
}
