import { BadRequestException } from '@nestjs/common'
import { z } from 'zod/v3'
import type { DiagramIR } from './diagram.types.js'
import { diagramIrSchema } from './diagram-input.schema.js'
export { diagramIrSchema, diagramNodeSchema, diagramEdgeSchema, diagramGroupSchema } from './diagram-input.schema.js'

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
