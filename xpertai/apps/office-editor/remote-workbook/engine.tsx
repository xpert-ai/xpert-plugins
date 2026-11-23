import { peerCellsAtRevision } from '../src/lib/workbooks/peer-selection'
import type { ICollaborationPresence } from '@xpert-ai/plugin-sdk/collaboration-client'
import { z } from 'zod/v3'
// Sheet UI observers require a sheet unit and must not initialize in document editors.
import '@univerjs/sheets-ui/facade'
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CommandType, LifecycleService, LifecycleStages, LocaleService, ThemeService, type IWorkbookData, type Workbook, type Univer } from '@univerjs/core'
import { FormulaCalculationSessionService } from '@univerjs/sheets-formula'
import { InsertRowMutation, InsertColMutation, RemoveRowMutation, RemoveColMutation, MoveRowsMutation, MoveColsMutation,
  MoveRangeMutation, ReorderRangeMutation, InsertSheetMutation, RemoveSheetMutation, SetWorksheetNameMutation,
  SetRangeValuesMutation, type ISetRangeValuesMutationParams } from '@univerjs/sheets'
import { diffWorkbook } from '../src/lib/workbooks/core'
import { structuralState, type StructuralState } from '../src/lib/workbooks/structure/model'
import { fromUniver, reconcileSnapshotAxes } from '../src/lib/workbooks/univer-adapter'
import { BuiltInUIPart, IRibbonService, Ribbon } from '@univerjs/ui'
import { createOfficeUniver, FUniver, LocaleType, UniverInstanceType } from '../src/lib/remote-components/office-editor-workbench/src/univer-engine'
import { connectWorkbookRibbon, type WorkbookRibbon } from '../src/lib/remote-components/office-editor-workbench/src/workbook-ribbon'
import { onAppearanceChange } from '../remote-file/bridge'
import { i18n } from '../remote-file/i18n'
import { selectionWithinBounds, type WorkbookSelection } from '../src/lib/workbooks/selection'

export interface WorkbookHandle {
  snapshot(): IWorkbookData
  calculatedSnapshot(): Promise<IWorkbookData>
  selection(): WorkbookSelection | null
  acceptSavedSnapshot(snapshot: IWorkbookData): boolean
}
/** The existing Univer engine is reused; no private grid or second content copy.
 * Host appearance changes update engine services without remounting the workbook. */
