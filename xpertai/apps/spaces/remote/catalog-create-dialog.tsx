import React, { useState } from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Label, Input, Textarea,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/plugin-shadcn-ui'
import { FolderSelect } from './create-dialog'
import { action, askAssistant, setAssistantContext } from './bridge'
import { t } from './i18n'
import type { Item } from './model'
import { catalogItemSchema, useCatalogLabel, openCatalogItem, type Implementation } from './catalog'

export function CatalogCreateDialog({ implementation, implementations, items, initialParent, onClose, onDone, run, busy }: {
  implementation: Implementation; implementations: Implementation[]; items: Item[]; initialParent: string | null;
  onClose: () => void; onDone: () => Promise<void>; run: (work: () => Promise<void>) => Promise<void>; busy: boolean
}) {
  const label = useCatalogLabel()
  const options = implementations.filter(option => option.typeId === implementation.typeId)
  const identity = (option: Implementation) => `${option.providerKey}/${option.implementationKey}`
  const [selected, setSelected] = useState(identity(implementation)), [template, setTemplate] = useState('blank')
  const active = options.find(option => identity(option) === selected) ?? implementation
  const [mode, setMode] = useState('create'), [prompt, setPrompt] = useState('')
  const [parent, setParent] = useState(initialParent ?? ''), [title, setTitle] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  // Keep the completed identity when Assistant delivery fails, so retry does not create
  // another resource. Changing the creation form starts a new explicit request.
  const [createdId, setCreatedId] = useState<string | null>(null)
  const changed = () => { setRequestId(crypto.randomUUID()); setCreatedId(null) }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent>
    <DialogHeader><DialogTitle>{t('catalog.create', { type: label(active.title) })}</DialogTitle><DialogDescription>{t('catalog.permissions')}</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void run(async () => {
      let contentId = createdId
      if (!contentId) {
        const item = catalogItemSchema.parse(await action('catalog.create', { providerKey: active.providerKey, implementationKey: active.implementationKey,
          requestId, title, parentId: parent || null, ...(template !== 'blank' ? { templateId: template } : {}) }))
        contentId = item.contentId; setCreatedId(contentId)
      }
      await onDone()
      if (mode === 'assistant') {
        await setAssistantContext({ key: 'spaces.creation', context: { contentId, title, typeId: active.typeId } })
        // Open within the current Workbench before sending. The first Assistant
        // message may create a conversation and replace the iframe's scope; a
        // navigation request sent after that transition would be cancelled.
        await openCatalogItem(contentId)
        await askAssistant(t('catalog.generatePrompt', { title, contentId, prompt }), requestId)
      } else await openCatalogItem(contentId)
      onClose()
    }) }}>
      <div><Label htmlFor="resource-title">{t('common.name')}</Label><Input id="resource-title" disabled={busy} required maxLength={160} value={title} onChange={event => { changed(); setTitle(event.target.value) }} /></div>
      {options.length > 1 && <div><Label>{t('catalog.implementation')}</Label><Select disabled={busy} value={selected} onValueChange={value => { changed(); setSelected(value); setTemplate('blank') }}><SelectTrigger aria-label={t('catalog.implementation')}><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={identity(option)} value={identity(option)}>{label(option.implementationTitle)}</SelectItem>)}</SelectContent></Select></div>}
      <div><Label>{t('catalog.startFrom')}</Label><Select disabled={busy} value={template} onValueChange={value => { changed(); setTemplate(value) }}><SelectTrigger aria-label={t('catalog.startFrom')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="blank">{t('catalog.blank')}</SelectItem>{active.templates?.map(option => <SelectItem key={option.id} value={option.id}>{label(option.title)}</SelectItem>)}</SelectContent></Select>
        {active.templates?.find(option => option.id === template)?.description && <p>{label(active.templates.find(option => option.id === template)!.description!)}</p>}</div>
      <FolderSelect disabled={busy} items={items} value={parent} onChange={value => { changed(); setParent(value) }} />
      <div><Label>{t('catalog.creationMode')}</Label><Select disabled={busy} value={mode} onValueChange={setMode}><SelectTrigger aria-label={t('catalog.creationMode')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="create">{t('catalog.editMyself')}</SelectItem><SelectItem value="assistant">{t('catalog.withAssistant')}</SelectItem></SelectContent></Select></div>
      {mode === 'assistant' && <div><Label htmlFor="creation-brief">{t('catalog.brief')}</Label><Textarea id="creation-brief" disabled={busy} required maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} /><p>{t('catalog.assistantNotice')}</p></div>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy || !title.trim() || mode === 'assistant' && !prompt.trim()}>{mode === 'assistant' ? t('catalog.generate') : t('common.create')}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
