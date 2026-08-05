import { BadRequestException } from '@nestjs/common'
import type { DrawioDiagramSpec, DrawioSpecEdge, DrawioSpecNode, DrawioSpecPage } from './types.js'

const DEFAULT_NODE_STYLE = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;'
const DEFAULT_EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;'

const SHAPE_STYLES: Record<NonNullable<DrawioSpecNode['shape']>, string> = {
  rectangle: 'rounded=0;whiteSpace=wrap;html=1;',
  rounded: 'rounded=1;whiteSpace=wrap;html=1;',
  ellipse: 'ellipse;whiteSpace=wrap;html=1;',
  diamond: 'rhombus;whiteSpace=wrap;html=1;',
  hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;',
  cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;',
  cloud: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;',
  actor: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;',
  note: 'shape=note;whiteSpace=wrap;html=1;',
  text: 'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;',
  group: 'group;'
}

export function buildDrawioXmlFromSpec(spec: DrawioDiagramSpec) {
  if (!spec.pages.length) {
    throw new BadRequestException('draw.io diagram spec must contain at least one page.')
  }

  const pageIds = new Set<string>()
  const pages = spec.pages.map((page, pageIndex) => {
    const pageId = page.id?.trim() || `page-${pageIndex + 1}`
    if (pageIds.has(pageId)) {
      throw new BadRequestException(`Duplicate draw.io page id: ${pageId}`)
    }
    pageIds.add(pageId)
    return renderPage(page, pageId, pageIndex)
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<mxfile host="XpertAI" agent="drawio-spec-builder" version="1.0" type="device">',
    ...pages,
    '</mxfile>'
  ].join('\n')
}

function renderPage(page: DrawioSpecPage, pageId: string, pageIndex: number) {
  const nodeIds = new Set<string>()
  const cellIds = new Set<string>(['0', '1'])

  for (const node of page.nodes) {
    assertCellId(node.id, cellIds)
    nodeIds.add(node.id)
  }
  for (const node of page.nodes) {
    if (node.parentId && node.parentId !== '1' && !nodeIds.has(node.parentId)) {
      throw new BadRequestException(`Unknown parentId "${node.parentId}" for node "${node.id}" on page "${page.name}".`)
    }
  }
  for (const [edgeIndex, edge] of page.edges.entries()) {
    const edgeId = edge.id?.trim() || `edge-${pageIndex + 1}-${edgeIndex + 1}`
    assertCellId(edgeId, cellIds)
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new BadRequestException(`Edge "${edgeId}" on page "${page.name}" references an unknown source or target node.`)
    }
  }

  const width = page.width ?? 1600
  const height = page.height ?? 1200
  const renderedNodes = page.nodes.map(renderNode)
  const renderedEdges = page.edges.map((edge, edgeIndex) => renderEdge(edge, edge.id?.trim() || `edge-${pageIndex + 1}-${edgeIndex + 1}`))

  return [
    `  <diagram id="${escapeXml(pageId)}" name="${escapeXml(page.name)}">`,
    `    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">`,
    '      <root>',
    '        <mxCell id="0"/>',
    '        <mxCell id="1" parent="0"/>',
    ...renderedNodes,
    ...renderedEdges,
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>'
  ].join('\n')
}

function renderNode(node: DrawioSpecNode) {
  const style = normalizeStyle(node.style || (node.shape ? SHAPE_STYLES[node.shape] : DEFAULT_NODE_STYLE))
  const parentId = node.parentId?.trim() || '1'
  return [
    `        <mxCell id="${escapeXml(node.id)}" value="${escapeXml(node.label ?? '')}" style="${escapeXml(style)}" parent="${escapeXml(parentId)}" vertex="1">`,
    `          <mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry"/>`,
    '        </mxCell>'
  ].join('\n')
}

function renderEdge(edge: DrawioSpecEdge, edgeId: string) {
  const style = normalizeStyle(edge.style || DEFAULT_EDGE_STYLE)
  const geometry = edge.waypoints?.length
    ? [
        '          <mxGeometry relative="1" as="geometry">',
        '            <Array as="points">',
        ...edge.waypoints.map((point) => `              <mxPoint x="${point.x}" y="${point.y}"/>`),
        '            </Array>',
        '          </mxGeometry>'
      ]
    : ['          <mxGeometry relative="1" as="geometry"/>']

  return [
    `        <mxCell id="${escapeXml(edgeId)}" value="${escapeXml(edge.label ?? '')}" style="${escapeXml(style)}" parent="1" source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}" edge="1">`,
    ...geometry,
    '        </mxCell>'
  ].join('\n')
}

function assertCellId(id: string, cellIds: Set<string>) {
  const normalized = id.trim()
  if (!normalized) {
    throw new BadRequestException('draw.io cell ids cannot be empty.')
  }
  if (cellIds.has(normalized)) {
    throw new BadRequestException(`Duplicate draw.io cell id: ${normalized}`)
  }
  cellIds.add(normalized)
}

function normalizeStyle(style: string) {
  const normalized = style.trim()
  return normalized && !normalized.endsWith(';') ? `${normalized};` : normalized
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
