import { axisIdentity, axisIndex, axisLength, axisSchema, deleteAxis, insertAxis, mapAxisRange, reorderAxis } from './axis.js'

it('keeps identities across insertion/deletion while a million empty rows stay compact', () => {
  const original = [{ segment: 'original', start: 0, count: 1048570 }]
  const identity = axisIdentity(original, 999999)
  const inserted = insertAxis(original, 10, 6, 'insert-one')
  expect(inserted).toHaveLength(3)
  expect(axisLength(inserted)).toBe(1048576)
  expect(axisIndex(inserted, identity)).toBe(1000005)
  const removed = deleteAxis(inserted, 12, 10)
  expect(axisIndex(removed, identity)).toBe(999995)
  expect(axisIndex(removed, axisIdentity(original, 12))).toBeNull()
  expect(() => insertAxis(inserted, 0, 1, 'overflow')).toThrow()
})
it('rejects duplicate identities, reused insertion IDs, invalid permutations and empty axes', () => {
  const base = [{ segment: 'a', start: 0, count: 10 }]
  expect(() => axisSchema.parse([...base, { segment: 'a', start: 9, count: 1 }])).toThrow()
  expect(() => insertAxis(base, 3, 1, 'a')).toThrow()
  expect(() => reorderAxis(base, 0, [1, 1])).toThrow()
  expect(() => deleteAxis(base, 0, 10)).toThrow()
})
it('shrinks deleted range edges, includes interior insertions and rejects non-rectangular movement', () => {
  const base = [{ segment: 'a', start: 0, count: 10 }]
  expect(mapAxisRange(base, insertAxis(base, 4, 2, 'new'), 2, 5)).toEqual([2, 7])
  expect(mapAxisRange(base, deleteAxis(base, 2, 2), 2, 5)).toEqual([2, 3])
  expect(mapAxisRange(base, deleteAxis(base, 2, 4), 2, 5)).toBeNull()
  const sorted = reorderAxis(base, 0, [0, 2, 1, 3])
  expect(axisIndex(sorted, axisIdentity(base, 1))).toBe(2)
  expect(() => mapAxisRange(base, sorted, 0, 1)).toThrow('office.workbook_range_reordered')
  expect(mapAxisRange(base, sorted, 1, 2)).toEqual([1, 2])
  // After a prior permutation, endpoints can both be inside the old range while
  // an intervening identity is outside it. Checking only endpoints widens it.
  expect(() => mapAxisRange(sorted, base, 0, 1)).toThrow('office.workbook_range_reordered')
})
it('matches an independent expanded identity model across deterministic mixed edits', () => {
  let axis = [{ segment: 'initial', start: 0, count: 20 }], expanded = Array.from({ length: 20 }, (_, offset) => ({ segment: 'initial', offset }))
  let seed = 12345
  const random = (limit: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit }
  for (let step = 0; step < 300; step++) {
    const before = structuredClone(axis), prior = [...expanded], kind = random(3)
    if (kind === 0 || expanded.length < 3) {
      const index = random(expanded.length + 1), count = 1 + random(3), segment = `insert-${step}`
      axis = insertAxis(axis, index, count, segment); expanded.splice(index, 0, ...Array.from({ length: count }, (_, offset) => ({ segment, offset })))
    } else if (kind === 1) {
      const index = random(expanded.length - 1), count = Math.min(1 + random(3), expanded.length - index - 1)
      axis = deleteAxis(axis, index, count); expanded.splice(index, count)
    } else {
      const index = random(expanded.length - 1), count = Math.min(2 + random(5), expanded.length - index)
      const order = Array.from({ length: count }, (_, i) => count - i - 1), values = expanded.slice(index, index + count)
      axis = reorderAxis(axis, index, order); expanded.splice(index, count, ...order.map(i => values[i]))
    }
    expect(axisLength(axis)).toBe(expanded.length)
    expanded.forEach((identity, index) => { expect(axisIdentity(axis, index)).toEqual(identity); expect(axisIndex(axis, identity)).toBe(index) })
    const start = random(prior.length), end = start + random(prior.length - start)
    const key = (identity: typeof prior[number]) => `${identity.segment}/${identity.offset}`
    const oldIndices = new Map(prior.map((identity, index) => [key(identity), index]))
    const targets = expanded.flatMap((identity, index) => { const old = oldIndices.get(key(identity)); return old !== undefined && old >= start && old <= end ? [index] : [] })
    if (!targets.length) expect(mapAxisRange(before, axis, start, end)).toBeNull()
    else {
      const left = Math.min(...targets), right = Math.max(...targets)
      const disjoint = expanded.slice(left, right + 1).some(identity => { const old = oldIndices.get(key(identity)); return old !== undefined && (old < start || old > end) })
      if (disjoint) expect(() => mapAxisRange(before, axis, start, end)).toThrow('office.workbook_range_reordered')
      else expect(mapAxisRange(before, axis, start, end)).toEqual([left, right])
    }
  }
})
