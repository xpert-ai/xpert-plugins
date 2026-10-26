import React from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import { z } from 'zod/v3'
import { action } from './bridge'
import { t, useLocale } from './i18n'
import type { Item } from './model'
export function UnavailableContent({ item, onClose, run, busy }: { item: Item; onClose: () => void; run: (work: () => Promise<void>) => Promise<void>; busy: boolean }) {
  useLocale()
  return <Dialog open onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>{t('catalog.unavailable')}</DialogTitle><DialogDescription>{t('catalog.unavailableDescription')}</DialogDescription></DialogHeader>
    <p>{item.title}</p><DialogFooter><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy} onClick={() => void run(async () => {
      const backup = z.object({ fileName: z.string(), content: z.string() }).parse(await action('catalog.backup', { contentId: item.id }))
      const url = URL.createObjectURL(new Blob([backup.content], { type: 'application/json' })), link = document.createElement('a')
      link.href = url; link.download = backup.fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    })}>{t('catalog.downloadBackup')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
