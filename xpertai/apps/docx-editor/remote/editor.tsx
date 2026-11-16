import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DocxEditor, useFonts } from '@docx-editor.dev/react'
import { packagedFonts } from '@docx-editor.dev/fonts'
import { Button } from '@xpert-ai/plugin-shadcn-ui'
import '@docx-editor.dev/core/styles/editor.css'
import { download, onAppearanceChange } from './bridge'
import { useDocument, type Source } from './use-document'
import { useCollaboration } from './collaboration'
import { t, useLocale } from './i18n'
import { engineLocales } from './engine-locale'
import { EditorToolbar } from './editor-toolbar'

export function Editor({ source }: { source: Source }) {
  const locale = useLocale(), doc = useDocument(source), fonts = useFonts(packagedFonts())
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'))
  const [header, setHeader] = useState<HTMLElement | null>(null)
  const [stage, setStage] = useState<HTMLElement | null>(null)
  const [rulers, setRulers] = useState(false)
  useEffect(() => onAppearanceChange(() => setDark(document.documentElement.classList.contains('dark'))), [])
  const collaboration = useCollaboration(source, doc.info?.collaboration === true)
  const updated = collaboration.revision > (doc.info?.sequence ?? 0)
  useEffect(() => { if (updated && !doc.dirty && !doc.busy) void doc.load() }, [updated, doc.dirty, doc.busy, doc.load])
  // Saving must stay available even while the engine's full menu bar is collapsed.
  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (doc.info?.canWrite) void doc.save().catch(() => {})
      }
    }
    window.addEventListener('keydown', saveShortcut)
    return () => window.removeEventListener('keydown', saveShortcut)
  }, [doc.info?.canWrite, doc.save])
  const status = t(doc.busy ? 'document.saving' : doc.dirty ? 'document.unsaved' : doc.info?.canWrite ? 'document.saved' : 'document.readOnly')
  return <main className="document-root">
    <header ref={setHeader} className="document-header" />
    {(doc.error || updated) && <section role="alert" className="flex items-center gap-3 p-3">
      <p>{t(doc.error ?? 'document.updated')}</p>
      <Button variant="outline" disabled={doc.dirty || doc.busy} onClick={() => void doc.load()}>{t('document.reload')}</Button>
    </section>}
    <section ref={setStage} className={`document-canvas docx-editor${dark ? ' dark' : ''}`}>
      {doc.bytes ? <DocxEditor ref={doc.editor} className="word-viewport" document={doc.bytes} chrome={false}
        fonts={fonts} locale={locale} i18n={engineLocales[locale]} colorMode={dark ? 'dark' : 'light'} mode={doc.info?.canWrite ? 'edit' : 'view'}
        onChange={change => { if (!change.source) doc.edit() }}>
        {header && <EditorToolbar mount={header} title={doc.info?.title ?? ''} status={status}
          canWrite={doc.info?.canWrite === true} dirty={doc.dirty} busy={doc.busy}
          collaboration={collaboration.connected ? t('document.collaboration', { count: collaboration.peers.length }) : undefined}
          rulers={rulers} onRulersChange={setRulers} onSave={() => void doc.save().catch(() => {})}
          onDownload={() => void (doc.dirty ? doc.downloadDraft() : download(JSON.stringify(source)).catch(doc.fail))} />}
        <DocxEditor.HeaderFooterChrome /><DocxEditor.NotesChrome />
        {rulers && <div className="word-vertical-ruler"><DocxEditor.VerticalRuler /></div>}
        {stage && createPortal(<><DocxEditor.Navigation /><DocxEditor.PageNumber /><DocxEditor.Loading overlay /></>, stage)}
        {header && createPortal(<DocxEditor.FontNotice />, header)}
      </DocxEditor> : <p role="status" className="p-6">{t(doc.error ?? 'document.loading')}</p>}
    </section>
  </main>
}
