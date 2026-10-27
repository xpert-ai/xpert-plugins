import React, { useState } from 'react'
import { z } from 'zod/v3'
import type { I18nObject } from '@xpert-ai/contracts'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Label, Input } from '@xpert-ai/plugin-shadcn-ui'
import { FolderSelect } from './create-dialog'
import { action, openDocument } from './bridge'
import { t, i18n, useLocale } from './i18n'
import { itemSchema, type Item } from './model'

// Validate provider metadata against the shared contract; translations are optional.
export const localizedLabel = z.object({ en_US: z.string(), zh_Hans: z.string().optional(), zh_Hant: z.string().optional() }) satisfies z.ZodType<I18nObject>
export const implementationSchema = z.object({ typeId: z.string(), title: localizedLabel, providerKey: z.string(), implementationKey: z.string(), implementationTitle: localizedLabel, templates: z.array(z.object({ id: z.string(), title: localizedLabel, description: localizedLabel.optional() })).optional() })
export type Implementation = z.infer<typeof implementationSchema>
export const catalogItemSchema = z.object({ contentId: z.string(), sourceSync: itemSchema.shape.sourceSync, preview: itemSchema.shape.preview, availability: itemSchema.shape.availability, parentId: z.string().nullable().optional(), placementVersion: z.number().optional(), canWrite: z.boolean(), title: z.string(), typeId: z.string(), revision: z.string(), updatedAt: z.string(), deleted: z.boolean(), defaultEditorKey: z.string(), allowedActions: z.array(z.string()), compatibleEditors: itemSchema.shape.compatibleEditors })
export const catalogPageSchema = z.object({ items: z.array(catalogItemSchema), hasMore: z.boolean() })
// Manifest labels use the platform locale convention; translate once at the adapter boundary.
export function useCatalogLabel() {
  useLocale()
  return (label: I18nObject) => i18n.label({ ...label })
}
export function catalogItem(item: z.infer<typeof catalogItemSchema>): Item {
  return { id: item.contentId, sourceSync: item.sourceSync, preview: item.preview, availability: item.availability, title: item.title, kind: 'resource', version: item.placementVersion ?? 0, parentId: item.parentId ?? null, canWrite: item.canWrite, editorKey: item.defaultEditorKey,
    updatedAt: item.updatedAt, deleted: item.deleted, resourceTypeId: item.typeId, resourceRevision: item.revision, allowedActions: item.allowedActions, compatibleEditors: item.compatibleEditors }
}
export const openCatalogItem = (id: string, editorKey?: string) => openDocument(id, 'platform.content.catalog', editorKey)
export { CatalogCreateDialog } from './catalog-create-dialog'

export function CatalogRenameDialog({ item, duplicate = false, onClose, onDone, run, busy }: {
  item: Item; duplicate?: boolean; onClose: () => void; onDone: () => Promise<void>;
  run: (work: () => Promise<void>) => Promise<void>; busy: boolean
}) {
  const [title, setTitle] = useState(duplicate ? t('catalog.copyTitle', { title: item.title }) : item.title)
  const [requestId] = useState(() => crypto.randomUUID())
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent>
    <DialogHeader><DialogTitle>{duplicate ? t('catalog.duplicate') : t('catalog.rename')}</DialogTitle><DialogDescription>{t('catalog.permissions')}</DialogDescription></DialogHeader>
    <form onSubmit={event => { event.preventDefault(); void run(async () => {
      const result = await action(duplicate ? 'catalog.duplicate' : 'catalog.rename', { contentId: item.id, expectedRevision: item.resourceRevision, title, ...(duplicate ? { requestId, parentId: item.parentId ?? null } : {}) })
      await onDone(); onClose()
      if (duplicate) await openCatalogItem(catalogItemSchema.parse(result).contentId)
    }) }}><Label htmlFor="rename-resource">{t('common.name')}</Label><Input id="rename-resource" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} />
      <DialogFooter className="mt-4"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy || !title.trim()}>{t('common.save')}</Button></DialogFooter>
    </form></DialogContent></Dialog>
}

/** A recoverable lifecycle operation, not an unconditional HTML delete. The provider owns
 * collaboration retirement and share revocation; failed transitions remain retryable. */
export function CatalogLifecycleDialog({ item, operation, onClose, onDone, run, busy }: {
  item: Item; operation: 'trash' | 'restore'; onClose: () => void; onDone: () => Promise<void>;
  run: (work: () => Promise<void>) => Promise<void>; busy: boolean
}) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent>
    <DialogHeader><DialogTitle>{operation === 'trash' ? t('trash.move') : t('trash.restore')}</DialogTitle>
      <DialogDescription>{operation === 'trash' ? t('catalog.recycleDescription', { title: item.title }) : t('catalog.restoreDescription', { title: item.title })}</DialogDescription></DialogHeader>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
      <Button variant={operation === 'trash' ? 'destructive' : 'default'} disabled={busy} onClick={() => void run(async () => {
        await action('catalog.lifecycle', { contentId: item.id, expectedRevision: item.resourceRevision, action: operation })
        await onDone(); onClose()
      })}>{operation === 'trash' ? t('trash.move') : t('trash.restore')}</Button></DialogFooter>
  </DialogContent></Dialog>
}

export function CatalogMoveDialog({ item, items, onClose, onDone, run, busy }: {
  item: Item; items: Item[]; onClose: () => void; onDone: () => Promise<void>;
  run: (work: () => Promise<void>) => Promise<void>; busy: boolean
}) {
  const [parent, setParent] = useState(item.parentId ?? '')
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent>
    <DialogHeader><DialogTitle>{t('catalog.move')}</DialogTitle><DialogDescription>{t('catalog.moveDescription')}</DialogDescription></DialogHeader>
    <FolderSelect items={items} value={parent} onChange={setParent} />
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
      <Button disabled={busy} onClick={() => void run(async () => {
        await action('catalog.move', { contentId: item.id, parentId: parent || null, expectedVersion: item.version })
        await onDone(); onClose()
      })}>{t('common.save')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
