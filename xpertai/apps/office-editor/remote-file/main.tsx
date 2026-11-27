import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import { connect } from './bridge'
import { SheetEditor } from './sheet'
import { fileTargetSchema } from '../src/lib/spreadsheets/file-contract'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { t, i18n, useLocale } from './i18n'
const selection = z.object({ selectionId: z.string().min(1), parameters: z.object({ contentProvider: z.string().min(1), filePath: z.string().optional(), contentEditor: z.string().optional() }) }).transform(query => ({
  id: query.selectionId, target: query.parameters.contentProvider === 'platform.workspace.file'
    ? { kind: 'file', path: query.parameters.filePath, editorKey: query.parameters.contentEditor }
    : { kind: 'resource', resourceId: query.selectionId, providerKey: query.parameters.contentProvider }
})).pipe(z.object({ id: z.string(), target: fileTargetSchema }))
function App() {
  useLocale()
  const [source, setSource] = useState<z.infer<typeof selection> | null>(null)
  useEffect(() => connect(query => { const parsed = selection.safeParse(query); setSource(parsed.success ? parsed.data : null) }), [])
  return <main className="office-file">{source ? <SheetEditor key={JSON.stringify(source)} resourceId={source.id} target={source.target} /> : <p role="status">{t('sheet.choose')}</p>}</main>
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App /></RemoteI18nProvider>)
