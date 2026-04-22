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
        secret: 'secret-1',
        xpertId: 'xpert-1'
      },
      ...overrides
    } as IIntegration<TIntegrationWeComLongOptions>
  }

  function createFixture() {
    const longConnection = {
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

  it('disconnects runtime with xpert_unbound reason when xpert is removed', async () => {
    const { strategy, longConnection } = createFixture()

    await strategy.onUpdate(createIntegration(), createIntegration({ options: { botId: 'bot-1', secret: 'secret-1' } }))

    expect(longConnection.disconnect).toHaveBeenCalledWith('integration-1', {
      reason: 'xpert_unbound'
    })
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
})
