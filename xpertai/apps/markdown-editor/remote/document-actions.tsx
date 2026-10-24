import type { ViewMessageValue } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { t, useLocale, i18n } from './i18n'
import React, { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import type { Editor } from '@tiptap/core'
import { Button, Input, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  FileText, ChevronDown, Check, Folder, Type, Plus, Undo2, Redo2, Bold, Italic,
  History, MessageSquare, X, Link, Download } from '@xpert-ai/plugin-shadcn-ui'
import { action, command, download, openDocument } from './bridge'
import { formats } from './block-menu'
import { formatBlock } from './block-actions'
import { ResourceResults, useResources } from './resources'
import { InsertMenu } from './insert-menu'

type Run = (work: () => Promise<unknown>) => Promise<void>
function DocumentSwitcher({ resourceId, title, navigate }: { resourceId: string; title: string; navigate: Run }) {
  useLocale()
  const [open, setOpen] = useState(false), resources = useResources(resourceId, 'page', open)
  return <><Button variant="outline" className="document-switcher" aria-label={t('document.switchLabel', { title })} title={title} onClick={() => setOpen(true)}><FileText /><span>{title}</span><ChevronDown /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="reference-dialog"><DialogHeader><DialogTitle>{t('document.switch')}</DialogTitle><DialogDescription>{t('document.switchDescription')}</DialogDescription></DialogHeader>
      <ResourceResults resources={resources} disabled={false} choose={(item) => {
        if (item.resourceId === resourceId) { setOpen(false); return }
        void navigate(async () => { await openDocument(item.resourceId); setOpen(false) })
      }} />
      <Button variant="outline" onClick={() => void navigate(() => command('workbench.navigation.open', { target: 'workbench.view', viewKey: 'spaces.views__spaces.workspace' }))}><Folder />{t('document.browse')}</Button>
    </DialogContent></Dialog></>
}
export function DocumentActions({ editor, resourceId, title, writable, saved, self, history, run, copy, prepareLeave, notify, math, child, canCreateChild }: {
  editor: Editor | null; resourceId: string; title: string; writable: boolean; saved: boolean
  self: { name: string; color: string }; history: () => void; run: Run; copy: () => Promise<void>
  prepareLeave: () => Promise<boolean>
  notify: (message: ViewMessageValue) => void
  math: (anchor: string) => void; child: () => void; canCreateChild: boolean
}) {
  useLocale()
  const [share, setShare] = useState(false)
  // Flush the source editor before replacing its selection, regardless of host shell.
  const navigate: Run = (work) => run(async () => {
    if (!await prepareLeave()) throw i18n.error('document.saveBeforeSwitch')
    return work()
  })
  const blockId = () => editor?.state.selection.$from.parent.attrs.blockId
  const edit = (work: (editor: Editor, id: string) => unknown) => void run(async () => {
    const id = blockId()
    if (!editor || typeof id !== 'string') throw i18n.error('block.selectFirst')
    work(editor, id)
  })
  return <header className="topbar"><div className="topbar-left">
    <DocumentSwitcher resourceId={resourceId} title={title} navigate={navigate} />
    <div className="action-pill" aria-label={t('toolbar.label')}>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={!writable} aria-label={t('toolbar.format')} title={t('toolbar.format')}><Type /></Button></DropdownMenuTrigger>
        <DropdownMenuContent className="format-menu" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DropdownMenuItem onSelect={() => editor?.chain().focus().toggleBold().run()}><Bold />{t('toolbar.bold')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor?.chain().focus().toggleItalic().run()}><Italic />{t('toolbar.italic')}</DropdownMenuItem>
          <DropdownMenuSeparator />{formats.map((format) => <DropdownMenuItem key={format.key} onSelect={() => edit((current, id) => formatBlock(current, id, format.key))}><format.icon />{t(format.labelKey)}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <InsertMenu editor={editor} writable={writable} resourceId={resourceId} title={title} flush={prepareLeave} run={run} notify={notify} math={math} child={child} canCreateChild={canCreateChild} />
      <Button variant="ghost" size="icon" disabled={!writable} aria-label={t('toolbar.undo')} title={t('toolbar.undo')} onClick={() => editor?.chain().focus().undo().run()}><Undo2 /></Button>
      <Button variant="ghost" size="icon" disabled={!writable} aria-label={t('toolbar.redo')} title={t('toolbar.redo')} onClick={() => editor?.chain().focus().redo().run()}><Redo2 /></Button>
    </div></div>
    <div className="topbar-right">
      <Button variant="outline" size="icon" className="round-action" aria-label={t('history.title')} title={t('history.title')} onClick={history}><History /></Button>
      <Button variant="outline" size="icon" className="round-action" aria-label={t('document.review')} title={t('document.review')} onClick={() => void run(() => command('assistant.content.review', { resourceId, blockId: blockId() ?? null }))}><MessageSquare /></Button>
      <Button variant="outline" className="share-action" aria-label={t('document.shareLabel')} onClick={() => setShare(true)}><span className="avatar" style={{ backgroundColor: self.color }} aria-hidden="true">{self.name.slice(0, 1)}</span><span className="share-label">{t('document.share')}</span></Button>
      <Button variant="outline" size="icon" className="round-action" aria-label={t('document.close')} title={t('document.close')} onClick={() => void run(() => command('workbench.content.close', {}))}><X /></Button>
    </div>
    <Dialog open={share} onOpenChange={setShare}><DialogContent className="share-dialog"><DialogHeader><DialogTitle>{t('document.shareLabel')}</DialogTitle><DialogDescription>{t('document.shareDescription')}</DialogDescription></DialogHeader>
      <p className="share-title"><FileText />{title}</p>
      <Button onClick={() => void run(copy)}><Link />{t('document.copyLink')}</Button>
      <Button variant="outline" disabled={!saved} onClick={() => void run(() => download(resourceId))}><Download />{t('document.download')}</Button>
    </DialogContent></Dialog>
  </header>
}
