import { t, useLocale, i18n, useMessage } from './i18n'
import { Label } from '@xpert-ai/plugin-shadcn-ui'
import React, { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { ContentReferenceEntry, ContentReferenceTarget } from '@xpert-ai/contracts'
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, FileText } from '@xpert-ai/plugin-shadcn-ui'
import { action, upload } from './bridge'
import { referenceEntry, referencePage, referenceUri } from '../src/references'
import { insertAtAnchor } from './insert-content'

export function useResources(resourceId: string, kind: ContentReferenceTarget['kind'], open: boolean) {
  const [search, setSearch] = useState(''), [items, setItems] = useState<ContentReferenceEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(false), [error, setError] = useMessage('')
  const generation = useRef(0), busy = useRef(false)
  const load = async (append = false, expected = generation.current) => {
    if (busy.current) return
    busy.current = true; setLoading(true); setError('')
    try {
      const page = referencePage.parse(await action('reference.list', { resourceId, kind, query: search, pageSize: 25, ...(append && cursor ? { cursor } : {}) }))
      if (expected !== generation.current) return
      setItems((previous) => append ? [...previous, ...page.items.filter((item) => !previous.some((entry) => entry.resourceId === item.resourceId))] : page.items)
      setCursor(page.nextCursor)
    } catch (err) { if (expected === generation.current) setError(err instanceof Error ? err : i18n.message('resources.loadFailed')) }
    finally { if (expected === generation.current) { busy.current = false; setLoading(false) } }
  }
  useEffect(() => {
    generation.current++; busy.current = false; setItems([]); setCursor(null); setError('')
    if (!open) { setLoading(false); return }
    setLoading(true)
    const expected = generation.current, timer = setTimeout(() => void load(false, expected), 180)
    return () => { clearTimeout(timer); generation.current++; busy.current = false }
  }, [open, resourceId, kind, search])
  return { search, setSearch, items, loading, error, cursor, more: () => load(true), retry: () => load(false) }
}
export function ResourceResults({ resources, disabled, choose }: {
  resources: ReturnType<typeof useResources>; disabled: boolean; choose: (entry: ContentReferenceEntry) => void
}) {
  useLocale()
  return <>
    <Input autoFocus aria-label={t('resources.searchLabel')} placeholder={t('resources.searchPlaceholder')} value={resources.search} onChange={(event) => resources.setSearch(event.target.value)} />
    <div className="reference-results">{resources.items.map((item) => <Button type="button" variant="ghost" key={item.resourceId} disabled={disabled} onClick={() => choose(item)}>
      <FileText /><span>{item.title}<small>{item.path}</small></span></Button>)}
      {resources.loading && <p role="status">{t('resources.loading')}</p>}
      {!resources.loading && !resources.items.length && !resources.error && <p>{t('resources.empty')}</p>}
      {resources.error && <p role="alert">{resources.error} <Button variant="outline" onClick={() => void resources.retry()}>{t('common.retry')}</Button></p>}
      {resources.cursor && <Button variant="outline" disabled={resources.loading || disabled} onClick={() => void resources.more()}>{t('common.loadMore')}</Button>}
    </div>
  </>
}
export function ResourceDialog({ kind, resourceId, editor, anchor, writable, close }: {
  kind: ContentReferenceTarget['kind']; resourceId: string; editor: Editor | null; anchor: string; writable: boolean; close: () => void
}) {
  useLocale()
  const fileInput = useRef<HTMLInputElement>(null)
  const resources = useResources(resourceId, kind, true), [error, setError] = useMessage(''), [busy, setBusy] = useState(false)
  const [uploaded, setUploaded] = useState<ContentReferenceEntry | null>(null)
  const active = useRef(true), uploadPending = useRef(false)
  useEffect(() => () => { active.current = false }, [])
  const insert = (item: ContentReferenceEntry) => {
    if (!editor || !writable || !active.current) return
    try {
      const uri = referenceUri(item)
      insertAtAnchor(editor, anchor, { type: 'paragraph', content: kind === 'image'
        ? [{ type: 'image', attrs: { src: uri, alt: item.title, title: null } }]
        : [{ type: 'text', text: item.title, marks: [{ type: 'link', attrs: { href: uri } }] }] })
      close()
    } catch (err) { setError(err instanceof Error ? err : i18n.message('resources.insertFailed')) }
  }
  const selectFile = async (file?: File) => {
    if (!file || uploadPending.current || kind === 'page') return
    if (!file.size || file.size > 25 * 1024 * 1024) { setError(i18n.message('resources.sizeError')); return }
    uploadPending.current = true; setBusy(true); setError('')
    try {
      const item = referenceEntry.parse(await upload({ resourceId, kind }, file, 'reference.upload'))
      if (active.current) { setUploaded(item); insert(item) }
    } catch (err) { if (active.current) setError(err instanceof Error ? err : i18n.message('resources.uploadFailed')) }
    finally { if (active.current) setBusy(false); uploadPending.current = false }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) close() }}><DialogContent className="reference-dialog" onCloseAutoFocus={(event) => event.preventDefault()}>
    <DialogHeader><DialogTitle>{kind === 'image' ? t('resources.imageTitle') : kind === 'file' ? t('resources.fileTitle') : t('resources.pageTitle')}</DialogTitle>
      <DialogDescription>{t('resources.description')}{kind !== 'page' && t('resources.uploadLocation')}</DialogDescription></DialogHeader>
    {error && <p role="alert">{error}</p>}
    {uploaded && <p>{t('resources.uploaded')}<Button disabled={!writable} onClick={() => insert(uploaded)}>{t('resources.retryInsert')}</Button></p>}
    {kind !== 'page' && <div className="resource-upload">{busy ? t('resources.uploading') : kind === 'image' ? t('resources.imageLabel') : t('resources.fileLabel')}
      <Button variant="outline" disabled={busy || !writable || !!uploaded} onClick={() => fileInput.current?.click()}>{kind === 'image' ? t('resources.uploadImage') : t('resources.uploadFile')}</Button>
      <Input ref={fileInput} className="hidden" type="file" aria-label={kind === 'image' ? t('resources.uploadImage') : t('resources.uploadFile')} accept={kind === 'image' ? 'image/png,image/jpeg,image/gif,image/webp' : undefined}
        disabled={busy || !writable || !!uploaded} onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = '' }} /></div>}
    <ResourceResults resources={resources} disabled={busy || !writable} choose={insert} />
    <p className="menu-caption">{t('resources.exportNote')}</p>
  </DialogContent></Dialog>
}
