export type LucidchartPreviewShape = {
  id: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  text: string
  type: string
  fillColor: string
  strokeColor: string
  strokeWidth: number
  strokeStyle: string
  textColor: string
  fontSize: number
  cornerRadius: number
  opacity: number
}

export type LucidchartPreviewLine = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  text: string
  lineType: string
  strokeColor: string
  strokeWidth: number
  strokeStyle: string
  startStyle: string
  endStyle: string
}

export type LucidchartPreviewPage = {
  id: string
  title: string
  backgroundColor: string
  shapes: LucidchartPreviewShape[]
  lines: LucidchartPreviewLine[]
  viewBox: string
}

export type LucidchartPreviewModel = {
  pages: LucidchartPreviewPage[]
  shapeCount: number
  lineCount: number
}

export function createLucidchartPreview(source: unknown): LucidchartPreviewModel | null {
  if (!isRecord(source)) return null
  const root = isRecord(source.standardImport) ? source.standardImport : source
  const rawPages = Array.isArray(root.pages) ? root.pages.filter(isRecord) : []
  const pageSources = rawPages.length ? rawPages : [root]
  const pages = pageSources
    .map((page, index) => createPreviewPage(page, index))
    .filter((page): page is LucidchartPreviewPage => Boolean(page))
  if (!pages.length) return null
  return {
    pages,
    shapeCount: pages.reduce((total, page) => total + page.shapes.length, 0),
    lineCount: pages.reduce((total, page) => total + page.lines.length, 0)
  }
}

export function renderLucidchartPreviewSvg(
  page: LucidchartPreviewPage,
  options: { className?: string; markerPrefix?: string; ariaLabel?: string } = {}
) {
  const markerPrefix = safeId(options.markerPrefix || `lucid-${page.id}`)
  const arrowMarkerId = `${markerPrefix}-arrow`
  const circleMarkerId = `${markerPrefix}-circle`
  const lines = page.lines.map((line) => renderLine(line, arrowMarkerId, circleMarkerId)).join('')
  const shapes = page.shapes.map(renderShape).join('')
  return `<svg${options.className ? ` class="${escapeHtml(options.className)}"` : ''} viewBox="${escapeHtml(
    page.viewBox
  )}" role="img" aria-label="${escapeHtml(options.ariaLabel || `${page.title} Lucidchart preview`)}"><defs><marker id="${
    arrowMarkerId
  }" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker><marker id="${
    circleMarkerId
  }" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto" markerUnits="strokeWidth"><circle cx="5" cy="5" r="3.25" fill="context-stroke"/></marker></defs>${lines}${shapes}</svg>`
}

function createPreviewPage(source: Record<string, unknown>, index: number): LucidchartPreviewPage | null {
  const rawShapes: Record<string, unknown>[] = []
  const rawLines: Record<string, unknown>[] = []
  collectPreviewItems(source, rawShapes, rawLines, 0, new Set())
  const shapes = rawShapes
    .map((shape, shapeIndex) => normalizeShape(shape, shapeIndex))
    .filter((shape): shape is LucidchartPreviewShape => Boolean(shape))
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]))
  const lines = rawLines
    .map((line, lineIndex) => normalizeLine(line, lineIndex, shapeMap))
    .filter((line): line is LucidchartPreviewLine => Boolean(line))
  if (!shapes.length && !lines.length) return null
  const settings = firstRecord(source.settings, source.pageSettings)
  const id = firstString(source.id, source.pageId) || `page-${index + 1}`
  return {
    id,
    title: firstString(source.title, source.name) || `Page ${index + 1}`,
    backgroundColor: safeColor(settings?.fillColor ?? source.backgroundColor, '#ffffff'),
    shapes,
    lines,
    viewBox: computeViewBox(shapes, lines)
  }
}

function collectPreviewItems(
  value: unknown,
  shapes: Record<string, unknown>[],
  lines: Record<string, unknown>[],
  depth: number,
  seen: Set<object>
) {
  if (depth > 8 || value == null || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item) => collectPreviewItems(item, shapes, lines, depth + 1, seen))
    return
  }
  const record = value as Record<string, unknown>
  if (hasLineGeometry(record)) {
    lines.push(record)
    return
  }
  if (readBounds(record)) {
    shapes.push(record)
    return
  }
  for (const key of ['layers', 'groups', 'children', 'items', 'objects', 'blocks', 'shapes', 'lines', 'connectors']) {
    collectPreviewItems(record[key], shapes, lines, depth + 1, seen)
  }
}

