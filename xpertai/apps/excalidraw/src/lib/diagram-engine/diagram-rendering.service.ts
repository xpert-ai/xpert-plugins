import { Injectable } from '@nestjs/common'
import { Resvg } from '@resvg/resvg-js'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { DiagramLayoutService } from './diagram-layout.service.js'
import type {
  DiagramCompileResult,
  DiagramFlow,
  DiagramIR,
  DiagramPoint,
  DiagramQualityIssue,
  DiagramValidationReport,
  DiagramWorkspaceFilesApi,
  ResolvedDiagram,
  ResolvedDiagramNode
} from './diagram.types.js'

type Palette = {
  canvas: string
  text: string
  muted: string
  nodeFill: string
  nodeStroke: string
  groupFill: string
  groupStroke: string
  flows: Record<DiagramFlow, string>
}

const requireFromHere = createRequire(import.meta.url)
const bundledCjkFontDir = join(dirname(requireFromHere.resolve('@fontsource-variable/noto-sans-sc/package.json')), 'files')

@Injectable()
export class DiagramValidationService {
  validate(resolved: ResolvedDiagram): DiagramValidationReport {
    const issues: DiagramQualityIssue[] = []
    const { canvas } = resolved.ir
    for (const group of resolved.groups) {
      if (group.x < 0 || group.y < 0 || group.x + group.width > canvas.width || group.y + group.height > canvas.height) {
        issues.push(issue('canvas.group_out_of_bounds', 'error', `Group "${group.label}" is outside the canvas.`, [group.id]))
      }
    }
    for (const node of resolved.nodes) {
      if (node.x < canvas.padding || node.y < canvas.padding || node.x + node.width > canvas.width - canvas.padding || node.y + node.height > canvas.height - canvas.padding) {
        issues.push(issue('canvas.node_out_of_bounds', 'error', `Node "${node.label}" is outside the canvas safe area.`, [node.id]))
      }
      if (estimatedTextWidth(node.label) > node.width - 24) {
        issues.push(issue('text.node_overflow', 'warning', `Node "${node.label}" may overflow its box.`, [node.id]))
      }
    }
    for (let i = 0; i < resolved.nodes.length; i += 1) {
      for (let j = i + 1; j < resolved.nodes.length; j += 1) {
        if (nodeIntersects(resolved.nodes[i], resolved.nodes[j], 8)) {
          issues.push(issue('layout.node_overlap', 'error', 'Diagram nodes overlap.', [resolved.nodes[i].id, resolved.nodes[j].id]))
        }
      }
    }
    const nodeMap = new Map(resolved.nodes.map((node) => [node.id, node]))
    for (const edge of resolved.edges) {
      for (const node of resolved.nodes) {
        if (node.id === edge.source.nodeId || node.id === edge.target.nodeId) continue
        if (polylineHitsNode(edge.points, node, 4)) {
          issues.push(issue('routing.edge_node_collision', 'error', `Edge "${edge.id}" crosses node "${node.id}".`, [edge.id, node.id]))
        }
      }
      if (edge.label && estimatedTextWidth(edge.label) > 180) {
        issues.push(issue('text.edge_label_long', 'warning', `Edge label "${edge.label}" is too long for reliable routing.`, [edge.id]))
      }
      if (!nodeMap.has(edge.source.nodeId) || !nodeMap.has(edge.target.nodeId)) {
        issues.push(issue('reference.edge_endpoint_missing', 'error', `Edge "${edge.id}" has a missing endpoint.`, [edge.id]))
      }
    }
    const labels = resolved.edges.filter((edge) => edge.label).map((edge) => {
      const midpoint = longestSegmentMidpoint(edge.points)
      const width = Math.min(180, Math.max(60, estimatedTextWidth(edge.label ?? '') + 16))
      return { edge, left: midpoint.x - width / 2, right: midpoint.x + width / 2, top: midpoint.y - 22, bottom: midpoint.y + 6 }
    })
    for (const label of labels) {
      if (label.left < 0 || label.top < 0 || label.right > canvas.width || label.bottom > canvas.height) {
        issues.push(issue('text.edge_label_out_of_bounds', 'warning', `Edge label "${label.edge.label}" is near or outside the canvas boundary.`, [label.edge.id]))
      }
      for (const node of resolved.nodes) {
        if (rectanglesIntersect(label, { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height })) {
          issues.push(issue('text.edge_label_node_collision', 'warning', `Edge label "${label.edge.label}" overlaps node "${node.id}".`, [label.edge.id, node.id]))
        }
      }
    }
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        if (rectanglesIntersect(labels[i], labels[j])) {
          issues.push(issue('text.edge_label_collision', 'warning', 'Edge labels overlap.', [labels[i].edge.id, labels[j].edge.id]))
        }
      }
    }
    const crossings = countEdgeCrossings(resolved)
    if (crossings > Math.max(2, resolved.edges.length / 3)) {
      issues.push(issue('routing.excessive_crossings', 'warning', `Diagram contains ${crossings} edge crossings.`, resolved.edges.map((edge) => edge.id)))
    }
    const errors = issues.filter((item) => item.severity === 'error').length
    const warnings = issues.filter((item) => item.severity === 'warning').length
    return {
      valid: errors === 0,
      checkedAt: new Date().toISOString(),
      issues,
      summary: { errors, warnings, nodes: resolved.nodes.length, edges: resolved.edges.length }
    }
  }
}

