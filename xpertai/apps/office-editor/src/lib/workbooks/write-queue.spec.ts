import { WorkbookWriteQueue } from './write-queue'
import { AsyncLocalStorage } from 'node:async_hooks'

function blocked() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
const tick = () => new Promise<void>(resolve => setImmediate(resolve))

it('retains each queued caller identity instead of inheriting the previous writer context', async () => {
  const context = new AsyncLocalStorage<string>(), queue = new WorkbookWriteQueue(), first = blocked()
  const a = context.run('owner', () => queue.run('doc', 1, () => first.promise))
  const b = context.run('editor', () => queue.run('doc', 1, async () => {
    expect(context.getStore()).toBe('editor'); await tick(); expect(context.getStore()).toBe('editor')
  }))
  first.resolve(); await Promise.all([a, b])
})

it('serializes each document, allows a second document and releases slots on failure', async () => {
  const queue = new WorkbookWriteQueue(), first = blocked(), events: string[] = []
  const a = queue.run('a', 1, async () => { events.push('a1'); await first.promise; throw new Error('rollback') })
  const aFailure = expect(a).rejects.toThrow('rollback')
  const next = queue.run('a', 1, async () => { events.push('a2') })
  const b = queue.run('b', 1, async () => { events.push('b') })
  await tick(); expect(events).toEqual(['a1', 'b'])
  first.resolve(); await Promise.all([aFailure, next, b]); expect(events).toEqual(['a1', 'b', 'a2'])
})

it('bounds pending count and bytes without starting excess transactions', async () => {
  const queue = new WorkbookWriteQueue(), first = blocked(), work = jest.fn(async () => undefined)
  const running = queue.run('a', 1, () => first.promise)
  const pending = Array.from({ length: 64 }, () => queue.run('a', 1, work))
  await expect(queue.run('a', 1, work)).rejects.toThrow('office.workbook_busy')
  expect(work).not.toHaveBeenCalled(); first.resolve(); await Promise.all([running, ...pending])
  const held = blocked(), active = queue.run('b', 1, () => held.promise)
  const large = queue.run('b', 32 * 1024 * 1024, work)
  await expect(queue.run('b', 1, work)).rejects.toThrow('office.workbook_busy')
  held.resolve(); await Promise.all([active, large])
})

it('keeps 100 concurrent writes below two active transactions without losing work', async () => {
  const queue = new WorkbookWriteQueue(); let active = 0, maximum = 0, finished = 0
  for (let batch = 0; batch < 2; batch++) await Promise.all(Array.from({ length: 50 }, (_, i) => queue.run(String(i), 20, async () => {
    active++; maximum = Math.max(active, maximum); await tick(); active--; finished++
  })))
  expect(maximum).toBe(2); expect(finished).toBe(100)
})
