import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { HostBridge } from './bridge'
import { i18n, errorKey, type MessageKey } from './i18n'
import { Workbench } from './workbench'

function App() {
  const [bridge] = React.useState(() => new HostBridge())
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState<MessageKey | null>(null)
  React.useEffect(() => {
    void bridge.connect().then(() => setReady(true)).catch(value => setError(errorKey(value instanceof Error ? value : new Error('host_request_failed'))))
    return () => bridge.dispose()
  }, [bridge])
  return <RemoteI18nProvider i18n={i18n}>{ready ? <Workbench bridge={bridge} /> : <main className="intake-empty bg-background text-foreground"><p role="status">{i18n.t(error ?? 'state.loading')}</p>{error && <Button onClick={() => location.reload()}>{i18n.t('action.retry')}</Button>}</main>}</RemoteI18nProvider>
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
