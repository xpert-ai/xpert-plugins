import type { BaiduNetdiskFile, BaiduNetdiskPage, BaiduNetdiskQuota, BaiduNetdiskUser } from './types.js'
import { BaiduNetdiskConnectorError, isRecord, readString } from '../errors.js'

const CATEGORY_NAMES: Record<number, string> = {
  1: 'video',
  2: 'audio',
  3: 'image',
  4: 'document',
  5: 'app',
  6: 'other',
  7: 'bt'
}

export function mapFile(value: unknown): BaiduNetdiskFile | undefined {
  if (!isRecord(value)) return undefined
  const fsid = readIdentifier(value.fs_id) ?? readIdentifier(value.fsid)
  const path = readString(value.path)
  const name = readString(value.server_filename) ?? readString(value.filename) ?? readString(value.name)
  if (!fsid || !path || !name) return undefined
  const category = readInteger(value.category) ?? 6
  return {
    fsid,
    path,
    name,
    category,
    isDirectory: value.isdir === 1 || value.isdir === true,
    ...(readInteger(value.size) !== undefined ? { size: readInteger(value.size) } : {}),
    ...(readString(value.md5) ? { md5: readString(value.md5) } : {}),
    ...(readInteger(value.server_mtime) !== undefined
      ? { modifiedAt: new Date(readInteger(value.server_mtime)! * 1_000).toISOString() }
      : {}),
    ...(readInteger(value.server_ctime) !== undefined
      ? { createdAt: new Date(readInteger(value.server_ctime)! * 1_000).toISOString() }
      : {}),
    ...(readString(value.content) ? { content: readString(value.content)!.slice(0, 4_000) } : {}),
    ...(readString(value.abstract) ? { abstract: readString(value.abstract)!.slice(0, 1_000) } : {}),
    ...(readString(value.thumbnail) ? { thumbnail: readString(value.thumbnail) } : {})
  }
}

export function mapPage(payload: Record<string, unknown>, page: number, pageSize: number): BaiduNetdiskPage {
  const source = Array.isArray(payload.list) ? payload.list : []
  const items = source
    .map(mapFile)
    .filter((value): value is BaiduNetdiskFile => Boolean(value))
    .slice(0, pageSize)
  const total = readInteger(payload.total)
  return {
    page,
    pageSize,
    items,
    ...(total !== undefined ? { total } : {}),
    hasMore: total !== undefined ? page * pageSize < total : items.length === pageSize
  }
}

export function mapSemanticPage(payload: Record<string, unknown>, page: number, pageSize: number): BaiduNetdiskPage {
  const groups = Array.isArray(payload.data) ? payload.data : []
  const source = groups.flatMap((group) => (isRecord(group) && Array.isArray(group.list) ? group.list : []))
  const items = source
    .map(mapFile)
    .filter((value): value is BaiduNetdiskFile => Boolean(value))
    .slice(0, pageSize)
  const isEnd = payload.is_end === true
  return { page, pageSize, items, hasMore: !isEnd }
}

export function mapQuota(payload: Record<string, unknown>): BaiduNetdiskQuota {
  const usedBytes = readInteger(payload.used) ?? readInteger(payload.used_bytes)
  const totalBytes = readInteger(payload.total) ?? readInteger(payload.total_bytes)
  if (usedBytes === undefined || totalBytes === undefined) {
    throw new BaiduNetdiskConnectorError(
      'UPSTREAM_RESPONSE_INVALID',
      'Baidu quota response is missing capacity fields.'
    )
  }
  return {
    usedBytes,
    totalBytes,
    freeBytes: Math.max(0, totalBytes - usedBytes),
    ...(typeof payload.expire === 'number' ? { expired: payload.expire !== 0 } : {})
  }
}

export function mapUser(payload: Record<string, unknown>): BaiduNetdiskUser {
  const user = isRecord(payload.user_info) ? payload.user_info : payload
  return {
    ...(readIdentifier(user.uk) ?? readIdentifier(user.user_id)
      ? { userId: readIdentifier(user.uk) ?? readIdentifier(user.user_id) }
      : {}),
    ...(readString(user.uname) ?? readString(user.name)
      ? { name: readString(user.uname) ?? readString(user.name) }
      : {}),
    ...(readString(user.avatar_url) ? { avatarUrl: readString(user.avatar_url) } : {})
  }
}

export function mapOperation(payload: Record<string, unknown>, affectedFiles: string[] = []) {
  const taskId = readString(payload.taskid) ?? readString(payload.task_id)
  return {
    status: taskId ? ('queued' as const) : ('completed' as const),
    ...(taskId ? { taskId } : {}),
    ...(affectedFiles.length ? { affectedFiles } : {})
  }
}

export function categoryName(category: number): string {
  return CATEGORY_NAMES[category] ?? 'other'
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : undefined
  }
  return undefined
}

function readIdentifier(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  return undefined
}
