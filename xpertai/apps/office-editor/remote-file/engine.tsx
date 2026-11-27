import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CommandType, LifecycleService, LifecycleStages, ThemeService, type IWorkbookData } from '@univerjs/core'
import '@univerjs/sheets-ui/facade'
import { createOfficeUniver, FUniver, LocaleType } from '../src/lib/remote-components/office-editor-workbench/src/univer-engine'
import { unsupportedXlsxCommand, xlsxMenu } from '../src/lib/spreadsheets/xlsx-capabilities'
import { fileChangesSchema, type FileFormat, type FileChanges } from '../src/lib/spreadsheets/file-contract'
import { xlsxChanges } from '../src/lib/spreadsheets/xlsx-preservation'
import { onAppearanceChange } from './bridge'
import { i18n, t } from './i18n'

export interface FileEngineHandle {
  changes(): Promise<FileChanges>
  acceptSaved(): void
}

/** File edit state shares Office's engine; storage and revisions stay outside it. */
export const FileEngine = forwardRef<FileEngineHandle, {
  snapshot: IWorkbookData; format: FileFormat; canWrite: boolean; busy: boolean; onDirty(): void; onError(error: Error): void
}>(function FileEngine(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const current = useRef<{ api: FUniver; baseline: IWorkbookData; saved?: IWorkbookData }>()
  const callbacks = useRef(props); callbacks.current = props
  const [ready, setReady] = useState(false)
  useImperativeHandle(ref, () => ({
    async changes() {
      const engine = current.current, workbook = engine?.api.getActiveWorkbook()
      if (!engine || !workbook || !ready) throw i18n.error('sheet.loading')
      await workbook.endEditingAsync(true)
      const before = workbook.save()
      const hasFormulas = Object.values(before.sheets).some(sheet => Object.values(sheet.cellData ?? {})
        .some(row => Object.values(row).some(cell => cell && typeof cell === 'object' && 'f' in cell && Boolean(cell.f))))
      if (hasFormulas) {
        const formula = engine.api.getFormula()
        const applied = formula.onCalculationResultApplied(20000)
        formula.executeCalculation()
        await applied
      }
      if (current.current !== engine) throw i18n.error('bridge.contextChanged')
      const snapshot = workbook.save()
      const changes = props.format === 'xlsx' ? xlsxChanges(engine.baseline, snapshot) : { format: props.format, snapshot }
      engine.saved = snapshot
      return fileChangesSchema.parse(changes)
    },
    acceptSaved() {
      const engine = current.current
      if (engine?.saved) { engine.baseline = engine.saved; engine.saved = undefined }
    }
  }), [ready])
  useEffect(() => {
    if (!host.current) return
    let active = true, initialized = false
    setReady(false)
    const locale = () => i18n.getLocale().startsWith('zh') ? LocaleType.ZH_CN : LocaleType.EN_US
    const univer = createOfficeUniver(host.current, locale(), {
      ribbonType: 'collapsed',
      ...(props.format !== 'xls' ? { menu: xlsxMenu } : {})
    })
    const api = FUniver.newAPI(univer)
    const workbook = api.createWorkbook(props.snapshot)
    const theme = univer.__getInjector().get(ThemeService)
    const appearance = () => { api.setLocale(locale()); theme.setDarkMode(document.documentElement.classList.contains('dark')) }
    appearance()
    const stopAppearance = onAppearanceChange(appearance)
    current.current = { api, baseline: structuredClone(workbook.save()) }
    const guard = api.addEvent(api.Event.BeforeCommandExecute, event => {
      if (initialized && props.format !== 'xls' && unsupportedXlsxCommand(event.id)) {
        event.cancel = true
        callbacks.current.onError(i18n.error(props.format === 'xlsx' ? 'sheet.xlsxUnsupported' : 'sheet.delimitedLimitations'))
      }
    })
    const listener = api.onCommandExecuted((command, options) => {
      const params: unknown = command.params
      if (initialized && command.type === CommandType.MUTATION && !options?.onlyLocal && !options?.fromChangeset &&
        params && typeof params === 'object' && 'unitId' in params && params.unitId === workbook.getId()) callbacks.current.onDirty()
    })
    void univer.__getInjector().get(LifecycleService).onStage(LifecycleStages.Steady).then(() => {
      if (!active || !current.current) return
      current.current.baseline = structuredClone(workbook.save())
      workbook.setEditable(callbacks.current.canWrite)
      initialized = true; setReady(true)
    }).catch(error => { if (active) callbacks.current.onError(error instanceof Error ? error : i18n.error('bridge.editorUnavailable')) })
    return () => {
      active = false; stopAppearance(); guard.dispose(); listener.dispose(); current.current = undefined
      queueMicrotask(() => univer.dispose())
    }
  }, [props.snapshot, props.format])
  useEffect(() => { current.current?.api.getActiveWorkbook()?.setEditable(props.canWrite) }, [props.canWrite])
  return <div className="file-engine" onKeyDownCapture={event => { if (props.busy || !ready) { event.preventDefault(); event.stopPropagation() } }} aria-label={t('sheet.label')} aria-busy={!ready}>
    {!ready && <p role="status">{t('sheet.loading')}</p>}
    <div className="file-engine-canvas" ref={host} style={{ pointerEvents: ready && !props.busy ? undefined : 'none' }} />
  </div>
})
