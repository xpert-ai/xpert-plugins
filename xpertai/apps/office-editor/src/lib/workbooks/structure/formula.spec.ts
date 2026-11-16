import { parseFormulaReferences, rewriteFormulaReferences } from './formula.js'

it('parses mixed absolute references, quoted Unicode sheet names, ranges and opaque string constants', () => {
  const source = '=SUM(\'销售 \'\'华东\'\'\'!$A1:B$4)+IF(A1="A1 and \'Sheet\'!B2",LOG10(100),1E3)'
  const ast = parseFormulaReferences(source)
  const refs = ast.parts.filter(part => part.kind === 'reference')
  expect(refs).toEqual([
    { kind: 'reference', sheet: "销售 '华东'", start: { column: { index: 0, absolute: true }, row: { index: 0, absolute: false } },
      end: { column: { index: 1, absolute: false }, row: { index: 3, absolute: true } } },
    { kind: 'reference', start: { column: { index: 0, absolute: false }, row: { index: 0, absolute: false } } }
  ])
  expect(rewriteFormulaReferences(ast, reference => reference)).toBe(source)
})
it('recognizes whole rows/columns and leaves functions, booleans, errors and intersection whitespace intact', () => {
  const source = '=IF(TRUE,SUM($A:$C,\'数据\'!$2:$5,A1:B2 B2:C3),#REF!)'
  expect(rewriteFormulaReferences(parseFormulaReferences(source), reference => reference)).toBe(source)
  expect(rewriteFormulaReferences(parseFormulaReferences('=A1+"A1"'), () => null)).toBe('=#REF!+"A1"')
})
it.each(['=Table1[Amount]', '=SUM(MyRange)', "='[book.xlsx]Sheet'!A1", '=Sheet1:Sheet3!A1',
  '=INDIRECT("A1")', '=A1#', '=XFE1', '=A1048577', '=SUM(A1', '="unterminated', '=SUM(A:A1)'])
  ('rejects unsupported references atomically: %s', formula => {
    expect(() => parseFormulaReferences(formula)).toThrow('office.workbook_formula_transform_unsupported')
  })
