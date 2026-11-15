import { Inject, Injector, Plugin, LocaleType, LogLevel, Univer, UniverInstanceType, mergeLocales } from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import DesignEnUS from '@univerjs/design/locale/en-US'
import DesignZhCN from '@univerjs/design/locale/zh-CN'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US'
import DocsUIZhCN from '@univerjs/docs-ui/locale/zh-CN'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { IRenderManagerService, type IRender, UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import SheetsEnUS from '@univerjs/sheets/locale/en-US'
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
import SheetsZhCN from '@univerjs/sheets/locale/zh-CN'
import { UniverSlidesPlugin } from '@univerjs/slides'
import {
  ActivateSlidePageOperation,
  AppendSlideOperation,
  SlideAddTextOperation,
  UniverSlidesUIPlugin,
  UpdateSlideElementOperation
} from '@univerjs/slides-ui'
import SlidesUIEnUS from '@univerjs/slides-ui/locale/en-US'
import SlidesUIZhCN from '@univerjs/slides-ui/locale/zh-CN'
import { UniverUIPlugin, type IUniverUIConfig } from '@univerjs/ui'
import UIEnUS from '@univerjs/ui/locale/en-US'
import UIZhCN from '@univerjs/ui/locale/zh-CN'
import '@univerjs/ui/facade'
import '@univerjs/docs-ui/facade'
import '@univerjs/sheets/facade'
import '@univerjs/sheets-formula/facade'
import '@univerjs/sheets-numfmt/facade'
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'
import '@univerjs/sheets-formula-ui/lib/index.css'
import '@univerjs/sheets-numfmt-ui/lib/index.css'
import '@univerjs/slides-ui/lib/index.css'
const univerLocaleBundles = {
  [LocaleType.EN_US]: mergeLocales(
    DesignEnUS,
    UIEnUS,
    DocsUIEnUS,
    SheetsEnUS,
    SheetsUIEnUS,
    SheetsFormulaEnUS,
    SheetsFormulaUIEnUS,
    SheetsNumfmtUIEnUS,
    SlidesUIEnUS
  ),
  [LocaleType.ZH_CN]: mergeLocales(
    DesignZhCN,
    UIZhCN,
    DocsUIZhCN,
    SheetsZhCN,
    SheetsUIZhCN,
    SheetsFormulaZhCN,
    SheetsFormulaUIZhCN,
    SheetsNumfmtUIZhCN,
    SlidesUIZhCN
  )
}

/** Fit the native slide scene to its actual editor viewport, including sidebar resizing. */
class OfficeSlideViewportPlugin extends Plugin {
  static override pluginName = 'office-slide-viewport'
  static override type = UniverInstanceType.UNIVER_SLIDE
  constructor(_config: unknown, protected readonly _injector: Injector) { super() }
  override onRendered() {
    const manager = this._injector.get(IRenderManagerService)
    const wired = new Set<string>()
    const wire = (render: IRender) => {
      if (render.type !== UniverInstanceType.UNIVER_SLIDE || render.isThumbNail || wired.has(render.unitId)) return
      wired.add(render.unitId)
      let frame = 0
      const schedule = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          const { engine, scene, mainComponent: slide } = render
          if (!slide || !slide.width || !slide.height || engine.width < 1 || engine.height < 1) return
          const scale = Math.max(0.1, Math.min(1, (engine.width - 64) / slide.width, (engine.height - 64) / slide.height))
          scene.scale(scale, scale)
          for (const viewport of scene.getViewports()) viewport.scrollToViewportPos({
            // Viewport scrolling uses unscaled scene coordinates.
            viewportScrollX: Math.max(0, (scene.width - engine.width / scale) / 2),
            viewportScrollY: Math.max(0, (scene.height - engine.height / scale) / 2)
          })
        })
      }
      const resize = render.engine.onTransformChange$.subscribeEvent(schedule)
      this.disposeWithMe({ dispose: () => { cancelAnimationFrame(frame); resize.unsubscribe() } })
      schedule()
    }
    manager.getRenderAll().forEach(wire)
    const created = manager.created$.subscribe(wire)
    this.disposeWithMe({ dispose: () => created.unsubscribe() })
  }
}

Inject(Injector)(OfficeSlideViewportPlugin, undefined, 1)

export function createOfficeUniver(container: HTMLElement, locale: LocaleType, ui: Pick<IUniverUIConfig, 'toolbar'> = {}) {
  const univer = new Univer({ locale, locales: univerLocaleBundles, logLevel: LogLevel.ERROR })
    univer.registerPlugin(UniverRenderEnginePlugin)
    univer.registerPlugin(UniverFormulaEnginePlugin)
    univer.registerPlugin(UniverUIPlugin, {
      container: container,
      header: true,
      footer: true,
      ...ui
    })
    univer.registerPlugin(UniverDocsPlugin)
    univer.registerPlugin(UniverDocsUIPlugin)
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin)
    univer.registerPlugin(UniverSheetsNumfmtPlugin)
    univer.registerPlugin(UniverSheetsNumfmtUIPlugin)
    univer.registerPlugin(UniverSheetsFormulaPlugin)
    univer.registerPlugin(UniverSheetsFormulaUIPlugin)
    univer.registerPlugin(UniverSlidesPlugin)
    univer.registerPlugin(UniverSlidesUIPlugin)
    univer.registerPlugin(OfficeSlideViewportPlugin)

  return univer
}
export { FUniver, LocaleType, UniverInstanceType }
