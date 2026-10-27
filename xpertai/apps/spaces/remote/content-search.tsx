import React, { useState } from 'react'
import { z } from 'zod/v3'
import { Button, Input } from '@xpert-ai/plugin-shadcn-ui'
import { action, openDocument } from './bridge'
import { t, useLocale } from './i18n'
const matches = z.array(z.object({ itemId: z.string(), contentId: z.string().optional(), title: z.string(), text: z.string(),
  anchor: z.object({ kind: z.string(), id: z.string() }).optional() }))
export function ContentSearch({ spaceId, run, busy }: { spaceId: string; busy: boolean; run: (work: () => Promise<void>) => Promise<void> }) {
  useLocale()
  const [query, setQuery] = useState(''), [results, setResults] = useState<z.infer<typeof matches> | null>(null)
  return <div className="grid gap-2"><form className="flex gap-2" onSubmit={event => { event.preventDefault(); void run(async () => setResults(matches.parse(await action('knowledge.search', { spaceId, query })))) }}>
    <Input aria-label={t('knowledge.searchQuery')} placeholder={t('knowledge.searchQuery')} value={query} onChange={event => setQuery(event.target.value)} required maxLength={200} />
    <Button disabled={busy}>{t('knowledge.searchAction')}</Button></form>
    {results?.length === 0 && <p>{t('knowledge.noSources')}</p>}
    {results?.map((match, index) => <div key={`${match.itemId}:${index}`} className="grid gap-1">
      <Button variant="link" className="justify-start" onClick={() => void run(async () => { await openDocument(match.contentId ?? match.itemId, match.contentId ? 'platform.content.catalog' : 'spaces') })}>{match.title}</Button>
      <p>{match.text.slice(0, 360)}</p>
    </div>)}
  </div>
}
