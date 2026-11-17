import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ItemIcon } from '../remote/item-icon'
import { getFileIconType } from '../remote/file-type-icon'

test('file formats use MIME metadata without relying on a filename', () => {
  assert.equal(getFileIconType('Application/PDF; charset=binary'), 'pdf')
  assert.equal(getFileIconType('application/vnd.openxmlformats-officedocument.presentationml.presentation'), 'powerpoint')
  assert.equal(getFileIconType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'excel')
  assert.equal(getFileIconType('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'word')
  assert.equal(getFileIconType('application/octet-stream'), 'file')
})

test('a generic artifact keeps its declared type icon while PPTX uses the shared format icon', () => {
  const presentation = { kind: 'artifact' as const, referenceId: 'reference', artifactKind: 'file' as const,
    type: { pluginName: 'example', resourceType: 'diagram', icon: { type: 'emoji' as const, value: '📊' } } }
  assert.match(renderToStaticMarkup(React.createElement(ItemIcon, { item: { kind: 'resource', presentation } })), /📊/)
  assert.match(renderToStaticMarkup(React.createElement(ItemIcon, { item: { kind: 'resource', presentation: { ...presentation, artifactKind: 'pptx' } } })), /data-file-type="powerpoint"/)
})
