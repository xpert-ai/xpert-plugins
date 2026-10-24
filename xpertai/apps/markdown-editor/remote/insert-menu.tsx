import type { ViewMessageValue } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { t, useLocale, i18n, useMessage } from './i18n'
import type { MessageKey } from './i18n'
import { Label } from '@xpert-ai/plugin-shadcn-ui'
import React, { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { z } from 'zod/v3'
import { Button, Input, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Plus, WandSparkles, Type, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, Quote, Code2,
  Table2, Minus, Link, FileText, MessageSquare, Info } from '@xpert-ai/plugin-shadcn-ui'
import { action, command } from './bridge'
import { insertedContent, insertionAnchor, insertAtAnchor, type InsertKind } from './insert-content'
import { ResourceDialog } from './resources'
import { safeHref } from './content-links'

type Run = (work: () => Promise<unknown>) => Promise<void>
export const insertItems: Array<{ kind: InsertKind; labelKey: MessageKey; icon: typeof Type; shortcut?: string }> = [
  { kind: 'paragraph', labelKey: 'block.paragraph', icon: Type },
  { kind: 'heading1', labelKey: 'block.heading1', icon: Heading1, shortcut: '#' },
  { kind: 'heading2', labelKey: 'block.heading2', icon: Heading2, shortcut: '##' },
  { kind: 'heading3', labelKey: 'block.heading3', icon: Heading3, shortcut: '###' },
  { kind: 'bulletList', labelKey: 'block.bulletList', icon: List, shortcut: '-' },
  { kind: 'orderedList', labelKey: 'block.orderedList', icon: ListOrdered, shortcut: '1.' },
  { kind: 'taskList', labelKey: 'block.taskList', icon: ListTodo, shortcut: '[]' },
  { kind: 'blockquote', labelKey: 'block.quote', icon: Quote, shortcut: '>' },
  { kind: 'codeBlock', labelKey: 'block.code', icon: Code2, shortcut: '```' },
  { kind: 'table', labelKey: 'insert.table', icon: Table2 },
  { kind: 'horizontalRule', labelKey: 'insert.divider', icon: Minus, shortcut: '---' },
  { kind: 'hint', labelKey: 'insert.hint', icon: MessageSquare },
  { kind: 'callout', labelKey: 'insert.callout', icon: Info }
]
export function InsertMenu({ editor, writable, resourceId, title, flush, run, notify, math, child, canCreateChild }: {
  editor: Editor | null; writable: boolean; resourceId: string; title: string; flush: () => Promise<boolean>;
  run: Run; notify: (message: ViewMessageValue) => void
  math: (anchor: string) => void; child: () => void; canCreateChild: boolean
}) {
  useLocale()
  const [anchor, setAnchor] = useState(''), [dialog, setDialog] = useState<'page' | 'image' | 'file' | 'link' | null>(null)
  const handoff = () => run(async () => {
    if (!await flush()) throw i18n.error('assistant.saveFirst')
    // Reference-only handoff: do not send a message or replace an existing Assistant draft.
    // The user supplies the writing request in Assistant; document text has no instruction authority.
    await command('assistant.composer.append_references', { references: [{ type: 'quote',
      label: title, source: `content:${resourceId}`,
      text: t('assistant.reference', { title, resourceId }) }] })
    notify(i18n.message('assistant.referenceAdded'))
  })
  return <>
    <DropdownMenu onOpenChange={(open) => { if (open && editor) setAnchor(insertionAnchor(editor)) }}>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={!writable || !editor} aria-label={t('insert.title')} title={t('insert.title')}><Plus /></Button></DropdownMenuTrigger>
      <DropdownMenuContent className="insert-menu" align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuLabel>{t('insert.generateGroup')}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void handoff()}><WandSparkles /><span>{t('insert.assistant')}<small>{t('insert.assistantDescription')}</small></span></DropdownMenuItem>
        {canCreateChild && <><DropdownMenuSeparator /><DropdownMenuLabel>{t('insert.createGroup')}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={child}><FileText /><span>{t('insert.childPage')}<small>{t('insert.childDescription')}</small></span></DropdownMenuItem></>}
        <DropdownMenuSeparator /><DropdownMenuLabel>{t('insert.mediaGroup')}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setDialog('image')}><FileText /><span>{t('insert.image')}<small>{t('insert.imageDescription')}</small></span></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDialog('file')}><FileText /><span>{t('insert.attachment')}<small>{t('insert.attachmentDescription')}</small></span></DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuLabel>{t('insert.basicGroup')}</DropdownMenuLabel>
        {insertItems.map((item) => <DropdownMenuItem key={item.kind} onSelect={() => void run(async () => {
          if (editor) insertAtAnchor(editor, anchor, insertedContent(item.kind))
        })}><item.icon /><span>{t(item.labelKey)}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</DropdownMenuItem>)}
        <DropdownMenuItem onSelect={() => math(anchor)}><Code2 /><span>{t('insert.math')}<small>{t('insert.mathDescription')}</small></span></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDialog('link')}><Link /><span>{t('link.title')}<small>{t('link.description')}</small></span></DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuLabel>{t('insert.referencesGroup')}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setDialog('page')}><FileText /><span>{t('insert.page')}<small>{t('insert.pageDescription')}</small></span></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {dialog && dialog !== 'link' && <ResourceDialog kind={dialog} resourceId={resourceId} editor={editor} anchor={anchor} writable={writable} close={() => setDialog(null)} />}
    <ReferenceDialog kind={dialog === 'link' ? 'link' : null} close={() => setDialog(null)} editor={editor} anchor={anchor} writable={writable} />
  </>
}
function ReferenceDialog({ kind, close, editor, anchor, writable }: {
  kind: 'link' | null; close: () => void; editor: Editor | null; anchor: string; writable: boolean
}) {
  useLocale()
  const [href, setHref] = useState(''), [label, setLabel] = useState(''), [error, setError] = useMessage('')
  useEffect(() => { if (kind) { setHref(''); setLabel(''); setError('') } }, [kind])
  const insert = () => {
    if (!editor || !writable) return
    try {
      const url = safeHref(href)
      insertAtAnchor(editor, anchor, { type: 'paragraph', content: [{ type: 'text', text: label.trim() || url, marks: [{ type: 'link', attrs: { href: url } }] }] })
      close()
    } catch (err) { setError(err instanceof Error ? err : i18n.message('link.failed')) }
  }
  return <Dialog open={!!kind} onOpenChange={(open) => { if (!open) close() }}><DialogContent className="reference-dialog" onCloseAutoFocus={(event) => event.preventDefault()}>
    <DialogHeader><DialogTitle>{t('link.title')}</DialogTitle><DialogDescription>{t('link.insertDescription')}</DialogDescription></DialogHeader>
    {error && <p role="alert">{error}</p>}
    <form className="reference-form" onSubmit={(event) => { event.preventDefault(); insert() }}>
      <Label>{t('link.url')}<Input autoFocus aria-label={t('link.url')} value={href} onChange={(event) => setHref(event.target.value)} placeholder="https://…" maxLength={4096} /></Label>
      <Label>{t('link.text')}<Input aria-label={t('link.textLabel')} value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t('link.textPlaceholder')} maxLength={1000} /></Label>
      <Button type="submit" disabled={!writable || !href.trim()}>{t('link.insert')}</Button>
    </form>
  </DialogContent></Dialog>
}
