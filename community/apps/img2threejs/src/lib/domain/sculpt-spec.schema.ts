import { z } from 'zod/v3'
import { NEXT_DECISIONS } from '../constants.js'

const boundedId = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const evidenceId = z.string().uuid()
const colorHex = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const vec3Schema = z.tuple([
  z.number().finite().min(-10000).max(10000),
  z.number().finite().min(-10000).max(10000),
  z.number().finite().min(-10000).max(10000)
])

const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema.refine((value) => value.every((part) => part > 0), 'Scale values must be positive.')
}).strict()

const heightfieldGeometrySchema = z.object({
  type: z.literal('heightfield'),
  columns: z.number().int().min(4).max(48),
  rows: z.number().int().min(4).max(48),
  width: z.number().finite().positive().max(20),
  height: z.number().finite().positive().max(20),
  depth: z.number().finite().positive().max(5),
  heights: z.array(z.number().finite().min(0).max(1)).min(16).max(2304),
  colors: z.array(colorHex).min(16).max(2304)
}).strict().superRefine((geometry, ctx) => {
  const expected = geometry.columns * geometry.rows
  if (geometry.heights.length !== expected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['heights'],
      message: `Heightfield requires exactly ${expected} height samples.`
    })
  }
  if (geometry.colors.length !== expected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['colors'],
      message: `Heightfield requires exactly ${expected} color samples.`
    })
  }
})

const roundedBoxGeometrySchema = z.object({
  type: z.literal('rounded-box'),
  width: z.number().finite().positive().max(20),
  height: z.number().finite().positive().max(20),
  depth: z.number().finite().positive().max(20),
  segments: z.number().int().min(1).max(16),
  radius: z.number().finite().positive().max(5)
}).strict().refine((geometry) => (
  geometry.radius <= Math.min(geometry.width, geometry.height, geometry.depth) / 2
), {
  path: ['radius'],
  message: 'Rounded-box radius cannot exceed half of its smallest dimension.'
})

const torusArcGeometrySchema = z.object({
  type: z.literal('torus-arc'),
  radius: z.number().finite().positive().max(20),
  tube: z.number().finite().positive().max(5),
  radialSegments: z.number().int().min(3).max(64),
  tubularSegments: z.number().int().min(3).max(256),
  arc: z.number().finite().positive().max(Math.PI * 2)
}).strict()

const shapePointSchema = z.tuple([
  z.number().finite().min(-20).max(20),
  z.number().finite().min(-20).max(20)
])

const extrudeShapeGeometrySchema = z.object({
  type: z.literal('extrude-shape'),
  points: z.array(shapePointSchema).min(3).max(128),
  depth: z.number().finite().positive().max(10),
  bevelEnabled: z.boolean(),
  bevelThickness: z.number().finite().min(0).max(2),
  bevelSize: z.number().finite().min(0).max(2),
  bevelSegments: z.number().int().min(1).max(12),
  curveSegments: z.number().int().min(1).max(64)
}).strict()

const proceduralGeometrySchema = z.union([
  heightfieldGeometrySchema,
  roundedBoxGeometrySchema,
  torusArcGeometrySchema,
  extrudeShapeGeometrySchema
])

const componentSchema = z.object({
  id: boundedId,
  parentId: boundedId.nullable(),
  name: z.string().trim().min(1).max(120),
  semanticType: z.enum(['primary_form', 'secondary_form', 'joint', 'attachment', 'detail_cluster']),
  primitive: z.enum(['box', 'sphere', 'capsule', 'cylinder', 'cone', 'torus', 'lathe', 'extrude', 'custom']),
  geometry: proceduralGeometrySchema.optional(),
  transform: transformSchema,
  materialId: boundedId,
  deformable: z.boolean(),
  evidenceIds: z.array(evidenceId).min(1).max(20),
  confidence: z.number().min(0).max(1)
}).strict()

const materialSchema = z.object({
  id: boundedId,
  name: z.string().trim().min(1).max(120),
  type: z.enum(['standard', 'physical', 'toon', 'lambert']),
  baseColor: colorHex,
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  opacity: z.number().min(0).max(1),
  transparent: z.boolean(),
  vertexColors: z.boolean().optional(),
  emissive: colorHex.optional(),
  emissiveIntensity: z.number().finite().min(0).max(20).optional(),
  clearcoat: z.number().finite().min(0).max(1).optional(),
  clearcoatRoughness: z.number().finite().min(0).max(1).optional(),
  colorRamp: z.object({
    axis: z.literal('y'),
    min: z.number().finite().min(-10000).max(10000),
    max: z.number().finite().min(-10000).max(10000),
    stops: z.array(z.object({
      position: z.number().finite().min(0).max(1),
      color: colorHex
    }).strict()).min(2).max(12)
  }).strict().optional(),
  textureIntents: z.array(z.enum(['albedo', 'normal', 'roughness', 'metalness', 'emissive', 'ao'])).max(6)
}).strict().superRefine((material, ctx) => {
  if (material.colorRamp) {
    if (material.colorRamp.max <= material.colorRamp.min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['colorRamp', 'max'],
        message: 'Color-ramp max must be greater than min.'
      })
    }
    for (let index = 1; index < material.colorRamp.stops.length; index += 1) {
      if (material.colorRamp.stops[index].position <= material.colorRamp.stops[index - 1].position) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['colorRamp', 'stops', index, 'position'],
          message: 'Color-ramp stops must be strictly increasing.'
        })
      }
    }
  }
})

