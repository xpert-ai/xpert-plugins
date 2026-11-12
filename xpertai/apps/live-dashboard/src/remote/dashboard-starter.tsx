import * as React from 'react'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Database, WandSparkles, Table2, ChevronRight } from '@xpert-ai/plugin-shadcn-ui'
import type { messages } from './i18n'
import { openLibrary } from './library-gateway'
import type { LibraryPage } from '../lib/library.schema'

/** @beta Starter navigation and entry points may change during the workbench rollout. */
export function DashboardStarter({ t, onStart }: { t: ReturnType<typeof messages>; onStart: (text: string) => Promise<void> }) {
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('')
  async function navigate(page: LibraryPage) { setBusy(true); setError(''); try { await openLibrary(page) } catch (e) { setError(e instanceof Error ? e.message : t.error) } finally { setBusy(false) } }
  return <section className="mx-auto h-full max-w-5xl space-y-6 overflow-auto p-6" aria-label={t.libNewTitle}>
    <div className="space-y-3 py-6"><h2 className="text-2xl font-semibold tracking-tight">{t.libNewTitle}</h2><p className="max-w-2xl text-muted-foreground">{t.libNewHint}</p></div>
    <div className="grid gap-4 lg:grid-cols-3">{([
      { page: 'data', title: t.libMyData, hint: t.libNewDataHint, Icon: Database },
      { page: 'templates', title: t.libTemplates, hint: t.libNewTemplateHint, Icon: Table2 },
      { page: 'explore', title: t.libExplore, hint: t.libNewExploreHint, Icon: WandSparkles }
    ] as const).map(({page,title,hint,Icon}) => <Card key={page}><CardHeader><Icon className="text-primary"/><CardTitle>{title}</CardTitle><CardDescription>{hint}</CardDescription></CardHeader><CardContent><Button variant={page === 'data' ? 'default' : 'outline'} disabled={busy} onClick={() => void navigate(page)}>{t.libStart}<ChevronRight/></Button></CardContent></Card>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5"><p className="text-sm text-muted-foreground">{t.libDescribeQuestion}</p><Button variant="ghost" disabled={busy} onClick={() => void onStart(t.realDataPrompt)}>{t.libAskAssistant}<ChevronRight/></Button></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>
}
