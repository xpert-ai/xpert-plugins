import * as React from 'react'
import { z } from 'zod/v3'
import { Badge, Button, Card, CardHeader, CardTitle, CardDescription, CardFooter, ChevronRight, Sparkles } from '@xpert-ai/plugin-shadcn-ui'
import { directoryPageSchema, type DirectoryQuery, type DirectoryItem } from '../lib/library/directory-contract'
import { libraryAction } from './library-gateway'
import { catalogImages } from './library-catalog-images'
import { exploreCovers } from './explore-covers'
import { ResourceImage as ResourceAssetImage } from './resource-image'
import type { messages } from './i18n'

type T = ReturnType<typeof messages>
const builtinCovers: Record<string, string> = { ...catalogImages, ...exploreCovers }
export function useDirectory(query: DirectoryQuery, revision: number) {
  const [state, setState] = React.useState<{ page?: z.infer<typeof directoryPageSchema>; loading: boolean; error: string }>({ loading: true, error: '' })
  const key = JSON.stringify(query)
  React.useEffect(() => {
    let alive = true
    setState({ loading: true, error: '' })
    libraryAction('resource-directory', query, directoryPageSchema).then(page => { if (alive) setState({ page, loading: false, error: '' }) },
      error => { if (alive) setState({ loading: false, error: error instanceof Error ? error.message : 'LIBRARY_DIRECTORY_UNAVAILABLE' }) })
    return () => { alive = false }
  }, [key, revision])
  return state
}
export function ResourceImage({ item }: { item: DirectoryItem }) {
  return <ResourceAssetImage item={item} fallbackSrc={item.coverKey ? builtinCovers[item.coverKey] : undefined}/>
}
export function DirectoryGallery({ items, t, busy, canEdit, inserted, onOpen, onUse }: { items: DirectoryItem[]; t: T; busy: boolean; canEdit: boolean;
  inserted: Set<string>; onOpen(item: DirectoryItem): void; onUse(item: DirectoryItem): void }) {
  return <div className={items[0]?.kind === 'example-task' ? 'explore-task-grid' : items[0]?.kind === 'component' ? 'catalog-component-grid' : 'template-grid'}>
    {items.map(item => {
      const task = item.kind === 'example-task', used = !!item.releaseId && inserted.has(item.releaseId)
      const badge = item.state === 'released' ? t.v2Installed : item.state === 'planned' ? t.shellPlanned : t.v2NotInstalled
      const preview = <div className="relative overflow-hidden rounded-xl"><ResourceImage item={item}/>
        {task && item.state === 'released' && <div className="absolute inset-0 flex items-center justify-center"><Button disabled={busy || !canEdit || used} onClick={() => onUse(item)} aria-label={`${t.exploreUse} · ${item.title}`}><span className="absolute inset-0" aria-hidden="true"/><Sparkles aria-hidden="true"/>{used ? t.exploreInserted : t.exploreUse}</Button></div>}
        <div className="absolute bottom-0 right-0 p-2"><Button size="sm" variant="secondary" onClick={() => onOpen(item)} aria-label={`${t.libraryPreview} · ${item.title}`}>{t.libraryPreview}<ChevronRight aria-hidden="true"/></Button></div></div>
      return item.kind === 'component' ? <Card key={item.id} data-catalog-entry={item.id}><div className="mx-3">{preview}</div><CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader>
        <CardFooter className="flex flex-wrap gap-2"><Badge variant="outline">{badge}</Badge>{item.features.slice(0,3).map(feature => <Badge variant="secondary" key={feature}>{feature}</Badge>)}</CardFooter></Card>
        : <article key={item.id} className="min-w-0" data-catalog-entry={item.id}>
          {preview}<div className="mt-4 flex items-start justify-between gap-3"><h2 className="text-base font-semibold leading-snug">{item.title}</h2><Badge variant="outline">{badge}</Badge></div>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground" title={item.description}>{item.description}</p>
          {task && <><p className="mt-3 text-xs text-muted-foreground">{item.dataMode === 'demo' ? t.exploreDemoData : item.dataMode === 'web' ? t.exploreWebData : item.dataMode === 'external' ? t.exploreExternalData : ''}{item.requirements.length ? ` · ${item.requirements.join(' / ')}` : ''}</p>
            <Button className="mt-3" variant="ghost" disabled={busy || !canEdit || item.state !== 'released' || used} onClick={() => onUse(item)}><Sparkles aria-hidden="true"/>{used ? t.exploreInserted : t.exploreUse}</Button></>}
        </article>
    })}
  </div>
}
