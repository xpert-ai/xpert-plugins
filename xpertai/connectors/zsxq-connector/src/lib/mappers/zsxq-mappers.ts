import { ZsxqConnectorError } from '../errors.js'

type JsonRecord = Record<string, unknown>

export type ZsxqAccountDto = {
  id: string
  name: string
  uniqueId?: string
  location?: string
  avatarUrl?: string
  identityStatus?: string
  subscribedWechat?: boolean
}

export type ZsxqPage<T> = { items: T[]; hasMore: boolean; nextCursor?: string }

export type ZsxqGroupSummaryDto = {
  id: string
  name: string
  description?: string
  owner?: { id?: string; name?: string }
  memberCount?: number
  topicCount?: number
}

export type ZsxqTopicSummaryDto = {
  id: string
  type?: string
  title?: string
  excerpt?: string
  createdAt?: string
  author?: { id?: string; name?: string }
  group?: { id?: string; name?: string }
  digested?: boolean
  sticky?: boolean
  counts?: { comments?: number; likes?: number; readers?: number }
}

export type ZsxqTopicDetailDto = ZsxqTopicSummaryDto & { content?: string }

export type ZsxqCommentSummaryDto = {
  id: string
  text?: string
  createdAt?: string
  author?: { id?: string; name?: string }
  replyToCommentId?: string
  likeCount?: number
}

export type ZsxqHashtagSummaryDto = { id: string; title: string; topicCount?: number }
export type ZsxqNoteSummaryDto = { id: string; text?: string; excerpt?: string; createdAt?: string }
export type ZsxqScheduledJobDto = {
  id: string
  groupId?: string
  text?: string
  scheduledTime?: string
  status?: string
}
export type ZsxqMemberSummaryDto = { id: string; name?: string; avatarUrl?: string; role?: string }

export function mapAccount(payload: unknown): ZsxqAccountDto {
  const root = requireRecord(payload, 'Knowledge Planet account')
  const user = record(root.user) ?? record(root.self) ?? root
  const id = text(user.user_id) ?? text(user.id)
  const name = boundedText(text(user.name) ?? text(user.nickname), 200)
  if (!id || !name) throw invalidResponse('Knowledge Planet account is missing id or name.')
  return compact({
    id,
    name,
    uniqueId: boundedText(text(user.unique_id), 200),
    location: boundedText(text(user.location), 300),
    avatarUrl: trustedHttpsUrl(text(user.avatar_url) ?? text(user.avatarUrl)),
    identityStatus: boundedText(text(root.identity_status), 100),
    subscribedWechat: boolean(root.subscribed_wechat)
  })
}

export function mapGroups(payload: unknown): ZsxqPage<ZsxqGroupSummaryDto> {
  const root = record(payload)
  const data = record(root?.data)
  const values =
    array(payload) ?? array(root?.groups) ?? array(root?.items) ?? array(data?.groups) ?? array(data?.items) ?? []
  return page(values.map(mapGroup).filter(isPresent), root)
}

export function mapTopics(payload: unknown): ZsxqPage<ZsxqTopicSummaryDto> {
  const root = record(payload)
  const data = record(root?.data)
  const values =
    array(payload) ?? array(root?.topics) ?? array(root?.items) ?? array(data?.topics) ?? array(data?.items) ?? []
  return page(values.map(mapTopicSummary).filter(isPresent), root)
}

export function mapTopicDetail(payload: unknown): ZsxqTopicDetailDto {
  const root = requireRecord(payload, 'Knowledge Planet topic')
  const topicRoot = record(root.data) ?? root
  const topic = record(topicRoot.topic) ?? topicRoot
  const summary = mapTopicSummary(topic)
  if (!summary) throw invalidResponse('Knowledge Planet topic is missing topic_id.')
  return compact({ ...summary, content: boundedText(text(topic.content) ?? text(topic.text), 100_000) })
}

