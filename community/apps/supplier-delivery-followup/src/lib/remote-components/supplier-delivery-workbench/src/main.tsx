import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import { TooltipProvider } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { connectBridge, type HostContext } from './bridge'
import { i18n, t, useLocale } from './i18n'
import { React, ReactDOM } from './vendor'
import { Workbench } from './app'

const { useEffect, useState } = React

function App() {
  useLocale()
  const [context, setContext] = useState<HostContext | null>(null)
  useEffect(() => connectBridge({ onInit: setContext }), [])
  if (!context) {
    return (
      <main role="status" className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground">
        {t('app.loading')}
      </main>
    )
  }
  return <Workbench />
}

const rootElement = document.getElementById('root')
const tree = (
  <RemoteI18nProvider i18n={i18n}>
    <TooltipProvider delayDuration={300}>
      <App />
    </TooltipProvider>
  </RemoteI18nProvider>
)
const root = ReactDOM.createRoot?.(rootElement)
if (root) root.render(tree)
else ReactDOM.render?.(tree, rootElement)
