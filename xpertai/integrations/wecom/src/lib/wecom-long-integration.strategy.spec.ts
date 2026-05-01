import { IIntegration } from '@metad/contracts'
import { WeComLongIntegrationStrategy } from './wecom-long-integration.strategy.js'
import { TIntegrationWeComLongOptions } from './types.js'

describe('WeComLongIntegrationStrategy', () => {
  function createIntegration(
    overrides?: Partial<IIntegration<TIntegrationWeComLongOptions>> & { enabled?: boolean }
  ) {
    return {
      id: 'integration-1',
      provider: 'wecom_long',
      enabled: true,
      options: {
        botId: 'bot-1',
        secret: 'secret-1'
      },
      ...overrides
    } as IIntegration<TIntegrationWeComLongOptions>
  }

  function createFixture() {
    const longConnection = {
      hasRoutingTarget: jest.fn().mockResolvedValue(true),
      connectWithConfig: jest.fn().mockResolvedValue(undefined),
      reconnect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }

    return {
      longConnection,
      strategy: new WeComLongIntegrationStrategy(longConnection as any)
    }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('disconnects runtime with integration_disabled reason when integration is disabled', async () => {
    const { strategy, longConnection } = createFixture()

    await strategy.onUpdate(createIntegration(), createIntegration({ enabled: false }))

    expect(longConnection.disconnect).toHaveBeenCalledWith('integration-1', {
      reason: 'integration_disabled'
    })
  })

  it('disconnects runtime with xpert_unbound reason when trigger binding is missing', async () => {
    const { strategy, longConnection } = createFixture()
    longConnection.hasRoutingTarget.mockResolvedValue(false)

    await strategy.onUpdate(createIntegration(), createIntegration({ options: { botId: 'bot-1', secret: 'secret-1' } }))

    expect(longConnection.disconnect).toHaveBeenCalledWith('integration-1', {
      reason: 'xpert_unbound'
    })
  })

  it('keeps runtime restorable when trigger binding provides the routing target', async () => {
    const { strategy, longConnection } = createFixture()
    longConnection.hasRoutingTarget
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)

    await strategy.onUpdate(createIntegration(), createIntegration({ options: { botId: 'bot-1', secret: 'secret-1' } }))

    expect(longConnection.disconnect).not.toHaveBeenCalled()
    expect(longConnection.reconnect).not.toHaveBeenCalled()
  })

  it('reconnects runtime when integration becomes restorable again', async () => {
    const { strategy, longConnection } = createFixture()

    await strategy.onUpdate(
      createIntegration({ enabled: false, options: { botId: 'bot-1', secret: 'secret-1' } }),
      createIntegration()
    )

    expect(longConnection.reconnect).toHaveBeenCalledWith('integration-1')
  })

  it('clears runtime status on delete', async () => {
    const { strategy, longConnection } = createFixture()

    await strategy.onDelete(createIntegration())

    expect(longConnection.disconnect).toHaveBeenCalledWith('integration-1', {
      clearStatus: true
    })
  })

  it('connects with config when trigger binding satisfies the routing target', async () => {
    const { strategy, longConnection } = createFixture()
    longConnection.hasRoutingTarget.mockResolvedValue(true)

    await strategy.validateConfig(
      {
        botId: 'bot-1',
        secret: 'secret-1'
      },
      createIntegration({ options: { botId: 'bot-1', secret: 'secret-1' } })
    )

    expect(longConnection.connectWithConfig).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      botId: 'bot-1',
      secret: 'secret-1',
      wsOrigin: undefined,
      timeoutMs: undefined
    })
    expect(longConnection.disconnect).not.toHaveBeenCalled()
  })

  it('does not expose xpertId in the long-connection integration schema', () => {
    const { strategy } = createFixture()

    expect((strategy.meta.schema?.properties as Record<string, unknown>)?.xpertId).toBeUndefined()
  })
})
