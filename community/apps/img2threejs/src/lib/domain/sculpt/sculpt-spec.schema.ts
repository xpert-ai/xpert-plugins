import { z } from 'zod/v3'
import { NEXT_DECISIONS } from '../../constants.js'
import { GeometryDescriptorSchema } from './geometry-descriptors.js'
import { QualityProfileNameSchema } from '../quality/quality-profiles.js'

const boundedId = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const evidenceId = z.string().uuid()
const finite = z.number().finite()
const vec3 = z.tuple([finite, finite, finite])
const colorHex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const transformSchema = z.object({
  position: vec3,
  rotation: vec3
}).strict()

const referenceCameraSchema = z.object({
  evidenceId,
  view: z.enum(['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter', 'detail']),
  projection: z.enum(['perspective', 'orthographic']),
  position: vec3,
  target: vec3,
  up: vec3,
  fovDegrees: finite.min(10).max(120),
  orthographicHeight: finite.positive().max(1000).nullable(),
  subjectFillRatio: finite.min(0.02).max(0.98),
  confidence: z.number().min(0).max(1)
}).strict().superRefine((camera, ctx) => {
  if (camera.projection === 'orthographic' && camera.orthographicHeight === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orthographicHeight'], message: 'Orthographic cameras require orthographicHeight.' })
  }
  if (camera.position.every((value, index) => value === camera.target[index])) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['position'], message: 'Camera position must differ from target.' })
  }
})

const partSchema = z.object({
  id: boundedId,
  parentId: boundedId.nullable(),
  name: z.string().trim().min(1).max(160),
  semanticType: z.enum(['primary-form', 'secondary-form', 'attachment', 'detail']),
  geometry: GeometryDescriptorSchema,
  transform: transformSchema,
  materialId: boundedId,
  evidenceIds: z.array(evidenceId).min(1).max(20),
  confidence: z.object({ shape: z.number().min(0).max(1), placement: z.number().min(0).max(1), hidden: z.number().min(0).max(1) }).strict()
}).strict()

const attachmentSchema = z.object({
  id: boundedId,
  parentPartId: boundedId,
  childPartId: boundedId,
  localStart: vec3,
  localEnd: vec3,
  radius: finite.positive().max(1000),
  socketId: boundedId.optional(),
  evidenceIds: z.array(evidenceId).min(1).max(20),
  confidence: z.number().min(0).max(1)
}).strict()

const materialChannelSchema = z.object({
  reference: z.string().trim().min(1).max(1000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  colorSpace: z.enum(['srgb', 'linear', 'raw']),
  confidence: z.number().min(0).max(1)
}).strict()

const materialSchema = z.object({
  id: boundedId,
  name: z.string().trim().min(1).max(160),
  shader: z.enum(['standard', 'physical', 'toon']),
  baseColor: colorHex,
  roughness: finite.min(0).max(1),
  metalness: finite.min(0).max(1),
  channels: z.object({
    albedo: materialChannelSchema.optional(),
    roughness: materialChannelSchema.optional(),
    height: materialChannelSchema.optional(),
    normal: materialChannelSchema.optional(),
    ao: materialChannelSchema.optional()
  }).strict(),
  localOverrides: z.array(z.object({
    regionId: boundedId,
    roughness: finite.min(0).max(1).optional(),
    metalness: finite.min(0).max(1).optional(),
    aoStrength: finite.min(0).max(1).optional()
  }).strict()).max(100)
}).strict()

const detailSchema = z.object({
  id: boundedId,
  partId: boundedId,
  kind: z.enum(['ridge', 'seam', 'panel', 'opening', 'marking', 'fastener', 'surface-variation']),
  priority: z.enum(['must', 'should', 'optional']),
  description: z.string().trim().min(1).max(500),
  evidenceIds: z.array(evidenceId).min(1).max(20),
  acceptance: z.string().trim().min(1).max(300)
}).strict()

const featureReviewTargetSchema = z.object({
  id: boundedId,
  label: z.string().trim().min(1).max(160),
  partIds: z.array(boundedId).min(1).max(20),
  evidenceId,
  view: z.enum(['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter', 'detail']),
  region: z.object({
    x: finite.min(0).max(1),
    y: finite.min(0).max(1),
    width: finite.positive().max(1),
    height: finite.positive().max(1)
  }).strict(),
  metric: z.enum(['silhouette', 'edge', 'color', 'luminance']),
  criticality: z.enum(['critical', 'important']),
  threshold: finite.min(0).max(1),
  acceptance: z.string().trim().min(1).max(300)
}).strict().superRefine((target, ctx) => {
  if (target.region.x + target.region.width > 1 || target.region.y + target.region.height > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['region'], message: 'Feature region must stay inside normalized image bounds.' })
  }
})

