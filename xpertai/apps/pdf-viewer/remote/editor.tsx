import { useEffect, useRef, useState } from 'react'
import { Button, Input } from '@xpert-ai/plugin-shadcn-ui'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { z } from 'zod'
import { action, download } from './bridge'
import { decode, openPdf } from './engine'
import { Page } from './page'
import { t, useLocale } from './i18n'
import 'pdfjs-dist/web/pdf_viewer.css'

type Source = { resourceId: string; providerKey: string; filePath?: string }
export function Editor({ source }: { source: Source }) {
  useLocale()
  const [pdf, setPdf] = useState<PDFDocumentProxy>(), [title, setTitle] = useState(''), [page, setPage] = useState(1)
  const [scale, setScale] = useState(1), [fit, setFit] = useState(true), [sidebar, setSidebar] = useState(true)
  const [error, setError] = useState<'document.previewFailed' | 'document.limit' | null>(null), [retry, setRetry] = useState(0)
  const [password, setPassword] = useState(''), [locked, setLocked] = useState(false)
  const unlock = useRef<((value: string) => void) | null>(null)
  const [search, setSearch] = useState(''), [searching, setSearching] = useState(false), [notFound, setNotFound] = useState(false)
  const searchEpoch = useRef(0), canvas = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true, opened: ReturnType<typeof openPdf> | undefined
    setError(null); setPdf(undefined); setLocked(false); setPassword(''); setPage(1); searchEpoch.current++
    void (async () => {
      const result = z.object({ contentBase64: z.string(), title: z.string() }).parse(await action('file.read', source))
      if (!active) return
      setTitle(result.title); opened = openPdf(decode(result.contentBase64))
      opened.task.onPassword = update => { if (active) { opened?.awaitPassword(); unlock.current = update; setLocked(true); setPassword('') } }
      const next = await opened.promise
      if (!active) return
      if (next.numPages > 1000) { setError('document.limit'); await opened.destroy(); return }
      setLocked(false); unlock.current = null; setPdf(next)
    })().catch(() => { if (active) { setLocked(false); setError('document.previewFailed') }; void opened?.destroy().catch(() => {}) })
    return () => { active = false; searchEpoch.current++; unlock.current = null; void opened?.destroy().catch(() => {}) }
  }, [source.resourceId, source.providerKey, source.filePath, retry])
  useEffect(() => {
    if (!pdf || !fit || !canvas.current) return
    let active = true
    const resize = async () => {
      const p = await pdf.getPage(page)
      if (!active || !canvas.current) return
      const size = p.getViewport({ scale: 1 }), area = canvas.current
      setScale(Math.max(0.1, Math.min(4, (area.clientWidth - 40) / size.width, (area.clientHeight - 40) / size.height)))
    }
    const observer = new ResizeObserver(() => void resize().catch(() => {})); observer.observe(canvas.current); void resize().catch(() => {})
    return () => { active = false; observer.disconnect() }
  }, [pdf, page, fit, sidebar])
  const find = async () => {
    if (!pdf || !search.trim()) return
    const epoch = ++searchEpoch.current, query = search.trim().toLocaleLowerCase()
    setSearching(true); setNotFound(false)
    try {
      for (let offset = 1; offset <= pdf.numPages; offset++) {
        const number = ((page - 1 + offset) % pdf.numPages) + 1
        const content = await (await pdf.getPage(number)).getTextContent()
        if (epoch !== searchEpoch.current) return
        const text = content.items.map(item => 'str' in item ? item.str : '').join(' ').toLocaleLowerCase()
        if (text.includes(query)) { setPage(number); return }
      }
      setNotFound(true)
    } catch { if (epoch === searchEpoch.current) setError('document.previewFailed') }
    finally { if (epoch === searchEpoch.current) setSearching(false) }
  }
  return <main className="document-root">
    <a href="#pdf-document" className="sr-only focus:not-sr-only">{t('document.skip')}</a>
    <header className="document-toolbar">
      <Button variant="outline" aria-pressed={sidebar} onClick={() => setSidebar(!sidebar)}>{t('document.thumbnails')}</Button>
      <span className="min-w-0 flex-1 truncate" title={title}>{title || t('document.loading')}</span>
      <Button variant="outline" disabled={!title} onClick={() => void download(JSON.stringify(source)).catch(() => setError('document.previewFailed'))}>{t('document.download')}</Button>
    </header>
    {pdf && <nav className="document-toolbar" aria-label={t('document.pageNumber')}>
      <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('document.previous')}</Button>
      <Input className="w-20" type="number" min={1} max={pdf.numPages} aria-label={t('document.pageNumber')} value={page} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n > 0 && n <= pdf.numPages) setPage(n) }} />
      <span>{t('document.page', { page, total: pdf.numPages })}</span>
      <Button variant="outline" disabled={page >= pdf.numPages} onClick={() => setPage(page + 1)}>{t('document.next')}</Button>
      <Button variant="outline" onClick={() => { setFit(false); setScale(Math.max(0.1, scale / 1.2)) }}>{t('document.zoomOut')}</Button>
      <Button variant="outline" onClick={() => { setFit(false); setScale(Math.min(4, scale * 1.2)) }}>{t('document.zoomIn')}</Button>
      <Button variant="outline" aria-pressed={fit} onClick={() => setFit(true)}>{t('document.fit')}</Button>
      <section className="flex gap-2" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void find() } }}>
        <Input aria-label={t('document.search')} placeholder={t('document.search')} maxLength={200} value={search} onChange={e => { searchEpoch.current++; setSearching(false); setSearch(e.target.value); setNotFound(false) }} />
        <Button variant="outline" onClick={() => void find()} disabled={searching || !search.trim()}>{t(searching ? 'document.searching' : 'document.find')}</Button>
      </section>
    </nav>}
    {notFound && <p role="status" className="p-3">{t('document.notFound')}</p>}
    {error && <section role="alert" className="p-3"><p>{t(error)}</p><Button variant="outline" onClick={() => setRetry(retry + 1)}>{t('document.reload')}</Button></section>}
    {locked && <section className="p-6 flex flex-wrap gap-3" onKeyDown={e => { if (e.key === 'Enter' && password) { e.preventDefault(); unlock.current?.(password); setPassword('') } }}>
      <p>{t('document.password')}</p><Input type="password" autoComplete="off" aria-label={t('document.passwordLabel')} value={password} onChange={e => setPassword(e.target.value)} />
      <Button onClick={() => { unlock.current?.(password); setPassword('') }} disabled={!password}>{t('document.unlock')}</Button></section>}
    {!pdf && !locked && !error && <p role="status" className="p-6">{t('document.loading')}</p>}
    <div className="pdf-layout">
      {pdf && sidebar && <aside className="pdf-sidebar" aria-label={t('document.thumbnails')}>
        {Array.from({ length: pdf.numPages }, (_, i) => <Button className="pdf-page-button" key={i} variant={page === i + 1 ? 'secondary' : 'ghost'} aria-pressed={page === i + 1} aria-label={t('document.page', { page: i + 1, total: pdf.numPages })} onClick={() => setPage(i + 1)}>
          <span>{i + 1}</span><Page pdf={pdf} page={i + 1} scale={1} thumbnail />
        </Button>)}
      </aside>}
      <div ref={canvas} id="pdf-document" tabIndex={0} className="document-canvas pdf-canvas" onKeyDown={e => {
        if (window.getSelection()?.toString()) return
        if (e.key === 'ArrowRight' && pdf) { e.preventDefault(); setPage(Math.min(pdf.numPages, page + 1)) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); setPage(Math.max(1, page - 1)) }
      }}>{pdf && <Page pdf={pdf} page={page} scale={scale} />}</div>
    </div>
  </main>
}
