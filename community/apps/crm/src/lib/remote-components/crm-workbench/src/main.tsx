import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui'
import { installBridgeListener, post, reportResize } from './bridge'
import { CrmWorkbench } from './components/workbench'
import { TEXT } from './i18n'
import { injectStyles } from './styles'
import type { HostContext } from './types'
import { React, ReactDOM } from './vendor'

const { useEffect, useState } = React

installShadcnThemeVars({ styleId: 'crm-workbench-shadcn-ui-vars' })
injectStyles()

function App() {
  const [context, setContext] = useState<HostContext | null>(null)

  useEffect(() => {
    const disposeBridge = installBridgeListener({
      onInit: setContext,
      onHostEvent: () => window.__crmReload?.()
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
      <main className="crm20-shell crm20-shell-loading">
        <div className="crm20-empty">{TEXT.zh_Hans.loading}</div>
      </main>
    )
  }

  return <CrmWorkbench context={context} />
}

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null
if (root) {
  root.render(<App />)
} else {
  ReactDOM.render?.(<App />, rootElement)
}
