import { t, useLocale } from './i18n'
import React, { useState } from 'react'
import { Button, Input, Label, Tabs, TabsList, TabsTrigger, TabsContent, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, LockKeyhole, Check } from '@xpert-ai/plugin-shadcn-ui'
import { action } from './bridge'
import { itemSchema, type Item } from './model'
const getTemplates = () => [
  { title: t('templates.project.title'), description: t('templates.project.description'), content: t('templates.project.content') },
  { title: t('templates.meeting.title'), description: t('templates.meeting.description'), content: t('templates.meeting.content') },
  { title: t('templates.weekly.title'), description: t('templates.weekly.description'), content: t('templates.weekly.content') }
]
export function FolderSelect({ items, value, onChange }: { items: Item[]; value: string; onChange: (value: string) => void }) {
  useLocale()
  // Radix reserves an empty value for the placeholder; map the root option at this UI boundary.
  return <div className="form-field"><Label htmlFor="folder-location">{t('folder.location')}</Label>
    <Select value={value || 'root'} onValueChange={(id) => onChange(id === 'root' ? '' : id)}>
      <SelectTrigger id="folder-location" className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent position="popper"><SelectItem value="root">{t('folder.root')}</SelectItem>
        {items.filter((item) => item.kind === 'folder' && !item.deleted).map((item) => <SelectItem key={item.id} value={item.id}>{item.filePath ?? item.title}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
}
export function CreateDialog({ root, items, initialParent, kind, editors, editing, onClose, onDone, run, busy }: {
  root: Item; items: Item[]; initialParent: string; kind: string;
  editors: Array<{ key: string; title: string }>; editing?: Item;
  onClose: () => void; onDone: (item: Item) => Promise<void>; run: (work: () => Promise<void>) => Promise<void>; busy: boolean
}) {
  useLocale()
  const templates = getTemplates()
  const [template, setTemplate] = useState(0), [blank, setBlank] = useState(false)
  const [title, setTitle] = useState(editing?.title ?? ''), [parent, setParent] = useState(editing?.parentId ?? initialParent)
  const isPage = kind === 'page' && !editing
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className={isPage ? 'space-dialog template-dialog' : 'space-dialog'}>
    <DialogHeader><DialogTitle>{editing ? t('create.renameMove') : isPage ? t('create.page') : kind === 'folder' ? t('create.folder') : t('create.document')}</DialogTitle>
      <DialogDescription>{isPage ? t('create.pageDescription') : t('library.storageNote')}</DialogDescription></DialogHeader>
    {isPage && <Tabs value={blank ? 'blank' : 'templates'} onValueChange={(value) => setBlank(value === 'blank')}>
      <TabsList aria-label={t('create.startingPoint')}><TabsTrigger value="templates">{t('create.templates')}</TabsTrigger><TabsTrigger value="blank">{t('create.blank')}</TabsTrigger></TabsList>
      <TabsContent value="templates"><div className="template-grid">{templates.map((item, index) => <Button type="button" variant={template === index ? 'secondary' : 'outline'} key={item.title} className="template-option" aria-pressed={template === index} onClick={() => { setTemplate(index); if (!title) setTitle(item.title) }}>
      <div className={`template-paper ${template === index ? 'chosen' : ''}`}>{template === index && <Check className="template-check" />}
        <strong>{item.title}</strong>{item.content.split('\n\n').slice(0, 6).map((text, i) => text.startsWith('## ') ? <h4 key={i}>{text.slice(3)}</h4> : <p key={i}>{text}</p>)}
      </div><h3>{item.title}</h3><p>{item.description}</p>
    </Button>)}</div></TabsContent><TabsContent value="blank"><p className="muted">{t('create.blankDescription')}</p></TabsContent></Tabs>}
    <form className="create-form" onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const editor = editors.find((entry) => entry.key === kind)
      const raw = editing ? await action('item.edit', { itemId: editing.id, expectedVersion: editing.version, title, parentId: parent || null })
        : await action(editor ? 'editor.create' : 'item.create', { spaceId: root.id, parentId: parent || null, title,
          ...(editor ? { editorKey: editor.key } : { kind, ...(isPage ? { content: blank ? '' : templates[template].content } : {}) }) })
      await onDone(itemSchema.parse(raw)); onClose()
    }) }}>
      <div className="form-columns"><Label>{isPage ? t('create.pageName') : t('common.name')}<Input required autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('create.namePlaceholder')} /></Label>
        <FolderSelect items={items.filter((item) => item.id !== editing?.id)} value={parent} onChange={setParent} /></div>
      <DialogFooter><span className="muted mr-auto flex items-center gap-2"><LockKeyhole />{t('create.permissions')}</span><Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy}>{editing ? t('common.save') : isPage ? t('create.createPage') : t('common.create')}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
