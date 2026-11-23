import { randomUUID } from 'node:crypto'
import { workbookFromTransfer } from './transfer.js'
import { fromUniver, toUniver } from './univer-adapter.js'
import type { ContentTextTransferSnapshot } from '@xpert-ai/contracts'
const source = (): ContentTextTransferSnapshot => ({ schema: 'xpert.content-transfer@1',
  source: { providerKey: 'canvas.documents', resourceId: randomUUID(), revision: '9', title: 'Plan' },
  sections: [{ anchor: { kind: 'canvas-element', id: 'shape:1' }, text: '=HYPERLINK("unsafe")' }] })
it('imports literal text and element/version provenance through the canonical workbook model', () => {
  const transfer = source(), book = workbookFromTransfer(randomUUID(), 'Plan', transfer)
  const roundtrip = toUniver(fromUniver(book)), cells = roundtrip.sheets[roundtrip.sheetOrder[0]].cellData
  expect(cells['1']['0']).toMatchObject({ v: 'shape:1', t: 1 })
  expect(cells['1']['2']).toMatchObject({ v: transfer.sections[0].text, t: 1 })
  expect(cells['1']['2'].f).toBeUndefined()
  expect(cells['1']['4']).toMatchObject({ v: '9' })
})
it('rejects unsupported transfer versions and oversized outlines before writing', () => {
  expect(() => workbookFromTransfer(randomUUID(), 'Plan', { ...source(), schema: 'other' } as never)).toThrow()
  const large = source();large.sections = Array.from({ length: 1001 }, () => large.sections[0])
  expect(() => workbookFromTransfer(randomUUID(), 'Plan', large)).toThrow()
})
