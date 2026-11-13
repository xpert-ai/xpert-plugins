import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import { installBridgeListener, post, reportResize } from './bridge'
import { VehiclePickupWorkbench } from './workbench'
import type { HostContext } from './types'
import { React, ReactDOM } from './vendor'

const { useEffect, useState } = React

function App() {
  const [context, setContext] = useState<HostContext | null>(null)

  useEffect(() => {
    const dispose = installBridgeListener({
      onInit: setContext,
      onHostEvent: () => window.__vehiclePickupReload?.()
    })
    post('ready')
    return dispose
  }, [])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setTimeout(reportResize, 0))
    observer.observe(root)
    setTimeout(reportResize, 0)
    return () => observer.disconnect()
  }, [])

  if (!context) {
    return <main className="vp-shell vp-loading">正在载入自提申请…</main>
  }
  return <VehiclePickupWorkbench context={context} />
}

const container = document.getElementById('root')
const root = ReactDOM.createRoot?.(container)
if (root) root.render(<App />)
else ReactDOM.render?.(<App />, container)
