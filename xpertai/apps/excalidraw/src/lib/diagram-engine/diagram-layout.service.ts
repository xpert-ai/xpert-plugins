import { Injectable } from '@nestjs/common'
import type {
  DiagramIR,
  DiagramPoint,
  DiagramPort,
  ResolvedDiagram,
  ResolvedDiagramEdge,
  ResolvedDiagramGroup,
  ResolvedDiagramNode
} from './diagram.types.js'

type Bounds = { left: number; top: number; right: number; bottom: number }

@Injectable()
export class DiagramRoutingService {
  route(ir: DiagramIR, nodes: ResolvedDiagramNode[]): ResolvedDiagramEdge[] {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]))
    const obstacles = nodes.map(nodeBounds)
    return [...ir.edges]
      .sort(byOrderThenId)
      .map((edge) => {
        const source = nodeMap.get(edge.source.nodeId)
        const target = nodeMap.get(edge.target.nodeId)
        if (!source || !target) throw new Error(`Cannot route edge ${edge.id}; endpoint is missing.`)
        const sourcePort = edge.source.port ?? inferredPort(source, target)
        const targetPort = edge.target.port ?? inferredPort(target, source)
        const start = portPoint(source, sourcePort)
        const end = portPoint(target, targetPort)
        const otherObstacles = obstacles.filter((item) => !sameBounds(item, nodeBounds(source)) && !sameBounds(item, nodeBounds(target)))
        const points = edge.routing?.points?.length
          ? simplify([start, ...edge.routing.points, end])
          : chooseRoute(start, end, otherObstacles, edge.routing?.corridorX ?? [], edge.routing?.corridorY ?? [])
        return { ...edge, source: { ...edge.source, port: sourcePort }, target: { ...edge.target, port: targetPort }, points }
      })
  }
}

@Injectable()
export class DiagramLayoutService {
  constructor(private readonly routing: DiagramRoutingService) {}

  resolve(ir: DiagramIR): ResolvedDiagram {
    const nodes = this.resolveNodes(ir)
    const groups = resolveGroups(ir, nodes)
    const edges = ir.layout.strategy === 'sequence' ? sequenceEdges(ir, nodes) : this.routing.route(ir, nodes)
    return { ir, nodes, groups, edges }
  }

  private resolveNodes(ir: DiagramIR): ResolvedDiagramNode[] {
    if (ir.layout.strategy === 'explicit') return explicitNodes(ir)
    if (ir.layout.strategy === 'radial') return radialNodes(ir)
    if (ir.layout.strategy === 'matrix') return matrixNodes(ir)
    if (ir.layout.strategy === 'sequence') return sequenceNodes(ir)
    return layeredNodes(ir)
  }
}

function sequenceEdges(ir: DiagramIR, nodes: ResolvedDiagramNode[]): ResolvedDiagramEdge[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const sorted = [...ir.edges].sort(byOrderThenId)
  const top = ir.canvas.padding + 190
  const available = Math.max(80, ir.canvas.height - ir.canvas.padding - top)
  const step = Math.min(76, available / Math.max(1, sorted.length))
  return sorted.map((edge, index) => {
    const source = nodeMap.get(edge.source.nodeId)
    const target = nodeMap.get(edge.target.nodeId)
    if (!source || !target) throw new Error(`Cannot route sequence edge ${edge.id}; endpoint is missing.`)
    const sourceX = source.x + source.width / 2
    const targetX = target.x + target.width / 2
    const y = round(top + index * step)
    return {
      ...edge,
      source: { ...edge.source, port: sourceX <= targetX ? 'right' : 'left' },
      target: { ...edge.target, port: sourceX <= targetX ? 'left' : 'right' },
      points: [{ x: round(sourceX), y }, { x: round(targetX), y }]
    }
  })
}

