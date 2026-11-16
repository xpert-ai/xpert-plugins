import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LibraryPager } from '../remote/library-pager.js'

test('merges both streams across server pages without placing older rows before unseen newer rows', async () => {
  const calls = [0, 0]
  const source = (index: number, values: number[]) => async (cursor?: string) => {
    calls[index]++
    const offset = Number(cursor ?? 0), items = values.slice(offset, offset + 3)
    return { items, hasMore: offset + items.length < values.length, nextCursor: String(offset + items.length) }
  }
  const pager = new LibraryPager([source(0, [100, 99, 98, 97, 96, 95, 94]), source(1, [93, 92, 91, 90])], (a, b) => b - a)
  const first = await pager.next(3)
  assert.deepEqual(first.items, [100, 99, 98]); assert.deepEqual(calls, [1, 1])
  const second = await pager.next(3)
  assert.deepEqual(second.items, [97, 96, 95]); assert.equal(second.hasMore, true)
  assert.deepEqual((await pager.next(3)).items, [94, 93, 92])
  assert.deepEqual(await pager.next(3), { items: [91, 90], hasMore: false })
})

test('does not silently loop when a server reports more without an advancing cursor', async () => {
  const pager = new LibraryPager([async () => ({ items: [1], hasMore: true })], (a, b) => b - a)
  await assert.rejects(pager.next(), /invalid_cursor/)
})

test('retries a failed refill without dropping rows already consumed from either stream', async () => {
  let fail = true
  const reader = (values: number[], failing = false) => async (cursor?: string) => {
    const offset = Number(cursor ?? 0)
    if (failing && offset === 2 && fail) { fail = false; throw new Error('temporary failure') }
    return { items: values.slice(offset, offset + 2), hasMore: offset + 2 < values.length, nextCursor: String(offset + 2) }
  }
  const pager = new LibraryPager([reader([9, 7, 5, 3], true), reader([8, 6, 4, 2])], (a, b) => b - a)
  assert.deepEqual((await pager.next(2)).items, [9, 8])
  await assert.rejects(pager.next(4), /temporary failure/)
  assert.deepEqual((await pager.next(4)).items, [7, 6, 5, 4])
  assert.deepEqual(await pager.next(4), { items: [3, 2], hasMore: false })
})

test('serializes concurrent next calls without returning duplicate rows', async () => {
  const pager = new LibraryPager([async (cursor?: string) => {
    const offset = Number(cursor ?? 0)
    return { items: [4, 3, 2, 1].slice(offset, offset + 2), hasMore: offset < 2, nextCursor: String(offset + 2) }
  }], (a, b) => b - a)
  assert.deepEqual(await Promise.all([pager.next(2), pager.next(2)]), [
    { items: [4, 3], hasMore: true }, { items: [2, 1], hasMore: false }
  ])
})
