import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFieldFlags,
  mergeFieldFlags,
  normalizeDraftInput,
  normalizeEvidence,
  splitBatchSource
} from '../dist/lib/listing-assistant.mapper.js'

test('buildFieldFlags marks absent, uncertain and drafted fields', () => {
  const flags = buildFieldFlags({
    title: '游戏点卡 100元面值',
    description: '官方直充，自动发货。',
    price: null,
    category: '虚拟商品',
    specs: [],
    missingFields: ['price'],
    uncertainFields: ['category']
  })

  assert.deepEqual(flags, {
    title: 'ai',
    description: 'ai',
    price: 'missing',
    category: 'uncertain',
    specs: 'missing'
  })
})

test('buildFieldFlags treats a model omission as missing even without an explicit flag', () => {
  const flags = buildFieldFlags({ title: '  ', description: 'ok', price: '9.9', category: null, specs: null })
  assert.equal(flags.title, 'missing')
  assert.equal(flags.description, 'ai')
  assert.equal(flags.price, 'ai')
  assert.equal(flags.category, 'missing')
  assert.equal(flags.specs, 'missing')
})

test('normalizeDraftInput trims, clamps and drops empty specs', () => {
  const normalized = normalizeDraftInput({
    title: ' 标题 ',
    description: ' 描述 ',
    price: ' 99.00 ',
    currency: ' CNY ',
    category: ' 虚拟商品 ',
    attributes: { ' 区服 ': '全区', empty: null, '': 'ignored' },
    specs: [
      { name: ' 100元面值 ', price: '92.00', stock: 200 },
      { name: '   ', price: '1', stock: 1 },
      { name: '50元面值', price: null, stock: 12.9 }
    ]
  })

  assert.equal(normalized.title, '标题')
  assert.equal(normalized.price, '99.00')
  assert.deepEqual(normalized.attributes, { 区服: '全区', empty: null })
  assert.deepEqual(normalized.specs, [
    { name: '100元面值', price: '92.00', stock: 200 },
    { name: '50元面值', price: null, stock: 12 }
  ])
})

test('mergeFieldFlags clears markers for confirmed fields only', () => {
  const existing = { title: 'ai', description: 'ai', price: 'missing', category: 'uncertain', specs: 'ai' }
  const merged = mergeFieldFlags(existing, {
    title: '人工确认标题',
    description: null,
    price: '99.00',
    currency: null,
    category: null,
    attributes: null,
    specs: undefined
  })

  assert.deepEqual(merged, { description: 'ai', category: 'uncertain', specs: 'ai' })
})

test('splitBatchSource splits entries on a standalone separator line', () => {
  const parts = splitBatchSource('商品 A\n价格 10\n---\n商品 B\n价格 20\n---\n\n---\n商品 C')
  assert.deepEqual(parts, ['商品 A\n价格 10', '商品 B\n价格 20', '商品 C'])
})

test('splitBatchSource keeps a single entry without separators intact', () => {
  assert.deepEqual(splitBatchSource('  只有一条文案  '), ['只有一条文案'])
  assert.deepEqual(splitBatchSource('   '), [])
})

test('normalizeEvidence keeps known non-empty excerpts only', () => {
  assert.deepEqual(
    normalizeEvidence({
      title: '  游戏点卡 100元面值  ',
      price: '售价 92 元',
      category: '   ',
      unknown: 'ignored',
      specs: 42
    }),
    { title: '游戏点卡 100元面值', price: '售价 92 元' }
  )
})

test('normalizeEvidence rejects non-object payloads and empty maps', () => {
  assert.equal(normalizeEvidence(null), null)
  assert.equal(normalizeEvidence(['title']), null)
  assert.equal(normalizeEvidence({ title: '', category: '   ' }), null)
})
