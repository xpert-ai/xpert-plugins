import { z } from 'zod/v3'

/** A million empty rows use one span. Identity is (segment, offset), never the
 * current grid coordinate. Splitting/moving a span keeps every existing ID. */
export const axisSpan = z.object({ segment: z.string().min(1).max(128), start: z.number().int().nonnegative().max(1048575),
  count: z.number().int().positive().max(1048576) }).strict()
export const axisSchema = z.array(axisSpan).min(1).max(10000).superRefine((spans, ctx) => {
  const sorted = [...spans].sort((a, b) => a.segment.localeCompare(b.segment) || a.start - b.start)
  if (spans.reduce((total, span) => total + span.count, 0) > 1048576 ||
    sorted.some((span, index) => span.start + span.count > 1048576 || (index > 0 && sorted[index - 1].segment === span.segment &&
      sorted[index - 1].start + sorted[index - 1].count > span.start)))
    ctx.addIssue({ code: 'custom', message: 'office.workbook_axis_invalid' })
})
export type Axis = z.infer<typeof axisSchema>
export type AxisIdentity = { segment: string; offset: number }
export const axisLength = (axis: Axis) => axis.reduce((count, span) => count + span.count, 0)
export function axisIdentity(axis: Axis, index: number): AxisIdentity {
  if (!Number.isInteger(index) || index < 0) throw new Error('office.workbook_axis_invalid')
  for (const span of axis) {
    if (index < span.count) return { segment: span.segment, offset: span.start + index }
    index -= span.count
  }
  throw new Error('office.workbook_axis_invalid')
}
export function axisIndex(axis: Axis, identity: AxisIdentity): number | null {
  let index = 0
  for (const span of axis) {
    if (span.segment === identity.segment && identity.offset >= span.start && identity.offset < span.start + span.count)
      return index + identity.offset - span.start
    index += span.count
  }
  return null
}
function sliceAxis(axis: Axis, start: number, end: number): Axis {
  let index = 0
  return axis.flatMap(span => {
    const left = Math.max(start, index), right = Math.min(end, index + span.count)
    const part = left < right ? [{ ...span, start: span.start + left - index, count: right - left }] : []
    index += span.count
    return part
  })
}
function compact(spans: Axis): Axis {
  const result: Axis = []
  for (const span of spans) {
    const previous = result.at(-1)
    if (previous?.segment === span.segment && previous.start + previous.count === span.start) previous.count += span.count
    else result.push({ ...span })
  }
  return axisSchema.parse(result)
}
export function insertAxis(axis: Axis, index: number, count: number, segment: string): Axis {
  const length = axisLength(axis)
  if (!Number.isInteger(index) || index < 0 || index > length || axis.some(span => span.segment === segment))
    throw new Error('office.workbook_axis_invalid')
  const inserted = axisSpan.parse({ segment, start: 0, count })
  return compact([...sliceAxis(axis, 0, index), inserted, ...sliceAxis(axis, index, length)])
}
export function deleteAxis(axis: Axis, index: number, count: number): Axis {
  const length = axisLength(axis)
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index + count > length || count === length)
    throw new Error('office.workbook_axis_invalid')
  return compact([...sliceAxis(axis, 0, index), ...sliceAxis(axis, index + count, length)])
}
/** Explicit whole-axis permutation, bounded to 10k positions. Partial grid
 * sorting cannot claim row identity and must remain a structural barrier. */
export function reorderAxis(axis: Axis, index: number, order: number[]): Axis {
  const length = axisLength(axis)
  if (!Number.isInteger(index) || index < 0 || order.length < 1 || order.length > 10000 || index + order.length > length ||
    new Set(order).size !== order.length || order.some(value => !Number.isInteger(value) || value < 0 || value >= order.length))
    throw new Error('office.workbook_axis_invalid')
  return compact([...sliceAxis(axis, 0, index), ...order.flatMap(value => sliceAxis(axis, index + value, index + value + 1)),
    ...sliceAxis(axis, index + order.length, length)])
}

