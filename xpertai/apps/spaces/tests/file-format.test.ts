import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
import { fileFormat } from '../src/file-format.js'

const formats = [{ kind: 'file', key: 'custom.binary', extension: 'custom' }] as FileContentEditorRegistration[]
test('unmarked files use a registered codec by extension, preserving explicit choices', () => {
  const item = { kind: 'file', filePath: 'nested/AI-result.CUSTOM' }
  assert.equal(fileFormat(item, formats), formats[0])
  const dotted = [{ ...formats[0], extension: '.custom' }]
  assert.equal(fileFormat(item, dotted), dotted[0])
  assert.equal(fileFormat({ ...item, editorKey: 'removed.codec' }, formats), undefined)
  assert.equal(fileFormat({ ...item, kind: 'page' }, formats), undefined)
  assert.equal(fileFormat({ ...item, filePath: 'result.custom.zip' }, formats), undefined)
  assert.equal(fileFormat(item, [...formats, { ...formats[0], key: 'alternate' }]), undefined)
  assert.equal(fileFormat({ ...item, editorKey: 'custom.binary' }, [...formats, { ...formats[0], key: 'alternate' }]), formats[0])
})
