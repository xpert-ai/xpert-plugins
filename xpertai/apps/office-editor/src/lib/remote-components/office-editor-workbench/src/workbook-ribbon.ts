import type { LocaleService } from '@univerjs/core'
import type { IMenuSchema, IRibbonService } from '@univerjs/ui'

export type WorkbookRibbon = {
  label: string
  tabs: { id: string; label: string }[]
  activeId: string
  select(id: string): void
}

/** Adapt the public engine menu state to the surrounding shadcn UI. Menu IDs,
 * order, contextual visibility and translations remain owned by Univer. */
export function connectWorkbookRibbon(
  ribbon: Pick<IRibbonService, 'ribbon$' | 'activatedTab$' | 'setActivatedTab'>,
  locale: Pick<LocaleService, 'currentLocale$' | 'localeChanged$' | 't'>,
  publish: (state: WorkbookRibbon | null) => void
) {
  let tabs: IMenuSchema[] = [], activeId = '', disposed = false
  const select = (id: string) => {
    // A contextual menu may disappear between rendering and activation.
    if (!disposed && tabs.some(tab => tab.key === id)) ribbon.setActivatedTab(id)
  }
  const emit = () => publish({
    label: locale.t('ui.ribbon.menu'),
    tabs: tabs.map(tab => ({ id: tab.key, label: locale.t(tab.title || tab.key) })),
    activeId,
    select
  })
  const subscriptions = [
    ribbon.ribbon$.subscribe(value => { tabs = value; emit() }),
    ribbon.activatedTab$.subscribe(value => { activeId = value; emit() }),
    locale.currentLocale$.subscribe(emit),
    locale.localeChanged$.subscribe(emit)
  ]
  return () => {
    disposed = true
    subscriptions.forEach(subscription => subscription.unsubscribe())
    publish(null)
  }
}