function layeredNodes(ir: DiagramIR): ResolvedDiagramNode[] {
  const { padding } = ir.canvas
  const horizontal = ir.layout.direction === 'left-to-right'
  const layers = new Map<number, typeof ir.nodes>()
  for (const node of [...ir.nodes].sort(byOrderThenId)) {
    const layer = node.layer ?? 0
    const items = layers.get(layer) ?? []
    items.push(node)
    layers.set(layer, items)
  }
  const layerEntries = [...layers.entries()].sort(([a], [b]) => a - b)
  const majorSpace = horizontal
    ? Math.max(180, (ir.canvas.width - padding * 2) / Math.max(1, layerEntries.length))
    : Math.max(120, (ir.canvas.height - padding * 2 - 70) / Math.max(1, layerEntries.length))

  return layerEntries.flatMap(([, items], layerIndex) => {
    const minorAvailable = horizontal ? ir.canvas.height - padding * 2 - 70 : ir.canvas.width - padding * 2
    const minorSpace = minorAvailable / Math.max(1, items.length)
    return items.map((node, itemIndex) => {
      const requestedSize = nodeSize(node)
      const size = {
        ...requestedSize,
        width: round(Math.max(96, Math.min(requestedSize.width, (horizontal ? majorSpace : minorSpace) - 24)))
      }
      const x = horizontal
        ? padding + layerIndex * majorSpace + Math.max(0, (majorSpace - size.width) / 2)
        : padding + itemIndex * minorSpace + Math.max(0, (minorSpace - size.width) / 2)
      const y = horizontal
        ? padding + 70 + itemIndex * minorSpace + Math.max(0, (minorSpace - size.height) / 2)
        : padding + 70 + layerIndex * majorSpace + Math.max(0, (majorSpace - size.height) / 2)
      return { ...node, ...size, x: round(x), y: round(y) }
    })
  })
}

function sequenceNodes(ir: DiagramIR): ResolvedDiagramNode[] {
  const sorted = [...ir.nodes].sort(byOrderThenId)
  const available = ir.canvas.width - ir.canvas.padding * 2
  const slot = available / Math.max(1, sorted.length)
  return sorted.map((node, index) => {
    const size = nodeSize(node, { width: Math.min(180, slot - 24), height: 64 })
    return {
      ...node,
      ...size,
      x: round(ir.canvas.padding + index * slot + (slot - size.width) / 2),
      y: ir.canvas.padding + 70
    }
  })
}

function radialNodes(ir: DiagramIR): ResolvedDiagramNode[] {
  const sorted = [...ir.nodes].sort(byOrderThenId)
  const centerIndex = sorted.findIndex((node) => node.layer === 0)
  const center = sorted[Math.max(0, centerIndex)]
  const others = sorted.filter((node) => node.id !== center.id)
  const cx = ir.canvas.width / 2
  const cy = ir.canvas.height / 2 + 20
  const radiusX = Math.max(180, ir.canvas.width * 0.33)
  const radiusY = Math.max(130, ir.canvas.height * 0.3)
  const centerSize = nodeSize(center, { width: 200, height: 88 })
  const result: ResolvedDiagramNode[] = [{
    ...center,
    ...centerSize,
    x: round(cx - centerSize.width / 2),
    y: round(cy - centerSize.height / 2)
  }]
  others.forEach((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, others.length)
    const size = nodeSize(node)
    result.push({
      ...node,
      ...size,
      x: round(cx + Math.cos(angle) * radiusX - size.width / 2),
      y: round(cy + Math.sin(angle) * radiusY - size.height / 2)
    })
  })
  return result
}

function matrixNodes(ir: DiagramIR): ResolvedDiagramNode[] {
  const sorted = [...ir.nodes].sort(byOrderThenId)
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)))
  const rows = Math.max(1, Math.ceil(sorted.length / columns))
  const width = (ir.canvas.width - ir.canvas.padding * 2) / columns
  const height = (ir.canvas.height - ir.canvas.padding * 2 - 70) / rows
  return sorted.map((node, index) => {
    const size = nodeSize(node, { width: Math.min(210, width - 32), height: Math.min(96, height - 28) })
    const column = index % columns
    const row = Math.floor(index / columns)
    return {
      ...node,
      ...size,
      x: round(ir.canvas.padding + column * width + (width - size.width) / 2),
      y: round(ir.canvas.padding + 70 + row * height + (height - size.height) / 2)
    }
  })
}

function explicitNodes(ir: DiagramIR): ResolvedDiagramNode[] {
  return [...ir.nodes].sort(byOrderThenId).map((node, index) => {
    const size = nodeSize(node)
    const position = node.position ?? {
      x: ir.canvas.padding + (index % 4) * (size.width + ir.layout.horizontalGap),
      y: ir.canvas.padding + 70 + Math.floor(index / 4) * (size.height + ir.layout.verticalGap)
    }
    return { ...node, ...size, x: round(position.x), y: round(position.y) }
  })
}

