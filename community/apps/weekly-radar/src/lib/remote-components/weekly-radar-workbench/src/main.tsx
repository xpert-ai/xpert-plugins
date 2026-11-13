import { installBridgeListener, post, reportResize } from './bridge'
import { WeeklyRadarWorkbench } from './components/workbench'
import { TEXT } from './i18n'
import { injectStyles } from './styles'
import type { HostContext } from './types'
import { React, ReactDOM } from './vendor'

const { useEffect, useState } = React
injectStyles()

function App() {
  const [context, setContext] = useState<HostContext | null>(null)

  useEffect(() => {
    const disposeBridge = installBridgeListener({
      onInit: setContext,
      onHostEvent: () => window.__radarReload?.()
    })
    post('ready')
    return disposeBridge
  }, [])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setTimeout(reportResize, 0))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setTimeout(reportResize, 0)
  })

  if (!context) {
    return (
      <main className="radar-shell">
        <div className="radar-loading">{TEXT.zh_Hans.loading}</div>
      </main>
    )
  }

  return <WeeklyRadarWorkbench context={context} />
}

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null
if (root) {
  root.render(<App />)
} else {
  ReactDOM.render?.(<App />, rootElement)
}
