import { useEffect, useRef, useState } from 'react'
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import { t } from './i18n'

/** Only visible thumbnails and the current page allocate canvases. */
export function Page({ pdf, page, scale, thumbnail = false }: { pdf: PDFDocumentProxy; page: number; scale: number; thumbnail?: boolean }) {
  const mount = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(!thumbnail), [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!thumbnail || !mount.current) return
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '100px' })
    observer.observe(mount.current); return () => observer.disconnect()
  }, [thumbnail])
  useEffect(() => {
    const container = mount.current
    if (!container || !visible) return
    let active = true, render: RenderTask | undefined, text: TextLayer | undefined
    setFailed(false)
    const canvas = document.createElement('canvas'), textContainer = document.createElement('div')
    textContainer.className = 'textLayer'; container.replaceChildren(canvas, textContainer)
    void (async () => {
      const documentPage = await pdf.getPage(page)
      if (!active) return
      const base = documentPage.getViewport({ scale: 1 })
      const viewport = documentPage.getViewport({ scale: thumbnail ? 140 / base.width : scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12_000_000 / (viewport.width * viewport.height)))
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio)); canvas.height = Math.max(1, Math.floor(viewport.height * ratio))
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`
      container.style.width = `${viewport.width}px`; container.style.height = `${viewport.height}px`
      container.style.setProperty('--scale-factor', String(viewport.scale))
      render = documentPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await render.promise
      if (!thumbnail && active) {
        text = new TextLayer({ textContentSource: documentPage.streamTextContent(), container: textContainer, viewport })
        await text.render()
      }
    })().catch(() => { if (active) setFailed(true) })
    return () => { active = false; render?.cancel(); text?.cancel(); container.replaceChildren(); canvas.width = canvas.height = 0 }
  }, [pdf, page, scale, thumbnail, visible])
  return <section aria-label={t('document.page', { page, total: pdf.numPages })}>
    <div ref={mount} className={`pdf-page ${thumbnail ? 'pdf-thumbnail' : ''}`} />
    {failed && <p role="alert">{t('document.renderFailed')}</p>}
  </section>
}
