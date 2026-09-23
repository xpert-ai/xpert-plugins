import type { ConnectorProfile } from '@xpert-ai/plugin-sdk'
import { isRecord, readString } from './errors.js'

export type NotionPageSummary = {
  id: string
  type: 'page' | 'data_source' | 'unknown'
  title?: string
  url?: string
  lastEditedTime?: string
  parent?: { type: string; id?: string }
  archived?: boolean
}

export type NotionPageDetail = NotionPageSummary & {
  properties: Record<string, unknown>
  createdTime?: string
  createdBy?: string
  lastEditedBy?: string
}

export type NotionBlock = {
  id: string
  type: string
  text?: string
  hasChildren: boolean
  children?: NotionBlock[]
}

export type NotionDataSource = {
  id: string
  type: 'data_source'
  title?: string
  parent?: { type: string; id?: string }
  properties: Record<string, string>
}

export function mapPageSummary(value: Record<string, unknown>): NotionPageSummary {
  const parentValue = isRecord(value.parent) ? value.parent : undefined
  const parentType = readString(parentValue?.type)
  return {
    id: readString(value.id) ?? 'unknown',
    type: value.object === 'data_source' ? 'data_source' : value.object === 'page' ? 'page' : 'unknown',
    title: extractTitle(value),
    url: readString(value.url),
    lastEditedTime: readString(value.last_edited_time),
    archived:
      typeof value.in_trash === 'boolean'
        ? value.in_trash
        : typeof value.archived === 'boolean'
        ? value.archived
        : undefined,
    ...(parentType ? { parent: { type: parentType, id: parentId(parentValue, parentType) } } : {})
  }
}

export function mapPageDetail(value: Record<string, unknown>): NotionPageDetail {
  const summary = mapPageSummary(value)
  const createdBy = isRecord(value.created_by) ? readString(value.created_by.id) : undefined
  const lastEditedBy = isRecord(value.last_edited_by) ? readString(value.last_edited_by.id) : undefined
  const properties = isRecord(value.properties) ? mapProperties(value.properties) : {}
  return {
    ...summary,
    properties,
    createdTime: readString(value.created_time),
    createdBy,
    lastEditedBy
  }
}

export function mapDataSource(value: Record<string, unknown>): NotionDataSource {
  const properties = isRecord(value.properties) ? value.properties : {}
  const mapped: Record<string, string> = {}
  for (const [name, property] of Object.entries(properties)) {
    mapped[name] = isRecord(property) ? readString(property.type) ?? 'unknown' : 'unknown'
  }
  const parent = isRecord(value.parent) ? value.parent : undefined
  const parentType = readString(parent?.type)
  return {
    id: readString(value.id) ?? 'unknown',
    type: 'data_source',
    title: extractTitle(value),
    properties: mapped,
    ...(parentType ? { parent: { type: parentType, id: parentId(parent, parentType) } } : {})
  }
}

export function mapBlock(value: Record<string, unknown>, children?: NotionBlock[]): NotionBlock {
  const type = readString(value.type) ?? 'unknown'
  const payload = isRecord(value[type]) ? value[type] : undefined
  const text = payload ? blockText(type, payload) : undefined
  return {
    id: readString(value.id) ?? 'unknown',
    type,
    hasChildren: value.has_children === true,
    ...(text ? { text } : {}),
    ...(children?.length ? { children } : {})
  }
}

export function blocksToMarkdown(blocks: NotionBlock[]): string {
  return blocks
    .map((block) => renderBlock(block, 0))
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 50_000)
}

export function profileFromToken(value: {
  workspaceId: string
  workspaceName?: string
  workspaceIcon?: string
  botId: string
  owner?: Record<string, unknown>
}): ConnectorProfile {
  const ownerUser = isRecord(value.owner?.user) ? value.owner?.user : undefined
  const person = isRecord(ownerUser?.person) ? ownerUser?.person : undefined
  return {
    userId: readString(ownerUser?.id),
    name: value.workspaceName ?? 'Notion workspace',
    avatarUrl: value.workspaceIcon,
    email: readString(person?.email),
    workspaceId: value.workspaceId,
    workspaceName: value.workspaceName,
    botId: value.botId
  }
}