export const WorkbookEngine = forwardRef<WorkbookHandle, {
  snapshot: IWorkbookData
  canWrite: boolean
  onDirty(): void
  /** Stable callback for a portal into Univer's native ribbon header. */
  onToolbarHost(host: HTMLDivElement | null): void
  onRibbon(state: WorkbookRibbon | null): void
  peers?: ICollaborationPresence[]
  revision: number
  highlights?: Array<{ sheetId: string; row: number; column: number }>
}>(function WorkbookEngine(props, ref) {
  const [ready, setReady] = useState(false)
  const container = useRef<HTMLDivElement>(null), current = useRef<{ univer: Univer; unit: Workbook; api: FUniver;
    axes?: StructuralState; epoch: string; structureChanged: boolean }>()
  const snapshot = () => {
    const engine = current.current
    if (!engine) throw new Error('office.editor_not_ready')
    const raw = engine.unit.save(), axes = reconcileSnapshotAxes(raw, engine.axes, engine.epoch, engine.structureChanged)
    return { ...raw, ...(axes ? { xpertStructure: axes } : {}) }
  }
  const dirty = useRef(props.onDirty); dirty.current = props.onDirty
  const writable = useRef(props.canWrite); writable.current = props.canWrite
  const applyingSavedSnapshot = useRef(false)
  useImperativeHandle(ref, () => ({ snapshot: () => {
    if (!current.current) throw new Error('office.editor_not_ready')
    return snapshot()
  }, acceptSavedSnapshot: next => {
    const engine = current.current
    if (!engine) return false
    const operations = diffWorkbook(fromUniver(snapshot()), fromUniver(next))
    // A save acknowledgement normally has no changes. Merge concurrent cells
    // into the live unit without resetting the viewport or local undo history.
    // Structural replacements still use the existing full-load boundary.
    if (operations.some(operation => operation.kind !== 'set_cell')) return false
    applyingSavedSnapshot.current = true
    try {
      for (const operation of operations) {
        if (operation.kind !== 'set_cell') continue
        const { sheetId, row, column } = operation
        const params: ISetRangeValuesMutationParams = {
          unitId: engine.unit.getUnitId(), subUnitId: sheetId, cellValue: { [row]: { [column]: null } }
        }
        // Univer merges cell properties; clear first so removed formulas/styles
        // cannot survive. Use mutations, not undoable user commands, and let
        // normal formula observers process the new values and dependencies.
        if (!engine.api.syncExecuteCommand(SetRangeValuesMutation.id, params)) return false
        const cell = next.sheets[sheetId].cellData?.[row]?.[column]
        if (cell && !engine.api.syncExecuteCommand(SetRangeValuesMutation.id,
          { ...params, cellValue: { [row]: { [column]: cell } } })) return false
      }
      const axes = structuralState.safeParse(Reflect.get(next, 'xpertStructure'))
      engine.axes = axes.success ? axes.data : undefined
      engine.structureChanged = false
      return true
    } finally { applyingSavedSnapshot.current = false }
  }, calculatedSnapshot: async () => {
    const engine = current.current
    if (!engine || container.current?.dataset.ready !== 'true') throw new Error('office.editor_not_ready')
    await engine.api.getFormula().onCalculationResultApplied(15000)
    if (current.current !== engine) throw new Error('office.selection_changed')
    const calculation = engine.univer.__getInjector().get(FormulaCalculationSessionService).state
    const calculated = snapshot()
    const formulas = Object.values(calculated.sheets).some(sheet => Object.values(sheet.cellData ?? {})
      .some(row => Object.values(row).some(cell => cell && typeof cell === 'object' && 'f' in cell && typeof cell.f === 'string' && Boolean(cell.f))))
    if (formulas && (!calculation.started || calculation.stopped || !calculation.resultApplied ||
      (!calculation.completed && !calculation.resultEmitted))) throw new Error('office.calculation_unavailable')
    return calculated
  }, selection: () => {
    if (container.current?.dataset.ready !== 'true') return null
    try {
    const selected = current.current?.api.getActiveWorkbook()?.getActiveRange()
    if (!selected) return null
    const { startRow, endRow, startColumn, endColumn } = selected.getRange()
    return { sheetId: selected.getSheetId(), startRow, endRow, startColumn, endColumn }
    } catch { return null } // A name-box edit can temporarily describe an invalid range.
  } }), [])
  useEffect(() => {
    if (!container.current) return
    let active = true
    const element = container.current
    element.style.pointerEvents = 'none'; setReady(false)
    // Preserve Univer's programmatic caret initialization while rejecting early
    // user input. Native inert also blocks that initialization in Chromium.
    const waitForRender = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation() }
    element.addEventListener('keydown', waitForRender, true)
    element.addEventListener('beforeinput', waitForRender, true)
    const acceptInput = () => {
      element.style.pointerEvents = ''
      element.removeEventListener('keydown', waitForRender, true)
      element.removeEventListener('beforeinput', waitForRender, true)
    }
    const locale = () => i18n.getLocale().startsWith('zh') ? LocaleType.ZH_CN : LocaleType.EN_US
    const univer = createOfficeUniver(container.current, locale(), { toolbar: false })
    const unit = univer.createUnit<IWorkbookData, Workbook>(UniverInstanceType.UNIVER_SHEET, props.snapshot)
    const api = FUniver.newAPI(univer), theme = univer.__getInjector().get(ThemeService)
    const ribbon = univer.__getInjector().get(IRibbonService)
    // Compose the public Ribbon component in a custom header. The shadcn bar's
    // portal mount stays stable, preserving focus when using arrow-key navigation.
    function WorkbookChrome() {
      const [activeTab, setActiveTab] = useState<string>()
      useEffect(() => {
        const subscription = ribbon.activatedTab$.subscribe(setActiveTab)
        return () => subscription.unsubscribe()
      }, [])
      return <>
        <div className="workbook-toolbar-mount" ref={props.onToolbarHost} />
        {/* Univer 0.25 resets its measurement refs only in its own tab click
          * handler. Public setActivatedTab does not; remount just Ribbon so its
          * overflow calculations never include the previous group's controls.
          * The workbook, canvas, selection and our navigation remain mounted. */}
        <Ribbon key={activeTab} ribbonType="classic" />
      </>
    }
    const toolbarPart = api.registerUIPart(BuiltInUIPart.CUSTOM_HEADER, WorkbookChrome)
    const stopRibbon = connectWorkbookRibbon(ribbon,
      univer.__getInjector().get(LocaleService), props.onRibbon)
    const appearance = () => {
      api.setLocale(locale())
      theme.setDarkMode(document.documentElement.classList.contains('dark'))
      const primary = getComputedStyle(document.documentElement).getPropertyValue('--xui-color-primary').trim()
      if (primary && CSS.supports('color', primary)) {
        const base = theme.getCurrentTheme()
        theme.setTheme({ ...base, primary: { ...base.primary, 500: primary, 600: primary } })
      }
    }
    appearance()
    const stopAppearance = onAppearanceChange(appearance)
    api.getActiveWorkbook()?.setEditable(props.canWrite)
    const axes = structuralState.safeParse(Reflect.get(props.snapshot, 'xpertStructure'))
    current.current = { univer, unit, api, axes: axes.success ? axes.data : undefined, epoch: crypto.randomUUID(), structureChanged: false }
    // Name-box and scroll commands require render-scoped controllers, which
    // Univer registers at Rendered after its visible chrome first mounts.
    void univer.__getInjector().get(LifecycleService).onStage(LifecycleStages.Rendered).then(() => {
      if (active) { acceptInput(); setReady(true) }
    }).catch(() => { /* Disposal before Rendered rejects the lifecycle wait. */ })
    // Ignore selection/scroll and local formula calculation. Univer marks snapshot
    // initialization and derived results explicitly; neither is a user edit.
    const listener = api.onCommandExecuted((command, options) => {
      const target = z.object({ unitId: z.string() }).safeParse(command.params)
      // Univer also creates internal rich-text documents. Their mutations do not
      // modify this workbook and must not set its tab dirty during initialization.
      if (command.type === CommandType.MUTATION && target.success && target.data.unitId === props.snapshot.id &&
        !options?.onlyLocal && !options?.fromChangeset && !applyingSavedSnapshot.current && writable.current) {
        if (current.current && [InsertRowMutation, InsertColMutation, RemoveRowMutation, RemoveColMutation, MoveRowsMutation,
          MoveColsMutation, MoveRangeMutation, ReorderRangeMutation, InsertSheetMutation, RemoveSheetMutation, SetWorksheetNameMutation]
          .some(mutation => mutation.id === command.id)) current.current.structureChanged = true
        dirty.current()
      }
    })
    return () => { active = false; acceptInput(); stopAppearance(); stopRibbon(); listener.dispose(); toolbarPart.dispose(); current.current = undefined; univer.dispose() }
  }, [props.snapshot, props.onToolbarHost, props.onRibbon])
  useEffect(() => { current.current?.api.getActiveWorkbook()?.setEditable(props.canWrite) }, [props.canWrite])
  useEffect(() => {
    if (!ready) return
    const book = current.current?.api.getActiveWorkbook()
    const marks = (props.highlights ?? []).slice(0, 200).flatMap(cell => {
      const sheet = book?.getSheetBySheetId(cell.sheetId)
      return sheet && cell.row < sheet.getMaxRows() && cell.column < sheet.getMaxColumns() ? [sheet.getRange(cell.row, cell.column, 1, 1).highlight({ stroke: '#2563eb', fill: 'rgba(37,99,235,0.12)' })] : []
    })
    const clear = () => marks.forEach(mark => mark.dispose())
    const timer = setTimeout(clear, 8000)
    return () => { clearTimeout(timer); clear() }
  }, [props.snapshot, props.highlights, ready])
  useEffect(() => {
    if (!ready) return
    const book = current.current?.api.getActiveWorkbook()
    const marks = (props.peers ?? []).slice(0, 32).flatMap(peer => {
      const cells = peerCellsAtRevision(peer, props.revision)
      const sheet = cells && book?.getSheetBySheetId(cells.sheetId)
      if (!cells || !sheet || !selectionWithinBounds(cells, sheet.getMaxRows(), sheet.getMaxColumns()) || !CSS.supports('color', peer.color)) return []
      return [sheet.getRange(cells.startRow, cells.startColumn, cells.endRow - cells.startRow + 1,
        cells.endColumn - cells.startColumn + 1).highlight({ stroke: peer.color, fill: 'transparent' })]
    })
    return () => marks.forEach(mark => mark.dispose())
  }, [props.snapshot, props.peers, props.revision, ready])
  return <div className="workbook-engine" ref={container} aria-busy={!ready} data-ready={ready} />
})
