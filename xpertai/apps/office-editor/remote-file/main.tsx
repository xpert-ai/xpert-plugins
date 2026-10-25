import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import { connect } from './bridge'
import { SheetEditor } from './sheet'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { t, i18n, useLocale } from './i18n'
const selection = z.object({ selectionId: z.string().uuid(), parameters: z.object({ contentProvider: z.string().min(1) }) })
function App() {
  useLocale()
  const [source, setSource] = useState<z.infer<typeof selection> | null>(null)
  useEffect(() => connect(query => { const parsed = selection.safeParse(query); setSource(parsed.success ? parsed.data : null) }), [])
  return <main className="office-file">{source ? <SheetEditor key={`${source.parameters.contentProvider}:${source.selectionId}`} resourceId={source.selectionId} providerKey={source.parameters.contentProvider} /> : <p role="status">{t('sheet.choose')}</p>}</main>
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App /></RemoteI18nProvider>)
