import { normalizeCutFileName } from './cut-file-name.js'

describe('Cut file names', () => {
  it('preserves valid Unicode file names', () => {
    expect(normalizeCutFileName('记录—Xpert访谈.mov')).toBe('记录—Xpert访谈.mov')
  })

  it('repairs UTF-8 names decoded as Latin-1 by a multipart parser', () => {
    const mojibake = Buffer.from('记录—Xpert访谈.mov', 'utf8').toString('latin1')
    expect(normalizeCutFileName(mojibake)).toBe('记录—Xpert访谈.mov')
  })

  it('removes path separators from an untrusted upload name', () => {
    expect(normalizeCutFileName('../素材\\片段.mov')).toBe('.._素材_片段.mov')
  })
})
