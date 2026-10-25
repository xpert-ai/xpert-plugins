import { t, useLocale, i18n, useMessage } from './i18n'
import { Label, Textarea, DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import React, { useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import katex from 'katex'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@xpert-ai/plugin-shadcn-ui'
import { mathOptions, validateMath } from '../src/math'
import { insertionTransaction } from './insert-content'

export type MathTarget = { kind: 'new'; anchor: string } | { kind: 'edit'; mathId: string; latex: string; inline: boolean }
export function MathDialog({ editor, target, writable, close }: { editor: Editor; target: MathTarget; writable: boolean; close: () => void }) {
  const locale = useLocale()
  const [latex, setLatex] = useState(target.kind === 'edit' ? target.latex : 'E = mc^2')
  const [inline, setInline] = useState(target.kind === 'edit' ? target.inline : false), [error, setError] = useMessage('')
  const preview = useMemo(() => {
    try { validateMath(latex, inline); return { html: katex.renderToString(latex, { ...mathOptions, displayMode: !inline }), error: '' } }
    catch (err) { return { html: '', error: t('math.constraints') } }
  }, [latex, inline, locale])
  const save = (remove = false) => {
    if (!writable || !editor.isEditable) return
    try {
      if (!remove) validateMath(latex, inline)
      if (target.kind === 'edit') {
        let position: number | undefined
        editor.state.doc.descendants((node, pos) => { if (node.attrs.mathId === target.mathId) position = pos })
        const node = position === undefined ? null : editor.state.doc.nodeAt(position)
        if (!node || node.attrs.latex !== target.latex) throw i18n.error('math.changed')
        const tr = editor.state.tr
        if (remove) tr.delete(position!, position! + node.nodeSize)
        else tr.setNodeMarkup(position!, undefined, { ...node.attrs, latex })
        editor.view.dispatch(tr)
      } else {
        const formula = { type: inline ? 'inlineMath' : 'blockMath', attrs: { latex, mathId: crypto.randomUUID(), ...(inline ? {} : { blockId: crypto.randomUUID() }) } }
        // A new inline formula gets its own paragraph after the chosen block: never overwrite a selection.
        const content = inline ? { type: 'paragraph', content: [formula, { type: 'text', text: ' ' }] } : formula
        const tr = insertionTransaction(editor.state, target.anchor, content)
        editor.view.dispatch(tr)
      }
      close(); editor.commands.focus()
    } catch (err) { setError(err instanceof Error ? err : i18n.message('math.saveFailed')) }
  }
  return <Dialog open onOpenChange={(open) => { if (!open) close() }}><DialogContent className="math-dialog" onCloseAutoFocus={(event) => event.preventDefault()}>
    <DialogHeader><DialogTitle>{target.kind === 'new' ? t('math.insertTitle') : t('math.editTitle')}</DialogTitle><DialogDescription>{t('math.description')}</DialogDescription></DialogHeader>
    {target.kind === 'new' && <div className="math-mode" role="group" aria-label={t('math.style')}>
      <Button variant={inline ? 'outline' : 'default'} onClick={() => setInline(false)}>{t('math.display')}</Button>
      <Button variant={inline ? 'default' : 'outline'} onClick={() => setInline(true)}>{t('math.inline')}</Button>
    </div>}
    <Label className="math-source">{t('math.source')}<Textarea autoFocus aria-label={t('math.source')} value={latex} disabled={!writable} maxLength={4096} rows={4} onChange={(event) => { setLatex(event.target.value); setError('') }} /></Label>
    <div className="math-preview" aria-label={t('math.preview')}>{preview.html ? <div dangerouslySetInnerHTML={{ __html: preview.html }} /> : <p>{t('math.previewPlaceholder')}</p>}</div>
    {(error || preview.error) && <p role="alert" className="math-error">{error || preview.error}</p>}
    <DialogFooter className="math-footer">{target.kind === 'edit' && <Button variant="outline" disabled={!writable} onClick={() => save(true)}>{t('math.delete')}</Button>}
      <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button disabled={!writable || !!preview.error} onClick={() => save()}>{target.kind === 'new' ? t('math.insert') : t('math.save')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
