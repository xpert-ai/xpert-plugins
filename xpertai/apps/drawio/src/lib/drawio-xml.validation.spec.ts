import assert from 'node:assert/strict'
import test from 'node:test'
import { validateDrawioXml } from './drawio-xml.validation.js'

test('accepts complete draw.io XML', () => {
  assert.equal(
    validateDrawioXml(
      '<mxfile><diagram id="page-1"><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>'
    ),
    '<mxfile><diagram id="page-1"><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>'
  )
})

test('accepts compressed draw.io pages', () => {
  assert.equal(
    validateDrawioXml('<mxfile><diagram id="page-1">dGVzdA==</diagram></mxfile>'),
    '<mxfile><diagram id="page-1">dGVzdA==</diagram></mxfile>'
  )
})

test('rejects the truncated attribute shape seen in Agent output', () => {
  assert.throws(
    () =>
      validateDrawioXml(
        '<mxfile>\n<diagram><mxGraphModel><root>\n<mxCell id="flow6" style="strokeWidth=2;fontSize'
      ),
    /line 3.*truncated.*Nothing was saved/i
  )
})

test('rejects mismatched tags and non-draw.io roots', () => {
  assert.throws(
    () => validateDrawioXml('<mxfile><diagram><mxGraphModel></diagram></mxfile>'),
    /Invalid draw\.io XML at line 1/i
  )
  assert.throws(() => validateDrawioXml('<svg><rect/></svg>'), /expected an <mxfile> or <mxGraphModel>/i)
})
