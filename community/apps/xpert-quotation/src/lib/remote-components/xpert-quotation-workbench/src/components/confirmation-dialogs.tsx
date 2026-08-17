import * as React from 'react'
import { Calculator, FileWarning, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Input
} from '@xpert-ai/plugin-shadcn-ui'
import type {
  CalculationTarget,
  DeleteTarget,
  ExcelOverwriteTarget,
  ResourcePriceTarget,
  Translate
} from '../presentation'
import { isValidWorkdayHours } from '../presentation'

export function WorkbenchDialogs({ t, busy, resourcePriceTarget, quotaWorkdayHours, calculationTarget, excelOverwriteTarget, deleteTarget, onQuotaWorkdayHoursChange, onCloseResourcePrice, onConfirmResourcePrice, onCloseCalculation, onConfirmCalculation, onCloseExcelOverwrite, onConfirmExcelOverwrite, onCloseDelete, onConfirmDelete }: {
  t: Translate
  busy: boolean
  resourcePriceTarget: ResourcePriceTarget | null
  quotaWorkdayHours: string
  calculationTarget: CalculationTarget | null
  excelOverwriteTarget: ExcelOverwriteTarget | null
  deleteTarget: DeleteTarget | null
  onQuotaWorkdayHoursChange: (value: string) => void
  onCloseResourcePrice: () => void
  onConfirmResourcePrice: () => void
  onCloseCalculation: () => void
  onConfirmCalculation: () => void
  onCloseExcelOverwrite: () => void
  onConfirmExcelOverwrite: () => void
  onCloseDelete: () => void
  onConfirmDelete: () => void
}) {
  return <>
    <AlertDialog open={Boolean(resourcePriceTarget)} onOpenChange={(open) => { if (!open && !busy) onCloseResourcePrice() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('resourcePriceAcceptTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('resourcePriceAcceptDescription')} {resourcePriceTarget?.label}</AlertDialogDescription>
        </AlertDialogHeader>
        {resourcePriceTarget?.sourceWorkdayHours != null && <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="quota-workday-hours">{t('quotaWorkdayBasis')}</label>
          <Input id="quota-workday-hours" inputMode="decimal" value={quotaWorkdayHours} onChange={(event) => onQuotaWorkdayHoursChange(event.currentTarget.value)}/>
          <small className="text-[11px] text-muted-foreground">{t('workdayBasis')} {resourcePriceTarget.sourceWorkdayHours}h · {t('quotaWorkdayHint')}</small>
        </div>}
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={busy}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction className="cursor-pointer" disabled={busy || (resourcePriceTarget?.sourceWorkdayHours != null && !isValidWorkdayHours(quotaWorkdayHours))} onClick={(event) => { event.preventDefault(); onConfirmResourcePrice() }}>{t('chooseResourcePrice')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={Boolean(calculationTarget)} onOpenChange={(open) => { if (!open && !busy) onCloseCalculation() }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('calculateRateTitle')}</AlertDialogTitle><AlertDialogDescription>{t('calculateRateDescription')} {calculationTarget?.label}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel className="cursor-pointer" disabled={busy}>{t('cancel')}</AlertDialogCancel><AlertDialogAction className="cursor-pointer" disabled={busy} onClick={(event) => { event.preventDefault(); onConfirmCalculation() }}><Calculator aria-hidden className="size-4"/>{t('calculateRateAndTotal')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={Boolean(excelOverwriteTarget)} onOpenChange={(open) => { if (!open && !busy) onCloseExcelOverwrite() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('overwriteExcelTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('overwriteExcelDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="font-medium">{t('overwriteExcelTargets')} ({excelOverwriteTarget?.occupiedCellCount ?? 0})</div>
          <div className="max-h-32 overflow-auto font-mono text-xs text-muted-foreground">
            {(excelOverwriteTarget?.occupiedCells ?? []).map((cell) => <div key={`${cell.sheetName}:${cell.address}`}>{cell.sheetName}!{cell.address}</div>)}
            {excelOverwriteTarget?.occupiedCellsTruncated ? <div>{t('overwriteExcelMore')}</div> : null}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={busy}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction className="cursor-pointer" variant="destructive" disabled={busy} onClick={(event) => { event.preventDefault(); onConfirmExcelOverwrite() }}><FileWarning aria-hidden className="size-4"/>{busy ? t('overwritingExcel') : t('overwriteExcelConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !busy) onCloseDelete() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteQuotationTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteQuotationDescription')} {deleteTarget?.label ? <strong>“{deleteTarget.label}”</strong> : null}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={busy}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction className="cursor-pointer" variant="destructive" disabled={busy} onClick={(event) => { event.preventDefault(); onConfirmDelete() }}><Trash2 aria-hidden className="size-4"/>{busy ? t('deleting') : t('deleteConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
