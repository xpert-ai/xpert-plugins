import * as React from 'react'
import { z } from 'zod/v3'
import { requestHost } from './bridge'

/** Search always starts a new server query. Later pages append, with stale replies discarded. */
export function usePickerItems<T extends { items: object[]; page: number; hasMore: boolean }>(
  actionKey: string, schema: z.ZodType<T>, itemKey: (item: T['items'][number]) => string, projectId?: string
) {
  type Item = T['items'][number]
  const [search, setSearch] = React.useState('')
  const key = JSON.stringify([actionKey, projectId, search])
  const [state, setState] = React.useState({ key, items: [] as Item[], page: 0, hasMore: true, data: null as T | null, loading: true, failed: false })
  const epoch = React.useRef(0), pending = React.useRef(false), sentinel = React.useRef<HTMLDivElement>(null)
  const fetchPage = React.useCallback(async (page: number, generation: number) => {
    try {
      const response = await requestHost('executeAction', { actionKey, input: { search, page, ...(projectId ? { projectId } : {}) } })
      const data = schema.parse(z.object({ success: z.literal(true), data: z.unknown() }).parse(response).data)
      if (generation !== epoch.current) return
      setState(previous => {
        const items = page === 1 ? [] : previous.items
        const seen = new Set(items.map(itemKey))
        return { key, items: [...items, ...data.items.filter(item => !seen.has(itemKey(item)))], page: data.page,
          hasMore: data.hasMore, data, loading: false, failed: false }
      })
    } catch {
      if (generation === epoch.current) setState(previous => ({ ...previous, loading: false, failed: true }))
    } finally { if (generation === epoch.current) pending.current = false }
  }, [actionKey, schema, itemKey, projectId, search, key])
  React.useEffect(() => {
    const generation = ++epoch.current
    pending.current = true
    setState({ key, items: [], page: 0, hasMore: true, data: null, loading: true, failed: false })
    const timer = window.setTimeout(() => void fetchPage(1, generation), search ? 200 : 80)
    return () => { ++epoch.current; window.clearTimeout(timer) }
  }, [key, fetchPage])
  const loadMore = React.useCallback((retry = false) => {
    if (state.key !== key || pending.current || !state.hasMore || state.failed && !retry) return
    pending.current = true
    setState(previous => ({ ...previous, loading: true, failed: false }))
    void fetchPage(state.page + 1, epoch.current)
  }, [state.key, state.page, state.hasMore, state.failed, key, fetchPage])
  React.useEffect(() => {
    if (!sentinel.current || !state.hasMore || state.loading || state.failed || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadMore() }, { rootMargin: '0px 0px 24px 0px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [state.hasMore, state.loading, state.failed, loadMore])
  return { ...state, items: state.key === key ? state.items : [], search, setSearch, sentinel, retry: () => loadMore(true),
    onScroll: (event: React.UIEvent<HTMLDivElement>) => {
      const list = event.currentTarget
      if (list.scrollHeight - list.scrollTop - list.clientHeight < 24) loadMore()
    } }
}
