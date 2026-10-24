import { t, useLocale, i18n, useMessage } from './i18n'
import { Label } from '@xpert-ai/plugin-shadcn-ui'
import React, { useCallback, useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Input, FileText, Plus, ArrowLeft, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@xpert-ai/plugin-shadcn-ui'
import { action, openDocument } from './bridge'

const entry = z.object({ resourceId: z.string().uuid(), title: z.string(), path: z.string() })
const hierarchy = z.object({ supported: z.boolean(), canCreate: z.boolean(), parent: entry.nullable(), children: z.array(entry), hasMore: z.boolean() })
export function useSubpages(resourceId: string) {
  const [value, setValue] = useState<z.infer<typeof hierarchy> | null>(null), [error, setError] = useMessage('')
  const refresh = useCallback(async () => {
    try { setValue(hierarchy.parse(await action('document.hierarchy', { resourceId }))); setError('') }
    catch (err) { setError(err instanceof Error ? err : i18n.message('subpages.loadFailed')) }
  }, [resourceId])
  useEffect(() => { void refresh() }, [refresh])
  return { value, error, refresh }
}
type Pages = ReturnType<typeof useSubpages>
export function ParentPage({ pages, navigate }: { pages: Pages; navigate: (id: string) => void }) {
  useLocale()
  return pages.value?.parent ? <nav className="page-breadcrumb" aria-label={t('subpages.hierarchy')}><Button variant="ghost" onClick={() => navigate(pages.value!.parent!.resourceId)}><ArrowLeft />{pages.value.parent.title}</Button><span>{t('subpages.currentSuffix')}</span></nav> : null
}
export function ChildPages({ pages, writable, create, navigate }: { pages: Pages; writable: boolean; create: () => void; navigate: (id: string) => void }) {
  useLocale()
  if (pages.error) return <div className="child-pages" role="status">{pages.error}<Button variant="ghost" onClick={() => void pages.refresh()}>{t('subpages.reload')}</Button></div>
  if (!pages.value?.supported) return null
  return <section className="child-pages" aria-label={t('insert.childPage')}><header><h2>{t('insert.childPage')}</h2><Button variant="ghost" onClick={() => void pages.refresh()}>{t('common.refresh')}</Button>
    {writable && pages.value.canCreate && <Button variant="ghost" onClick={create}><Plus />{t('subpages.new')}</Button>}</header>
    {pages.value.children.map((item) => <Button type="button" variant="ghost" className="child-page-link" key={item.resourceId} onClick={() => navigate(item.resourceId)}><FileText /><span>{item.title}</span></Button>)}
    {!pages.value.children.length && <p>{t('subpages.empty')}</p>}
    {pages.value.hasMore && <p>{t('subpages.limit')}</p>}
  </section>
}
export function CreateSubpageDialog({ resourceId, writable, flush, refresh, close }: {
  resourceId: string; writable: boolean; flush: () => Promise<boolean>; refresh: () => Promise<void>; close: () => void
}) {
  useLocale()
  const [title, setTitle] = useState(''), [requestId] = useState(() => crypto.randomUUID())
  const [attempted, setAttempted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useMessage('')
  const [created, setCreated] = useState<string | null>(null)
  const submit = async () => {
    if (!writable || busy) return
    setBusy(true); setError('')
    try {
      if (!await flush()) throw i18n.error('subpages.saveFirst')
      setAttempted(true)
      const id = created ?? z.object({ id: z.string().uuid() }).parse(await action('document.createChild', { resourceId, title: title.trim(), requestId })).id
      setCreated(id); await refresh()
      await openDocument(id)
      close()
    } catch (err) { setError(err instanceof Error ? err : i18n.message('subpages.createFailed')) }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) close() }}><DialogContent className="reference-dialog">
    <DialogHeader><DialogTitle>{created ? t('subpages.created') : t('subpages.createTitle')}</DialogTitle><DialogDescription>{t('subpages.description')}</DialogDescription></DialogHeader>
    <form className="reference-form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <Label>{t('subpages.name')}<Input autoFocus aria-label={t('subpages.namePlaceholder')} value={title} maxLength={180} disabled={attempted || busy || !writable} onChange={(event) => setTitle(event.target.value)} /></Label>
      {error && <p role="alert">{error}{attempted && t('subpages.retryNote')}</p>}
      <Button type="submit" disabled={!title.trim() || !writable || busy}>{busy ? t('subpages.creating') : created ? t('subpages.open') : attempted ? t('subpages.retry') : t('subpages.createOpen')}</Button>
    </form>
  </DialogContent></Dialog>
}