function extractTitle(value: Record<string, unknown>): string | undefined {
  const directTitle = richText(value.title)
  if (directTitle) return directTitle
  const properties = isRecord(value.properties) ? value.properties : undefined
  if (!properties) return undefined
  for (const property of Object.values(properties)) {
    if (isRecord(property) && property.type === 'title') {
      const result = richText(property.title)
      if (result) return result
    }
  }
  return undefined
}

function mapProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [name, property] of Object.entries(properties)) {
    if (!isRecord(property)) continue
    const type = readString(property.type)
    const value = type ? property[type] : undefined
    result[name] = propertyValue(type, value)
  }
  return result
}

function propertyValue(type: string | undefined, value: unknown): unknown {
  if (type === 'title' || type === 'rich_text') return richText(value) ?? ''
  if (type === 'select' || type === 'status') return isRecord(value) ? readString(value.name) ?? null : null
  if (type === 'multi_select')
    return Array.isArray(value)
      ? value
          .slice(0, 20)
          .map((item) => (isRecord(item) ? readString(item.name) ?? '' : ''))
          .filter(Boolean)
      : []
  if (type === 'date') return isRecord(value) ? { start: readString(value.start), end: readString(value.end) } : null
  if (type === 'number' || type === 'checkbox') return value
  if (type === 'url' || type === 'email' || type === 'phone_number') return readString(value) ?? null
  if (type === 'people' || type === 'relation')
    return Array.isArray(value)
      ? value
          .slice(0, 20)
          .map((item) => (isRecord(item) ? readString(item.id) : undefined))
          .filter(Boolean)
      : []
  if (type === 'formula' && isRecord(value)) return value[value.type as string]
  if (type === 'created_time' || type === 'last_edited_time') return readString(value) ?? null
  return null
}

function richText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const text = value
    .map((item) => {
      if (!isRecord(item)) return ''
      const plain = readString(item.plain_text)
      if (plain) return plain
      const itemText = isRecord(item.text) ? readString(item.text.content) : undefined
      return itemText ?? ''
    })
    .join('')
  return text || undefined
}

function blockText(type: string, payload: Record<string, unknown>): string | undefined {
  if (type === 'divider') return '---'
  if (type === 'child_page') return readString(payload.title)
  if (type === 'child_database') return readString(payload.title)
  if (type === 'table_row') {
    return Array.isArray(payload.cells) ? payload.cells.map((cell) => richText(cell) ?? '').join(' | ') : undefined
  }
  return richText(payload.rich_text) ?? richText(payload.caption) ?? readString(payload.url)
}

function renderBlock(block: NotionBlock, depth: number): string {
  const text = block.text ?? ''
  const children =
    block.children
      ?.map((child) => renderBlock(child, depth + 1))
      .filter(Boolean)
      .join('\n') ?? ''
  const indent = '  '.repeat(Math.min(depth, 8))
  let line = text
  if (block.type === 'heading_1') line = `# ${text}`
  else if (block.type === 'heading_2') line = `## ${text}`
  else if (block.type === 'heading_3') line = `### ${text}`
  else if (block.type === 'bulleted_list_item') line = `- ${text}`
  else if (block.type === 'numbered_list_item') line = `1. ${text}`
  else if (block.type === 'to_do') line = `- [ ] ${text}`
  else if (block.type === 'quote') line = `> ${text}`
  else if (block.type === 'code') line = '```\n' + text + '\n```'
  else if (block.type === 'callout') line = `> ${text}`
  else if (block.type === 'divider') line = '---'
  if (!line && !children) return ''
  return [line ? `${indent}${line}` : '', children].filter(Boolean).join('\n')
}

function parentId(parent: Record<string, unknown> | undefined, type: string): string | undefined {
  return parent
    ? readString(parent[type]) ??
        readString(parent.database_id) ??
        readString(parent.page_id) ??
        readString(parent.data_source_id)
    : undefined
}
