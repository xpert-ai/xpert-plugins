import assert from 'node:assert/strict'
import sharp from 'sharp'
import {
  analyzeImageAdmission,
  isNearDuplicate,
  pHashHammingDistance
} from '../dist/lib/domain/admission/image-admission.js'
import { SculptSpecSchema } from '../dist/lib/domain/sculpt/sculpt-spec.schema.js'
import { GeometryDescriptorSchema } from '../dist/lib/domain/sculpt/geometry-descriptors.js'
import { normalizeImageMime } from '../dist/lib/img2threejs.service-support.js'
import {
  QUALITY_PROFILES,
  QualityProfileSchema,
  getQualityProfile
} from '../dist/lib/domain/quality/quality-profiles.js'

const evidenceA = '123e4567-e89b-42d3-a456-426614174000'
const evidenceB = '123e4567-e89b-42d3-a456-426614174001'

const validSpec = {
  schemaVersion: 1,
  subject: {
    name: 'Hard surface test object',
    category: 'hard-surface',
    coordinateSystem: { up: 'Y', forward: 'Z-', units: 'meters' }
  },
  evidenceIds: [evidenceA, evidenceB],
  referenceCameras: [
    {
      evidenceId: evidenceA,
      view: 'front',
      projection: 'perspective',
      position: [0, 0, 4],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovDegrees: 35,
      orthographicHeight: null,
      subjectFillRatio: 0.75,
      confidence: 0.95
    },
    {
      evidenceId: evidenceB,
      view: 'three-quarter',
      projection: 'perspective',
      position: [3, 2, 3],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovDegrees: 35,
      orthographicHeight: null,
      subjectFillRatio: 0.7,
      confidence: 0.9
    }
  ],
  parts: [{
    id: 'body',
    parentId: null,
    name: 'Body',
    semanticType: 'primary-form',
    geometry: {
      type: 'primitive',
      primitive: 'box',
      dimensions: { x: 1.2, y: 0.8, z: 0.7 },
      radialSegments: 8,
      heightSegments: 4
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
    materialId: 'paint',
    evidenceIds: [evidenceA, evidenceB],
    confidence: { shape: 0.94, placement: 0.92, hidden: 0.5 }
  }],
  attachments: [],
  materials: [{
    id: 'paint',
    name: 'Paint',
    shader: 'physical',
    baseColor: '#668899',
    roughness: 0.3,
    metalness: 0.1,
    channels: {},
    localOverrides: []
  }],
  details: [{
    id: 'front-seam',
    partId: 'body',
    kind: 'seam',
    priority: 'must',
    description: 'A visible center seam.',
    evidenceIds: [evidenceA],
    acceptance: 'The seam remains visible in the front view.'
  }],
  featureReviewTargets: [{
    id: 'body-silhouette',
    label: 'Body silhouette',
    partIds: ['body'],
    evidenceId: evidenceA,
    view: 'front',
    region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    metric: 'silhouette',
    criticality: 'critical',
    threshold: 0.85,
    acceptance: 'The body outline matches the reference.'
  }],
  hiddenRegions: [],
  qualityContract: {
    profile: 'reference-fidelity',
    requiredViews: ['front', 'three-quarter'],
    maximumCorrectionIterations: 6
  },
  runtime: { sockets: [], colliders: [], destructionGroups: [] },
  nextDecision: 'continue'
}

assert.equal(SculptSpecSchema.safeParse(validSpec).success, true)
assert.equal(GeometryDescriptorSchema.safeParse(validSpec.parts[0].geometry).success, true)
assert.deepEqual(getQualityProfile('reference-fidelity'), QUALITY_PROFILES['reference-fidelity'])
assert.equal(QualityProfileSchema.safeParse(QUALITY_PROFILES.character).success, true)

const missingPart = structuredClone(validSpec)
missingPart.featureReviewTargets[0].partIds = ['missing']
assert.equal(SculptSpecSchema.safeParse(missingPart).success, false)

const duplicatePart = structuredClone(validSpec)
duplicatePart.parts.push({ ...duplicatePart.parts[0], name: 'Duplicate body' })
assert.equal(SculptSpecSchema.safeParse(duplicatePart).success, false)

const singleViewStrict = structuredClone(validSpec)
singleViewStrict.referenceCameras = singleViewStrict.referenceCameras.slice(0, 1)
assert.equal(SculptSpecSchema.safeParse(singleViewStrict).success, false)

const invalidSdf = {
  type: 'sdf',
  bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  resolution: { x: 32, y: 32, z: 32 },
  nodes: [{ id: 'root', operation: 'subtract', children: ['missing'] }],
  rootNodeId: 'root'
}
assert.equal(GeometryDescriptorSchema.safeParse(invalidSdf).success, false)

const admittedImage = await referenceFixture(640, 480)
assert.equal(normalizeImageMime('application/octet-stream', 'asset-id-without-extension', admittedImage), 'image/png')
const admittedDiagnostics = await analyzeImageAdmission(admittedImage, 'image/png', {
  maximumBytes: 25_000_000
})
assert.equal(admittedDiagnostics.status, 'admitted')
assert.match(admittedDiagnostics.pHash, /^[a-f0-9]{16}$/)
assert.ok(admittedDiagnostics.foregroundCoverage > 0.2)
assert.ok(admittedDiagnostics.foregroundCoverage < 0.6)
assert.equal(admittedDiagnostics.largestComponentFraction, 1)
assert.ok(admittedDiagnostics.foregroundBounds)
assert.equal(isNearDuplicate(admittedDiagnostics.pHash, admittedDiagnostics.pHash), true)
assert.equal(pHashHammingDistance(admittedDiagnostics.pHash, 'not-a-hash'), Number.POSITIVE_INFINITY)

const undersizedImage = await referenceFixture(128, 128)
const rejectedDiagnostics = await analyzeImageAdmission(undersizedImage, 'image/png', {
  maximumBytes: 25_000_000
})
assert.equal(rejectedDiagnostics.status, 'rejected')
assert.ok(rejectedDiagnostics.failureCodes.includes('image_short_side_too_small'))

const unsupportedDiagnostics = await analyzeImageAdmission(Buffer.from('not an image'), 'image/gif', {
  maximumBytes: 25_000_000
})
assert.equal(unsupportedDiagnostics.status, 'rejected')
assert.ok(unsupportedDiagnostics.failureCodes.includes('unsupported_image_type'))

console.log('greenfield img2threejs domain contract tests passed')

function referenceFixture(width, height) {
  const subjectWidth = Math.round(width * 0.55)
  const subjectHeight = Math.round(height * 0.6)
  return sharp({
    create: { width, height, channels: 4, background: '#00000000' }
  }).composite([{
    input: {
      create: {
        width: subjectWidth,
        height: subjectHeight,
        channels: 4,
        background: '#317fb8ff'
      }
    },
    left: Math.round((width - subjectWidth) / 2),
    top: Math.round((height - subjectHeight) / 2)
  }]).png().toBuffer()
}
