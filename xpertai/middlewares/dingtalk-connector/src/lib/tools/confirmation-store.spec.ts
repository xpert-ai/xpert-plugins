import { DingTalkConfirmationStore } from './confirmation-store.js'

describe('DingTalkConfirmationStore', () => {
  afterEach(() => jest.useRealTimers())

  it('binds a one-time handle to the connector and exact message', () => {
    const store = new DingTalkConfirmationStore()
    const message = { recipientId: 'user-1', content: 'Hello' }
    const confirmation = store.create('connector-1', message)

    expect(() => store.take(confirmation.handle, 'connector-1', message)).not.toThrow()
    expect(() => store.take(confirmation.handle, 'connector-1', message)).toThrow('expired')
  })

  it('consumes and rejects a handle when message content changes', () => {
    const store = new DingTalkConfirmationStore()
    const confirmation = store.create('connector-1', { content: 'Original' })

    expect(() => store.take(confirmation.handle, 'connector-1', { content: 'Changed' })).toThrow('does not match')
  })

  it('expires confirmation handles after five minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-27T00:00:00Z'))
    const store = new DingTalkConfirmationStore()
    const confirmation = store.create('connector-1', { content: 'Hello' })
    jest.advanceTimersByTime(5 * 60 * 1_000 + 1)

    expect(() => store.take(confirmation.handle, 'connector-1', { content: 'Hello' })).toThrow('expired')
  })
})
