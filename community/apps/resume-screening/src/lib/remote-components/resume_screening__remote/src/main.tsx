import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import { installBridgeListener, postReady } from './bridge'
import { i18n, RemoteI18nProvider } from './i18n'
import type { HostContext } from './types'
import { React, ReactDOM } from './vendor'
import { ResumeWorkbench } from './workbench'

const { useEffect, useState } = React

function App() {
  const [context, setContext] = useState<HostContext | null>(null)
  useEffect(() => {
    const dispose = installBridgeListener({
      onInit: (next) => {
        i18n.setLocale(next.locale)
        setContext(next)
      },
      onHostEvent: () => window.__resumeScreeningReload?.()
    })
    postReady()
    return dispose
  }, [])
  if (!context) {
    return (
      <main className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground">
        {i18n.t('loading')}
      </main>
    )
  }
  return (
    <RemoteI18nProvider i18n={i18n}>
      <ResumeWorkbench context={context} />
    </RemoteI18nProvider>
  )
}

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot?.(rootElement)
if (root) root.render(<App />)
else ReactDOM.render?.(<App />, rootElement)