function normalizeShape(input: Record<string, unknown>, index: number): LucidchartPreviewShape | null {
  const bounds = readBounds(input)
  if (!bounds) return null
  const style = firstRecord(input.style, input.format, input.styles, input.properties)
  const fill = firstRecord(style?.fill)
  const stroke = firstRecord(style?.stroke, input.stroke)
  const type = firstString(input.type, input.shape, input.shapeType, input.class) || 'rectangle'
  const rounding = firstNumber(input.cornerRadius, style?.cornerRadius, style?.rounding, input.radius, style?.radius)
  const cornerRadius = rounding == null ? 8 : rounding >= 0 && rounding <= 1 ? rounding * Math.min(bounds.w, bounds.h) / 2 : rounding
  return {
    id: firstString(input.id, input.uuid, input.shapeId, input.name) || `shape-${index + 1}`,
    ...bounds,
    rotation: firstNumber(bounds.rotation, input.rotation) ?? 0,
    text: firstString(input.text, input.label, input.name, input.title),
    type,
    fillColor: safeColor(input.fillColor ?? fill?.color ?? style?.fillColor ?? style?.backgroundColor ?? input.backgroundColor, '#eff6ff'),
    strokeColor: safeColor(input.strokeColor ?? stroke?.color ?? style?.strokeColor ?? style?.borderColor ?? input.borderColor, '#2563eb'),
    strokeWidth: clamp(firstNumber(input.strokeWidth, stroke?.width, style?.strokeWidth, style?.borderWidth) ?? 1.5, 0, 20),
    strokeStyle: firstString(input.strokeStyle, stroke?.style, style?.strokeStyle) || 'solid',
    textColor: safeColor(input.textColor ?? style?.textColor ?? style?.color, '#172033'),
    fontSize: clamp(firstNumber(input.fontSize, style?.fontSize) ?? 12, 7, 72),
    cornerRadius: clamp(cornerRadius, 0, Math.min(bounds.w, bounds.h) / 2),
    opacity: clamp(firstNumber(input.opacity, style?.opacity) ?? 1, 0, 1)
  }
}

function normalizeLine(
  input: Record<string, unknown>,
  index: number,
  shapes: Map<string, LucidchartPreviewShape>
): LucidchartPreviewLine | null {
  const fromId = readEndpointId(input, ['endpoint1', 'fromId', 'sourceId', 'startShapeId', 'startId', 'from', 'source', 'start'])
  const toId = readEndpointId(input, ['endpoint2', 'toId', 'targetId', 'endShapeId', 'endId', 'to', 'target', 'end'])
  const fromShape = fromId ? shapes.get(fromId) : null
  const toShape = toId ? shapes.get(toId) : null
  const startPoint = fromShape ? center(fromShape) : readPoint(input, ['start', 'fromPoint', 'sourcePoint', 'p1', 'endpoint1'])
  const endPoint = toShape ? center(toShape) : readPoint(input, ['end', 'toPoint', 'targetPoint', 'p2', 'endpoint2'])
  const bounds = readBounds(input)
  const x1 = startPoint?.x ?? firstNumber(input.x1, input.startX, input.fromX) ?? bounds?.x
  const y1 = startPoint?.y ?? firstNumber(input.y1, input.startY, input.fromY) ?? bounds?.y
  const x2 = endPoint?.x ?? firstNumber(input.x2, input.endX, input.toX) ?? (bounds ? bounds.x + bounds.w : null)
  const y2 = endPoint?.y ?? firstNumber(input.y2, input.endY, input.toY) ?? (bounds ? bounds.y + bounds.h : null)
  if (![x1, y1, x2, y2].every((value) => typeof value === 'number' && Number.isFinite(value))) return null
  const style = firstRecord(input.style, input.format, input.styles, input.properties)
  const stroke = firstRecord(input.stroke, style?.stroke)
  const endpoint1 = firstRecord(input.endpoint1)
  const endpoint2 = firstRecord(input.endpoint2)
  return {
    id: firstString(input.id, input.uuid, input.lineId, input.name) || `line-${index + 1}`,
    x1: x1 as number,
    y1: y1 as number,
    x2: x2 as number,
    y2: y2 as number,
    text: readLineText(input.text) || firstString(input.label, input.name, input.title),
    lineType: firstString(input.lineType, input.type) || 'straight',
    strokeColor: safeColor(input.strokeColor ?? stroke?.color ?? style?.strokeColor ?? input.color, '#64748b'),
    strokeWidth: clamp(firstNumber(input.strokeWidth, stroke?.width, style?.strokeWidth, input.width) ?? 1.5, 0.5, 20),
    strokeStyle: firstString(input.strokeStyle, stroke?.style, style?.strokeStyle) || 'solid',
    startStyle: firstString(endpoint1?.style, input.startStyle) || 'none',
    endStyle: firstString(endpoint2?.style, input.endStyle) || 'arrow'
  }
}

