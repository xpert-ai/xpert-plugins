import React from 'react'
import { z } from 'zod/v3'
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Download, Upload } from '@xpert-ai/plugin-shadcn-ui'
import { executeAction, executeFileAction, notify } from './runtime'
import { unwrapRemoteResponse } from './response-data'
import { createUuid } from './browser-crypto'
import type { translator } from './i18n'

const source = z.object({ fileName: z.string(), contentBase64: z.string(), revision: z.number(), sha256: z.string() })
const recovered = z.object({ deckId: z.string().uuid() })
/** Native file input is only the browser upload bridge. Visible controls are shared shadcn.
 * Recovery always creates another resource; this editor's unsaved content remains intact. */
export function SourceTransfer({ deckId, revision, disabled, t, onRecovered }: {
  deckId: string; revision: number; disabled: boolean; t: ReturnType<typeof translator>; onRecovered: (id: string) => Promise<void>
}) {
  const file = React.useRef<HTMLInputElement>(null), request = React.useRef({ key: '', id: '' })
  const [busy, setBusy] = React.useState(false)
  async function download() {
    setBusy(true)
    try {
      const result = source.parse(unwrapRemoteResponse(await executeAction('export_source', deckId, { deckId, expectedRevision: revision })))
      const bytes = Uint8Array.from(atob(result.contentBase64), character => character.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.fileName; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { notify('error', t('sourceFailure')) } finally { setBusy(false) }
  }
  async function recover(selected: File) {
    setBusy(true)
    try {
      if (selected.size > 64 * 1024 * 1024) throw new Error('limit')
      const key = `${selected.name}:${selected.size}:${selected.lastModified}`
      if (request.current.key !== key) request.current = { key, id: createUuid() }
      const result = recovered.parse(unwrapRemoteResponse(await executeFileAction('import_source', null, { requestId: request.current.id }, selected)))
      await onRecovered(result.deckId)
      request.current = { key: '', id: '' }
    } catch { notify('error', t('sourceFailure')) } finally { setBusy(false) }
  }
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={disabled || busy}>{t('source')}</Button></DropdownMenuTrigger>
      <DropdownMenuContent><DropdownMenuItem onSelect={() => void download()}><Download />{t('downloadSource')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => file.current?.click()}><Upload />{t('recoverSource')}</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
    <input ref={file} type="file" accept="application/json,.json" hidden onChange={event => {
      const selected = event.target.files?.[0]; event.currentTarget.value = ''; if (selected) void recover(selected)
    }} />
  </>
}
