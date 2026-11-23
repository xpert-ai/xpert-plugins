/** Reference AST for structural transforms. This is deliberately not a formula
 * evaluator. It preserves expression text and parses all references, or rejects
 * the entire transform. Unsupported names/external/3-D/structured references
 * are never treated as harmless text. Grammar boundary: MS-XLSX 2.2.2. */
export type FormulaCoordinate = { index: number; absolute: boolean }
export type FormulaAddress = { row?: FormulaCoordinate; column?: FormulaCoordinate }
export type FormulaReference = { kind: 'reference'; sheet?: string; start: FormulaAddress; end?: FormulaAddress }
export type FormulaPart = { kind: 'text'; value: string } | FormulaReference
export type FormulaReferenceAst = { kind: 'formula'; parts: FormulaPart[] }
const unsupported = () => new Error('office.workbook_formula_transform_unsupported')
const address = '(?:\\$?[A-Za-z]{1,3}\\$?[1-9][0-9]*|\\$?[A-Za-z]{1,3}|\\$?[1-9][0-9]*)'
const reference = new RegExp(`^(?:(('(?:[^']|'')+'|[\\p{L}_\\\\][\\p{L}\\p{N}_.\\\\]*)!)?(${address})(?::(${address}))?)`, 'u')
const nameCharacter = /[\p{L}\p{N}_.\[!]/u
function parseAddress(value: string): FormulaAddress {
  const match = /^(\$?)([A-Za-z]+)?(\$?)([1-9][0-9]*)?$/.exec(value)
  if (!match || (!match[2] && !match[4])) throw unsupported()
  const column = match[2]?.toUpperCase().split('').reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0)
  const row = match[4] ? Number(match[4]) : undefined
  if ((column !== undefined && column > 16384) || (row !== undefined && row > 1048576)) throw unsupported()
  return { ...(column !== undefined ? { column: { index: column - 1, absolute: match[1] === '$' } } : {}),
    ...(row !== undefined ? { row: { index: row - 1, absolute: (column === undefined ? match[1] : match[3]) === '$' } } : {}) }
}
function columnName(index: number) {
  let value = index + 1, result = ''
  while (value > 0) { result = String.fromCharCode(65 + (value - 1) % 26) + result; value = Math.floor((value - 1) / 26) }
  return result
}
function renderAddress(value: FormulaAddress) {
  return (value.column ? `${value.column.absolute ? '$' : ''}${columnName(value.column.index)}` : '') +
    (value.row ? `${value.row.absolute ? '$' : ''}${value.row.index + 1}` : '')
}
export function renderFormulaReference(value: FormulaReference) {
  return (value.sheet === undefined ? '' : `'${value.sheet.replaceAll("'", "''")}'!`) + renderAddress(value.start) +
    (value.end ? `:${renderAddress(value.end)}` : '')
}

export function parseFormulaReferences(formula: string): FormulaReferenceAst {
  if (!formula.startsWith('=') || formula.length > 32000) throw unsupported()
  const parts: FormulaPart[] = []
  const append = (value: string) => {
    const last = parts.at(-1)
    if (last?.kind === 'text') last.value += value
    else parts.push({ kind: 'text', value })
  }
  append('=')
  let position = 1, depth = 0
  while (position < formula.length) {
    const remaining = formula.slice(position)
    const string = /^"(?:[^"]|"")*"/.exec(remaining)
    if (string) { append(string[0]); position += string[0].length; continue }
    const fn = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(?=\()/.exec(remaining)
    if (fn) {
      // Text-generated references cannot be safely rewritten by a structural AST.
      if (/^(?:_xlfn\.)?INDIRECT$/i.test(fn[1])) throw unsupported()
      append(fn[0]); position += fn[0].length; continue
    }
    const ref = reference.exec(remaining)
    if (ref && (!remaining[ref[0].length] || !nameCharacter.test(remaining[ref[0].length]))) {
      const start = parseAddress(ref[3]), end = ref[4] ? parseAddress(ref[4]) : undefined
      const sameDimension = !end || Boolean(start.row) === Boolean(end.row) && Boolean(start.column) === Boolean(end.column)
      // A bare A/1 is a name/number, not a whole-column/row reference.
      if (sameDimension && ((start.row && start.column) || end)) {
        if (end && ((start.row && start.row.index > end.row!.index) || (start.column && start.column.index > end.column!.index))) throw unsupported()
        const quoted = ref[2]
        const sheet = quoted?.startsWith("'") ? quoted.slice(1, -1).replaceAll("''", "'") : quoted
        if (sheet && /[\[\]:\\/?*]/.test(sheet)) throw unsupported()
        parts.push({ kind: 'reference', ...(sheet ? { sheet } : {}), start, ...(end ? { end } : {}) })
        position += ref[0].length; continue
      }
    }
    const literal = /^(?:#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!|SPILL!|CALC!)|TRUE\b|FALSE\b|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?)/i.exec(remaining)
    if (literal && (!remaining[literal[0].length] || !nameCharacter.test(remaining[literal[0].length]))) {
      append(literal[0]); position += literal[0].length; continue
    }
    const token = remaining[0]
    if (/^[\s+\-*/^&=<>%,;]$/.test(token)) { append(token); position++; continue }
    if (token === '(') { depth++; append(token); position++; continue }
    if (token === ')' && depth > 0) { depth--; append(token); position++; continue }
    throw unsupported()
  }
  if (depth !== 0) throw unsupported()
  return { kind: 'formula', parts }
}
export function rewriteFormulaReferences(ast: FormulaReferenceAst, map: (reference: FormulaReference) => FormulaReference | null) {
  return ast.parts.map(part => {
    if (part.kind === 'text') return part.value
    const mapped = map(structuredClone(part))
    return mapped ? renderFormulaReference(mapped) : '#REF!'
  }).join('')
}
