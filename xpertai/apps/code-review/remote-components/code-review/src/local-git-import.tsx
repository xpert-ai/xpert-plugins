import React, { useState } from 'react'
import { z } from 'zod/v3'
import { Button, Input, Dialog, DialogContent, DialogTitle, DialogDescription } from '@xpert-ai/plugin-shadcn-ui'
import { localGitImportSchema } from '../../../src/local-git'
import { action, type Host } from './bridge'
import { errorMessage } from './i18n'

export function LocalGitImport({ host, onImported }: { host: Host | null; onImported: (id: string) => void }) {
  const [open, setOpen] = useState(false), [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const zh = host?.locale?.startsWith('zh') ?? true, t = (cn: string, en: string) => zh ? cn : en
  async function load() {
    if (!file || busy) return
    setBusy(true); setError('')
    try {
      if (file.size > 5_000_000) throw new Error('local_bundle_too_large')
      const input = localGitImportSchema.parse(JSON.parse(await file.text()))
      const result = z.object({ id: z.string().uuid() }).parse(await action('import-local', input))
      setOpen(false); onImported(result.id)
    } catch (error) { setError(error instanceof Error ? error.message : 'operation_failed') }
    finally { setBusy(false) }
  }
  return <div className="border-b px-5 py-3"><Button variant="outline" disabled={!host} onClick={() => setOpen(true)}>{t('导入本地 Git 审查', 'Import local Git review')}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}><DialogContent>
      <DialogTitle>{t('导入固定版本的变更', 'Import a versioned change')}</DialogTitle>
      <DialogDescription>{t('选择本地导出的审查包（最多 5 MB），包含两个提交版本、变更及对应源码。结果保存在平台。', 'Choose an exported review bundle (up to 5 MB) containing two commit versions, the diff and corresponding source. Results stay in the platform.')}</DialogDescription>
      <Input aria-label={t('审查包', 'Review bundle')} type="file" accept="application/json,.json" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setError('') }}/>
      {error && <p role="alert" className="text-sm text-destructive">{errorMessage(error, zh ? 'zh-Hans' : 'en-US')}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t('取消', 'Cancel')}</Button>
        <Button disabled={!file || busy} onClick={() => void load()}>{busy ? t('正在导入…', 'Importing…') : t('导入', 'Import')}</Button></div>
    </DialogContent></Dialog>
  </div>
}