@Injectable()
export class DiagramCompilerService {
  constructor(
    private readonly layout: DiagramLayoutService,
    private readonly validation: DiagramValidationService
  ) {}

  compile(ir: DiagramIR): DiagramCompileResult {
    const resolved = this.layout.resolve(ir)
    const report = this.validation.validate(resolved)
    const palette = paletteFor(ir)
    const elements = compileElements(resolved, palette)
    const appState = {
      theme: ir.appearance.colorScheme,
      viewBackgroundColor: palette.canvas,
      gridSize: 20
    }
    return { resolved, report, elements, appState, files: {}, svg: renderSvg(resolved, palette) }
  }
}

@Injectable()
export class DiagramPreviewService {
  async createPreview(
    workspaceFiles: DiagramWorkspaceFilesApi,
    input: { drawingId: string; qualityRunId: string; attempt: number; svg: string }
  ) {
    const base = `files/excalidraw/diagrams/${safePath(input.drawingId)}/quality/${safePath(input.qualityRunId)}/preview-${input.attempt}`
    const svgBuffer = Buffer.from(input.svg, 'utf8')
    const pngBuffer = Buffer.from(new Resvg(input.svg, {
      fitTo: { mode: 'width', value: 1920 },
      font: {
        loadSystemFonts: false,
        fontDirs: [bundledCjkFontDir],
        defaultFontFamily: 'Noto Sans SC',
        sansSerifFamily: 'Noto Sans SC'
      },
      languages: ['zh-CN', 'en-US']
    }).render().asPng())
    const [svg, png] = await Promise.all([
      workspaceFiles.writeRuntimeBuffer({
        path: `${base}.svg`, originalName: `preview-${input.attempt}.svg`, mimeType: 'image/svg+xml', buffer: svgBuffer
      }),
      workspaceFiles.writeRuntimeBuffer({
        path: `${base}.png`, originalName: `preview-${input.attempt}.png`, mimeType: 'image/png', buffer: pngBuffer
      })
    ])
    return {
      svg: { filePath: svg.filePath, workspacePath: svg.workspacePath, fileRef: svg.reference, size: svg.size ?? svgBuffer.length },
      png: { filePath: png.filePath, workspacePath: png.workspacePath, fileRef: png.reference, size: png.size ?? pngBuffer.length }
    }
  }
}

