import { reviewRefSchema, reviewLabel } from '../../../src/domain'
import React, { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/plugin-shadcn-ui'
import { data, type Host } from './bridge'
import { errorMessage } from './i18n'
const recent = z.object({ items: z.array(z.object({ id: z.string(), ref: reviewRefSchema })), total: z.number() })
const remote = z.object({ items: z.array(z.object({ url: z.string(), title: z.string(), number: z.number(), author: z.string() })), total: z.number() })
export function ManualInbox({ host, onSelect, onOpen }: { host: Host | null; onSelect: (id: string) => void; onOpen: (url: string, access: 'connected') => void }) {
  const [filter, setFilter] = useState('recent'), [page, setPage] = useState(1), [total, setTotal] = useState(0)
  const [items, setItems] = useState<{ id?: string; url?: string; title: string; subtitle: string }[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const zh = host?.locale?.startsWith('zh') ?? true, t = (cn: string, en: string) => zh ? cn : en
  useEffect(() => {
    let active = true
    if (!host) return
    setLoading(true); setError(''); setItems([])
    void data({ page, ...(filter === 'recent' ? {} : { parameters: { inbox: filter } }) }).then(value => {
      if (!active) return
      if (filter === 'recent') {
        const result = recent.parse(value); setTotal(result.total)
        setItems(result.items.map(r => ({ id: r.id, title: reviewLabel(r.ref), subtitle: '' })))
      } else {
        const result = remote.parse(value); setTotal(result.total)
        setItems(result.items.map(r => ({ url: r.url, title: `#${r.number} ${r.title}`, subtitle: r.author })))
      }
    }).catch(e => { if (active) { setError(e instanceof Error ? e.message : 'operation_failed'); setTotal(0) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [host, page, filter])
  return <div className="mt-4"><Select value={filter} onValueChange={v => { setFilter(v); setPage(1) }}><SelectTrigger className="w-44" aria-label={t('PR 列表', 'PR list')}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="recent">{t('最近与置顶', 'Recent and pinned')}</SelectItem><SelectItem value="requested">{t('请求我审查', 'Review requested')}</SelectItem><SelectItem value="authored">{t('我创建的 PR', 'My pull requests')}</SelectItem></SelectContent></Select>
    {error && <p role="alert" className="mt-3 text-sm text-muted-foreground">{errorMessage(error, zh ? 'zh-Hans' : 'en-US')}</p>}
    {loading && <p className="py-4 text-sm text-muted-foreground">{t('正在加载…', 'Loading…')}</p>}
    {!loading && !error && !items.length && <p className="py-4 text-sm text-muted-foreground">{t('暂无 PR', 'No pull requests')}</p>}
    <div className="mt-2 divide-y">{items.map(item => <button key={item.id ?? item.url} className="w-full rounded-md px-2 py-3 text-left text-sm hover:bg-accent" onClick={() => item.id ? onSelect(item.id) : item.url && onOpen(item.url, 'connected')}><span>{item.title}</span>{item.subtitle && <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>}</button>)}</div>
    {total > 20 && <div className="mt-3 flex items-center justify-between"><Button size="sm" variant="outline" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>{t('上一页', 'Previous')}</Button><span className="text-xs">{page} / {Math.ceil(total / 20)}</span><Button size="sm" variant="outline" disabled={page * 20 >= total || loading} onClick={() => setPage(p => p + 1)}>{t('下一页', 'Next')}</Button></div>}
  </div>
}
