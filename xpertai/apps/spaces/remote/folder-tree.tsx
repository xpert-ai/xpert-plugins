import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { Button, ChevronRight, ChevronDown, Folder } from '@xpert-ai/plugin-shadcn-ui'
import { action } from './bridge'
import { itemSchema, errorText, type Item } from './model'
import { t } from './i18n'
const pageSchema = z.object({ items: z.array(itemSchema), hasMore: z.boolean(), nextCursor: z.string().optional() })

export function FolderTree({ parentId = null, selected, onSelect, onItems, disabled, depth = 0, excludedId, revision = 0 }: {
  parentId?: string | null; selected: string | null; onSelect: (item: Item) => void;
  onItems: (items: Item[]) => void; disabled?: boolean; depth?: number; excludedId?: string; revision?: number
}) {
  const [items, setItems] = useState<Item[]>([]), [cursor, setCursor] = useState<string>(), [more, setMore] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set()), [loading, setLoading] = useState(true), [error, setError] = useState<unknown>()
  const generation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    setLoading(true); setError(undefined)
    const live = () => current === generation.current
    void action('folder.list', { parentId }).then(raw => {
      if (!live()) return
      const page = pageSchema.parse(raw); setItems(page.items); setCursor(page.nextCursor); setMore(page.hasMore); onItems(page.items)
    }).catch(error => { if (live()) setError(error) }).finally(() => { if (live()) setLoading(false) })
    return () => { generation.current++ }
  }, [parentId, revision])
  return <div className="folder-tree" style={{ paddingLeft: depth ? 'calc(var(--spacing) * 3)' : undefined }}>
    {items.filter(item => item.id !== excludedId).map(item => <React.Fragment key={item.id}><div className="flex min-w-0 items-center">
      <Button type="button" variant="ghost" size="icon" aria-label={t(expanded.has(item.id) ? 'folder.collapse' : 'folder.expand', { title: item.title })} aria-expanded={expanded.has(item.id)} disabled={disabled}
        onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })}>
        {expanded.has(item.id) ? <ChevronDown /> : <ChevronRight />}
      </Button>
      <Button type="button" variant={selected === item.id ? 'secondary' : 'ghost'} className="min-w-0 flex-1 justify-start" title={item.filePath ?? item.title} disabled={disabled} onClick={() => onSelect(item)}><Folder /><span className="truncate">{item.title}</span></Button>
    </div>{expanded.has(item.id) && <FolderTree parentId={item.id} selected={selected} onSelect={onSelect} onItems={onItems} disabled={disabled} depth={depth + 1} excludedId={excludedId} revision={revision} />}</React.Fragment>)}
    {loading && <p className="px-2 text-xs text-muted-foreground" role="status">{t('library.loading')}</p>}
    {error ? <p className="px-2 text-xs" role="alert">{String(errorText(error))}</p> : null}
    {more && <Button type="button" variant="ghost" disabled={loading || disabled} onClick={() => {
      const current = generation.current
      setLoading(true); setError(undefined)
      void action('folder.list', { parentId, cursor }).then(raw => { if (current !== generation.current) return; const page = pageSchema.parse(raw); setItems(previous => [...previous, ...page.items]); setCursor(page.nextCursor); setMore(page.hasMore); onItems(page.items) })
        .catch(error => { if (current === generation.current) setError(error) }).finally(() => { if (current === generation.current) setLoading(false) })
    }}>{t('catalog.more')}</Button>}
  </div>
}
