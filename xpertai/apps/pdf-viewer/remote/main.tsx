import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { connect, viewIdentity } from './bridge'
import { Editor } from './editor'
import { i18n, t, useLocale } from './i18n'
import './styles.css'

const querySchema = z.object({ selectionId: z.string().min(1).max(200), parameters: z.object({ contentProvider: z.string().min(1), filePath: z.string().optional() }) })
function App() {
  useLocale()
  const [state,setState]=useState<{query:z.infer<typeof querySchema>; identity:string} | null>(null)
  const [initialized, setInitialized] = useState(false)
  useEffect(()=>connect(value=>{const parsed=querySchema.safeParse(value);setState(parsed.success?{query:parsed.data,identity:viewIdentity()}:null); setInitialized(true)}),[])
  const query=state?.query
  return query ? <Editor key={`${state.identity}:${query.parameters.contentProvider}:${query.selectionId}`} source={{resourceId:query.selectionId,providerKey:query.parameters.contentProvider, ...(query.parameters.filePath ? {filePath:query.parameters.filePath} : {})}}/> : initialized ? <p className="p-6">{t('document.empty')}</p> : <p className="p-6" role="status">{t('document.loading')}</p>
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App/></RemoteI18nProvider>)
