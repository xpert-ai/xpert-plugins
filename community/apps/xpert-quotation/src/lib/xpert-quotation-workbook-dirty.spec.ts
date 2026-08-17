import { isUserWorkbookValueChange } from './remote-components/xpert-quotation-workbench/src/workbook-dirty'

describe('Xpert quotation workbook dirty tracking', () => {
  it('marks persistent user cell changes as dirty', () => {
    expect(isUserWorkbookValueChange({ id: 'sheet.mutation.set-range-values' })).toBe(true)
  })

  it.each([
    { onlyLocal: true },
    { fromChangeset: true },
    { syncOnly: true }
  ])('ignores non-user workbook changes with options %j', (options) => {
    expect(isUserWorkbookValueChange({
      id: 'sheet.mutation.set-range-values',
      options
    })).toBe(false)
  })

  it('ignores commands that do not persist workbook values', () => {
    expect(isUserWorkbookValueChange({ id: 'sheet.operation.set-selections' })).toBe(false)
  })
})
