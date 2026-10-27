import { t, useLocale } from './i18n'
import React, { useState } from 'react'
import { Button } from '@xpert-ai/plugin-shadcn-ui'
import { download } from './bridge'

export function DownloadButton({ fileKey, children, disabled, onError }: {
  fileKey: string; children: React.ReactNode; disabled?: boolean; onError: (error: unknown) => void
}) {
  useLocale()
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState<{ key: string; url: string; fileName: string } | null>(null)
  async function prepare() {
    setBusy(true)
    try { setReady({ key: fileKey, ...await download(fileKey) }) }
    catch (error) { onError(error) }
    finally { setBusy(false) }
  }
  return <span className="inline-flex flex-wrap items-center gap-2">
    <Button variant="outline" disabled={disabled || busy} onClick={() => void prepare()}>{busy ? t('download.preparing') : children}</Button>
    {ready?.key === fileKey && <a className="text-sm underline underline-offset-4" href={ready.url} download={ready.fileName} rel="noopener">{t('download.saveFile')}</a>}
  </span>
}
