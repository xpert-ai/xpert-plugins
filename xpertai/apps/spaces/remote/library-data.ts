import { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { action, data } from './bridge'
import { catalogItem, catalogPageSchema } from './catalog'
import { listSchema, type Item } from './model'
import { LibraryPager } from './library-pager'

export type LibraryQuery = { filter: string; search: string; folderId: string | null; trash: boolean }
export function useLibraryData(query: LibraryQuery, scope: number, onError: (error: unknown) => void) {
  const [root, setRoot] = useState<Item | null>(null)
  const [permissions, setPermissions] = useState({ canWrite: false, canManage: false })
  const [requiresProject, setRequiresProject] = useState(false)
  const [visible, setVisible] = useState<Item[]>([])
  const [knownItems, setKnownItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true), [syncing, setSyncing] = useState(false), [more, setMore] = useState(false)
  const [revision, setRevision] = useState(0)
  const pager = useRef<LibraryPager<Item> | null>(null), generation = useRef(0), scopeRef = useRef(scope), syncingScope = useRef<number | null>(null)
  const errorRef = useRef(onError); errorRef.current = onError; scopeRef.current = scope
  const remember = (items: Item[]) => setKnownItems(previous => [...new Map([...previous, ...items].map(item => [item.id, item])).values()])
  const reload = async () => { setRevision(value => value + 1) }
  const synchronize = async () => {
    const current = scopeRef.current
    if (syncingScope.current === current) return
    syncingScope.current = current; setSyncing(true)
    try { await action('library.sync', {}); if (current === scopeRef.current) await reload() }
    catch (error) { if (current === scopeRef.current) errorRef.current(error) }
    finally { if (syncingScope.current === current) { syncingScope.current = null; setSyncing(false) } }
  }
  useEffect(() => { setKnownItems([]); setRoot(null); setRequiresProject(false) }, [scope])
  const initialized = useRef(0)
  useEffect(() => {
    if (!scope) return
    const current = ++generation.current
    setLoading(true); setVisible([]); setMore(false)
    const live = () => current === generation.current && scope === scopeRef.current
    const { filter, search, folderId, trash } = query
    const reads: Array<(cursor?: string) => Promise<{ items: Item[]; hasMore: boolean; nextCursor?: string }>> = []
    // Native files and other providers use disjoint lanes. Both filter before paging;
    // the catalog excludes Spaces-owned items so the merge cannot duplicate files.
    reads.push(async cursor => {
      const raw = await data({ selectionId: 'root', pageSize: 50, parameters: { trash, search, cursor,
        ...(folderId ? { parentId: folderId } : {}), ...(filter === 'page' ? { kind: 'page' } : filter === 'files' ? { kind: 'file' } : {}),
        ...(!['all', 'page', 'files'].includes(filter) ? { typeId: filter } : {}) } })
      if (z.object({ meta: z.object({ requiresProject: z.literal(true) }) }).safeParse(raw).success) {
        if (live()) { setRequiresProject(true); setRoot(null) }
        return { items: [], hasMore: false }
      }
      const result = listSchema.parse(raw).meta
      if (live()) { setRoot(result.root); setPermissions(result); setRequiresProject(false); remember(result.items) }
      return result
    })
    if (filter !== 'page') reads.push(async cursor => {
      const result = catalogPageSchema.parse(await action('catalog.list', { deleted: trash, search, cursor,
        ...(folderId ? { parentId: folderId } : {}), ...(filter === 'files' ? { typeId: 'xpert.artifact' } : filter !== 'all' ? { typeId: filter } : {}) }))
      return { ...result, items: result.items.map(catalogItem) }
    })
    const instance = new LibraryPager(reads, (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.id.localeCompare(b.id))
    pager.current = instance
    const timer = setTimeout(() => {
      void instance.next().then(page => {
        if (!live()) return
        setVisible(page.items); setMore(page.hasMore)
        if (initialized.current !== scope) { initialized.current = scope; void synchronize() }
      }).catch(error => { if (live()) errorRef.current(error) }).finally(() => { if (live()) setLoading(false) })
    }, search ? 200 : 0)
    return () => { clearTimeout(timer); generation.current++ }
  }, [scope, query.filter, query.search, query.folderId, query.trash, revision])
  const loadMore = async () => {
    const current = generation.current
    const page = await pager.current?.next()
    if (page && current === generation.current) { setVisible(previous => [...previous, ...page.items]); setMore(page.hasMore) }
  }
  return { root, permissions, requiresProject, visible, knownItems, remember, loading, syncing, more, loadMore, reload, synchronize, revision }
}
