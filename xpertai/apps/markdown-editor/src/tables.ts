import type { Node } from '@tiptap/pm/model'

/** GFM supports one header row, rectangular cells and column alignment, not merged/rich-block cells. */
export function checkTables(root: Node) {
  root.descendants((table, _pos, parent) => {
    if (table.type.name !== 'table') return
    if (parent?.type.name !== 'doc') throw new Error('markdown.nested_table')
    const width = table.firstChild?.childCount ?? 0
    if (!width || width > 30 || table.childCount > 200) throw new Error('markdown.table_size')
    const alignment: unknown[] = []
    table.forEach((row, _offset, rowIndex) => {
      if (row.childCount !== width) throw new Error('markdown.table_shape')
      row.forEach((cell, _cellOffset, column) => {
        const { colspan, rowspan, colwidth, align } = cell.attrs
        if (cell.type.name !== (rowIndex === 0 ? 'tableHeader' : 'tableCell') ||
          colspan !== 1 || rowspan !== 1 || colwidth !== null || ![null, 'left', 'center', 'right'].includes(align) ||
          cell.childCount !== 1 || cell.firstChild?.type.name !== 'paragraph') throw new Error('markdown.table_format')
        if (rowIndex === 0) alignment[column] = align
        else if (alignment[column] !== align) throw new Error('markdown.table_alignment')
        cell.descendants((node) => {
          if (node.type.name === 'hardBreak' || (node.isText && /[\r\n]/u.test(node.text ?? '')))
            throw new Error('markdown.table_multiline')
        })
      })
    })
  })
}