const runtimeSchema = z.object({
  sockets: z.array(z.object({
    id: boundedId,
    partId: boundedId,
    name: z.string().trim().min(1).max(160),
    position: vec3,
    rotation: vec3,
    purpose: z.string().trim().min(1).max(300)
  }).strict()).max(200),
  colliders: z.array(z.object({
    id: boundedId,
    partId: boundedId,
    shape: z.enum(['box', 'sphere', 'capsule', 'convex']),
    position: vec3,
    rotation: vec3,
    dimensions: vec3,
    isTrigger: z.boolean()
  }).strict()).max(300),
  destructionGroups: z.array(z.object({ id: boundedId, partIds: z.array(boundedId).min(1).max(200) }).strict()).max(50)
}).strict()

export const SculptSpecSchema = z.object({
  schemaVersion: z.literal(1),
  subject: z.object({
    name: z.string().trim().min(1).max(160),
    category: z.enum(['hard-surface', 'character', 'relief']),
    coordinateSystem: z.object({ up: z.literal('Y'), forward: z.enum(['Z-', 'Z+']), units: z.enum(['meters', 'centimeters']) }).strict()
  }).strict(),
  evidenceIds: z.array(evidenceId).min(1).max(12),
  referenceCameras: z.array(referenceCameraSchema).min(1).max(12),
  parts: z.array(partSchema).min(1).max(300),
  attachments: z.array(attachmentSchema).max(300),
  materials: z.array(materialSchema).min(1).max(100),
  details: z.array(detailSchema).max(500),
  featureReviewTargets: z.array(featureReviewTargetSchema).min(1).max(100),
  hiddenRegions: z.array(z.object({
    id: boundedId,
    description: z.string().trim().min(1).max(300),
    confidence: z.number().min(0).max(1),
    occluded: z.boolean(),
    insufficientReferenceResolution: z.boolean()
  }).strict()).max(100),
  qualityContract: z.object({
    profile: QualityProfileNameSchema,
    requiredViews: z.array(z.enum(['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter', 'detail'])).min(1).max(7),
    maximumCorrectionIterations: z.number().int().min(1).max(12)
  }).strict(),
  runtime: runtimeSchema,
  nextDecision: z.enum(NEXT_DECISIONS)
}).strict().superRefine((spec, ctx) => {
  const evidenceIdValues = spec.evidenceIds
  const partIdValues = spec.parts.map((part) => part.id)
  const partIds = new Set(spec.parts.map((part) => part.id))
  const materialIds = new Set(spec.materials.map((material) => material.id))
  const evidenceIds = new Set(evidenceIdValues)
  const assertUnique = (values: string[], path: string, message: string) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
  }
  assertUnique(evidenceIdValues, 'evidenceIds', 'Evidence ids must be unique.')
  assertUnique(partIdValues, 'parts', 'Part ids must be unique.')
  assertUnique(spec.materials.map((material) => material.id), 'materials', 'Material ids must be unique.')
  for (const camera of spec.referenceCameras) {
    if (!evidenceIds.has(camera.evidenceId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['referenceCameras'], message: `Camera cites unavailable evidence '${camera.evidenceId}'.` })
  }
  for (const part of spec.parts) {
    if (part.parentId && !partIds.has(part.parentId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts'], message: `Missing parent part '${part.parentId}'.` })
    if (!materialIds.has(part.materialId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts'], message: `Missing material '${part.materialId}'.` })
    if (part.evidenceIds.some((id) => !evidenceIds.has(id))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts'], message: `Part '${part.id}' cites unavailable evidence.` })
  }
  for (const attachment of spec.attachments) {
    if (!partIds.has(attachment.parentPartId) || !partIds.has(attachment.childPartId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attachments'], message: `Attachment '${attachment.id}' references missing parts.` })
    if (attachment.evidenceIds.some((id) => !evidenceIds.has(id))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attachments'], message: `Attachment '${attachment.id}' cites unavailable evidence.` })
  }
  for (const detail of spec.details) {
    if (!partIds.has(detail.partId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details'], message: `Detail '${detail.id}' references missing part.` })
    if (detail.evidenceIds.some((id) => !evidenceIds.has(id))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details'], message: `Detail '${detail.id}' cites unavailable evidence.` })
  }
  for (const target of spec.featureReviewTargets) {
    if (target.partIds.some((id) => !partIds.has(id))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureReviewTargets'], message: `Feature '${target.id}' references missing parts.` })
    if (!evidenceIds.has(target.evidenceId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureReviewTargets'], message: `Feature '${target.id}' cites unavailable evidence.` })
  }
  if (!spec.featureReviewTargets.some((target) => target.criticality === 'critical' && target.metric === 'silhouette')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureReviewTargets'], message: 'At least one critical silhouette target is required.' })
  }
  if (spec.qualityContract.profile === 'reference-fidelity' && spec.referenceCameras.length < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['referenceCameras'], message: 'Reference-fidelity requires at least two reference cameras.' })
  }
})

export type SculptSpec = z.infer<typeof SculptSpecSchema>