function compileElements(resolved: ResolvedDiagram, palette: Palette) {
  const roughness = resolved.ir.appearance.rendering === 'sketch' ? 1 : 0
  const elements: Record<string, unknown>[] = []
  for (const group of resolved.groups) {
    elements.push(baseElement(`diagram-group-${group.id}`, 'rectangle', group.x, group.y, group.width, group.height, {
      strokeColor: palette.groupStroke,
      backgroundColor: palette.groupFill,
      strokeStyle: 'dashed',
      fillStyle: 'solid',
      roughness,
      opacity: 55
    }))
    elements.push(textElement(`diagram-group-label-${group.id}`, group.label, group.x + 16, group.y + 12, Math.max(120, group.width - 32), 26, palette.muted, roughness, 'left'))
  }
  if (resolved.ir.layout.strategy === 'sequence') {
    for (const node of resolved.nodes) {
      const x = node.x + node.width / 2
      const y = node.y + node.height
      const height = resolved.ir.canvas.height - resolved.ir.canvas.padding - y
      elements.push({
        ...baseElement(`diagram-lifeline-${node.id}`, 'line', x, y, 0, height, {
          strokeColor: palette.groupStroke,
          backgroundColor: 'transparent',
          strokeStyle: 'dashed',
          roughness
        }),
        points: [[0, 0], [0, round(height)]],
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null
      })
    }
  }
  for (const edge of resolved.edges) {
    const start = edge.points[0]
    const relativePoints = edge.points.map((point) => [round(point.x - start.x), round(point.y - start.y)])
    const maxX = Math.max(...relativePoints.map(([x]) => Math.abs(x)))
    const maxY = Math.max(...relativePoints.map(([, y]) => Math.abs(y)))
    elements.push({
      ...baseElement(`diagram-edge-${edge.id}`, 'arrow', start.x, start.y, maxX, maxY, {
        strokeColor: palette.flows[edge.flow],
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        roughness,
        strokeStyle: edge.flow === 'async' || edge.flow === 'write' ? 'dashed' : 'solid'
      }),
      points: relativePoints,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: edge.directed === false ? null : 'arrow',
      elbowed: edge.points.length > 2
    })
    if (edge.label) {
      const midpoint = longestSegmentMidpoint(edge.points)
      elements.push(textElement(`diagram-edge-label-${edge.id}`, edge.label, midpoint.x - 70, midpoint.y - 24, 140, 24, palette.muted, roughness, 'center'))
    }
  }
  for (const node of resolved.nodes) {
    const type = node.kind === 'decision' ? 'diamond' : ['user', 'actor', 'graph-store'].includes(node.kind) ? 'ellipse' : 'rectangle'
    const colors = nodeColors(node, palette)
    elements.push(baseElement(`diagram-node-${node.id}`, type, node.x, node.y, node.width, node.height, {
      strokeColor: colors.stroke,
      backgroundColor: colors.fill,
      fillStyle: resolved.ir.appearance.rendering === 'sketch' ? 'hachure' : 'solid',
      roughness
    }))
    elements.push(textElement(`diagram-node-label-${node.id}`, node.label, node.x + 12, node.y + node.height / 2 - 14, node.width - 24, 28, palette.text, roughness, 'center'))
    if (node.description) {
      elements.push(textElement(`diagram-node-description-${node.id}`, node.description, node.x + 12, node.y + node.height - 26, node.width - 24, 20, palette.muted, roughness, 'center', 14))
    }
  }
  for (const annotation of resolved.ir.annotations) {
    const position = annotation.position ?? { x: resolved.ir.canvas.padding, y: resolved.ir.canvas.height - resolved.ir.canvas.padding - 34 }
    elements.push(textElement(`diagram-annotation-${annotation.id}`, annotation.text, position.x, position.y, 260, 40, palette.muted, roughness, 'left', 14))
  }
  const legendTop = resolved.ir.canvas.height - resolved.ir.canvas.padding - resolved.ir.legend.length * 28
  resolved.ir.legend.forEach((item, index) => {
    const x = resolved.ir.canvas.width - resolved.ir.canvas.padding - 210
    const y = legendTop + index * 28
    elements.push({
      ...baseElement(`diagram-legend-line-${index}-${item.flow}`, 'line', x, y + 10, 36, 1, {
        strokeColor: palette.flows[item.flow], backgroundColor: 'transparent', roughness,
        strokeStyle: item.flow === 'async' || item.flow === 'write' ? 'dashed' : 'solid'
      }),
      points: [[0, 0], [36, 0]], lastCommittedPoint: null, startBinding: null, endBinding: null,
      startArrowhead: null, endArrowhead: null
    })
    elements.push(textElement(`diagram-legend-label-${index}-${item.flow}`, item.label, x + 46, y, 164, 22, palette.muted, roughness, 'left', 13))
  })
  return elements
}

