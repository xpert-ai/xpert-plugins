import { QqMailConfirmationStore } from './confirmation-store.js'

describe('QqMailConfirmationStore', () => {
  afterEach(() => jest.useRealTimers())

  it('binds a one-time provider token to connector, operation, and exact arguments', () => {
    const store = new QqMailConfirmationStore()
    const args = { alias_id: 'alias-1', to: [{ email: 'a@example.com' }], subject: 'Hello' }
    const created = store.create({
      connectorId: 'connector-1',
      operation: 'send',
      arguments: args,
      providerToken: 'ctk-secret'
    })
    expect(created.handle).not.toContain('ctk-secret')
    expect(store.take({ handle: created.handle, connectorId: 'connector-1', operation: 'send', arguments: args })).toBe(
      'ctk-secret'
    )
    expect(() =>
      store.take({ handle: created.handle, connectorId: 'connector-1', operation: 'send', arguments: args })
    ).toThrow('expired')
  })

  it('consumes and rejects a handle when operation arguments differ', () => {
    const store = new QqMailConfirmationStore()
    const created = store.create({
      connectorId: 'connector-1',
      operation: 'send',
      arguments: { subject: 'Original' },
      providerToken: 'ctk-secret'
    })
    expect(() =>
      store.take({
        handle: created.handle,
        connectorId: 'connector-1',
        operation: 'send',
        arguments: { subject: 'Changed' }
      })
    ).toThrow('does not match')
  })

  it('expires handles after five minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T00:00:00Z'))
    const store = new QqMailConfirmationStore()
    const created = store.create({
      connectorId: 'c',
      operation: 'delete',
      arguments: { message_id: 'm' },
      providerToken: 'ctk'
    })
    jest.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(() =>
      store.take({ handle: created.handle, connectorId: 'c', operation: 'delete', arguments: { message_id: 'm' } })
    ).toThrow('expired')
  })
})
