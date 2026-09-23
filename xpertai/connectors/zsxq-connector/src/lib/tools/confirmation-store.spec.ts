import { ZsxqConnectorError } from '../errors.js'
import { ZsxqConfirmationStore, confirmationFingerprint } from './confirmation-store.js'

describe('ZsxqConfirmationStore', () => {
  const identity = {
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'user',
    workspaceId: 'workspace',
    connectorId: 'connector'
  }

  it('binds a handle to exact identity, operation, and arguments and consumes it once', () => {
    const store = new ZsxqConfirmationStore()
    const created = store.create({
      ...identity,
      operation: 'create_topic',
      arguments: { groupId: '12', text: 'hello' }
    })
    expect(confirmationFingerprint({ a: 1, b: 2 })).toBe(confirmationFingerprint({ b: 2, a: 1 }))
    store.take({
      ...identity,
      operation: 'create_topic',
      arguments: { text: 'hello', groupId: '12' },
      handle: created.handle
    })
    expect(() =>
      store.take({
        ...identity,
        operation: 'create_topic',
        arguments: { groupId: '12', text: 'hello' },
        handle: created.handle
      })
    ).toThrow(ZsxqConnectorError)
  })

  it('rejects a changed argument or identity before execution', () => {
    const store = new ZsxqConfirmationStore()
    const created = store.create({ ...identity, operation: 'delete_note', arguments: { noteId: '88' } })
    expect(() =>
      store.take({
        ...identity,
        userId: 'other-user',
        operation: 'delete_note',
        arguments: { noteId: '88' },
        handle: created.handle
      })
    ).toThrow(/does not match/)
  })
})
