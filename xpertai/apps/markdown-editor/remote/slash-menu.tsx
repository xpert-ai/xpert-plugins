import type { ViewMessageValue } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { t, useLocale, i18n } from './i18n'
import { Command, CommandList, CommandItem, CommandEmpty } from '@xpert-ai/plugin-shadcn-ui'
import React, { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { insertItems } from './insert-menu'
import { slashMatch, consumeSlash, type Match } from './slash-content'
import { ResourceDialog } from './resources'

const extras = [{ kind: 'image', labelKey: 'insert.image' }, { kind: 'file', labelKey: 'insert.attachment' }, { kind: 'page', labelKey: 'resources.pageTitle' }, { kind: 'math', labelKey: 'insert.math' }] as const
export function SlashMenu({ editor, writable, resourceId, math, report }: {
  editor: Editor | null; writable: boolean; resourceId: string; math: (anchor: string) => void; report: (error: ViewMessageValue) => void
}) {
  useLocale()
  const [match, setMatch] = useState<Match | null>(null), [active, setActive] = useState(0), [dismissed, setDismissed] = useState('')
  const [point, setPoint] = useState({ left: 0, top: 0 })
  const [resource, setResource] = useState<{ kind: 'image' | 'file' | 'page'; anchor: string } | null>(null)
  useEffect(() => {
    if (!editor) return
    const update = () => {
      const value = editor.view.composing ? null : slashMatch(editor.state)
      setMatch(value); setActive(0); if (!value) setDismissed('')
      if (value) { const rect = editor.view.coordsAtPos(editor.state.selection.from); setPoint({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)), top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 310)) }) }
    }
    editor.on('transaction', update); editor.view.dom.addEventListener('compositionend', update)
    return () => { editor.off('transaction', update); editor.view.dom.removeEventListener('compositionend', update) }
  }, [editor])
  const options = [...insertItems, ...extras].filter((item) => !match?.query || `${t(item.labelKey)} ${item.kind}`.toLowerCase().includes(match.query))
  const visible = writable && !!match && `${match.anchor}:${match.text}` !== dismissed
  const choose = (kind: typeof options[number]['kind']) => {
    if (!editor || !match) return
    try {
      if (kind === 'math' || kind === 'image' || kind === 'file' || kind === 'page') {
        consumeSlash(editor, match)
        if (kind === 'math') math(match.anchor)
        else setResource({ kind, anchor: match.anchor })
      } else consumeSlash(editor, match, kind)
    } catch (err) { report(err instanceof Error ? err : i18n.message('slash.failed')) }
  }
  useEffect(() => {
    if (!editor || !visible) return
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || editor.view.composing) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setDismissed(`${match!.anchor}:${match!.text}`); return }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(options.length, 1)) % Math.max(options.length, 1)) }
      if (event.key === 'Enter' && options.length) { event.preventDefault(); event.stopImmediatePropagation(); choose(options[Math.min(active, options.length - 1)].kind) }
    }
    editor.view.dom.addEventListener('keydown', key, true)
    return () => editor.view.dom.removeEventListener('keydown', key, true)
  }, [editor, visible, active, match, options])
  // Keep editor focus for IME and slash typing; cmdk supplies list semantics and pointer selection.
  return <>{visible && <Command className="slash-menu" label={t('slash.searchLabel')} style={point} shouldFilter={false}
    value={options[active]?.kind ?? ''} onValueChange={(value) => { const index = options.findIndex((item) => item.kind === value); if (index >= 0) setActive(index) }}>
    <CommandList><CommandEmpty>{t('slash.empty')}</CommandEmpty>{options.map((item) => <CommandItem key={item.kind} value={item.kind}
      onMouseDown={(event) => event.preventDefault()} onSelect={() => choose(item.kind)}>{t(item.labelKey)}</CommandItem>)}</CommandList>
  </Command>}{resource && <ResourceDialog {...resource} resourceId={resourceId} editor={editor} writable={writable} close={() => setResource(null)} />}</>
}
