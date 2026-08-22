import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import { installBridgeListener, postReady } from './bridge'
import type { HostContext } from './types'
import { React, ReactDOM } from './vendor'
import { ValveWorkbench } from './workbench'

const { useEffect, useState } = React

function App() {
  const [context, setContext] = useState<HostContext | null>(null)
  useEffect(() => {
    const dispose = installBridgeListener({
      onInit: setContext,
      onHostEvent: () => window.__valveWorkbenchReload?.()
    })
    postReady()
    return dispose
  }, [])
  if (!context) {
    return (
      <main className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground">
        Loading Valve Business Workbench…
      </main>
    )
  }
  return <ValveWorkbench context={context} />
}

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot?.(rootElement)
if (root) root.render(<App />)
else ReactDOM.render?.(<App />, rootElement)
