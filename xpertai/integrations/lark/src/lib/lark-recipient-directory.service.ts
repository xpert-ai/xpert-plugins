import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { type Cache } from 'cache-manager'
import { LarkMentionIdentity, RecipientDirectory, RecipientDirectoryEntry } from './types.js'

const DIRECTORY_TTL_MS = 72 * 60 * 60 * 1000
const ENTRY_SOFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
    await this.cacheManager.set(key, this.pruneExpiredEntries(directory), DIRECTORY_TTL_MS)
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
}

export { DIRECTORY_TTL_MS as LARK_RECIPIENT_DIRECTORY_TTL_MS, ENTRY_SOFT_TTL_MS as LARK_RECIPIENT_DIRECTORY_SOFT_TTL_MS }
