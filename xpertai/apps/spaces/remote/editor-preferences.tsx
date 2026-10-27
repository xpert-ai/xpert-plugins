import React, { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/plugin-shadcn-ui'
import { action } from './bridge'
import { t, useLocale } from './i18n'
import type { Item } from './model'
const settings = z.array(z.object({ scope: z.enum(['resource', 'project', 'organization']), editorKey: z.string().nullable(), revision: z.number(), canSet: z.boolean() }))
export function EditorPreferences({ item, onClose, run, busy }: { item: Item; onClose: () => void; run: (work: () => Promise<void>) => Promise<void>; busy: boolean }) {
  useLocale()
  const [states, setStates] = useState<z.infer<typeof settings>>([])
  const [scope, setScope] = useState('resource'), [editorKey, setEditor] = useState('inherit')
  const current = states.find(value => value.scope === scope)
  useEffect(() => { void run(async () => { const values = settings.parse(await action('catalog.preferences', { contentId: item.id })); setStates(values); setEditor(values[0]?.editorKey ?? 'inherit') }) }, [item.id])
  return <Dialog open onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>{t('catalog.editorDefaults')}</DialogTitle><DialogDescription>{t('catalog.editorDefaultsDescription')}</DialogDescription></DialogHeader>
    <Label>{t('catalog.defaultScope')}</Label><Select value={scope} onValueChange={value => { setScope(value); setEditor(states.find(item => item.scope === value)?.editorKey ?? 'inherit') }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
      {states.map(value => <SelectItem key={value.scope} value={value.scope}>{t(`catalog.scope.${value.scope}`)}</SelectItem>)}
    </SelectContent></Select>
    <Label>{t('catalog.defaultEditor')}</Label><Select value={editorKey} onValueChange={setEditor} disabled={!current?.canSet}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="inherit">{t('catalog.inheritEditor')}</SelectItem>
      {item.compatibleEditors?.map(editor => <SelectItem key={editor.key} value={editor.key}>{editor.title}</SelectItem>)}
    </SelectContent></Select>
    <DialogFooter><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy || !current?.canSet} onClick={() => void run(async () => {
      await action('catalog.preference.set', { contentId: item.id, scope, editorKey: editorKey === 'inherit' ? null : editorKey, expectedRevision: current!.revision }); onClose()
    })}>{t('common.save')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
