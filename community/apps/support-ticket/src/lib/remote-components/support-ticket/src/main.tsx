import { installBridge, post, reportResize } from './bridge'
import { SupportTicketWorkbench } from './components/workbench'
import { injectStyles } from './styles'
import type { HostContext } from './types'
import { React, ReactDOM } from './vendor'

const { useEffect, useState } = React
injectStyles()

function App() {
  const [context, setContext] = useState<HostContext | null>(null)
  const [hostEventTick, setHostEventTick] = useState(0)

  useEffect(() => {
    const dispose = installBridge({
      onInit: (next) => setContext(next),
      onHostEvent: () => setHostEventTick((tick) => tick + 1)
    })
    post('ready')
    return dispose
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(reportResize, 0)
    return () => window.clearTimeout(timer)
  })

  if (!context) {
    return (
      <main className="st-shell">
        <div className="st-empty">Support Ticket Workbench</div>
      </main>
    )
  }

  return <SupportTicketWorkbench context={context} hostEventTick={hostEventTick} />
}

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null
if (root) {
  root.render(<App />)
} else {
  ReactDOM.render?.(<App />, rootElement)
}
