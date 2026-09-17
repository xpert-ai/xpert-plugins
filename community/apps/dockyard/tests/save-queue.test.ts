import test from 'node:test'
import assert from 'node:assert/strict'
import { SaveQueue } from '../src/lib/remote/save-queue.js'

test('a save requested just after an idle flush persists the new value before resolving', async () => {
  const persisted: string[] = []
  const queue = new SaveQueue(1, 'old', async value => {
    persisted.push(value)
    return { revision: 2 }
  })
  const idle = queue.flush()
  queue.set('new')
  assert.equal(queue.state, 'dirty')
  const save = queue.flush()
  await Promise.all([idle, save])
  assert.deepEqual(persisted, ['new'])
  assert.equal(queue.revision, 2)
  assert.equal(queue.state, 'saved')
})

test('edits made during a save remain dirty and are saved in order with the acknowledged revision', async () => {
  const calls: { value: string; revision: number }[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const queue = new SaveQueue(1, 'old', async (value, revision) => {
    calls.push({ value, revision })
    if (calls.length === 1) await gate
    return { revision: revision + 1 }
  })
  queue.set('first')
  const saving = queue.flush()
  assert.equal(queue.state, 'saving')
  queue.set('newer')
  release()
  await saving
  assert.deepEqual(calls, [{ value: 'first', revision: 1 }, { value: 'newer', revision: 2 }])
  assert.equal(queue.revision, 3)
  assert.equal(queue.state, 'saved')
})

test('failure keeps revision and pending content; explicit retry saves the newest edit', async () => {
  let fail = true
  const calls: string[] = []
  const queue = new SaveQueue(2, 'old', async (value, revision) => {
    if (fail) throw new Error('network_error')
    calls.push(value)
    return { revision: revision + 1 }
  })
  queue.set('first')
  await assert.rejects(queue.flush(), /network_error/)
  assert.equal(queue.state, 'error')
  assert.equal(queue.revision, 2)
  queue.set('newer')
  assert.equal(queue.state, 'error')
  fail = false
  await queue.flush()
  assert.deepEqual(calls, ['newer'])
  assert.equal(queue.revision, 3)
})
