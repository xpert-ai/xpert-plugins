import { t, useLocale, i18n, useMessage } from './i18n'
import { DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { EditorContent, useEditor } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import { NodeSelection } from '@tiptap/pm/state'
import { z } from 'zod/v3'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
   } from '@xpert-ai/plugin-shadcn-ui'
import { extensions, FRAGMENT } from '../src/schema'
import { action, command, connect, setAssistantContext, onEditorEvent, openDocument } from './bridge'
import { parseReference, referenceFileKey } from '../src/references'
import { SlashMenu } from './slash-menu'
import { resourceImageView } from './resource-image'
import { download } from './bridge'
import { useDocument } from './use-document'

import { BlockMenus } from './block-menu'
import { findBlock } from './block-actions'
import { DocumentActions } from './document-actions'
import { TableActions } from './table-actions'
import { linkedDocument } from './content-links'
import { serializeMarkdown } from '../src/serialize'
import { MathDialog, type MathTarget } from './math-dialog'
import { ChildPages, ParentPage, CreateSubpageDialog, useSubpages } from './subpages'

function App() {
  useLocale()
  const [resourceId, setResourceId] = useState(''), [blockId, setBlockId] = useState('')
  const [generation, setGeneration] = useState(0)
  useEffect(() => connect((query) => {
    const current = z.object({ selectionId: z.string().optional(), parameters: z.object({ blockId: z.string().optional() }).optional() }).safeParse(query)
    setResourceId(current.success ? current.data.selectionId ?? '' : '')
    setBlockId(current.success ? current.data.parameters?.blockId ?? '' : '')
    setGeneration((value) => value + 1)
  }), [])
  return resourceId ? <Document key={`${resourceId}:${generation}`} resourceId={resourceId} blockId={blockId} /> : <div className="empty" role="status">{t('editor.chooseDocument')}</div>
}
function Document({ resourceId, blockId }: { resourceId: string; blockId: string }) {
  useLocale()
  const document = useDocument(resourceId)
  if (!document.state) return <div className="empty" role="status"><p>{document.error || t('editor.connecting')}</p>
    {document.error && <Button variant="outline" onClick={document.retry}>{t('editor.reconnect')}</Button>}</div>
  return <Surface document={document} resourceId={resourceId} initialBlockId={blockId} />
}
function Surface({ document, resourceId, initialBlockId }: { document: ReturnType<typeof useDocument>; resourceId: string; initialBlockId: string }) {
  const locale = useLocale()
  const state = document.state!, [error, setError] = useMessage(''), [history, setHistory] = useState(false)
  const [notice, setNotice] = useMessage('')
  const [math, setMath] = useState<MathTarget | null>(null), [newChild, setNewChild] = useState(false)
  const pages = useSubpages(resourceId)
  const editor = useEditor({ extensions: [...extensions.map((extension) => extension.name === 'image' ? resourceImageView(resourceId) : ['blockMath', 'inlineMath'].includes(extension.name)
    ? extension.configure({ onClick: (node: import('@tiptap/pm/model').Node) => setMath({ kind: 'edit', mathId: node.attrs.mathId, latex: node.attrs.latex, inline: node.type.name === 'inlineMath' }) }) : extension), Markdown,
    Collaboration.configure({ document: document.doc, field: FRAGMENT }),
    CollaborationCaret.configure({ provider: { awareness: document.awareness }, user: document.self })],
    editable: false, editorProps: { attributes: { role: 'textbox', 'aria-label': t('editor.contentLabel'), 'aria-multiline': 'true', class: 'document-editor' } }
  }, [document.doc])
  const writable = state.canWrite && !state.externalChange && document.connection === 'connected'
  useEffect(() => { editor?.setEditable(writable) }, [editor, writable])
  useEffect(() => {
    if (!editor) return
    editor.view.dom.setAttribute('aria-label', t('editor.contentLabel'))
    const decorate = () => editor.view.dom.querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]').forEach((element) => {
      element.tabIndex = 0; element.setAttribute('role', 'button'); element.setAttribute('aria-label', t('math.editLabel', { latex: element.dataset.latex ?? '' }))
    })
    const key = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement && event.target.matches('[data-type="inline-math"], [data-type="block-math"]')) {
        event.preventDefault(); event.target.click()
      }
    }
    editor.on('transaction', decorate); editor.view.dom.addEventListener('keydown', key); decorate()
    return () => { editor.off('transaction', decorate); editor.view.dom.removeEventListener('keydown', key) }
  }, [editor, locale])
  const locate = (id: string) => {
    if (!editor) return
    const block = findBlock(editor, id)
    if (!block) return
    if (block.node.isAtom) editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, block.pos)).scrollIntoView())
    else editor.chain().setTextSelection({ from: block.pos + 1, to: block.pos + block.node.nodeSize - 1 }).scrollIntoView().run()
    setRevealed(id)
  }
  const [revealed, setRevealed] = useState('')
  useEffect(() => {
    if (!editor || !revealed) return
    const block = findBlock(editor, revealed), element = block && editor.view.nodeDOM(block.pos)
    if (!(element instanceof HTMLElement)) return
    element.classList.add('block-anchor-target')
    element.scrollIntoView({ block: 'center' })
    const timer = setTimeout(() => setRevealed(''), 5000)
    return () => { clearTimeout(timer); element.classList.remove('block-anchor-target') }
  }, [editor, revealed])
  useEffect(() => { if (initialBlockId) locate(initialBlockId) }, [editor, initialBlockId])
  useEffect(() => onEditorEvent((event) => {
    if (event.resourceId === resourceId && event.kind === 'revealAnchor') locate(event.blockId)
  }), [editor, resourceId])
  useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout>
    const report = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { $from } = editor.state.selection, node = $from.parent
        void setAssistantContext({ key: 'contentDocument', context: {
          resourceId, projectId: state.document.projectId, path: state.document.path, title: state.document.title,
          epoch: state.document.epoch, sequence: state.document.sequence, headRevisionId: state.document.headRevisionId,
          blockId: typeof node.attrs.blockId === 'string' ? node.attrs.blockId : null,
          text: node.textContent.slice(0, 12000), saved: !document.dirty,
          instruction: 'Read the current document through the content tools before proposing changes. A human reviews proposals in Assistant.'
        } }).catch(() => undefined)
      }, 150)
    }
    editor.on('selectionUpdate', report); editor.on('update', report); report()
    return () => { clearTimeout(timer); editor.off('selectionUpdate', report); editor.off('update', report) }
  }, [editor, state.document.sequence, state.document.headRevisionId, document.dirty])
  useEffect(() => () => { void setAssistantContext({ key: 'contentDocument', clear: true }).catch(() => undefined) }, [])
  const run = async (work: () => Promise<unknown>) => { setError(''); try { await work() } catch (err) { setError(err instanceof Error ? err : i18n.message('common.actionFailed')) } }
  const navigatePage = (id: string) => void run(async () => {
    if (!await document.flush()) throw i18n.error('editor.savePageFirst')
    await openDocument(id)
  })
  useEffect(() => {
    if (!editor) return
    const activate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement)) return
      event.preventDefault()
      const reference = parseReference(link.getAttribute('href'))
      if (reference) {
        if (reference.kind === 'page') navigatePage(reference.resourceId)
        else void run(() => download(referenceFileKey(resourceId, link.getAttribute('href')!)))
        return
      }
      const id = linkedDocument(link.href)
      if (id) void run(async () => {
        if (!await document.flush()) throw i18n.error('editor.saveBeforeReference')
        await openDocument(id) // Reauthorize in the current project and navigate in the containing Workbench.
      })
      else if (/^(https?:|mailto:)/iu.test(link.href)) window.open(link.href, '_blank', 'noopener,noreferrer')
      else if (link.getAttribute('href')?.startsWith('#')) {
        const id = link.getAttribute('href')!.slice(1)
        // Our durable anchors are block IDs, not heading text slugs.
        if (findBlock(editor, id)) locate(id)
        else window.document.getElementById(id)?.scrollIntoView({ block: 'center' })
      }
    }
    editor.view.dom.addEventListener('click', activate)
    return () => editor.view.dom.removeEventListener('click', activate)
  }, [editor, document.flush])
  const copy = async (blockId?: string) => {
    await command('workbench.content.copyLink', { resourceId, ...(blockId ? { blockId } : {}) })
    setNotice(blockId ? i18n.message('editor.blockLinkCopied') : i18n.message('editor.documentLinkCopied'))
  }
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(timer) } }, [notice])
  const saveDraft = () => {
    const url = URL.createObjectURL(new Blob([editor ? serializeMarkdown(new MarkdownManager({ extensions }), editor.getJSON()) : ''], { type: 'text/markdown' }))
    const link = window.document.createElement('a'); link.href = url; link.download = t('editor.draftName', { title: state.document.title }); link.click()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
  return <div className="editor-shell">
    <DocumentActions editor={editor} resourceId={resourceId} title={state.document.title} writable={writable}
      saved={!document.dirty && !state.externalChange} self={document.self} history={() => setHistory(true)} run={run} copy={() => copy()} prepareLeave={document.flush} notify={setNotice}
      math={(anchor) => setMath({ kind: 'new', anchor })} child={() => setNewChild(true)} canCreateChild={pages.value?.canCreate === true} />
    <SlashMenu editor={editor} writable={writable} resourceId={resourceId} math={(anchor) => setMath({ kind: 'new', anchor })} report={setError} />
    <TableActions editor={editor} writable={writable} report={setError} />
    {notice && <div className="toast" role="status">{notice}</div>}
    {(document.error || error || state.externalChange) && <div className="notice" role="alert"><span>{error || document.error || t('editor.externalConflict')}</span>
      <Button variant="outline" onClick={document.retry}>{t('common.retry')}</Button>{document.dirty && <Button variant="outline" onClick={saveDraft}>{t('editor.keepDraft')}</Button>}</div>}
    <div className="document-layout"><main className="paper"><ParentPage pages={pages} navigate={navigatePage} /><div className="editor-area">
      <EditorContent editor={editor} /><BlockMenus editor={editor} writable={writable} copy={copy} report={setError} />
    </div><ChildPages pages={pages} writable={writable} create={() => setNewChild(true)} navigate={navigatePage} /></main></div>
    <DialogFooter className="statusbar" role="status">{document.dirty ? document.error ? t('editor.unsaved') : t('editor.saving') : state.externalChange ? t('editor.conflict') : state.document.status !== 'ready' ? t('editor.pendingWrite') : state.canWrite ? t('editor.saved') : t('editor.readOnly')}<span className="presence-status">{document.presence?.collaborators.length ? t('editor.presence', { count: document.presence.collaborators.length }) : ''}{document.connection === 'connected' ? t('editor.connected') : t('editor.offline')}</span></DialogFooter>
    <HistoryDialog open={history} close={() => setHistory(false)} resourceId={resourceId} />
    {math && editor && <MathDialog editor={editor} target={math} writable={writable} close={() => setMath(null)} />}
    {newChild && <CreateSubpageDialog resourceId={resourceId} writable={writable} flush={document.flush} refresh={pages.refresh} close={() => setNewChild(false)} />}
  </div>
}
const revisionSchema = z.object({ id: z.string(), label: z.string(), createdAt: z.string() })
function HistoryDialog({ open, close, resourceId }: { open: boolean; close: () => void; resourceId: string }) {
  useLocale()
  const [versions, setVersions] = useState<Array<z.infer<typeof revisionSchema>>>([]), [preview, setPreview] = useState(''), [error, setError] = useMessage('')
  useEffect(() => { if (open) void action('document.history', { resourceId }).then((value) => setVersions(z.array(revisionSchema).parse(value))).catch((err: Error) => setError(err)) }, [open, resourceId])
  return <Dialog open={open} onOpenChange={(value) => { if (!value) close() }}><DialogContent className="history-dialog"><DialogHeader><DialogTitle>{t('history.title')}</DialogTitle><DialogDescription>{t('history.description')}</DialogDescription></DialogHeader>
    {error && <p role="alert">{error}</p>}<div className="history-layout"><nav>{versions.map((version) => <Button type="button" variant="ghost" key={version.id} onClick={() => void action('document.preview', { resourceId, revisionId: version.id }).then((value) => setPreview(z.object({ markdown: z.string() }).parse(value).markdown)).catch((err: Error) => setError(err))}>{version.label}<small>{i18n.date(version.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</small></Button>)}</nav><pre>{preview || t('history.chooseVersion')}</pre></div>
  </DialogContent></Dialog>
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App /></RemoteI18nProvider>)
