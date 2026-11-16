import type { XpertWorkbook } from '../core.js'
import type { StructuralState } from './model.js'
import { createAxisTransform } from './axis.js'
import { parseFormulaReferences, rewriteFormulaReferences } from './formula.js'

/** The same mapping rewrites formula dependencies and rebases a cell intent.
 * Callers must reject opaque structural history before trusting this mapper. */
export function createStructuralMapper(before: XpertWorkbook, beforeAxes: StructuralState, after: XpertWorkbook, afterAxes: StructuralState) {
  const transforms = Object.fromEntries(before.order.map(id => {
    if (!afterAxes.sheets[id]) throw new Error('office.version_conflict')
    return [id, {
      rows: createAxisTransform(beforeAxes.sheets[id].rows, afterAxes.sheets[id].rows),
      columns: createAxisTransform(beforeAxes.sheets[id].columns, afterAxes.sheets[id].columns)
    }]
  }))
  const formula = (input: string, sheetId: string) => rewriteFormulaReferences(parseFormulaReferences(input), reference => {
    const targetId = reference.sheet === undefined ? sheetId : before.order.find(id => before.sheets[id].title.toLowerCase() === reference.sheet!.toLowerCase())
    if (!targetId) throw new Error('office.workbook_formula_transform_unsupported')
    const transform = transforms[targetId]
    for (const [dimension, axis] of [['row', 'rows'], ['column', 'columns']] as const) {
      const start = reference.start[dimension], end = reference.end?.[dimension]
      if (!start) continue
      if (end) {
        const range = transform[axis].range(start.index, end.index)
        if (!range) return null
        start.index = range[0]; end.index = range[1]
      } else {
        const index = transform[axis].index(start.index)
        if (index === null) return null
        start.index = index
      }
    }
    if (reference.sheet !== undefined) reference.sheet = after.sheets[targetId].title
    return reference
  })
  return { transforms, formula }
}