/** Map an old interval after insertion/deletion. Endpoints deleted at the edges
 * shrink to the first/last surviving identity; inserted interior positions join
 * the range. Reordered/non-contiguous identities cannot silently widen it. */
export function mapAxisRange(before: Axis, after: Axis, start: number, end: number): [number, number] | null {
  return createAxisTransform(before, after).range(start, end)
}
type PositionedSpan = Axis[number] & { position: number }
function lowerBound<T>(items: T[], isBefore: (value: T) => boolean) {
  let lo = 0, hi = items.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (isBefore(items[mid])) lo = mid + 1; else hi = mid }
  return lo
}
function indexAxis(axis: Axis) {
  let position = 0
  const spans = axis.map(span => { const result = { ...span, position }; position += span.count; return result })
  const segments = new Map<string, PositionedSpan[]>()
  for (const span of spans) { const group = segments.get(span.segment) ?? []; group.push(span); segments.set(span.segment, group) }
  for (const group of segments.values()) group.sort((a, b) => a.start - b.start)
  const index = (segment: string, offset: number) => {
    const group = segments.get(segment) ?? [], span = group[lowerBound(group, span => span.start + span.count <= offset)]
    return span && span.start <= offset ? span.position + offset - span.start : null
  }
  return { spans, segments, index, length: position }
}
/** Compile once per structural transition, then map sparse cells/formulas in
 * logarithmic time without expanding row IDs or rescanning every span. */
export function createAxisTransform(before: Axis, after: Axis) {
  const source = indexAxis(before), target = indexAxis(after)
  const index = (position: number): number | null => {
    if (!Number.isInteger(position) || position < 0 || position >= source.length) throw new Error('office.workbook_axis_invalid')
    const span = source.spans[lowerBound(source.spans, span => span.position + span.count <= position)]
    return target.index(span.segment, span.start + position - span.position)
  }
  const range = (start: number, end: number): [number, number] | null => {
  if (start > end) throw new Error('office.workbook_axis_invalid')
  index(start); index(end)
  const survivors: Array<{ source: number; target: number; count: number }> = []
  const firstSpan = lowerBound(source.spans, span => span.position + span.count <= start)
  for (let i = firstSpan; i < source.spans.length && source.spans[i].position <= end; i++) {
    const old = source.spans[i], sourceIndex = old.position
    const left = Math.max(start, sourceIndex), right = Math.min(end + 1, sourceIndex + old.count)
    if (left < right) {
      const group = target.segments.get(old.segment) ?? []
      const loOffset = old.start + left - sourceIndex, hiOffset = old.start + right - sourceIndex
      for (let j = lowerBound(group, span => span.start + span.count <= loOffset); j < group.length && group[j].start < hiOffset; j++) {
          const next = group[j], targetIndex = next.position
          const lo = Math.max(old.start + left - sourceIndex, next.start)
          const hi = Math.min(old.start + right - sourceIndex, next.start + next.count)
          if (lo < hi) survivors.push({ source: sourceIndex + lo - old.start, target: targetIndex + lo - next.start, count: hi - lo })
      }
    }
  }
  if (!survivors.length) return null
  survivors.sort((a, b) => a.target - b.target)
  const first = survivors[0].target, last = survivors.at(-1)!
  // Moving an old row from outside the reference into its middle is not an
  // insertion. Such a non-rectangular reference requires an explicit decision.
  const inside = sliceAxis(after, first, last.target + last.count)
  for (const span of inside) {
    const group = source.segments.get(span.segment) ?? []
    for (let i = lowerBound(group, old => old.start + old.count <= span.start); i < group.length && group[i].start < span.start + span.count; i++) {
      const old = group[i], lo = Math.max(old.start, span.start), hi = Math.min(old.start + old.count, span.start + span.count)
      const firstSource = old.position + lo - old.start, lastSource = old.position + hi - old.start - 1
      if (firstSource < start || lastSource > end) throw new Error('office.workbook_range_reordered')
    }
  }
  return [first, last.target + last.count - 1]
  }
  return { index, range }
}
