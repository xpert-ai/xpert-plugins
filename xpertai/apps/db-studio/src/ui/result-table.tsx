import { Button, ControlInput, Textarea, Table, DialogSurface } from './controls'
import { translate } from './i18n'
import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { DatabaseResult, DatabaseValue } from '@xpert-ai/plugin-sdk/data-workbench'
export function ResultTable({
  result,
  edit,
  onEdit,
  zh,
}: {
  result: DatabaseResult
  edit: boolean
  onEdit: (row: DatabaseValue[], column: number, value: string) => void
  zh: boolean
}) {
  const parent = useRef<HTMLDivElement>(null),
    [hidden, setHidden] = useState<string[]>([]),
    [cell, setCell] = useState<{ row: number; column: number } | null>(null),
    [value, setValue] = useState('')
  const virtual = useVirtualizer({
      count: result.rows.length,
      getScrollElement: () => parent.current,
      estimateSize: () => 32,
      overscan: 12,
    }),
    columns = result.columns.filter((column) => !hidden.includes(column.id))
  return (
    <div className="results-grid">
      <details className="column-filter">
        <summary>
          {translate(zh, 'm_ffe160d7')} · {columns.length}
        </summary>
        <div>
          {result.columns.map((column) => (
            <label key={column.id}>
              <ControlInput
                type="checkbox"
                checked={!hidden.includes(column.id)}
                onChange={() =>
                  setHidden((before) =>
                    before.includes(column.id) ? before.filter((id) => id !== column.id) : [...before, column.id]
                  )
                }
              />
              {column.name} <small>{column.id}</small>
            </label>
          ))}
        </div>
      </details>
      <div className="grid-scroll" ref={parent}>
        <Table role="grid" aria-rowcount={result.rows.length + 1}>
          <thead>
            <tr>
              <th>#</th>
              {columns.map((column) => (
                <th key={column.id}>
                  {column.name}
                  <small>{column.dataType}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: virtual.getVirtualItems()[0]?.start ?? 0 }} />
            <>
              {virtual.getVirtualItems().map((item) => (
                <tr key={item.key} data-index={item.index}>
                  <td className="row-number">{item.index + 1}</td>
                  {columns.map((column) => {
                    const index = result.columns.indexOf(column),
                      value = result.rows[item.index][index]
                    return (
                      <td key={column.id}>
                        <Button
                          className="cell"
                          title={value === null ? 'NULL' : String(value)}
                          onDoubleClick={() => {
                            setCell({ row: item.index, column: index })
                            setValue(value === null ? '' : String(value))
                          }}
                          onClick={() => {
                            setCell({ row: item.index, column: index })
                            setValue(value === null ? '' : String(value))
                          }}
                        >
                          {value === null ? <em>NULL</em> : String(value)}
                        </Button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </>
            <tr
              style={{ height: Math.max(0, virtual.getTotalSize() - (virtual.getVirtualItems().at(-1)?.end ?? 0)) }}
            />
          </tbody>
        </Table>
        {!result.rows.length && <div className="empty">{translate(zh, 'm_76beff3a')}</div>}
      </div>
      {cell && (
        <DialogSurface
          open
          onOpenChange={(open) => { if (!open) setCell(null) }}
          title={result.columns[cell.column].name}
          footer={<>
            <Button variant="outline" onClick={() => setCell(null)}>{translate(zh, 'm_fbd8cee0')}</Button>
            {edit && <Button onClick={() => { onEdit(result.rows[cell.row], cell.column, value); setCell(null) }}>{translate(zh, 'm_393ddc80')}</Button>}
          </>}
        >
          <Textarea value={value} onChange={(event) => setValue(event.target.value)} readOnly={!edit} rows={8} />
        </DialogSurface>
      )}
    </div>
  )
}