const detailSchema = z.object({
  id: boundedId,
  componentId: boundedId,
  kind: z.enum(['ridge', 'seam', 'panel', 'opening', 'marking', 'fastener', 'hair', 'facial', 'surface_variation']),
  priority: z.enum(['must', 'should', 'optional']),
  description: z.string().trim().min(1).max(500),
  evidenceIds: z.array(evidenceId).min(1).max(20),
  acceptance: z.string().trim().min(1).max(300)
}).strict()

const pivotSchema = z.object({
  id: boundedId,
  componentId: boundedId,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['rotation', 'translation', 'root_motion']),
  origin: vec3Schema,
  axis: vec3Schema,
  min: z.number().finite().min(-360).max(360),
  max: z.number().finite().min(-360).max(360)
}).strict().refine((value) => value.max >= value.min, {
  path: ['max'],
  message: 'Pivot max must be greater than or equal to min.'
})

const socketSchema = z.object({
  id: boundedId,
  componentId: boundedId,
  name: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(300),
  transform: transformSchema
}).strict()

const colliderSchema = z.object({
  id: boundedId,
  componentId: boundedId,
  shape: z.enum(['box', 'sphere', 'capsule', 'convex']),
  transform: transformSchema,
  isTrigger: z.boolean()
}).strict()

const reviewViewSchema = z.enum([
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
  'three-quarter'
])

const normalizedRegionSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1)
}).strict().superRefine((region, ctx) => {
  if (region.x + region.width > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['width'],
      message: 'Feature review region must remain inside normalized image bounds.'
    })
  }
  if (region.y + region.height > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['height'],
      message: 'Feature review region must remain inside normalized image bounds.'
    })
  }
})

const referenceCameraSchema = z.object({
  evidenceId,
  view: reviewViewSchema,
  projection: z.enum(['perspective', 'orthographic']),
  position: vec3Schema,
  target: vec3Schema,
  up: vec3Schema,
  fovDegrees: z.number().finite().min(10).max(100),
  orthographicHeight: z.number().finite().positive().max(100).nullable(),
  framing: z.object({
    subjectFillRatio: z.number().finite().min(0.02).max(0.95),
    tolerance: z.number().finite().min(0.01).max(0.4)
  }).strict(),
  confidence: z.number().finite().min(0).max(1)
}).strict().superRefine((camera, ctx) => {
  if (camera.projection === 'orthographic' && camera.orthographicHeight === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['orthographicHeight'],
      message: 'Orthographic reference cameras require orthographicHeight.'
    })
  }
  if (camera.position.every((value, index) => value === camera.target[index])) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['position'],
      message: 'Reference camera position must differ from its target.'
    })
  }
})

const featureReviewTargetSchema = z.object({
  id: boundedId,
  label: z.string().trim().min(1).max(160),
  evidenceId,
  componentIds: z.array(boundedId).min(1).max(20),
  view: reviewViewSchema,
  region: normalizedRegionSchema,
  metric: z.enum(['silhouette', 'edge', 'color', 'luminance']),
  criticality: z.enum(['critical', 'important']),
  threshold: z.number().finite().min(0.1).max(1),
  confidence: z.number().finite().min(0).max(1),
  acceptance: z.string().trim().min(1).max(300)
}).strict()

