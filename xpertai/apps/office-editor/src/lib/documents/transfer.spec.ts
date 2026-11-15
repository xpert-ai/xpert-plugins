import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAnalysisEvidence } from '@xpert-ai/plugin-sdk/analytics'
import { documentFromTransfer, presentationFromTransfer } from './transfer.js'
const evidence = () => parseAnalysisEvidence(JSON.parse(readFileSync(join(__dirname, '../../../../../test-fixtures/analysis-evidence.json'), 'utf8')))
it('paginates editable slides without losing exact evidence cells or allowing tampering', () => {
  const snapshot = evidence()
  const transfer = { schema: 'xpert.content-analysis-transfer@1' as const,
    source: { providerKey: 'evidence', resourceId: snapshot.id, revision: snapshot.sha256, title: snapshot.title }, evidence: snapshot }
  const result = presentationFromTransfer(snapshot.id, 'Revenue', transfer)
  const text = result.snapshot.body.pageOrder.map(id => Object.values(result.snapshot.body.pages[id].pageElements)
    .map(element => element.richText.rich.body.dataStream).join('')).join('').replace(/[\r\n]/g, '')
  expect(text).toContain('9007199254740993.12 CNY [sales:0:amount]')
  expect(result.snapshot.xpertEvidence?.sha256).toBe(snapshot.sha256)
  expect(result.snapshot.body.pageOrder.length).toBeGreaterThan(1)
  transfer.evidence.datasets[0].rows[0].amount = '1'
  expect(() => presentationFromTransfer(snapshot.id, 'Revenue', transfer)).toThrow('integrity')
})
it('keeps exact decimal values, units, source revision and valid native paragraph indices', () => {
  const snapshot = evidence()
  const result = documentFromTransfer(snapshot.id, 'Revenue', { schema: 'xpert.content-analysis-transfer@1',
    source: { providerKey: 'live-dashboard.analysis-evidence', resourceId: snapshot.id, revision: snapshot.sha256, title: snapshot.title }, evidence: snapshot })
  expect(result.text).toContain('9007199254740993.12 CNY [sales:0:amount]')
  expect(result.text).toContain(snapshot.sha256)
  expect(result.text).toContain(snapshot.source.versionId)
  expect(result.snapshot.xpertEvidence?.sha256).toBe(snapshot.sha256)
  for (const paragraph of result.snapshot.body.paragraphs) expect(result.text[paragraph.startIndex]).toBe('\r')
})
it('rejects altered evidence instead of generating an inconsistent report', () => {
  const snapshot = evidence(); snapshot.datasets[0].rows[0].amount = '1.00'
  expect(() => documentFromTransfer(snapshot.id, 'Revenue', { schema: 'xpert.content-analysis-transfer@1',
    source: { providerKey: 'evidence', resourceId: snapshot.id, revision: snapshot.sha256, title: snapshot.title }, evidence: snapshot })).toThrow('integrity')
})
it('preserves canvas anchors and formula-looking text as literal document content', () => {
  const result = documentFromTransfer('doc', 'Plan', { schema: 'xpert.content-transfer@1', source: { providerKey: 'canvas', resourceId: 'board', revision: '12', title: 'Board' },
    sections: [{ anchor: { kind: 'canvas-element', id: 'shape:1' }, text: '=HYPERLINK("unsafe")' }] })
  expect(result.text).toContain('[canvas-element:shape:1] =HYPERLINK("unsafe")')
  expect(result.snapshot.xpertSource?.revision).toBe('12')
})
