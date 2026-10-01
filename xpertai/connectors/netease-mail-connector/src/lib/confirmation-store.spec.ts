import { NeteaseMailConfirmationStore, confirmationFingerprint } from './confirmation-store.js'

describe('NeteaseMailConfirmationStore', () => {
  afterEach(() => jest.useRealTimers())

  it('binds a one-use handle to connector, operation, and exact arguments', () => {
    const store = new NeteaseMailConfirmationStore()
    const argumentsValue = { to: ['alice@example.com'], subject: 'Hello' }
    const created = store.create({ connectorId: 'connector-1', operation: 'send', arguments: argumentsValue })
    expect(created.handle).toMatch(/^[0-9a-f-]{36}$/)
    expect(() =>
      store.take({
        handle: created.handle,
        connectorId: 'connector-1',
        operation: 'send',
        arguments: argumentsValue
      })
    ).not.toThrow()
    expect(() =>
      store.take({
        handle: created.handle,
        connectorId: 'connector-1',
        operation: 'send',
        arguments: argumentsValue
      })
    ).toThrow('MAIL_CONFIRMATION_EXPIRED')
  })

  it('consumes and rejects a changed operation', () => {
    const store = new NeteaseMailConfirmationStore()
    const created = store.create({
      connectorId: 'connector-1',
      operation: 'send',
      arguments: { subject: 'Original' }
    })
    expect(() =>
      store.take({
        handle: created.handle,
        connectorId: 'connector-1',
        operation: 'send',
        arguments: { subject: 'Changed' }
      })
    ).toThrow('MAIL_CONFIRMATION_INVALID')
  })

  it('expires handles after five minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T00:00:00Z'))
    const store = new NeteaseMailConfirmationStore()
    const created = store.create({ connectorId: 'c', operation: 'reply', arguments: { messageRef: 'm' } })
    jest.advanceTimersByTime(5 * 60 * 1_000 + 1)
    expect(() =>
      store.take({
        handle: created.handle,
        connectorId: 'c',
        operation: 'reply',
        arguments: { messageRef: 'm' }
      })
    ).toThrow('MAIL_CONFIRMATION_EXPIRED')
  })

  it('fingerprints object keys deterministically', () => {
    expect(confirmationFingerprint({ a: 1, b: { c: 2 } })).toBe(confirmationFingerprint({ b: { c: 2 }, a: 1 }))
  })
})