export function mapComments(payload: unknown): ZsxqPage<ZsxqCommentSummaryDto> {
  const root = record(payload)
  const data = record(root?.data)
  const values =
    array(payload) ?? array(root?.comments) ?? array(root?.items) ?? array(data?.comments) ?? array(data?.items) ?? []
  const items = values
    .map((value): ZsxqCommentSummaryDto | undefined => {
      const item = record(value)
      if (!item) return undefined
      const id = text(item.comment_id) ?? text(item.id)
      if (!id) return undefined
      return compact({
        id,
        text: boundedText(text(item.text) ?? text(item.content), 20_000),
        createdAt: timestamp(item.create_time ?? item.created_at),
        author: mapIdentity(record(item.owner) ?? record(item.user)),
        replyToCommentId: text(item.reply_to_comment_id) ?? text(record(item.reply_to)?.comment_id),
        likeCount: finiteNumber(item.likes_count ?? item.like_count)
      })
    })
    .filter(isPresent)
  return page(items, root)
}

export function mapHashtags(payload: unknown): ZsxqPage<ZsxqHashtagSummaryDto> {
  const root = record(payload)
  const data = record(root?.data)
  const values =
    array(payload) ?? array(root?.hashtags) ?? array(root?.items) ?? array(data?.hashtags) ?? array(data?.items) ?? []
  const items = values
    .map((value): ZsxqHashtagSummaryDto | undefined => {
      const item = record(value)
      if (!item) return undefined
      const id = text(item.hashtag_id) ?? text(item.id)
      const title = boundedText(text(item.title) ?? text(item.name), 200)
      if (!id || !title) return undefined
      return compact({ id, title, topicCount: finiteNumber(item.topic_count ?? item.topics_count) })
    })
    .filter(isPresent)
  return page(items, root)
}

export function mapNotes(payload: unknown): ZsxqPage<ZsxqNoteSummaryDto> {
  const root = record(payload)
  const data = record(root?.data)
  const values =
    array(payload) ?? array(root?.notes) ?? array(root?.items) ?? array(data?.notes) ?? array(data?.items) ?? []
  return page(values.map(mapNote).filter(isPresent), root)
}

export function mapScheduledJobs(payload: unknown): ZsxqPage<ZsxqScheduledJobDto> {
  const root = record(payload)
  const data = record(root?.data)
  const values =
    array(payload) ??
    array(root?.jobs) ??
    array(root?.scheduled_jobs) ??
    array(root?.items) ??
    array(data?.jobs) ??
    array(data?.items) ??
    []
  const items = values
    .map((value): ZsxqScheduledJobDto | undefined => {
      const item = record(value)
      if (!item) return undefined
      const id = text(item.job_id) ?? text(item.id)
      if (!id) return undefined
      return compact({
        id,
        groupId: text(item.group_id),
        text: boundedText(text(item.text) ?? text(item.content), 2_000),
        scheduledTime: timestamp(item.scheduled_time ?? item.scheduled_at),
        status: boundedText(text(item.status), 80)
      })
    })
    .filter(isPresent)
  return page(items, root)
}

export function mapMembers(payload: unknown): ZsxqPage<ZsxqMemberSummaryDto> {
  const root = record(payload)
  const data = record(root?.data)
  const values =
    array(payload) ?? array(root?.members) ?? array(root?.items) ?? array(data?.members) ?? array(data?.items) ?? []
  const items = values
    .map((value): ZsxqMemberSummaryDto | undefined => {
      const item = record(value)
      if (!item) return undefined
      const id = text(item.user_id) ?? text(item.member_id) ?? text(item.id)
      if (!id) return undefined
      return compact({
        id,
        name: boundedText(text(item.name) ?? text(item.nickname), 200),
        avatarUrl: trustedHttpsUrl(text(item.avatar_url) ?? text(item.avatarUrl)),
        role: boundedText(text(item.role), 80)
      })
    })
    .filter(isPresent)
  return page(items, root)
}

export function mapNoteDetail(payload: unknown): ZsxqNoteSummaryDto {
  const root = requireRecord(payload, 'Knowledge Planet note')
  const noteRoot = record(root.data) ?? root
  const note = record(noteRoot.note) ?? noteRoot
  const mapped = mapNote(note, 100_000)
  if (!mapped) throw invalidResponse('Knowledge Planet note is missing note_id.')
  return mapped
}

