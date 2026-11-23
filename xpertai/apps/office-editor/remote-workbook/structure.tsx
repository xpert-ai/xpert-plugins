import React, { useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/plugin-shadcn-ui'
import { t, useLocale } from '../remote-file/i18n'
import type { WorkbookSelection } from '../src/lib/workbooks/selection'
import type { StructuralOperation } from '../src/lib/workbooks/structure/model'

const choices = ['insertRows', 'insertColumns', 'deleteRows', 'deleteColumns', 'renameSheet', 'merge', 'unmerge', 'sortAscending', 'sortDescending'] as const
type Choice = typeof choices[number]
export function WorkbookStructure(props: { open: boolean; onOpenChange(open: boolean): void; selection: WorkbookSelection | null;
  sheetTitle: string; onApply(operation: StructuralOperation): Promise<void> }) {
  useLocale()
  const [choice, setChoice] = useState<Choice>('insertRows'), [count, setCount] = useState('1'), [title, setTitle] = useState(props.sheetTitle)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const apply = async () => {
    const range = props.selection
    if (!range) return
    setBusy(true); setError('')
    try {
      let operation: StructuralOperation
      if (choice === 'renameSheet') operation = { kind: 'rename_sheet', sheetId: range.sheetId, title }
      else if (choice === 'merge' || choice === 'unmerge') operation = { kind: choice === 'merge' ? 'merge_cells' : 'unmerge_cells', ...range }
      else if (choice === 'sortAscending' || choice === 'sortDescending') operation = { kind: 'sort_rows', sheetId: range.sheetId,
        startRow: range.startRow, endRow: range.endRow, column: range.startColumn, direction: choice === 'sortAscending' ? 'ascending' : 'descending' }
      else {
        const axis = choice === 'insertRows' || choice === 'deleteRows' ? 'rows' : 'columns'
        operation = { kind: choice === 'insertRows' || choice === 'insertColumns' ? 'insert_axis' : 'delete_axis', sheetId: range.sheetId,
          axis, index: axis === 'rows' ? range.startRow : range.startColumn, count: Number(count) }
      }
      await props.onApply(operation); props.onOpenChange(false)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(t(/version_conflict|409/.test(message) ? 'workbook.conflict' : /merge_would_discard/.test(message) ? 'workbook.structureDataLoss'
        : /unsupported|range_reordered/.test(message) ? 'workbook.structureUnsupported' : 'workbook.structureFailed'))
    } finally { setBusy(false) }
  }
  return <Dialog open={props.open} onOpenChange={open => { if (!busy) props.onOpenChange(open) }}><DialogContent>
    <DialogHeader><DialogTitle>{t('workbook.structure')}</DialogTitle><DialogDescription>{t('workbook.structureHelp')}</DialogDescription></DialogHeader>
    {props.selection && <p>{t('workbook.structureSelection', { sheet: props.sheetTitle, row: props.selection.startRow + 1, column: props.selection.startColumn + 1 })}</p>}
    <Label htmlFor="workbook-structure-action">{t('workbook.structureAction')}</Label>
    <Select value={choice} onValueChange={value => { const next = choices.find(choice => choice === value); if (next) setChoice(next) }} disabled={busy}>
      <SelectTrigger id="workbook-structure-action"><SelectValue /></SelectTrigger>
      <SelectContent>{choices.map(choice => <SelectItem key={choice} value={choice}>{t(`workbook.structure.${choice}`)}</SelectItem>)}</SelectContent>
    </Select>
    {choice === 'renameSheet' ? <><Label htmlFor="workbook-sheet-title">{t('workbook.structureTitle')}</Label>
      <Input id="workbook-sheet-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={31} disabled={busy} /></>
      : ['insertRows', 'insertColumns', 'deleteRows', 'deleteColumns'].includes(choice) ? <><Label htmlFor="workbook-axis-count">{t('workbook.structureCount')}</Label>
        <Input id="workbook-axis-count" type="number" min={1} max={10000} value={count} onChange={event => setCount(event.target.value)} disabled={busy} /></> : null}
    {(choice === 'sortAscending' || choice === 'sortDescending') && <p>{t('workbook.structureSortHelp')}</p>}
    {error && <p role="alert">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={() => props.onOpenChange(false)}>{t('common.cancel')}</Button>
      <Button disabled={busy || !props.selection} onClick={() => void apply()}>{t('workbook.structureApply')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
