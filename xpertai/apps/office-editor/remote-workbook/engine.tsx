import { z } from 'zod/v3'
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CommandType, LocaleService, ThemeService, type IWorkbookData, type Workbook, type Univer } from '@univerjs/core'
import { BuiltInUIPart, IRibbonService, Ribbon } from '@univerjs/ui'
import { createOfficeUniver, FUniver, LocaleType, UniverInstanceType } from '../src/lib/remote-components/office-editor-workbench/src/univer-engine'
import { connectWorkbookRibbon, type WorkbookRibbon } from '../src/lib/remote-components/office-editor-workbench/src/workbook-ribbon'
import { onAppearanceChange } from '../remote-file/bridge'
import { i18n } from '../remote-file/i18n'

export interface WorkbookHandle { snapshot(): IWorkbookData }
/** The existing Univer engine is reused; no private grid or second content copy.
 * Host appearance changes update engine services without remounting the workbook. */
export const WorkbookEngine = forwardRef<WorkbookHandle, {
  snapshot: IWorkbookData
  canWrite: boolean
  onDirty(): void
  /** Stable callback for a portal into Univer's native ribbon header. */
  onToolbarHost(host: HTMLDivElement | null): void
  onRibbon(state: WorkbookRibbon | null): void
}>(function WorkbookEngine(props, ref) {
  const container = useRef<HTMLDivElement>(null), current = useRef<{ univer: Univer; unit: Workbook; api: FUniver }>()
  const dirty = useRef(props.onDirty); dirty.current = props.onDirty
  const writable = useRef(props.canWrite); writable.current = props.canWrite
  useImperativeHandle(ref, () => ({ snapshot: () => {
    if (!current.current) throw new Error('office.editor_not_ready')
    return current.current.unit.save()
  } }), [])
  useEffect(() => {
    if (!container.current) return
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
    current.current = { univer, unit, api }
    // Ignore selection/scroll and local formula calculation. Univer marks snapshot
    // initialization and derived results explicitly; neither is a user edit.
    const listener = api.onCommandExecuted((command, options) => {
      const target = z.object({ unitId: z.string() }).safeParse(command.params)
      // Univer also creates internal rich-text documents. Their mutations do not
      // modify this workbook and must not set its tab dirty during initialization.
      if (command.type === CommandType.MUTATION && target.success && target.data.unitId === props.snapshot.id &&
        !options?.onlyLocal && !options?.fromChangeset && writable.current) dirty.current()
    })
    return () => { stopAppearance(); stopRibbon(); listener.dispose(); toolbarPart.dispose(); current.current = undefined; univer.dispose() }
  }, [props.snapshot, props.onToolbarHost, props.onRibbon])
  useEffect(() => { current.current?.api.getActiveWorkbook()?.setEditable(props.canWrite) }, [props.canWrite])
  return <div className="workbook-engine" ref={container} />
})
