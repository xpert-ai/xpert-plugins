import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as esm from 'tldraw'

// Serialized by the real 5.1.1 store, including its historical migration schema.
const legacy = JSON.parse(await readFile(new URL('./fixtures/tldraw-5.1.1.json', import.meta.url), 'utf8'))
const require = createRequire(import.meta.url)

for (const [format, { createTLStore }] of Object.entries({ esm, cjs: require('tldraw') })) {
  test(`${format}: 5.1.1 whiteboards migrate, save and reopen with content intact`, () => {
    const input = structuredClone(legacy)
    const store = createTLStore()
    store.loadStoreSnapshot(input)
    for (const original of Object.values(legacy.store)) {
      const record = store.get(original.id)
      assert.ok(record, original.id)
      for (const key of ['typeName', 'type', 'parentId', 'x', 'y', 'meta']) {
        assert.deepEqual(record[key], original[key], `${original.id}.${key}`)
      }
      for (const [key, value] of Object.entries(original.props ?? {})) {
        // Upstream renamed this note attribution field; the migration preserves its value.
        const migratedKey = key === 'textFirstEditedBy' ? 'textLastEditedBy' : key
        assert.deepEqual(record.props[migratedKey], value, `${original.id}.props.${migratedKey}`)
      }
    }
    const text = store.get('shape:legacy-text')
    store.put([{ ...text, x: 350 }])
    const saved = JSON.parse(JSON.stringify(store.getStoreSnapshot()))
    const reopened = createTLStore()
    reopened.loadStoreSnapshot(saved)
    assert.deepEqual(reopened.getStoreSnapshot(), saved)
    assert.equal(reopened.get('shape:legacy-text').x, 350)
    assert.deepEqual(input, legacy, 'migration must not mutate the supplied snapshot')
  })
}