function renderLine(line: LucidchartPreviewLine, arrowMarkerId: string, circleMarkerId: string) {
  const markerStart = markerFor(line.startStyle, arrowMarkerId, circleMarkerId)
  const markerEnd = markerFor(line.endStyle, arrowMarkerId, circleMarkerId)
  const dash = dashArray(line.strokeStyle)
  const path = linePath(line)
  const label = line.text
    ? `<text class="lw-preview-line-label" x="${number((line.x1 + line.x2) / 2)}" y="${number(
        (line.y1 + line.y2) / 2 - 8
      )}" text-anchor="middle">${escapeHtml(truncateText(line.text, 60))}</text>`
    : ''
  return `<g data-preview-id="${escapeHtml(line.id)}"><path class="lw-preview-line" d="${path}" fill="none" stroke="${escapeHtml(
    line.strokeColor
  )}" stroke-width="${number(line.strokeWidth)}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${
    markerStart ? ` marker-start="url(#${markerStart})"` : ''
  }${markerEnd ? ` marker-end="url(#${markerEnd})"` : ''}/>${label}</g>`
}

function renderShape(shape: LucidchartPreviewShape) {
  const type = shape.type.toLowerCase()
  const transform = shape.rotation
    ? ` transform="rotate(${number(shape.rotation)} ${number(shape.x + shape.w / 2)} ${number(shape.y + shape.h / 2)})"`
    : ''
  const shared = `class="lw-preview-shape" fill="${escapeHtml(shape.fillColor)}" stroke="${escapeHtml(
    shape.strokeColor
  )}" stroke-width="${number(shape.strokeWidth)}" opacity="${number(shape.opacity)}"${
    dashArray(shape.strokeStyle) ? ` stroke-dasharray="${dashArray(shape.strokeStyle)}"` : ''
  }`
  let geometry = ''
  if (type === 'text') {
    geometry = ''
  } else if (type.includes('diamond') || type.includes('rhombus') || type.includes('decision')) {
    geometry = `<polygon ${shared} points="${number(shape.x + shape.w / 2)},${number(shape.y)} ${number(
      shape.x + shape.w
    )},${number(shape.y + shape.h / 2)} ${number(shape.x + shape.w / 2)},${number(shape.y + shape.h)} ${number(
      shape.x
    )},${number(shape.y + shape.h / 2)}"/>`
  } else if (type.includes('circle') || type.includes('ellipse') || type.includes('terminator')) {
    geometry = `<ellipse ${shared} cx="${number(shape.x + shape.w / 2)}" cy="${number(
      shape.y + shape.h / 2
    )}" rx="${number(shape.w / 2)}" ry="${number(shape.h / 2)}"/>`
  } else {
    geometry = `<rect ${shared} x="${number(shape.x)}" y="${number(shape.y)}" width="${number(shape.w)}" height="${number(
      shape.h
    )}" rx="${number(shape.cornerRadius)}"/>`
  }
  const labels = splitLabel(shape.text || shape.id, shape.w, shape.fontSize)
  const startY = shape.y + shape.h / 2 - ((labels.length - 1) * shape.fontSize * 1.25) / 2
  const text = `<text class="lw-preview-label" fill="${escapeHtml(shape.textColor)}" font-size="${number(
    shape.fontSize
  )}" text-anchor="middle" dominant-baseline="middle">${labels
    .map(
      (label, index) =>
        `<tspan x="${number(shape.x + shape.w / 2)}" y="${number(startY + index * shape.fontSize * 1.25)}">${escapeHtml(label)}</tspan>`
    )
    .join('')}</text>`
  return `<g data-preview-id="${escapeHtml(shape.id)}"${transform}>${geometry}${text}</g>`
}

function linePath(line: LucidchartPreviewLine) {
  const type = line.lineType.toLowerCase()
  if (type.includes('elbow')) {
    const middleX = (line.x1 + line.x2) / 2
    return `M${number(line.x1)} ${number(line.y1)}L${number(middleX)} ${number(line.y1)}L${number(middleX)} ${number(
      line.y2
    )}L${number(line.x2)} ${number(line.y2)}`
  }
  if (type.includes('curve')) {
    const middleX = (line.x1 + line.x2) / 2
    return `M${number(line.x1)} ${number(line.y1)}C${number(middleX)} ${number(line.y1)} ${number(middleX)} ${number(
      line.y2
    )} ${number(line.x2)} ${number(line.y2)}`
  }
  return `M${number(line.x1)} ${number(line.y1)}L${number(line.x2)} ${number(line.y2)}`
}

