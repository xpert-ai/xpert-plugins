import * as React from 'react'
import { LocaleType, LogLevel, Univer, UniverInstanceType, mergeLocales } from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import DesignEnUS from '@univerjs/design/locale/en-US'
import DesignZhCN from '@univerjs/design/locale/zh-CN'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US'
import DocsUIZhCN from '@univerjs/docs-ui/locale/zh-CN'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import SheetsEnUS from '@univerjs/sheets/locale/en-US'
import SheetsZhCN from '@univerjs/sheets/locale/zh-CN'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import SheetsFormulaEnUS from '@univerjs/sheets-formula/locale/en-US'
import SheetsFormulaZhCN from '@univerjs/sheets-formula/locale/zh-CN'
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui'
import SheetsFormulaUIEnUS from '@univerjs/sheets-formula-ui/locale/en-US'
import SheetsFormulaUIZhCN from '@univerjs/sheets-formula-ui/locale/zh-CN'
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt'
import { UniverSheetsNumfmtUIPlugin } from '@univerjs/sheets-numfmt-ui'
import SheetsNumfmtUIEnUS from '@univerjs/sheets-numfmt-ui/locale/en-US'
import SheetsNumfmtUIZhCN from '@univerjs/sheets-numfmt-ui/locale/zh-CN'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US'
import SheetsUIZhCN from '@univerjs/sheets-ui/locale/zh-CN'
import { UniverUIPlugin } from '@univerjs/ui'
import UIEnUS from '@univerjs/ui/locale/en-US'
import UIZhCN from '@univerjs/ui/locale/zh-CN'
import '@univerjs/ui/facade'
import '@univerjs/docs-ui/facade'
import '@univerjs/sheets/facade'
import '@univerjs/sheets-ui/facade'
import '@univerjs/sheets-formula/facade'
import '@univerjs/sheets-numfmt/facade'
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'
import '@univerjs/sheets-formula-ui/lib/index.css'
import '@univerjs/sheets-numfmt-ui/lib/index.css'
import type { OfficeSpreadsheetHandle } from '../presentation'
import { reportResize } from '../runtime'
import { isUserWorkbookValueChange } from '../workbook-dirty'

const univerLocales = {
  [LocaleType.EN_US]: mergeLocales(
    DesignEnUS,
    UIEnUS,
    DocsUIEnUS,
    SheetsEnUS,
    SheetsUIEnUS,
    SheetsFormulaEnUS,
    SheetsFormulaUIEnUS,
    SheetsNumfmtUIEnUS
  ),
  [LocaleType.ZH_CN]: mergeLocales(
    DesignZhCN,
    UIZhCN,
    DocsUIZhCN,
    SheetsZhCN,
    SheetsUIZhCN,
    SheetsFormulaZhCN,
    SheetsFormulaUIZhCN,
    SheetsNumfmtUIZhCN
  )
}

export const OfficeSpreadsheetHost = React.forwardRef<OfficeSpreadsheetHandle, {
  documentKey: string
  snapshot: unknown
  locale: unknown
  onDirty: () => void
  onContextChange: () => void
}>(function OfficeSpreadsheetHost(props, ref) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const apiRef = React.useRef<ReturnType<typeof FUniver.newAPI> | null>(null)
  const unitRef = React.useRef<{ getSnapshot?: () => unknown } | null>(null)

  React.useEffect(() => {
    if (!containerRef.current) return
    const restoreCanvasPattern = guardBrokenProtectionPattern()
    const locale = String(props.locale ?? '').toLowerCase().startsWith('en') ? LocaleType.EN_US : LocaleType.ZH_CN
    const univer = new Univer({ locale, locales: univerLocales, logLevel: LogLevel.ERROR })
    univer.registerPlugin(UniverRenderEnginePlugin)
    univer.registerPlugin(UniverFormulaEnginePlugin)
    univer.registerPlugin(UniverUIPlugin, { container: containerRef.current, header: true, footer: true })
    univer.registerPlugin(UniverDocsPlugin)
    univer.registerPlugin(UniverDocsUIPlugin)
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin, { protectedRangeShadow: false })
    univer.registerPlugin(UniverSheetsNumfmtPlugin)
    univer.registerPlugin(UniverSheetsNumfmtUIPlugin)
    univer.registerPlugin(UniverSheetsFormulaPlugin)
    univer.registerPlugin(UniverSheetsFormulaUIPlugin)
    const unit = univer.createUnit(UniverInstanceType.UNIVER_SHEET, props.snapshot as Record<string, never>)
    const api = FUniver.newAPI(univer)
    let editorReady = false
    const readyTimer = window.setTimeout(() => { editorReady = true }, 500)
    const markDirty = () => { if (editorReady) props.onDirty() }
    const disposables = [
      api.addEvent?.(api.Event?.CommandExecuted, (event) => {
        if (isUserWorkbookValueChange(event)) markDirty()
      }),
      api.addEvent?.(api.Event?.SheetCreated, markDirty),
      api.addEvent?.(api.Event?.SheetDeleted, markDirty),
      api.addEvent?.(api.Event?.SheetMoved, markDirty),
      api.addEvent?.(api.Event?.SheetNameChanged, markDirty),
      api.addEvent?.(api.Event?.SelectionChanged, props.onContextChange)
    ]
    apiRef.current = api
    unitRef.current = unit
    const contextTimer = window.setTimeout(props.onContextChange, 0)
    window.setTimeout(reportResize, 0)
    return () => {
      window.clearTimeout(readyTimer)
      window.clearTimeout(contextTimer)
      disposables.forEach((disposable) => disposable?.dispose?.())
      univer.dispose?.()
      restoreCanvasPattern()
      apiRef.current = null
      unitRef.current = null
    }
  }, [props.documentKey, props.locale])

  React.useImperativeHandle(ref, () => ({
    getSnapshot() {
      return apiRef.current?.getActiveWorkbook?.()?.getSnapshot?.()
        ?? unitRef.current?.getSnapshot?.()
        ?? props.snapshot
    },
    getActiveSheetName() {
      return apiRef.current?.getActiveSheet?.()?.worksheet.getSheetName?.()
        ?? apiRef.current?.getActiveWorkbook?.()?.getActiveSheet?.()?.getSheetName?.()
    },
    getSelectedRange() {
      return apiRef.current?.getActiveSheet?.()?.worksheet.getSelection?.()?.getActiveRange?.()?.getA1Notation?.()
    }
  }), [props.snapshot])

  return <div className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-card" ref={containerRef}/>
})

export function firstSnapshotSheetName(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined
  const value = snapshot as { sheetOrder?: unknown; sheets?: Record<string, { name?: unknown }> }
  const ordered = Array.isArray(value.sheetOrder) ? value.sheetOrder : Object.keys(value.sheets ?? {})
  for (const id of ordered) {
    if (typeof id !== 'string') continue
    const name = value.sheets?.[id]?.name
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  return undefined
}

function guardBrokenProtectionPattern() {
  const prototype = globalThis.CanvasRenderingContext2D?.prototype
  if (!prototype) return () => undefined
  const original = prototype.createPattern
  prototype.createPattern = function guardedCreatePattern(image, repetition) {
    try {
      return original.call(this, image, repetition)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'InvalidStateError') return null
      throw error
    }
  }
  return () => { prototype.createPattern = original }
}
