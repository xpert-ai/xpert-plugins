import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import { installBridgeListener, postReady } from './bridge'
import type { HostContext } from './types'
import { React, ReactDOM } from './vendor'
import { MeetingWorkbench } from './workbench'
import { CATALOG } from './i18n'

const { useEffect, useState } = React

function App() {
  const [context, setContext] = useState<HostContext | null>(null)
  useEffect(() => {
    const dispose = installBridgeListener({
      onInit: setContext,
      onHostEvent: () => window.__meetingWorkbenchReload?.()
    })
    postReady()
    return dispose
  }, [])
  if (!context) {
    return <main className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground">{CATALOG['zh-Hans'].loading}</main>
  }
  return <MeetingWorkbench context={context} />
}

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot?.(rootElement)
if (root) root.render(<App />)
else ReactDOM.render?.(<App />, rootElement)
