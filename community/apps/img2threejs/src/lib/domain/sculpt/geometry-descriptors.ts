import { z } from 'zod/v3'

const boundedId = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const finite = z.number().finite()
const positive = finite.positive()
const vec3 = z.tuple([finite, finite, finite])
const point2 = z.tuple([finite, finite])
const point3 = z.tuple([finite, finite, finite])

const segmentBounds = { min: 3, max: 256 } as const

const primitiveGeometry = z.union([
  z.object({
    type: z.literal('primitive'),
    primitive: z.enum(['box', 'sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'torus']),
    dimensions: z.object({
      x: positive.max(10000),
      y: positive.max(10000),
      z: positive.max(10000)
    }).strict(),
    radialSegments: z.number().int().min(segmentBounds.min).max(segmentBounds.max),
    heightSegments: z.number().int().min(1).max(128)
  }).strict().superRefine((value, ctx) => {
    if (value.primitive === 'sphere' && value.dimensions.x !== value.dimensions.y) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimensions'], message: 'Sphere dimensions must be uniform.' })
    }
    if (value.primitive === 'sphere' && value.dimensions.x !== value.dimensions.z) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimensions'], message: 'Sphere dimensions must be uniform.' })
    }
  }),
  z.object({
    type: z.literal('lathe'),
    axis: z.enum(['x', 'y', 'z']),
    profile: z.array(z.tuple([positive.max(10000), finite.min(-10000).max(10000)])).min(2).max(256),
    segments: z.number().int().min(8).max(512),
    closed: z.boolean()
  }).strict(),
  z.object({
    type: z.literal('tube'),
    path: z.array(point3).min(2).max(256),
    radii: z.array(positive.max(1000)).min(2).max(256),
    radialSegments: z.number().int().min(3).max(128),
    closed: z.boolean()
  }).strict().superRefine((value, ctx) => {
    if (value.path.length !== value.radii.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['radii'], message: 'Tube path and radii must have the same length.' })
    }
  }),
  z.object({
    type: z.literal('curveSweep'),
    controlPoints: z.array(point3).min(2).max(128),
    profile: z.object({
      kind: z.enum(['circle', 'ellipse', 'custom']),
      radius: positive.max(1000),
      secondaryRadius: positive.max(1000).optional(),
      segments: z.number().int().min(3).max(128)
    }).strict(),
    tubularSegments: z.number().int().min(4).max(512),
    closed: z.boolean()
  }).strict(),
  z.object({
    type: z.literal('groundBlade'),
    outline: z.array(point2).min(3).max(128),
    thickness: positive.max(1000),
    bevel: z.object({
      enabled: z.boolean(),
      size: finite.min(0).max(100),
      segments: z.number().int().min(1).max(32)
    }).strict()
  }).strict(),
  z.object({
    type: z.literal('extrude'),
    outline: z.array(point2).min(3).max(128),
    depth: positive.max(1000),
    bevel: z.object({
      enabled: z.boolean(),
      size: finite.min(0).max(100),
      thickness: finite.min(0).max(100),
      segments: z.number().int().min(1).max(32)
    }).strict()
  }).strict(),
  z.object({
    type: z.literal('planeCard'),
    width: positive.max(10000),
    height: positive.max(10000),
    doubleSided: z.boolean(),
    normal: vec3
  }).strict(),
  z.object({
    type: z.literal('instancedCluster'),
    sourcePartId: boundedId,
    transforms: z.array(z.object({
      position: vec3,
      rotation: vec3
    }).strict()).min(1).max(10000)
  }).strict(),
  z.object({
    type: z.literal('visualHull'),
    voxelResolution: z.number().int().min(16).max(256),
    bounds: z.object({ min: vec3, max: vec3 }).strict(),
    masks: z.array(z.object({
      evidenceId: z.string().uuid(),
      width: z.number().int().min(16).max(8192),
      height: z.number().int().min(16).max(8192),
      maskReference: z.string().trim().min(1).max(1000),
      confidence: z.number().min(0).max(1)
    }).strict()).min(2).max(12)
  }).strict(),
  z.object({
    type: z.literal('sdf'),
    bounds: z.object({ min: vec3, max: vec3 }).strict(),
    resolution: z.object({ x: z.number().int().min(8).max(256), y: z.number().int().min(8).max(256), z: z.number().int().min(8).max(256) }).strict(),
    nodes: z.array(z.object({
      id: boundedId,
      operation: z.enum(['primitive', 'smoothUnion', 'subtract', 'intersect']),
      primitive: z.enum(['sphere', 'capsule', 'box', 'cone', 'ellipsoid']).optional(),
      children: z.array(boundedId).max(8).optional(),
      transform: z.object({ position: vec3, rotation: vec3 }).strict().optional(),
      dimensions: vec3.optional(),
      smoothness: finite.min(0).max(100).optional()
    }).strict()).min(1).max(512),
    rootNodeId: boundedId
  }).strict().superRefine((value, ctx) => {
    const nodeIds = new Set(value.nodes.map((node) => node.id))
    if (nodeIds.size !== value.nodes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: 'SDF node ids must be unique.' })
    }
    if (!nodeIds.has(value.rootNodeId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rootNodeId'], message: 'SDF rootNodeId must reference a node.' })
    }
    for (const node of value.nodes) {
      if (node.operation === 'primitive' && !node.primitive) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: `SDF primitive node '${node.id}' requires primitive.` })
      }
      if (node.operation !== 'primitive' && (!node.children || node.children.length < 2)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: `SDF operation node '${node.id}' requires at least two children.` })
      }
      for (const child of node.children ?? []) {
        if (!nodeIds.has(child)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: `SDF node '${node.id}' references missing child '${child}'.` })
        }
      }
    }
  })
])

export const GeometryDescriptorSchema = primitiveGeometry
export type GeometryDescriptor = z.infer<typeof GeometryDescriptorSchema>
export type GeometryType = GeometryDescriptor['type']
