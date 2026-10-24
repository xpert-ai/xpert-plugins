import type { ViewMessageValue } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { t, useLocale, i18n } from './i18n'
import React, { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Button, Table2 } from '@xpert-ai/plugin-shadcn-ui'

export function TableActions({ editor, writable, report }: { editor: Editor | null; writable: boolean; report: (error: ViewMessageValue) => void }) {
  useLocale()
  const [active, setActive] = useState(false), [header, setHeader] = useState(false)
  useEffect(() => {
    if (!editor) return
    const update = () => { setActive(editor.isActive('table')); setHeader(editor.isActive('tableHeader')) }
    editor.on('transaction', update); update()
    return () => { editor.off('transaction', update) }
  }, [editor])
  if (!editor || !active) return null
  const run = (command: () => boolean) => {
    if (!writable) return
    try { if (!command()) report(i18n.message('table.invalidOperation')) }
    catch (error) { report(error instanceof Error ? error : i18n.message('table.failed')) }
  }
  return <div className="table-actions" role="toolbar" aria-label={t('table.actions')}><Table2 />
    <Button variant="ghost" disabled={!writable} onClick={() => run(() => editor.chain().focus().addRowAfter().run())}>{t('table.addRow')}</Button>
    <Button variant="ghost" disabled={!writable} onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}>{t('table.addColumn')}</Button>
    <Button variant="ghost" disabled={!writable || header} onClick={() => run(() => editor.chain().focus().deleteRow().run())}>{t('table.deleteRow')}</Button>
    <Button variant="ghost" disabled={!writable} onClick={() => run(() => editor.chain().focus().deleteColumn().run())}>{t('table.deleteColumn')}</Button>
    <Button variant="ghost" disabled={!writable} onClick={() => run(() => editor.chain().focus().deleteTable().run())}>{t('table.delete')}</Button>
    <span>{t('table.hint')}</span>
  </div>
}
