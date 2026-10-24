import type { ViewMessageValue } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { t, useLocale, i18n } from './i18n'
import type { MessageKey } from './i18n'
import React, { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator,
  GripVertical, RefreshCw, Plus, Link, Trash2, Type, Heading1, Heading2, Heading3,
  List, ListOrdered, ListTodo, Quote, Code2 } from '@xpert-ai/plugin-shadcn-ui'
import { deleteBlock, findBlock, formatBlock, insertBelow, type BlockFormat } from './block-actions'

export const formats: Array<{ key: BlockFormat; labelKey: MessageKey; icon: typeof Type }> = [
  { key: 'paragraph', labelKey: 'block.paragraph', icon: Type }, { key: 'heading1', labelKey: 'block.heading1', icon: Heading1 },
  { key: 'heading2', labelKey: 'block.heading2', icon: Heading2 }, { key: 'heading3', labelKey: 'block.heading3', icon: Heading3 },
  { key: 'bulletList', labelKey: 'block.bulletList', icon: List }, { key: 'orderedList', labelKey: 'block.orderedList', icon: ListOrdered },
  { key: 'taskList', labelKey: 'block.taskList', icon: ListTodo },
  { key: 'blockquote', labelKey: 'block.quote', icon: Quote }, { key: 'codeBlock', labelKey: 'block.code', icon: Code2 }
]
type Handle = { id: string; top: number; text: string }
export function BlockMenus({ editor, writable, copy, report }: {
  editor: Editor | null; writable: boolean; copy: (blockId: string) => Promise<void>; report: (message: ViewMessageValue) => void
}) {
  useLocale()
  const [handles, setHandles] = useState<Handle[]>([]), [openId, setOpenId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState('')
  useEffect(() => {
    if (!editor) return
    const root = editor.view.dom, area = root.closest('.editor-area')
    if (!area) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const origin = area.getBoundingClientRect(), next: Handle[] = []
        editor.state.doc.descendants((node, pos, parent) => {
          if (!node.isTextblock || typeof node.attrs.blockId !== 'string') return
          // Cells share a row's vertical position. Their commands live in TableActions;
          // stacking one six-dot handle per cell makes the left gutter unusable.
          if (parent && ['tableCell', 'tableHeader'].includes(parent.type.name)) return
          const element = editor.view.nodeDOM(pos)
          if (element instanceof HTMLElement) next.push({ id: node.attrs.blockId,
            top: element.getBoundingClientRect().top - origin.top, text: node.textContent.slice(0, 32) })
        })
        setHandles(next)
      })
    }
    const hover = (event: Event) => {
      const target = event.target
      if (target instanceof Element) {
        const block = target.closest('[data-block-id]')
        if (block) setActiveId(block.getAttribute('data-block-id') ?? '')
      }
    }
    const selection = () => {
      const id = editor.state.selection.$from.parent.attrs.blockId
      if (typeof id === 'string') setActiveId(id)
      update()
    }
    const observer = new ResizeObserver(update); observer.observe(area)
    editor.on('update', update); editor.on('selectionUpdate', selection); root.addEventListener('pointermove', hover)
    update()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); editor.off('update', update); editor.off('selectionUpdate', selection); root.removeEventListener('pointermove', hover) }
  }, [editor])
  useEffect(() => {
    if (!editor || !openId) return
    const block = findBlock(editor, openId)
    const element = block && editor.view.nodeDOM(block.pos)
    if (!(element instanceof HTMLElement)) return
    element.classList.add('block-menu-selected')
    return () => element.classList.remove('block-menu-selected')
  }, [editor, openId])
  const run = (work: () => unknown) => { try { work() } catch (error) { report(error instanceof Error ? error : i18n.message('block.changeFailed')) } }
  return <div className="block-controls">{handles.map((block) => <div key={block.id} className={`block-control ${activeId === block.id || openId === block.id ? 'active' : ''}`} style={{ top: block.top }}>
    <DropdownMenu modal={false} open={openId === block.id} onOpenChange={(value) => setOpenId(value ? block.id : null)}>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('block.actionsFor', { text: block.text || t('block.empty') })} title={t('block.actions')}><GripVertical /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" sideOffset={6} className="block-menu" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuSub><DropdownMenuSubTrigger disabled={!writable}><RefreshCw />{t('block.convert')}</DropdownMenuSubTrigger><DropdownMenuSubContent>
          {formats.map((format) => <DropdownMenuItem key={format.key} onSelect={() => editor && run(() => formatBlock(editor, block.id, format.key))}><format.icon />{t(format.labelKey)}</DropdownMenuItem>)}
        </DropdownMenuSubContent></DropdownMenuSub>
        <DropdownMenuItem disabled={!writable} onSelect={() => editor && run(() => insertBelow(editor, block.id))}><Plus />{t('block.insertBelow')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { void copy(block.id).catch((error: Error) => report(error)) }}><Link />{t('block.copyLink')}</DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuItem disabled={!writable} variant="destructive" onSelect={() => editor && run(() => deleteBlock(editor, block.id))}><Trash2 />{t('block.delete')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>)}</div>
}