function baseElement(id: string, type: string, x: number, y: number, width: number, height: number, overrides: Record<string, unknown>) {
  const seed = stableSeed(id)
  return {
    id,
    type,
    x: round(x), y: round(y), width: round(Math.max(1, width)), height: round(Math.max(1, height)), angle: 0,
    strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid',
    roughness: 0, opacity: 100, groupIds: [], frameId: null, index: null, roundness: { type: 3 }, seed,
    version: 1, versionNonce: seed + 1, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    ...overrides
  }
}

function textElement(id: string, text: string, x: number, y: number, width: number, height: number, color: string, roughness: number, align: 'left' | 'center', fontSize = 18) {
  return {
    ...baseElement(id, 'text', x, y, width, height, { strokeColor: color, backgroundColor: 'transparent', roughness }),
    fontSize,
    fontFamily: 5,
    text,
    originalText: text,
    textAlign: align,
    verticalAlign: 'middle',
    containerId: null,
    autoResize: false,
    lineHeight: 1.25
  }
}

function renderSvg(resolved: ResolvedDiagram, palette: Palette) {
  const markers = Object.entries(palette.flows).map(([flow, color]) =>
    `<marker id="arrow-${flow}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`
  ).join('')
  const groupSvg = resolved.groups.map((group) => `<g><rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="16" fill="${palette.groupFill}" stroke="${palette.groupStroke}" stroke-dasharray="7 5"/><text x="${group.x + 16}" y="${group.y + 24}" class="group">${escapeXml(group.label)}</text></g>`).join('')
  const lifelineSvg = resolved.ir.layout.strategy === 'sequence'
    ? resolved.nodes.map((node) => `<path d="M ${node.x + node.width / 2} ${node.y + node.height} L ${node.x + node.width / 2} ${resolved.ir.canvas.height - resolved.ir.canvas.padding}" fill="none" stroke="${palette.groupStroke}" stroke-width="1.5" stroke-dasharray="6 5"/>`).join('')
    : ''
  const edgeSvg = resolved.edges.map((edge) => {
    const d = edge.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
    const marker = edge.directed === false ? '' : ` marker-end="url(#arrow-${edge.flow})"`
    const dash = edge.flow === 'async' || edge.flow === 'write' ? ' stroke-dasharray="6 4"' : ''
    const label = edge.label ? (() => { const p = longestSegmentMidpoint(edge.points); return `<text x="${p.x}" y="${p.y - 8}" text-anchor="middle" class="edge-label">${escapeXml(edge.label)}</text>` })() : ''
    return `<g><path d="${d}" fill="none" stroke="${palette.flows[edge.flow]}" stroke-width="2.2"${dash}${marker}/>${label}</g>`
  }).join('')
  const nodeSvg = resolved.nodes.map((node) => {
    const colors = nodeColors(node, palette)
    const label = `<text x="${node.x + node.width / 2}" y="${node.y + node.height / 2 + 5}" text-anchor="middle" class="node-label">${escapeXml(node.label)}</text>`
    if (node.kind === 'decision') {
      const cx = node.x + node.width / 2
      const cy = node.y + node.height / 2
      return `<g><path d="M ${cx} ${node.y} L ${node.x + node.width} ${cy} L ${cx} ${node.y + node.height} L ${node.x} ${cy} Z" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>${label}</g>`
    }
    if (['user', 'actor', 'graph-store'].includes(node.kind)) {
      return `<g><ellipse cx="${node.x + node.width / 2}" cy="${node.y + node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>${label}</g>`
    }
    return `<g><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="14" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>${label}</g>`
  }).join('')
  const annotationSvg = resolved.ir.annotations.map((annotation) => {
    const p = annotation.position ?? { x: resolved.ir.canvas.padding, y: resolved.ir.canvas.height - resolved.ir.canvas.padding }
    return `<text x="${p.x}" y="${p.y}" class="annotation">${escapeXml(annotation.text)}</text>`
  }).join('')
  const legendTop = resolved.ir.canvas.height - resolved.ir.canvas.padding - resolved.ir.legend.length * 28
  const legendSvg = resolved.ir.legend.map((item, index) => {
    const x = resolved.ir.canvas.width - resolved.ir.canvas.padding - 210
    const y = legendTop + index * 28
    const dash = item.flow === 'async' || item.flow === 'write' ? ' stroke-dasharray="6 4"' : ''
    return `<g><path d="M ${x} ${y + 10} L ${x + 36} ${y + 10}" stroke="${palette.flows[item.flow]}" stroke-width="2"${dash}/><text x="${x + 46}" y="${y + 14}" class="annotation">${escapeXml(item.label)}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${resolved.ir.canvas.width} ${resolved.ir.canvas.height}" width="${resolved.ir.canvas.width}" height="${resolved.ir.canvas.height}"><defs>${markers}<style>text{font-family:"Noto Sans SC",Arial,"PingFang SC","Microsoft YaHei",sans-serif}.title{font-size:28px;font-weight:700;fill:${palette.text}}.subtitle{font-size:14px;fill:${palette.muted}}.group{font-size:13px;font-weight:700;fill:${palette.muted}}.node-label{font-size:17px;font-weight:600;fill:${palette.text}}.edge-label,.annotation{font-size:12px;fill:${palette.muted};paint-order:stroke;stroke:${palette.canvas};stroke-width:5px;stroke-linejoin:round}</style></defs><rect width="100%" height="100%" fill="${palette.canvas}"/><text x="${resolved.ir.canvas.padding}" y="${resolved.ir.canvas.padding + 24}" class="title">${escapeXml(resolved.ir.title)}</text>${resolved.ir.subtitle ? `<text x="${resolved.ir.canvas.padding}" y="${resolved.ir.canvas.padding + 48}" class="subtitle">${escapeXml(resolved.ir.subtitle)}</text>` : ''}${groupSvg}${lifelineSvg}${edgeSvg}${nodeSvg}${annotationSvg}${legendSvg}</svg>`
}

function paletteFor(ir: DiagramIR): Palette {
  const dark = ir.appearance.colorScheme === 'dark'
  const semantic = ir.appearance.palette === 'semantic'
  return {
    canvas: dark ? '#121212' : '#ffffff',
    text: dark ? '#f1f5f9' : '#1e1e1e',
    muted: dark ? '#94a3b8' : '#64748b',
    nodeFill: dark ? '#1e293b' : '#f8fafc',
    nodeStroke: dark ? '#64748b' : '#475569',
    groupFill: dark ? '#172033' : '#f8fafc',
    groupStroke: dark ? '#475569' : '#cbd5e1',
    flows: semantic ? {
      primary: '#2563eb', control: '#f97316', read: '#059669', write: '#10b981', async: '#8b5cf6',
      transform: '#7c3aed', feedback: '#ef4444', neutral: dark ? '#94a3b8' : '#64748b'
    } : Object.fromEntries(['primary', 'control', 'read', 'write', 'async', 'transform', 'feedback', 'neutral'].map((key) => [key, dark ? '#cbd5e1' : '#475569'])) as Record<DiagramFlow, string>
  }
}

function nodeColors(node: ResolvedDiagramNode, palette: Palette) {
  if (node.kind === 'agent' || node.kind === 'model') return { fill: palette.nodeFill, stroke: palette.flows.transform }
  if (['memory', 'database', 'vector-store', 'graph-store'].includes(node.kind)) return { fill: palette.nodeFill, stroke: palette.flows.read }
  if (node.kind === 'external') return { fill: palette.nodeFill, stroke: palette.flows.neutral }
  return { fill: palette.nodeFill, stroke: palette.nodeStroke }
}

function issue(code: string, severity: DiagramQualityIssue['severity'], message: string, targetIds: string[]): DiagramQualityIssue {
  return { code, severity, message, targetIds }
}

function nodeIntersects(a: ResolvedDiagramNode, b: ResolvedDiagramNode, padding: number) {
  return !(a.x + a.width + padding <= b.x || b.x + b.width + padding <= a.x || a.y + a.height + padding <= b.y || b.y + b.height + padding <= a.y)
}

function rectanglesIntersect(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function polylineHitsNode(points: DiagramPoint[], node: ResolvedDiagramNode, padding: number) {
  return points.slice(1).some((point, index) => segmentHitsNode(points[index], point, node, padding))
}

function segmentHitsNode(a: DiagramPoint, b: DiagramPoint, node: ResolvedDiagramNode, padding: number) {
  const left = node.x - padding
  const top = node.y - padding
  const right = node.x + node.width + padding
  const bottom = node.y + node.height + padding
  if (a.y === b.y) return a.y > top && a.y < bottom && Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right)
  if (a.x === b.x) return a.x > left && a.x < right && Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom)
  return false
}

function countEdgeCrossings(resolved: ResolvedDiagram) {
  let crossings = 0
  for (let i = 0; i < resolved.edges.length; i += 1) {
    for (let j = i + 1; j < resolved.edges.length; j += 1) {
      for (const [a1, a2] of segments(resolved.edges[i].points)) {
        for (const [b1, b2] of segments(resolved.edges[j].points)) {
          if (orthogonalSegmentsCross(a1, a2, b1, b2)) crossings += 1
        }
      }
    }
  }
  return crossings
}

function segments(points: DiagramPoint[]): Array<[DiagramPoint, DiagramPoint]> {
  return points.slice(1).map((point, index) => [points[index], point])
}

function orthogonalSegmentsCross(a1: DiagramPoint, a2: DiagramPoint, b1: DiagramPoint, b2: DiagramPoint) {
  const aHorizontal = a1.y === a2.y
  const bHorizontal = b1.y === b2.y
  if (aHorizontal === bHorizontal) return false
  const h1 = aHorizontal ? a1 : b1
  const h2 = aHorizontal ? a2 : b2
  const v1 = aHorizontal ? b1 : a1
  const v2 = aHorizontal ? b2 : a2
  return v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) && h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y)
}

function longestSegmentMidpoint(points: DiagramPoint[]) {
  const pair = segments(points).sort(([a1, a2], [b1, b2]) => distance(b1, b2) - distance(a1, a2))[0] ?? [points[0], points[0]]
  return { x: round((pair[0].x + pair[1].x) / 2), y: round((pair[0].y + pair[1].y) / 2) }
}

function distance(a: DiagramPoint, b: DiagramPoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function estimatedTextWidth(text: string) {
  return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 16 : 9), 0)
}

function stableSeed(value: string) {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return Math.abs(hash) || 1
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character] ?? character)
}

function safePath(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
