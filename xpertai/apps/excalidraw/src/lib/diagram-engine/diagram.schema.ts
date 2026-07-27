import { BadRequestException } from '@nestjs/common'
import { z } from 'zod/v3'
import type { DiagramIR } from './diagram.types.js'

const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()

export const diagramGroupSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(160),
  kind: z.enum(['container', 'lane', 'cluster']),
  order: z.number().int().optional(),
  parentId: idSchema.nullable().optional()
}).strict()

export const diagramNodeSchema = z.object({
  id: idSchema,
  kind: z.enum([
    'process', 'decision', 'user', 'agent', 'model', 'api', 'service', 'tool', 'memory', 'database',
    'vector-store', 'graph-store', 'queue', 'document', 'external', 'state', 'entity', 'actor', 'note'
  ]),
  label: z.string().min(1).max(240),
  description: z.string().max(500).optional(),
  groupId: idSchema.nullable().optional(),
  layer: z.number().int().min(0).max(100).optional(),
  order: z.number().int().optional(),
  size: z.object({ width: z.number().positive().max(1000).optional(), height: z.number().positive().max(1000).optional() }).strict().optional(),
  position: pointSchema.optional(),
  tags: z.array(z.string().max(64)).max(32).optional()
}).strict()

export const diagramEdgeSchema = z.object({
  id: idSchema,
  source: z.object({ nodeId: idSchema, port: z.enum(['left', 'right', 'top', 'bottom']).optional() }).strict(),
  target: z.object({ nodeId: idSchema, port: z.enum(['left', 'right', 'top', 'bottom']).optional() }).strict(),
  flow: z.enum(['primary', 'control', 'read', 'write', 'async', 'transform', 'feedback', 'neutral']),
  label: z.string().max(120).optional(),
  directed: z.boolean().optional(),
  order: z.number().int().optional(),
  routing: z.object({
    corridorX: z.array(z.number().finite()).max(8).optional(),
    corridorY: z.array(z.number().finite()).max(8).optional(),
    points: z.array(pointSchema).min(1).max(12).optional()
  }).strict().optional()
}).strict()

export const diagramIrSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum([
    'architecture', 'data-flow', 'flowchart', 'sequence', 'comparison', 'timeline', 'mind-map', 'agent',
    'memory', 'class', 'use-case', 'state-machine', 'er-diagram', 'network-topology', 'other'
  ]),
  title: z.string().min(1).max(240),
  subtitle: z.string().max(500).optional(),
  canvas: z.object({
    width: z.number().int().min(480).max(5000),
    height: z.number().int().min(320).max(5000),
    padding: z.number().int().min(16).max(240)
  }).strict(),
  appearance: z.object({
    colorScheme: z.enum(['light', 'dark']),
    rendering: z.enum(['clean', 'sketch']),
    palette: z.enum(['neutral', 'semantic']),
    fontFamilyId: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(8),
      z.literal(9)
    ]).optional()
  }).strict(),
  layout: z.object({
    strategy: z.enum(['layered', 'flow', 'sequence', 'radial', 'matrix', 'explicit']),
    direction: z.enum(['top-to-bottom', 'left-to-right']),
    horizontalGap: z.number().int().min(24).max(600),
    verticalGap: z.number().int().min(24).max(600),
    seed: z.string().min(1).max(128)
  }).strict(),
  groups: z.array(diagramGroupSchema).max(100),
  nodes: z.array(diagramNodeSchema).min(1).max(300),
  edges: z.array(diagramEdgeSchema).max(600),
  annotations: z.array(z.object({
    id: idSchema,
    text: z.string().min(1).max(1000),
    targetId: idSchema.optional(),
    position: pointSchema.optional()
  }).strict()).max(100),
  legend: z.array(z.object({
    flow: z.enum(['primary', 'control', 'read', 'write', 'async', 'transform', 'feedback', 'neutral']),
    label: z.string().min(1).max(120)
  }).strict()).max(16)
}).strict()

export function parseDiagramIr(value: unknown): DiagramIR {
  const result = diagramIrSchema.safeParse(value)
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
  }
  const data = parsedDiagramCompatibilityBoundary(result.data)
  assertDiagramReferences(data)
  return data
}

function parsedDiagramCompatibilityBoundary(value: z.infer<typeof diagramIrSchema>): DiagramIR {
  return value as DiagramIR
}

function assertDiagramReferences(ir: DiagramIR) {
  assertUnique(ir.groups.map((item) => item.id), 'group')
  assertUnique(ir.nodes.map((item) => item.id), 'node')
  assertUnique(ir.edges.map((item) => item.id), 'edge')
  assertUnique(ir.annotations.map((item) => item.id), 'annotation')

  const groupIds = new Set(ir.groups.map((item) => item.id))
  const nodeIds = new Set(ir.nodes.map((item) => item.id))
  const targetIds = new Set([...groupIds, ...nodeIds, ...ir.edges.map((item) => item.id)])
  for (const group of ir.groups) {
    if (group.parentId && !groupIds.has(group.parentId)) throw new BadRequestException(`Unknown parent group "${group.parentId}".`)
  }
  for (const node of ir.nodes) {
    if (node.groupId && !groupIds.has(node.groupId)) throw new BadRequestException(`Node "${node.id}" references unknown group "${node.groupId}".`)
  }
  for (const edge of ir.edges) {
    if (!nodeIds.has(edge.source.nodeId)) throw new BadRequestException(`Edge "${edge.id}" references unknown source node "${edge.source.nodeId}".`)
    if (!nodeIds.has(edge.target.nodeId)) throw new BadRequestException(`Edge "${edge.id}" references unknown target node "${edge.target.nodeId}".`)
    if (edge.source.nodeId === edge.target.nodeId && edge.flow !== 'feedback') {
      throw new BadRequestException(`Self edge "${edge.id}" must use feedback flow.`)
    }
  }
  for (const annotation of ir.annotations) {
    if (annotation.targetId && !targetIds.has(annotation.targetId)) {
      throw new BadRequestException(`Annotation "${annotation.id}" references unknown target "${annotation.targetId}".`)
    }
  }
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) throw new BadRequestException(`Duplicate ${label} id "${value}".`)
    seen.add(value)
  }
}
