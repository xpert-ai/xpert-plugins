import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TriageApi } from './api.js'
import { App } from './App.js'
import { HostBridge } from './bridge.js'
import { ServicesContext } from './context.js'
import type { AppServices } from './context.js'
import { catalogs, createTimeFormatter, createTranslator, resolveLocale } from './i18n.js'

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing')
const root = createRoot(container)
const bridge = new HostBridge()

// Before `init` arrives the host locale is unknown: show both languages rather than guess.
root.render(<div className="xui-empty">{`${catalogs['zh-Hans']['app.loading']} / ${catalogs['en-US']['app.loading']}`}</div>)

bridge
  .connect()
  .then((init) => {
    const locale = resolveLocale(init.locale)
    document.documentElement.lang = locale
    const services: AppServices = {
      api: new TriageApi(bridge),
      t: createTranslator(locale),
      formatTime: createTimeFormatter(locale),
      subscribeHostEvents: (listener) => bridge.onHostEvent(listener)
    }
    bridge.fillViewport()
    root.render(
      <StrictMode>
        <ServicesContext.Provider value={services}>
          <App />
        </ServicesContext.Provider>
      </StrictMode>
    )
  })
  .catch(() => {
    root.render(<div className="xui-notice xui-notice-error">{`${catalogs['zh-Hans']['app.hostUnavailable']} / ${catalogs['en-US']['app.hostUnavailable']}`}</div>)
  })

window.addEventListener('pagehide', () => bridge.dispose())