export function mapMutationReceipt(
  payload: unknown,
  operation: string,
  idKeys: readonly string[]
): { status: 'completed'; operation: string; id?: string; createdAt?: string; verified: false } {
  const root = record(payload) ?? {}
  const nested = record(root.topic) ?? record(root.comment) ?? record(root.note) ?? root
  const id = idKeys.map((key) => text(nested[key]) ?? text(root[key])).find(Boolean)
  return compact({
    status: 'completed' as const,
    operation,
    id,
    createdAt: timestamp(nested.create_time ?? root.create_time),
    verified: false as const
  })
}

function mapGroup(value: unknown): ZsxqGroupSummaryDto | undefined {
  const item = record(value)
  if (!item) return undefined
  const id = text(item.group_id) ?? text(item.id)
  const name = boundedText(text(item.name) ?? text(item.title), 300)
  if (!id || !name) return undefined
  const statistics = record(item.statistics) ?? record(item.stats)
  return compact({
    id,
    name,
    description: boundedText(text(item.description), 2_000),
    owner: mapIdentity(record(item.owner)),
    memberCount: finiteNumber(statistics?.members_count ?? statistics?.member_count ?? item.member_count),
    topicCount: finiteNumber(statistics?.topics_count ?? statistics?.topic_count ?? item.topic_count)
  })
}

function mapTopicSummary(value: unknown): ZsxqTopicSummaryDto | undefined {
  const item = record(value)
  if (!item) return undefined
  const id = text(item.topic_id) ?? text(item.id)
  if (!id) return undefined
  const counts = record(item.counts)
  const content = text(item.content) ?? text(item.text) ?? text(item.talk)
  return compact({
    id,
    type: boundedText(text(item.type), 80),
    title: boundedText(text(item.title), 500),
    excerpt: boundedText(content, 500),
    createdAt: timestamp(item.create_time ?? item.created_at),
    author: mapIdentity(record(item.owner) ?? record(item.author)),
    group: mapIdentity(record(item.group), 'group_id'),
    digested: boolean(item.digested),
    sticky: boolean(item.sticky),
    counts: compact({
      comments: finiteNumber(counts?.comments ?? item.comments_count),
      likes: finiteNumber(counts?.likes ?? item.likes_count),
      readers: finiteNumber(counts?.readers ?? item.readers_count)
    })
  })
}

function mapNote(value: unknown, textLimit = 2_000): ZsxqNoteSummaryDto | undefined {
  const item = record(value)
  if (!item) return undefined
  const id = text(item.note_id) ?? text(item.id)
  if (!id) return undefined
  const content = boundedText(text(item.text) ?? text(item.content), textLimit)
  return compact({
    id,
    text: content,
    excerpt: boundedText(content, 500),
    createdAt: timestamp(item.create_time ?? item.created_at)
  })
}

function page<T>(items: T[], root: JsonRecord | undefined): ZsxqPage<T> {
  const nextCursor = text(root?.next_end_time) ?? text(root?.next_cursor) ?? text(root?.end_time)
  return compact({ items, hasMore: boolean(root?.has_more) ?? !!nextCursor, nextCursor })
}

function mapIdentity(value: JsonRecord | undefined, idKey = 'user_id'): { id?: string; name?: string } | undefined {
  if (!value) return undefined
  const mapped = compact({
    id: text(value[idKey]) ?? text(value.id),
    name: boundedText(text(value.name) ?? text(value.nickname), 200)
  })
  return Object.keys(mapped).length ? mapped : undefined
}

function requireRecord(value: unknown, label: string): JsonRecord {
  const result = record(value)
  if (!result) throw invalidResponse(`${label} response is not an object.`)
  return result
}

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : undefined
}

function array(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return undefined
}

function boundedText(value: string | undefined, limit: number): string | undefined {
  return value ? value.slice(0, limit) : undefined
}

function timestamp(value: unknown): string | undefined {
  const result = text(value)
  return result && Number.isFinite(Date.parse(result)) ? result : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function trustedHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined
}

function invalidResponse(message: string): ZsxqConnectorError {
  return new ZsxqConnectorError('PROVIDER_RESPONSE_INVALID', message)
}
