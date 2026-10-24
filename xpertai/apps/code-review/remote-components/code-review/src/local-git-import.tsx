import React, { useState } from 'react'
import { z } from 'zod/v3'
import { Button, Input, Dialog, DialogContent, DialogTitle, DialogDescription } from '@xpert-ai/plugin-shadcn-ui'
import { localGitImportSchema } from '../../../src/local-git'
import { action, type Host } from './bridge'
import { i18n, errorMessage } from './i18n'

export function LocalGitImport({
  host,
  onImported,
  open,
  onOpenChange: setOpen
}: {
  host: Host | null
  onImported: (id: string) => void
  open: boolean
  onOpenChange: (value: boolean) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const { t, locale } = i18n(host?.locale)
  async function load() {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 5_000_000) throw new Error('local_bundle_too_large')
      const input = localGitImportSchema.parse(JSON.parse(await file.text()))
      const result = z.object({ id: z.string().uuid() }).parse(await action('import-local', input))
      setOpen(false)
      onImported(result.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'operation_failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) setOpen(value)
      }}
    >
      <DialogContent>
        <DialogTitle>{t('localImportTitle')}</DialogTitle>
        <DialogDescription>{t('localImportHelp')}</DialogDescription>
        <Input
          aria-label={t('reviewBundle')}
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            setError('')
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error, locale)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button disabled={!file || busy} onClick={() => void load()}>
            {busy ? t('importingBundle') : t('importBundle')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
