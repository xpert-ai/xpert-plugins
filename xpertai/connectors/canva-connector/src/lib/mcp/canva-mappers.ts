import { CANVA_RESPONSE_MAX_ITEMS, CANVA_RESPONSE_MAX_TEXT } from '../constants.js'

export type CanvaPayload = Record<string, unknown>
export type DesignSummary = {
  id: string
  title: string | null
  type: string | null
  status: string | null
  updatedAt: string | null
  hasThumbnail: boolean
}

export function mapDesign(value: CanvaPayload): DesignSummary {
  return {
    id: stringValue(value.id) ?? stringValue(value.design_id) ?? 'unknown',
    title: boundedString(value.title ?? value.name),
    type: boundedString(value.type ?? value.design_type),
    status: boundedString(value.status),
    updatedAt: boundedString(value.updated_at ?? value.updatedAt),
    hasThumbnail: typeof value.thumbnail_url === 'string' || typeof value.thumbnailUrl === 'string'
  }
}

export function mapDesignList(value: CanvaPayload, page: number, pageSize: number) {
  const rawItems = Array.isArray(value.items) ? value.items : Array.isArray(value.designs) ? value.designs : []
  const items = rawItems.filter(isRecord).slice(0, Math.min(pageSize, CANVA_RESPONSE_MAX_ITEMS)).map(mapDesign)
  const nextCursor = boundedString(value.next_cursor ?? value.nextCursor)
  return {
    items,
    page,
    pageSize,
    hasMore: Boolean(nextCursor) || items.length === pageSize,
    nextCursor: nextCursor ?? null
  }
}

export function mapPages(value: CanvaPayload) {
  const rawItems = Array.isArray(value.pages) ? value.pages : Array.isArray(value.items) ? value.items : []
  return {
    items: rawItems
      .filter(isRecord)
      .slice(0, CANVA_RESPONSE_MAX_ITEMS)
      .map((page) => ({
        id: stringValue(page.id) ?? stringValue(page.page_id) ?? 'unknown',
        title: boundedString(page.title ?? page.name),
        index: integerValue(page.index ?? page.page_number),
        hasThumbnail: typeof page.thumbnail_url === 'string' || typeof page.thumbnailUrl === 'string'
      })),
    hasMore: rawItems.length > CANVA_RESPONSE_MAX_ITEMS
  }
}

export function mapContent(value: CanvaPayload) {
  const text = boundedString(value.text ?? value.content ?? value.description ?? value.preview)
  return {
    designId: stringValue(value.design_id ?? value.designId) ?? null,
    text,
    elements: mapElements(value.elements)
  }
}

export function mapCandidateList(value: CanvaPayload) {
  const job = readRecord(value.job)
  const result = readRecord(job?.result)
  const generatedDesigns = result?.generated_designs ?? result?.generatedDesigns
  const designCompositions = result?.design_compositions ?? result?.designCompositions
  const rawItems = Array.isArray(designCompositions)
    ? designCompositions
    : Array.isArray(generatedDesigns)
    ? generatedDesigns
    : Array.isArray(value.candidates)
    ? value.candidates
    : Array.isArray(value.items)
    ? value.items
    : []
  const items = rawItems
    .filter(isRecord)
    .slice(0, 20)
    .map((candidate, index) => ({
      index: index + 1,
      candidateId: stringValue(candidate.id ?? candidate.candidate_id) ?? null,
      title: boundedString(candidate.title ?? candidate.name),
      description: boundedString(candidate.description),
      openUrl: safeCanvaUrl(candidate.url ?? candidate.open_url ?? candidate.openUrl),
      hasPreview: hasCandidatePreview(candidate)
    }))
  return {
    jobId: stringValue(job?.id ?? value.job_id ?? value.jobId) ?? null,
    status: boundedString(job?.status ?? value.status) ?? (items.length ? 'success' : 'unknown'),
    selectionMode: Array.isArray(designCompositions) ? 'open_url' : 'candidate_id',
    items
  }
}

export function mapReceipt(value: CanvaPayload, operation: string) {
  return {
    operation,
    id: stringValue(value.id ?? value.design_id ?? value.transaction_id ?? value.job_id) ?? null,
    status: boundedString(value.status) ?? 'accepted',
    revision: integerValue(value.revision),
    changedIds: stringArray(value.changed_ids ?? value.changedIds).slice(0, 50),
    nextAction: boundedString(value.next_action ?? value.nextAction)
  }
}

export function mapFormats(value: CanvaPayload) {
  const formats = Array.isArray(value.formats) ? value.formats : Array.isArray(value.items) ? value.items : []
  return {
    formats: formats
      .filter(isRecord)
      .slice(0, 30)
      .map((format) => ({
        type: boundedString(format.type ?? format.format) ?? 'unknown',
        mimeType: boundedString(format.mime_type ?? format.mimeType),
        extension: boundedString(format.extension),
        available: format.available !== false
      }))
  }
}

export function mapJob(value: CanvaPayload) {
  return {
    jobId: stringValue(value.job_id ?? value.jobId ?? value.id) ?? null,
    status: boundedString(value.status) ?? 'unknown',
    progress: integerValue(value.progress),
    failureCode: boundedString(value.failure_code ?? value.error_code),
    nextAction: boundedString(value.next_action ?? value.nextAction)
  }
}

export function readRecord(value: unknown): CanvaPayload | null {
  return isRecord(value) ? value : null
}
export function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, CANVA_RESPONSE_MAX_TEXT) : undefined
}
function boundedString(value: unknown) {
  return stringValue(value) ?? null
}
function integerValue(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}
function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 160))
    : []
}
function isRecord(value: unknown): value is CanvaPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function mapElements(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .slice(0, 50)
        .map((element) => ({
          id: stringValue(element.id) ?? null,
          type: boundedString(element.type),
          text: boundedString(element.text)
        }))
    : []
}
function hasCandidatePreview(candidate: CanvaPayload) {
  if (
    typeof candidate.url === 'string' ||
    typeof candidate.preview_url === 'string' ||
    typeof candidate.thumbnail_url === 'string'
  )
    return true
  const thumbnail = readRecord(candidate.thumbnail)
  if (typeof thumbnail?.url === 'string') return true
  return (
    Array.isArray(candidate.thumbnails) &&
    candidate.thumbnails.some((thumbnail) => isRecord(thumbnail) && typeof thumbnail.url === 'string')
  )
}
function safeCanvaUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const isCanvaHost =
      host === 'canva.com' ||
      host.endsWith('.canva.com') ||
      host === 'canva.cn' ||
      host.endsWith('.canva.cn') ||
      host === 'khsj.cn' ||
      host.endsWith('.khsj.cn')
    return url.protocol === 'https:' && isCanvaHost ? value : null
  } catch {
    return null
  }
}
