import assert from 'node:assert/strict'
import test from 'node:test'
import { DRAWIO_ORIGIN, editorReplyOrigin, editorSceneXml } from './remote-components/drawio-workbench/src/editor-channel.js'

test('opaque sandbox handshake replies to the bound editor window', () => {
  const editor = {}
  assert.equal(editorReplyOrigin({ source: editor, origin: 'null' }, editor), '*')
  assert.equal(editorReplyOrigin({ source: editor, origin: DRAWIO_ORIGIN }, editor), DRAWIO_ORIGIN)
})
test('unbound, sibling and unexpected-origin messages never establish an editor channel', () => {
  const editor = {}
  assert.equal(editorReplyOrigin({ source: editor, origin: 'null' }, null), null)
  assert.equal(editorReplyOrigin({ source: {}, origin: 'null' }, editor), null)
  assert.equal(editorReplyOrigin({ source: editor, origin: 'https://untrusted.example' }, editor), null)
})

test('saves XML from native Save and the supported export/xml response only', () => {
  const xml = '<mxfile><diagram/></mxfile>'
  assert.equal(editorSceneXml({ event: 'save', xml }), xml)
  assert.equal(editorSceneXml({ event: 'export', format: 'xml', xml }), xml)
  assert.equal(editorSceneXml({ event: 'export', format: 'png', xml }), null)
  assert.equal(editorSceneXml({ event: 'save' }), null)
  assert.equal(editorSceneXml({ event: 'save', xml: ' ' }), null)
  assert.equal(editorSceneXml({ event: 'init', xml }), null)
})