function computeViewBox(shapes: LucidchartPreviewShape[], lines: LucidchartPreviewLine[]) {
  const xs = shapes.flatMap((shape) => [shape.x, shape.x + shape.w]).concat(lines.flatMap((line) => [line.x1, line.x2]))
  const ys = shapes.flatMap((shape) => [shape.y, shape.y + shape.h]).concat(lines.flatMap((line) => [line.y1, line.y2]))
  const minX = Math.min(...xs) - 48
  const minY = Math.min(...ys) - 48
  const maxX = Math.max(...xs) + 48
  const maxY = Math.max(...ys) + 48
  return `${number(minX)} ${number(minY)} ${number(Math.max(360, maxX - minX))} ${number(Math.max(220, maxY - minY))}`
}

function hasLineGeometry(input: Record<string, unknown>) {
  const type = firstString(input.type, input.shape, input.shapeType, input.class, input.lineType).toLowerCase()
  return (
    ['line', 'arrow', 'connector', 'straight', 'elbow', 'curved'].some((candidate) => type.includes(candidate)) ||
    Boolean(input.endpoint1 || input.endpoint2) ||
    (firstNumber(input.x1) != null && firstNumber(input.y1) != null && firstNumber(input.x2) != null && firstNumber(input.y2) != null)
  )
}

function readBounds(input: Record<string, unknown>) {
  const bounds = firstRecord(input.boundingBox, input.bounds, input.box, input.geometry, input.position) ?? input
  const x = firstNumber(bounds.x, bounds.left, input.x, input.left)
  const y = firstNumber(bounds.y, bounds.top, input.y, input.top)
  const w = firstNumber(bounds.w, bounds.width, input.w, input.width)
  const h = firstNumber(bounds.h, bounds.height, input.h, input.height)
  return x != null && y != null && w != null && h != null && w > 0 && h > 0
    ? { x, y, w, h, rotation: firstNumber(bounds.rotation) ?? 0 }
    : null
}

function readPoint(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const point = input[key]
    if (!isRecord(point)) continue
    const x = firstNumber(point.x, point.left)
    const y = firstNumber(point.y, point.top)
    if (x != null && y != null) return { x, y }
  }
  return null
}

function readEndpointId(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    const direct = firstString(value)
    if (direct) return direct
    if (isRecord(value)) {
      const nested = firstString(value.id, value.shapeId, value.nodeId, value.ref, value.reference)
      if (nested) return nested
    }
  }
  return null
}

function readLineText(value: unknown) {
  const direct = firstString(value)
  if (direct) return direct
  if (!Array.isArray(value)) return ''
  for (const item of value) {
    if (isRecord(item)) {
      const text = firstString(item.text)
      if (text) return text
    }
  }
  return ''
}

function splitLabel(value: string, width: number, fontSize: number) {
  const size = Math.max(4, Math.floor(width / Math.max(fontSize * 0.62, 1)))
  const lines = value.replace(/\r\n/g, '\n').split('\n').flatMap((line) => chunkText(line.trim(), size)).filter(Boolean)
  if (lines.length <= 6) return lines
  return [...lines.slice(0, 5), truncateText(lines.slice(5).join(''), size)]
}

function chunkText(value: string, size: number) {
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += size) chunks.push(value.slice(index, index + size))
  return chunks.length ? chunks : ['']
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}…` : value
}

function markerFor(style: string, arrowMarkerId: string, circleMarkerId: string) {
  const normalized = style.toLowerCase()
  if (!normalized || normalized === 'none') return ''
  if (normalized.includes('circle') || normalized.includes('dot')) return circleMarkerId
  return arrowMarkerId
}

function dashArray(style: string) {
  const normalized = style.toLowerCase()
  if (normalized.includes('dash')) return '8 6'
  if (normalized.includes('dot')) return '2 5'
  return ''
}

function center(shape: LucidchartPreviewShape) {
  return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 }
}

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) ?? null
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function safeColor(value: unknown, fallback: string) {
  const color = firstString(value)
  return /^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%+-]+\))$/i.test(color) ? color : fallback
}

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'lucid-preview'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function number(value: number) {
  return Number(value.toFixed(3)).toString()
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character)
  )
}