export const SculptSpecSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  projectName: z.string().trim().min(1).max(160),
  route: z.enum(['object', 'character']),
  modelingMode: z.enum(['semantic-3d', 'relief']),
  coordinateSystem: z.object({
    up: z.literal('Y'),
    forward: z.enum(['Z-', 'Z+']),
    units: z.enum(['meters', 'centimeters'])
  }).strict(),
  referenceCamera: referenceCameraSchema,
  silhouetteIntent: z.string().trim().min(1).max(1000),
  proportions: z.array(z.object({
    subject: boundedId,
    relation: z.string().trim().min(1).max(200),
    evidenceIds: z.array(evidenceId).min(1).max(20),
    confidence: z.number().min(0).max(1)
  }).strict()).min(1).max(100),
  components: z.array(componentSchema).min(1).max(250),
  materials: z.array(materialSchema).min(1).max(80),
  details: z.array(detailSchema).max(500),
  featureReviewTargets: z.array(featureReviewTargetSchema).min(1).max(40),
  runtime: z.object({
    pivots: z.array(pivotSchema).max(120),
    sockets: z.array(socketSchema).max(120),
    colliders: z.array(colliderSchema).max(250),
    animationClips: z.array(z.object({
      name: boundedId,
      durationSeconds: z.number().positive().max(120),
      pivotIds: z.array(boundedId).min(1).max(120)
    }).strict()).max(50)
  }).strict(),
  qualityContract: z.object({
    minimumEvidenceCoverage: z.number().min(0.5).max(1),
    minimumDeterministicScore: z.number().min(0.5).max(1),
    requireHumanVisualApproval: z.boolean(),
    maximumTriangles: z.number().int().min(100).max(5_000_000),
    maximumDrawCalls: z.number().int().min(1).max(5000),
    minimumComponentCount: z.number().int().min(1).max(250),
    minimumMaterialCount: z.number().int().min(1).max(80),
    requiredViews: z.array(reviewViewSchema).min(2).max(7),
    minimumSilhouetteIoU: z.number().finite().min(0.05).max(0.95),
    minimumScaleScore: z.number().finite().min(0.2).max(1),
    minimumEdgeScore: z.number().finite().min(0).max(1),
    minimumPerceptualScore: z.number().finite().min(0).max(1),
    minimumReferenceMaskConfidence: z.number().finite().min(0).max(1),
    minimumMultiAngleSilhouetteRetention: z.number().finite().min(0.01).max(1),
    minimumVolumeAxisRatio: z.number().finite().min(0.001).max(0.5),
    maximumCorrectionIterations: z.number().int().min(1).max(8),
    mustPassStages: z.literal(8)
  }).strict(),
  nextDecision: z.enum(NEXT_DECISIONS)
}).strict().superRefine((spec, ctx) => {
  const componentIds = new Set(spec.components.map((item) => item.id))
  const materialIds = new Set(spec.materials.map((item) => item.id))
  const pivotIds = new Set(spec.runtime.pivots.map((item) => item.id))
  const featureTargetIds = new Set(spec.featureReviewTargets.map((item) => item.id))
  const heightfields = spec.components.filter((item) => item.geometry?.type === 'heightfield')

  if (spec.modelingMode === 'semantic-3d' && heightfields.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['modelingMode'],
      message: 'Semantic 3D specs cannot use heightfields. Select explicit relief mode for 2.5D image geometry.'
    })
  }
  if (spec.modelingMode === 'relief' && heightfields.length !== spec.components.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['modelingMode'],
      message: 'Relief specs must use typed heightfield geometry for every component.'
    })
  }
  if (spec.components.length < spec.qualityContract.minimumComponentCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['qualityContract', 'minimumComponentCount'],
      message: `Spec requires at least ${spec.qualityContract.minimumComponentCount} components.`
    })
  }
  if (spec.materials.length < spec.qualityContract.minimumMaterialCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['qualityContract', 'minimumMaterialCount'],
      message: `Spec requires at least ${spec.qualityContract.minimumMaterialCount} materials.`
    })
  }

  if (componentIds.size !== spec.components.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Component ids must be unique.' })
  }
  if (materialIds.size !== spec.materials.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['materials'], message: 'Material ids must be unique.' })
  }
  if (featureTargetIds.size !== spec.featureReviewTargets.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['featureReviewTargets'],
      message: 'Feature review target ids must be unique.'
    })
  }
  if (!spec.featureReviewTargets.some((item) =>
    item.criticality === 'critical' &&
    item.metric === 'silhouette'
  )) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['featureReviewTargets'],
      message: 'At least one critical silhouette review target is required.'
    })
  }
  if (!spec.qualityContract.requiredViews.includes(spec.referenceCamera.view)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referenceCamera', 'view'],
      message: 'The fixed reference-camera view must be included in requiredViews.'
    })
  }
  if (spec.referenceCamera.confidence < 0.5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referenceCamera', 'confidence'],
      message: 'Reference-camera confidence below 0.5 requires request-input before code generation.'
    })
  }
  for (const component of spec.components) {
    if (component.parentId && !componentIds.has(component.parentId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: `Missing parent '${component.parentId}'.` })
    }
    if (!materialIds.has(component.materialId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: `Missing material '${component.materialId}'.` })
    }
    if (component.geometry && component.primitive !== 'custom') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['components'],
        message: `Component '${component.id}' uses typed geometry and must declare primitive 'custom'.`
      })
    }
  }
  for (const item of [...spec.details, ...spec.runtime.pivots, ...spec.runtime.sockets, ...spec.runtime.colliders]) {
    if (!componentIds.has(item.componentId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Runtime/detail item references missing component '${item.componentId}'.` })
    }
  }
  for (const target of spec.featureReviewTargets) {
    if (target.evidenceId !== spec.referenceCamera.evidenceId && target.view === spec.referenceCamera.view) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['featureReviewTargets'],
        message: `Feature target '${target.id}' uses the fixed view but cites different evidence.`
      })
    }
    for (const componentId of target.componentIds) {
      if (!componentIds.has(componentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['featureReviewTargets'],
          message: `Feature target '${target.id}' references missing component '${componentId}'.`
        })
      }
    }
  }
  for (const clip of spec.runtime.animationClips) {
    for (const pivotId of clip.pivotIds) {
      if (!pivotIds.has(pivotId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['runtime', 'animationClips'], message: `Missing pivot '${pivotId}'.` })
      }
    }
  }
  if (spec.route === 'character' && spec.runtime.pivots.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['runtime', 'pivots'], message: 'Character specs require at least one pivot.' })
  }
})

export type SculptSpec = z.infer<typeof SculptSpecSchema>
