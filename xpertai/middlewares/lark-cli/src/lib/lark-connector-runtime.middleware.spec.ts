jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined
}))

import { LarkConnectorRuntimeMiddleware } from './lark-connector-runtime.middleware.js'
import { LARK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME, LarkAuthMode } from './lark-cli.types.js'

describe('LarkConnectorRuntimeMiddleware', () => {
  it('is hidden from user-addable middleware lists', () => {
    const strategy = new LarkConnectorRuntimeMiddleware({ createMiddleware: jest.fn() } as any)

    expect(strategy.meta.name).toBe(LARK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME)
    expect(strategy.meta.builtin).toBe(true)
    expect(strategy.meta.configSchema).toEqual({
      type: 'object',
      properties: {}
    })
  })

  it('delegates connector runtime to Lark CLI connector mode', () => {
    const delegated = {
      name: 'LarkCLISkill',
      tools: []
    }
    const larkCliMiddleware = {
      createMiddleware: jest.fn().mockReturnValue(delegated)
    }
    const context = { workspaceId: 'workspace-1' }
    const strategy = new LarkConnectorRuntimeMiddleware(larkCliMiddleware as any)

    const middleware = strategy.createMiddleware(
      {
        provider: 'lark',
        connectorId: ' connector-1 '
      },
      context as any
    )

    expect(larkCliMiddleware.createMiddleware).toHaveBeenCalledWith(
      {
        authMode: LarkAuthMode.CONNECTOR,
        connectorId: 'connector-1'
      },
      context
    )
    expect(middleware).toEqual({
      ...delegated,
      name: LARK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME
    })
  })

  it('delegates without a connector id so the platform resolves the active workspace connector', () => {
    const delegated = {
      name: 'LarkCLISkill'
    }
    const larkCliMiddleware = {
      createMiddleware: jest.fn().mockReturnValue(delegated)
    }
    const context = { workspaceId: 'workspace-1' }
    const strategy = new LarkConnectorRuntimeMiddleware(larkCliMiddleware as any)

    expect(strategy.createMiddleware({ provider: 'lark' }, context as any)).toEqual({
      ...delegated,
      name: LARK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME
    })
    expect(larkCliMiddleware.createMiddleware).toHaveBeenCalledWith(
      {
        authMode: LarkAuthMode.CONNECTOR
      },
      context
    )
  })
})
