import * as React from 'react'
import { z } from 'zod/v3'
import { dashboardDiscoveryPageSchema, type DiscoveredDashboard } from '../lib/dashboard-discovery.schema'
import { requestHost } from './bridge'

export type DiscoveryOrigin = 'all' | 'project' | 'shared'
type Page = z.infer<typeof dashboardDiscoveryPageSchema>
const responseSchema = z.object({ success: z.literal(true), data: dashboardDiscoveryPageSchema })
export const discoveryKey = (item: DiscoveredDashboard) => `${item.resource.kind}:${item.resource.id}`

/** Cursors belong to one query and Project. Stale responses never append to a new conversation/filter. */
export function useDashboardDiscovery(projectId: string, origin: DiscoveryOrigin) {
  const [search, setSearch] = React.useState('')
  const key = JSON.stringify([projectId, origin, search])
  const [state, setState] = React.useState({
    key,
    items: [] as DiscoveredDashboard[],
    data: null as Page | null,
    cursor: undefined as string | undefined,
    loading: true,
    failed: false
  })
  const epoch = React.useRef(0),
    pending = React.useRef(false)
  const fetchPage = React.useCallback(
    async (cursor: string | undefined, generation: number) => {
      try {
        const result = await requestHost('executeAction', {
          actionKey: 'available-dashboards',
          input: { projectId, origin, search, ...(cursor ? { cursor } : {}) }
        })
        const { data } = responseSchema.parse(result)
        if (generation !== epoch.current) return
        setState((previous) => {
          const items = cursor ? previous.items : []
          const seen = new Set(items.map(discoveryKey))
          return {
            key,
            items: [...items, ...data.items.filter((item) => !seen.has(discoveryKey(item)))],
            data,
            cursor: data.nextCursor ?? undefined,
            loading: false,
            failed: false
          }
        })
      } catch {
        if (generation === epoch.current)
          setState((previous) => ({ ...previous, cursor, loading: false, failed: true }))
      } finally {
        if (generation === epoch.current) pending.current = false
      }
    },
    [key, projectId, origin, search]
  )
  React.useEffect(() => {
    const generation = ++epoch.current
    pending.current = true
    setState({ key, items: [], data: null, cursor: undefined, loading: true, failed: false })
    const timer = window.setTimeout(() => void fetchPage(undefined, generation), search ? 200 : 0)
    return () => {
      ++epoch.current
      window.clearTimeout(timer)
    }
  }, [key, fetchPage])
  const loadMore = () => {
    if (state.key !== key || pending.current || (!state.failed && !state.cursor)) return
    pending.current = true
    setState((previous) => ({ ...previous, loading: true, failed: false }))
    void fetchPage(state.cursor, epoch.current)
  }
  return {
    ...state,
    items: state.key === key ? state.items : [],
    search,
    setSearch,
    loadMore,
    onScroll: (event: React.UIEvent<HTMLDivElement>) => {
      const list = event.currentTarget
      if (!state.failed && list.scrollHeight - list.scrollTop - list.clientHeight < 24) loadMore()
    }
  }
}
