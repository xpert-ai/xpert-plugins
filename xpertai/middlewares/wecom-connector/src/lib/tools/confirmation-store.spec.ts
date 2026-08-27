import { WeComConfirmationStore } from './confirmation-store.js'

describe('WeComConfirmationStore', () => {
  afterEach(() => jest.useRealTimers())

  it('binds a one-time handle to connector, operation, and exact arguments', () => {
    const store = new WeComConfirmationStore()
    const args = { userIds: ['user-1'], content: 'Hello' }
    const created = store.create({ connectorId: 'connector-1', operation: 'send', arguments: args })

    expect(() =>
      store.take({ handle: created.handle, connectorId: 'connector-1', operation: 'send', arguments: args })
    ).not.toThrow()
    expect(() =>
      store.take({ handle: created.handle, connectorId: 'connector-1', operation: 'send', arguments: args })
    ).toThrow('expired')
  })

  it('expires handles after five minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-27T00:00:00Z'))
    const store = new WeComConfirmationStore()
    const created = store.create({ connectorId: 'c', operation: 'recall', arguments: { messageId: 'm' } })
    jest.advanceTimersByTime(5 * 60 * 1000 + 1)

    expect(() =>
      store.take({
        handle: created.handle,
        connectorId: 'c',
        operation: 'recall',
        arguments: { messageId: 'm' }
      })
    ).toThrow('expired')
  })
})
