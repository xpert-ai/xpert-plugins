import { PENCIL_JSX_REFERENCE, codeTargetIds, toCoreJsxFormat } from './code.js'

describe('Pencil code inspector helpers', () => {
  it('maps product-facing code formats to the core JSX exporter values', () => {
    expect(toCoreJsxFormat('pencil')).toBe('openpencil')
    expect(toCoreJsxFormat('tailwind')).toBe('tailwind')
  })

  it('deduplicates selected ids and drops nodes that are no longer present', () => {
    const ids = codeTargetIds(['frame-1', 'missing', 'frame-1', 'text-1'], (id) => id !== 'missing')

    expect(ids).toEqual(['frame-1', 'text-1'])
  })

  it('keeps the copied reference aligned with the Pencil app naming', () => {
    expect(PENCIL_JSX_REFERENCE).toContain('Pencil JSX Reference')
    expect(PENCIL_JSX_REFERENCE).not.toContain(['Open', 'Pencil'].join(''))
  })
})
