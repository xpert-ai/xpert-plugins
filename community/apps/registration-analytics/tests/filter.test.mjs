import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadService() {
  const service = require('../dist/lib/registration.service.js')
  return service
}

test('isTextField returns true for text columns and false for timestamps/numbers', () => {
  const { isTextField } = loadService()
  assert.equal(isTextField('name'), true)
  assert.equal(isTextField('status'), true)
  assert.equal(isTextField('city'), true)
  assert.equal(isTextField('registerTime'), false)
  assert.equal(isTextField('createdAt'), false)
  assert.equal(isTextField('fee'), false)
})

test('applyFilters does not wrap timestamp columns in LOWER()', () => {
  const { applyFilters } = loadService()
  const clauses = []
  const qb = {
    andWhere(condition, parameters) {
      clauses.push({ condition, parameters })
    }
  }
  applyFilters(qb, 'record', [
    { field: 'registerTime', op: 'eq', value: '2026-09-01T00:00:00Z' },
    { field: 'status', op: 'eq', value: 'confirmed' },
    { field: 'city', op: 'contains', value: '北' }
  ])
  const all = clauses.map((c) => c.condition).join(' ')
  assert.ok(!all.includes('LOWER(record.registerTime)'), 'timestamp filter must not use LOWER()')
  assert.ok(all.includes('LOWER(record.status)'), 'text eq filter should use LOWER()')
  assert.ok(all.includes('LOWER(record.city) LIKE'), 'text contains filter should use LOWER()')
})

test('applyFilters rejects unknown/injected fields', () => {
  const { applyFilters } = loadService()
  const clauses = []
  const qb = {
    andWhere(condition, parameters) {
      clauses.push({ condition, parameters })
    }
  }
  applyFilters(qb, 'record', [
    { field: 'id; DROP TABLE x', op: 'eq', value: '1' },
    { field: '__proto__', op: 'eq', value: 'x' },
    { field: 'status', op: 'eq', value: 'confirmed' }
  ])
  assert.equal(clauses.length, 1, 'only the known field filter should be emitted')
  assert.ok(clauses[0].condition.includes('record.status'))
})

test('appendFilterSql emits positional ? placeholders with array params', () => {
  const { appendFilterSql } = loadService()
  const where = []
  const params = []
  appendFilterSql(where, params, [
    { field: 'registerTime', op: 'eq', value: '2026-09-01T00:00:00Z' },
    { field: 'status', op: 'eq', value: 'confirmed' },
    { field: 'city', op: 'contains', value: '北' }
  ])
  const all = where.join(' ')
  assert.ok(!all.includes(':'), 'SQL must not contain named : placeholders')
  assert.ok(all.includes('LOWER(record."status") = LOWER(?)'), 'text eq should use positional ?')
  assert.ok(!all.includes('LOWER(record."registerTime")'), 'timestamp eq must not use LOWER()')
  assert.equal(params.length, 3, 'one param per filter')
})
