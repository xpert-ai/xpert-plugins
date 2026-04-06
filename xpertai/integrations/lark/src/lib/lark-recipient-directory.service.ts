import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { type Cache } from 'cache-manager'
import { LarkMentionIdentity, RecipientDirectory, RecipientDirectoryEntry } from './types.js'

const DIRECTORY_TTL_MS = 72 * 60 * 60 * 1000
const ENTRY_SOFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_PAGE_SIZE = 10

export type LarkRecipientDirectoryListItem = {
  id: string
  name: string
  openId: string
  source: RecipientDirectoryEntry['source']
  aliases: string[]
  firstSeenAt: number
  lastSeenAt: number
}

export type LarkRecipientDirectoryListQuery = {
  page?: number
  pageSize?: number
  search?: string | null
  sortBy?: string | null
  sortDirection?: 'asc' | 'desc' | null
}

export type LarkRecipientDirectoryListResult = {
  items: LarkRecipientDirectoryListItem[]
  total: number
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeName(value: string | null | undefined): string | null {
  const normalized = normalizeString(value)
  return normalized ? normalized.toLocaleLowerCase() : null
}

type RecipientScopeParams = {
  integrationId?: string | null
  chatType?: string | null
  chatId?: string | null
  senderOpenId?: string | null
}

@Injectable()
export class LarkRecipientDirectoryService {
  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache
  ) {}

  buildKey(params: RecipientScopeParams): string | null {
    const integrationId = normalizeString(params.integrationId)
    if (!integrationId) {
      return null
    }

    const normalizedChatType = normalizeString(params.chatType)?.toLowerCase()
    const chatId = normalizeString(params.chatId)
    const senderOpenId = normalizeString(params.senderOpenId)

    if (normalizedChatType === 'group' && chatId) {
      return `lark:recipient-dir:${integrationId}:chat:${chatId}`
    }

    if (senderOpenId) {
      return `lark:recipient-dir:${integrationId}:user:${senderOpenId}`
    }

    return chatId ? `lark:recipient-dir:${integrationId}:chat:${chatId}` : null
  }

  async get(key: string | null | undefined): Promise<RecipientDirectory | null> {
    const normalizedKey = normalizeString(key)
    if (!normalizedKey) {
      return null
    }
    const directory = await this.cacheManager.get<RecipientDirectory>(normalizedKey)
    if (!directory) {
      return null
    }
    return this.pruneExpiredEntries(directory)
  }

  async save(key: string, directory: RecipientDirectory): Promise<void> {
    const prunedDirectory = this.pruneExpiredEntries(directory)
    await this.cacheManager.set(key, prunedDirectory, DIRECTORY_TTL_MS)
    await this.saveIntegrationIndex(prunedDirectory.integrationId, [
      ...new Set([...(await this.readIntegrationIndex(prunedDirectory.integrationId)), key])
    ])
  }

  async touchByName(key: string | null | undefined, name: string | null | undefined): Promise<void> {
    const directory = await this.get(key)
    const normalizedName = normalizeName(name)
    if (!directory || !normalizedName) {
      return
    }
    let updated = false
    const now = Date.now()
    directory.entries = directory.entries.map((entry) => {
      const values = [entry.name, ...(entry.aliases ?? [])]
      if (values.some((value) => normalizeName(value) === normalizedName)) {
        updated = true
        return {
          ...entry,
          lastSeenAt: now
        }
      }
      return entry
    })
    if (updated && key) {
      await this.save(key, directory)
    }
  }

  async upsertSender(
    key: string | null | undefined,
    params: { scope: Omit<RecipientDirectory, 'entries'>; openId?: string | null; name?: string | null }
  ): Promise<void> {
    const openId = normalizeString(params.openId)
    const name = normalizeString(params.name)
    if (!key || !openId || !name) {
      return
    }

    const directory = (await this.get(key)) ?? {
      ...params.scope,
      entries: []
    }
    directory.entries = this.upsertEntry(directory.entries, {
      openId,
      name,
      source: 'sender'
    })
    await this.save(key, directory)
  }

  async upsertMentions(
    key: string | null | undefined,
    params: { scope: Omit<RecipientDirectory, 'entries'>; mentions: LarkMentionIdentity[] }
  ): Promise<void> {
    if (!key || !Array.isArray(params.mentions) || !params.mentions.length) {
      return
    }

    const directory = (await this.get(key)) ?? {
      ...params.scope,
      entries: []
    }
    let entries = directory.entries

    for (const mention of params.mentions) {
      const openId = normalizeString(mention.id)
      const name = normalizeString(mention.name)
      if (!openId || !name || mention.idType !== 'open_id') {
        continue
      }
      entries = this.upsertEntry(entries, {
        openId,
        name,
        source: 'mention'
      })
    }

    directory.entries = entries
    await this.save(key, directory)
  }

  async resolveByName(
    key: string | null | undefined,
    name: string | null | undefined
  ): Promise<
    | { status: 'resolved'; entry: RecipientDirectoryEntry }
    | { status: 'not_found' }
    | { status: 'ambiguous'; entries: RecipientDirectoryEntry[] }
  > {
    const directory = await this.get(key)
    const normalizedName = normalizeName(name)
    if (!directory || !normalizedName) {
      return { status: 'not_found' }
    }

    const matches = directory.entries.filter((entry) => {
      const values = [entry.name, ...(entry.aliases ?? [])]
      return values.some((value) => normalizeName(value) === normalizedName)
    })

    if (!matches.length) {
      return { status: 'not_found' }
    }
    if (matches.length > 1) {
      return { status: 'ambiguous', entries: matches }
    }

    return { status: 'resolved', entry: matches[0] }
  }

  async resolveByOpenId(
    key: string | null | undefined,
    openId: string | null | undefined
  ): Promise<RecipientDirectoryEntry | null> {
    const directory = await this.get(key)
    const normalizedOpenId = normalizeString(openId)
    if (!directory || !normalizedOpenId) {
      return null
    }

    return directory.entries.find((entry) => entry.openId === normalizedOpenId) ?? null
  }

  async listByIntegration(
    integrationId: string | null | undefined,
    query: LarkRecipientDirectoryListQuery = {}
  ): Promise<LarkRecipientDirectoryListResult> {
    const normalizedIntegrationId = normalizeString(integrationId)
    if (!normalizedIntegrationId) {
      return {
        items: [],
        total: 0
      }
    }

    const keys = await this.readIntegrationIndex(normalizedIntegrationId)
    const activeKeys: string[] = []
    const itemsByOpenId = new Map<string, LarkRecipientDirectoryListItem>()

    for (const key of keys) {
      const directory = await this.get(key)
      if (!directory || directory.integrationId !== normalizedIntegrationId || !directory.entries.length) {
        continue
      }

      activeKeys.push(key)

      for (const entry of directory.entries) {
        const existing = itemsByOpenId.get(entry.openId)
        if (!existing) {
          itemsByOpenId.set(entry.openId, {
            id: entry.openId,
            name: entry.name,
            openId: entry.openId,
            source: entry.source,
            aliases: [...new Set(entry.aliases ?? [])],
            firstSeenAt: entry.firstSeenAt,
            lastSeenAt: entry.lastSeenAt
          })
          continue
        }

        const nextAliases = new Set([...existing.aliases, ...(entry.aliases ?? []), entry.name])
        const useIncomingName = entry.lastSeenAt >= existing.lastSeenAt && !!entry.name

        itemsByOpenId.set(entry.openId, {
          ...existing,
          name: useIncomingName ? entry.name : existing.name,
          source: entry.lastSeenAt >= existing.lastSeenAt ? entry.source : existing.source,
          aliases: Array.from(nextAliases),
          firstSeenAt: Math.min(existing.firstSeenAt, entry.firstSeenAt),
          lastSeenAt: Math.max(existing.lastSeenAt, entry.lastSeenAt)
        })
      }
    }

    if (activeKeys.length !== keys.length) {
      await this.saveIntegrationIndex(normalizedIntegrationId, activeKeys)
    }

    const normalizedSearch = normalizeName(query.search ?? null)
    const filtered = Array.from(itemsByOpenId.values()).filter((item) => {
      if (!normalizedSearch) {
        return true
      }

      const values = [item.name, item.openId, ...item.aliases]
      return values.some((value) => normalizeName(value)?.includes(normalizedSearch))
    })

    const sorted = this.sortItems(filtered, query.sortBy, query.sortDirection)
    const pageSize = normalizePositiveInt(query.pageSize) ?? DEFAULT_PAGE_SIZE
    const page = normalizePositiveInt(query.page) ?? 1
    const start = Math.max(0, (page - 1) * pageSize)

    return {
      items: sorted.slice(start, start + pageSize),
      total: sorted.length
    }
  }

  private async readIntegrationIndex(integrationId: string): Promise<string[]> {
    const index = await this.cacheManager.get<unknown>(this.getIntegrationIndexKey(integrationId))
    if (!Array.isArray(index)) {
      return []
    }

    return Array.from(
      new Set(
        index.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      )
    )
  }

  private async saveIntegrationIndex(integrationId: string, keys: string[]): Promise<void> {
    await this.cacheManager.set(
      this.getIntegrationIndexKey(integrationId),
      Array.from(new Set(keys)),
      DIRECTORY_TTL_MS
    )
  }

  private getIntegrationIndexKey(integrationId: string): string {
    return `lark:recipient-dir:${integrationId}:keys`
  }

  private pruneExpiredEntries(directory: RecipientDirectory): RecipientDirectory {
    const now = Date.now()
    return {
      ...directory,
      entries: (directory.entries ?? []).filter((entry) => {
        const lastSeenAt = typeof entry.lastSeenAt === 'number' ? entry.lastSeenAt : 0
        return now - lastSeenAt <= ENTRY_SOFT_TTL_MS
      })
    }
  }

  private upsertEntry(
    entries: RecipientDirectoryEntry[],
    params: { openId: string; name: string; source: RecipientDirectoryEntry['source'] }
  ): RecipientDirectoryEntry[] {
    const now = Date.now()
    const index = entries.findIndex((entry) => entry.openId === params.openId)
    if (index >= 0) {
      const current = entries[index]
      const aliases = new Set([...(current.aliases ?? []), params.name])
      const next = {
        ...current,
        name: current.name || params.name,
        aliases: Array.from(aliases),
        source: current.source === 'mention' ? current.source : params.source,
        lastSeenAt: now
      }
      const cloned = [...entries]
      cloned[index] = next
      return cloned
    }

    const nextRef = `u_${entries.length + 1}`
    return [
      ...entries,
      {
        ref: nextRef,
        openId: params.openId,
        name: params.name,
        aliases: [params.name],
        source: params.source,
        firstSeenAt: now,
        lastSeenAt: now
      }
    ]
  }

  private sortItems(
    items: LarkRecipientDirectoryListItem[],
    sortBy?: string | null,
    sortDirection?: 'asc' | 'desc' | null
  ): LarkRecipientDirectoryListItem[] {
    const key =
      sortBy === 'name' || sortBy === 'openId' || sortBy === 'source' || sortBy === 'lastSeenAt'
        ? sortBy
        : 'lastSeenAt'
    const direction = sortDirection === 'asc' ? 'asc' : 'desc'

    return [...items].sort((left, right) => {
      const factor = direction === 'asc' ? 1 : -1

      if (key === 'lastSeenAt') {
        return factor * (left.lastSeenAt - right.lastSeenAt)
      }

      const leftValue = key === 'name' ? left.name : key === 'openId' ? left.openId : left.source
      const rightValue = key === 'name' ? right.name : key === 'openId' ? right.openId : right.source
      return factor * leftValue.localeCompare(rightValue)
    })
  }
}

export { DIRECTORY_TTL_MS as LARK_RECIPIENT_DIRECTORY_TTL_MS, ENTRY_SOFT_TTL_MS as LARK_RECIPIENT_DIRECTORY_SOFT_TTL_MS }

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }

  return null
}
