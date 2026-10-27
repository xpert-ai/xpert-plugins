import React from 'react'
import { z } from 'zod/v3'
import { Badge } from '@xpert-ai/plugin-shadcn-ui'
import { executeAction } from './runtime'
import { unwrapRemoteResponse } from './response-data'
import type { translator } from './i18n'

const schema = z.object({ status: z.enum(['synced', 'pending', 'failed']), revision: z.number().nullish() }).nullable()
/** Connection/save acknowledgement and file projection are separate facts. Poll only
 * metadata, never replace the active Yjs document; stale responses die with the effect. */
export function SourceSyncBadge({ deckId, t }: { deckId: string; t: ReturnType<typeof translator> }) {
  const [status, setStatus] = React.useState<'synced' | 'pending' | 'failed' | 'unknown' | null>(null)
  React.useEffect(() => {
    let active = true, pending = false
    setStatus(null)
    const refresh = async () => {
      if (!active || pending || document.hidden) return
      pending = true
      try {
        const result = schema.parse(unwrapRemoteResponse(await executeAction('source_status', deckId, { deckId })))
        if (active) setStatus(result?.status ?? null)
      } catch { if (active) setStatus('unknown') }
      finally { pending = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [deckId])
  return status && <Badge variant={status === 'failed' ? 'destructive' : 'outline'} role="status">{t(({ synced: 'sourceSynced', pending: 'sourcePending', failed: 'sourceFailed', unknown: 'sourceUnknown' } as const)[status])}</Badge>
}