function resolveGroups(ir: DiagramIR, nodes: ResolvedDiagramNode[]): ResolvedDiagramGroup[] {
  const groupMap = new Map<string, ResolvedDiagramNode[]>()
  for (const node of nodes) {
    if (!node.groupId) continue
    const items = groupMap.get(node.groupId) ?? []
    items.push(node)
    groupMap.set(node.groupId, items)
  }
  return [...ir.groups].sort(byOrderThenId).map((group) => {
    const items = groupMap.get(group.id) ?? []
    if (!items.length) return { ...group, x: ir.canvas.padding, y: ir.canvas.padding + 50, width: 220, height: 140 }
    const left = Math.min(...items.map((node) => node.x)) - 28
    const top = Math.min(...items.map((node) => node.y)) - 42
    const right = Math.max(...items.map((node) => node.x + node.width)) + 28
    const bottom = Math.max(...items.map((node) => node.y + node.height)) + 28
    return { ...group, x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) }
  })
}

function nodeSize(node: DiagramIR['nodes'][number], fallback: { width: number; height: number } = { width: 180, height: 80 }) {
  const width = node.size?.width ?? Math.max(fallback.width, Math.min(320, node.label.length * 11 + 44))
  return { width: round(width), height: round(node.size?.height ?? fallback.height) }
}

function chooseRoute(start: DiagramPoint, end: DiagramPoint, obstacles: Bounds[], corridorX: number[], corridorY: number[]) {
  const midpointX = round((start.x + end.x) / 2)
  const midpointY = round((start.y + end.y) / 2)
  const expanded = obstacles.map((item) => expandBounds(item, 18))
  const railsX = [midpointX, ...corridorX, Math.min(start.x, end.x) - 48, Math.max(start.x, end.x) + 48]
  const railsY = [midpointY, ...corridorY, Math.min(start.y, end.y) - 48, Math.max(start.y, end.y) + 48]
  const candidates: DiagramPoint[][] = [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
    ...railsX.map((x) => [start, { x, y: start.y }, { x, y: end.y }, end]),
    ...railsY.map((y) => [start, { x: start.x, y }, { x: end.x, y }, end])
  ].map(simplify)
  return candidates.sort((a, b) => routeScore(a, expanded) - routeScore(b, expanded))[0]
}

function routeScore(points: DiagramPoint[], obstacles: Bounds[]) {
  const length = points.slice(1).reduce((sum, point, index) => sum + manhattan(points[index], point), 0)
  const collisions = points.slice(1).reduce((sum, point, index) => {
    return sum + obstacles.filter((obstacle) => segmentHitsBounds(points[index], point, obstacle)).length
  }, 0)
  return collisions * 100000 + Math.max(0, points.length - 2) * 24 + length
}

function inferredPort(source: ResolvedDiagramNode, target: ResolvedDiagramNode): DiagramPort {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2)
  const dy = target.y + target.height / 2 - (source.y + source.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function portPoint(node: ResolvedDiagramNode, port: DiagramPort): DiagramPoint {
  if (port === 'left') return { x: node.x, y: node.y + node.height / 2 }
  if (port === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 }
  if (port === 'top') return { x: node.x + node.width / 2, y: node.y }
  return { x: node.x + node.width / 2, y: node.y + node.height }
}

function nodeBounds(node: ResolvedDiagramNode): Bounds {
  return { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height }
}

function expandBounds(bounds: Bounds, padding: number): Bounds {
  return { left: bounds.left - padding, top: bounds.top - padding, right: bounds.right + padding, bottom: bounds.bottom + padding }
}

function segmentHitsBounds(start: DiagramPoint, end: DiagramPoint, bounds: Bounds) {
  if (start.y === end.y) {
    return start.y > bounds.top && start.y < bounds.bottom && Math.max(Math.min(start.x, end.x), bounds.left) < Math.min(Math.max(start.x, end.x), bounds.right)
  }
  if (start.x === end.x) {
    return start.x > bounds.left && start.x < bounds.right && Math.max(Math.min(start.y, end.y), bounds.top) < Math.min(Math.max(start.y, end.y), bounds.bottom)
  }
  return false
}

function simplify(points: DiagramPoint[]) {
  const deduplicated = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
  return deduplicated.filter((point, index) => {
    if (index === 0 || index === deduplicated.length - 1) return true
    const previous = deduplicated[index - 1]
    const next = deduplicated[index + 1]
    return !((previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y))
  })
}

function manhattan(a: DiagramPoint, b: DiagramPoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function sameBounds(a: Bounds, b: Bounds) {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
}

function byOrderThenId<T extends { order?: number; id: string }>(a: T, b: T) {
  return (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
