import { BehaviorSubject, Subject } from 'rxjs'
import type { LocaleService } from '@univerjs/core'
import type { IMenuSchema } from '@univerjs/ui'
import { connectWorkbookRibbon, type WorkbookRibbon } from './workbook-ribbon.js'

describe('workbook ribbon navigation', () => {
  it('follows engine menus, context changes and locale without recreating the workbook', () => {
    const ribbon$ = new BehaviorSubject<IMenuSchema[]>([{ key: 'sheet.home', order: 0 }])
    const activatedTab$ = new BehaviorSubject('sheet.home')
    const setActivatedTab = jest.fn((id: string) => activatedTab$.next(id))
    const currentLocale$ = new Subject<never>(), localeChanged$ = new Subject<void>()
    let language = 'en', state: WorkbookRibbon | null = null
    const publish = jest.fn((value: WorkbookRibbon | null) => { state = value })
    const locale: Pick<LocaleService, 'currentLocale$' | 'localeChanged$' | 't'> = {
      currentLocale$, localeChanged$, t: key => `${language}:${key}`
    }
    const stop = connectWorkbookRibbon({ ribbon$, activatedTab$, setActivatedTab }, locale, publish)
    expect(state?.activeId).toBe('sheet.home')

    // An extension adds a contextual tab; no hardcoded Start/Formula/Data list.
    ribbon$.next([{ key: 'sheet.home', order: 0 }, { key: 'chart.tools', title: 'chart.title', contextual: true, order: 1 }])
    expect(state?.tabs).toEqual([{ id: 'sheet.home', label: 'en:sheet.home' }, { id: 'chart.tools', label: 'en:chart.title' }])
    state?.select('chart.tools')
    expect(state?.activeId).toBe('chart.tools')
    activatedTab$.next('sheet.home')
    expect(state?.activeId).toBe('sheet.home')

    language = 'zh'; currentLocale$.next(undefined as never)
    expect(state?.tabs[1].label).toBe('zh:chart.title')
    language = 'en'; localeChanged$.next()
    expect(state?.label).toBe('en:ui.ribbon.menu')

    const staleSelect = state!.select
    ribbon$.next([{ key: 'sheet.home', order: 0 }])
    setActivatedTab.mockClear()
    staleSelect('chart.tools')
    expect(setActivatedTab).not.toHaveBeenCalled()
    stop()
    expect(state).toBeNull()
    publish.mockClear()
    activatedTab$.next('chart.tools'); localeChanged$.next(); ribbon$.next([])
    staleSelect('sheet.home')
    expect(publish).not.toHaveBeenCalled()
    expect(setActivatedTab).not.toHaveBeenCalled()
  })
})
