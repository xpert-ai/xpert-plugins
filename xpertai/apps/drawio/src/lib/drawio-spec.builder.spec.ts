import assert from 'node:assert/strict'
import test from 'node:test'
import { XMLValidator } from 'fast-xml-parser'
import { buildDrawioXmlFromSpec } from './drawio-spec.builder.js'

test('builds complete multi-page draw.io XML from a compact diagram spec', () => {
  const xml = buildDrawioXmlFromSpec({
    pages: [
      {
        name: 'Architecture',
        nodes: [
          { id: 'client', label: '<b>Client & API</b>', x: 40, y: 80, width: 160, height: 70, shape: 'rounded' },
          { id: 'database', label: 'Database', x: 320, y: 80, width: 140, height: 90, shape: 'cylinder' }
        ],
        edges: [{ source: 'client', target: 'database', label: 'read/write' }]
      },
      {
        name: 'Request Flow',
        width: 1200,
        height: 800,
        nodes: [{ id: 'step-1', label: '① Request', x: 60, y: 60, width: 180, height: 70, shape: 'rounded' }],
        edges: []
      }
    ]
  })

  assert.equal(XMLValidator.validate(xml), true)
  assert.match(xml, /<diagram id="page-1" name="Architecture">/)
  assert.match(xml, /<diagram id="page-2" name="Request Flow">/)
  assert.match(xml, /value="&lt;b&gt;Client &amp; API&lt;\/b&gt;"/)
  assert.match(xml, /source="client" target="database"/)
})

test('rejects duplicate ids and edges with unknown node references', () => {
  assert.throws(
    () => buildDrawioXmlFromSpec({ pages: [{ name: 'Invalid', nodes: [
      { id: 'same', x: 0, y: 0, width: 100, height: 60 },
      { id: 'same', x: 120, y: 0, width: 100, height: 60 }
    ], edges: [] }] }),
    /Duplicate draw\.io cell id/
  )
  assert.throws(
    () => buildDrawioXmlFromSpec({ pages: [{ name: 'Invalid edge', nodes: [
      { id: 'known', x: 0, y: 0, width: 100, height: 60 }
    ], edges: [{ source: 'known', target: 'missing' }] }] }),
    /unknown source or target node/
  )
})
