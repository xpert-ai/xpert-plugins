import type { WeComApiPayload } from './types.js'

export function mapAgent(payload: WeComApiPayload) {
  const allowedUsers = readArray(readRecord(payload.allow_userinfos)?.user)
  const allowedDepartments = readArray(readRecord(payload.allow_partys)?.partyid)
  const allowedTags = readArray(readRecord(payload.allow_tags)?.tagid)
  return compact({
    agentId: readString(payload.agentid) ?? readNumber(payload.agentid)?.toString(),
    name: readString(payload.name),
    description: readString(payload.description),
    squareLogoUrl: readHttpsUrl(payload.square_logo_url),
    closed: readNumber(payload.close) === 1,
    visibleScope: {
      userCount: allowedUsers.length,
      departmentCount: allowedDepartments.length,
      tagCount: allowedTags.length
    }
  })
}

export function mapDepartment(payload: WeComApiPayload) {
  const department = readRecord(payload.department) ?? readRecord(readArray(payload.department)[0]) ?? payload
  return departmentDto(department)
}

export function mapDepartmentList(payload: WeComApiPayload, parentDepartmentId: number, limit: number) {
  const all = readArray(payload.department_id)
    .map(readRecord)
    .filter(isDefined)
    .filter((item) => readNumber(item.parentid) === parentDepartmentId)
    .map((item) =>
      compact({
        departmentId: readNumber(item.id),
        parentDepartmentId: readNumber(item.parentid),
        order: readNumber(item.order)
      })
    )
    .filter((item) => item.departmentId != null)
  return page(all, limit)
}

export function mapDepartmentMembers(payload: WeComApiPayload, limit: number) {
  const all = readArray(payload.userlist)
    .map(readRecord)
    .filter(isDefined)
    .map(memberSummaryDto)
    .filter((item) => item.userId)
  return page(all, limit)
}

export function mapMember(payload: WeComApiPayload) {
  return compact({
    userId: readString(payload.userid),
    name: readString(payload.name),
    alias: readString(payload.alias),
    departmentIds: readNumberArray(payload.department),
    position: readString(payload.position),
    status: readNumber(payload.status),
    enabled: readNumber(payload.enable) !== 0,
    externalPosition: readString(payload.external_position),
    mainDepartmentId: readNumber(payload.main_department)
  })
}

export function mapTagList(payload: WeComApiPayload, limit: number) {
  const all = readArray(payload.taglist)
    .map(readRecord)
    .filter(isDefined)
    .map((item) => compact({ tagId: readNumber(item.tagid), name: readString(item.tagname) }))
    .filter((item) => item.tagId != null)
  return page(all, limit)
}

export function mapTagMembers(payload: WeComApiPayload, limit: number) {
  const members = readArray(payload.userlist)
    .map(readRecord)
    .filter(isDefined)
    .map(memberSummaryDto)
    .filter((item) => item.userId)
  const departmentIds = readNumberArray(payload.partylist)
  return {
    tagName: readString(payload.tagname),
    members: members.slice(0, limit),
    memberCount: members.length,
    departmentIds: departmentIds.slice(0, limit),
    departmentCount: departmentIds.length,
    truncated: members.length > limit || departmentIds.length > limit
  }
}

export function mapMedia(payload: WeComApiPayload) {
  return {
    mediaId: readString(payload.media_id),
    type: readString(payload.type),
    createdAt: readString(payload.created_at) ?? readNumber(payload.created_at)?.toString()
  }
}

export function mapMessageReceipt(payload: WeComApiPayload, operation: string) {
  const invalidUserIds = splitProviderIds(payload.invaliduser)
  const unlicensedUserIds = splitProviderIds(payload.unlicenseduser)
  return compact({
    status: invalidUserIds.length || unlicensedUserIds.length ? 'partial' : 'completed',
    operation,
    messageId: readString(payload.msgid),
    invalidUserIds,
    unlicensedUserIds,
    responseCode: readString(payload.response_code)
  })
}

function departmentDto(value: Record<string, unknown>) {
  return compact({
    departmentId: readNumber(value.id),
    name: readString(value.name),
    englishName: readString(value.name_en),
    parentDepartmentId: readNumber(value.parentid),
    order: readNumber(value.order),
    leaderUserIds: readStringArray(value.department_leader)
  })
}

function memberSummaryDto(value: Record<string, unknown>) {
  return compact({
    userId: readString(value.userid),
    name: readString(value.name),
    departmentIds: readNumberArray(value.department)
  })
}

function page<T>(items: T[], limit: number) {
  return { items: items.slice(0, limit), total: items.length, truncated: items.length > limit }
}

function splitProviderIds(value: unknown) {
  return typeof value === 'string' ? value.split('|').map((item) => item.trim()).filter(Boolean).slice(0, 100) : []
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return !!value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readStringArray(value: unknown) {
  return readArray(value).map(readString).filter(isDefined).slice(0, 100)
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return undefined
}

function readNumberArray(value: unknown) {
  return readArray(value).map(readNumber).filter(isDefined).slice(0, 100)
}

function readHttpsUrl(value: unknown) {
  const text = readString(value)
  if (!text) return undefined
  try {
    const url = new URL(text)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
