import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { presentationSummary } from '../dist/lib/presentation-summary.js'

test('delivery metadata preserves the business title and counts only slides in presentation order', async () => {
  const zip = new JSZip()
  zip.file('docProps/core.xml', '<cp:coreProperties xmlns:cp="urn:core" xmlns:dc="urn:title"><dc:title>南京元数 &amp; 企业协作</dc:title></cp:coreProperties>')
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="urn:ppt"><p:sldIdLst><p:sldId id="256"/><p:sldId id="257"/></p:sldIdLst></p:presentation>')
  zip.file('ppt/slides/unused.xml', '<p:sld/>')
  assert.deepEqual(await presentationSummary(await zip.generateAsync({ type: 'nodebuffer' }), 'internal-id.pptx'), {
    title: '南京元数 & 企业协作', slideCount: 2
  })
})

test('missing optional document properties retain the file title', async () => {
  const zip = new JSZip()
  zip.file('ppt/presentation.xml', '<presentation><sldIdLst><sldId id="256"/></sldIdLst></presentation>')
  assert.deepEqual(await presentationSummary(await zip.generateAsync({ type: 'nodebuffer' }), 'Quarterly report.pptx'), {
    title: 'Quarterly report.pptx', slideCount: 1
  })
})
