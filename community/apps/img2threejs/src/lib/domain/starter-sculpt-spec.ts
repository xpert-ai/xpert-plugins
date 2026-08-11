import type { SculptSpec } from './sculpt-spec.schema.js'
import type { ModelRoute } from './types.js'

type StarterEvidence = {
  id: string
  view: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'three-quarter' | 'detail' | 'unknown'
  width: number | null
  height: number | null
}

const REVIEW_VIEWS = ['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter'] as const
type ReviewView = (typeof REVIEW_VIEWS)[number]

export function createStarterSculptSpec(input: {
  projectName: string
  route: ModelRoute
  evidence: StarterEvidence[]
}): SculptSpec {
  if (input.evidence.length === 0) throw new Error('ADMITTED_IMAGE_REQUIRED')
  const evidenceIds = input.evidence.map((item) => item.id)
  const aspectRatio = averageAspectRatio(input.evidence)
  const reviewViews = requiredReviewViews(input.evidence)
  const fixedEvidence = input.evidence.find((item) => isReviewView(item.view)) ?? input.evidence[0]
  const fixedView: ReviewView = isReviewView(fixedEvidence.view) ? fixedEvidence.view : 'front'
  return input.route === 'character'
    ? characterSpec(input.projectName, evidenceIds, reviewViews, aspectRatio, fixedEvidence.id, fixedView)
    : objectSpec(input.projectName, evidenceIds, reviewViews, aspectRatio, fixedEvidence.id, fixedView)
}

function objectSpec(
  projectName: string,
  evidenceIds: string[],
  requiredViews: ReviewView[],
  aspectRatio: number,
  fixedEvidenceId: string,
  fixedView: ReviewView
): SculptSpec {
  const bodyHeight = clamp(1.25 / aspectRatio, 0.85, 1.8)
  return {
    schemaVersion: '1.0.0',
    projectName,
    route: 'object',
    modelingMode: 'semantic-3d',
    coordinateSystem: { up: 'Y', forward: 'Z-', units: 'meters' },
    referenceCamera: starterReferenceCamera(fixedEvidenceId, fixedView, bodyHeight),
    silhouetteIntent:
      'A conservative reference-proxy object that preserves the admitted image aspect envelope. Semantic form and surface details remain explicitly reviewable refinements.',
    proportions: [{
      subject: 'main_body',
      relation: `The starter body uses a deterministic ${aspectRatio.toFixed(2)} average evidence aspect ratio.`,
      evidenceIds,
      confidence: 0.64
    }],
    components: [
      {
        id: 'main_body',
        parentId: null,
        name: 'Primary reference body',
        semanticType: 'primary_form',
        primitive: 'capsule',
        transform: { position: [0, bodyHeight * 0.5, 0], rotation: [0, 0, 0], scale: [0.72, bodyHeight, 0.62] },
        materialId: 'body_material',
        deformable: false,
        evidenceIds,
        confidence: 0.64
      },
      {
        id: 'base',
        parentId: 'main_body',
        name: 'Grounded base',
        semanticType: 'secondary_form',
        primitive: 'cylinder',
        transform: { position: [0, -0.52, 0], rotation: [0, 0, 0], scale: [0.84, 0.12, 0.84] },
        materialId: 'accent_material',
        deformable: false,
        evidenceIds,
        confidence: 0.58
      },
      {
        id: 'front_detail',
        parentId: 'main_body',
        name: 'Front-facing detail proxy',
        semanticType: 'detail_cluster',
        primitive: 'box',
        transform: { position: [0, 0, 0.62], rotation: [0, 0, 0], scale: [0.38, 0.32, 0.05] },
        materialId: 'detail_material',
        deformable: false,
        evidenceIds,
        confidence: 0.52
      }
    ],
    materials: [
      {
        id: 'body_material',
        name: 'Studio body',
        type: 'physical',
        baseColor: '#d6d3d1',
        roughness: 0.58,
        metalness: 0.12,
        opacity: 1,
        transparent: false,
        textureIntents: ['albedo', 'normal', 'roughness']
      },
      {
        id: 'accent_material',
        name: 'Violet accent',
        type: 'standard',
        baseColor: '#7c3aed',
        roughness: 0.42,
        metalness: 0.2,
        opacity: 1,
        transparent: false,
        textureIntents: []
      },
      {
        id: 'detail_material',
        name: 'Dark detail',
        type: 'standard',
        baseColor: '#111827',
        roughness: 0.36,
        metalness: 0.28,
        opacity: 1,
        transparent: false,
        textureIntents: []
      }
    ],
    details: [{
      id: 'front_panel',
      componentId: 'front_detail',
      kind: 'panel',
      priority: 'must',
      description: 'The starter keeps one explicit front-facing detail cluster for visual refinement.',
      evidenceIds,
      acceptance: 'The detail remains visible in the front and three-quarter review renders.'
    }],
    featureReviewTargets: [{
      id: 'primary_silhouette',
      label: 'Primary object silhouette',
      evidenceId: fixedEvidenceId,
      componentIds: ['main_body', 'base'],
      view: fixedView,
      region: { x: 0.08, y: 0.04, width: 0.84, height: 0.92 },
      metric: 'silhouette',
      criticality: 'critical',
      threshold: 0.55,
      confidence: 0.64,
      acceptance: 'The primary silhouette and framing remain aligned to the fixed reference view.'
    }],
    runtime: {
      pivots: [{
        id: 'turntable_pivot',
        componentId: 'main_body',
        name: 'Turntable pivot',
        kind: 'rotation',
        origin: [0, 0, 0],
        axis: [0, 1, 0],
        min: -180,
        max: 180
      }],
      sockets: [{
        id: 'top_socket',
        componentId: 'main_body',
        name: 'Top attachment socket',
        purpose: 'Attach optional refinements without changing the stable root.',
        transform: { position: [0, 0.95, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
      }],
      colliders: [{
        id: 'main_collider',
        componentId: 'main_body',
        shape: 'capsule',
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.72, bodyHeight, 0.62] },
        isTrigger: false
      }],
      animationClips: [{
        name: 'turntable',
        durationSeconds: 6,
        pivotIds: ['turntable_pivot']
      }]
    },
    qualityContract: qualityContract(requiredViews, 20_000, 24),
    nextDecision: 'continue'
  }
}

function characterSpec(
  projectName: string,
  evidenceIds: string[],
  requiredViews: ReviewView[],
  aspectRatio: number,
  fixedEvidenceId: string,
  fixedView: ReviewView
): SculptSpec {
  const torsoHeight = clamp(1.35 / aspectRatio, 1, 1.7)
  return {
    schemaVersion: '1.0.0',
    projectName,
    route: 'character',
    modelingMode: 'semantic-3d',
    coordinateSystem: { up: 'Y', forward: 'Z-', units: 'meters' },
    referenceCamera: starterReferenceCamera(fixedEvidenceId, fixedView, torsoHeight + 0.8),
    silhouetteIntent:
      'A rig-ready reference-proxy character with a readable torso and head silhouette. Identity, anatomy, and surface details remain explicit visual-review refinements.',
    proportions: [{
      subject: 'torso',
      relation: `The torso height is initialized from the ${aspectRatio.toFixed(2)} average evidence aspect ratio.`,
      evidenceIds,
      confidence: 0.62
    }],
    components: [
      {
        id: 'torso',
        parentId: null,
        name: 'Torso',
        semanticType: 'primary_form',
        primitive: 'capsule',
        transform: { position: [0, 0.65, 0], rotation: [0, 0, 0], scale: [0.72, torsoHeight, 0.58] },
        materialId: 'character_material',
        deformable: true,
        evidenceIds,
        confidence: 0.62
      },
      {
        id: 'head',
        parentId: 'torso',
        name: 'Head',
        semanticType: 'secondary_form',
        primitive: 'sphere',
        transform: { position: [0, 0.92, 0], rotation: [0, 0, 0], scale: [0.58, 0.62, 0.54] },
        materialId: 'character_material',
        deformable: true,
        evidenceIds,
        confidence: 0.56
      },
      {
        id: 'face_detail',
        parentId: 'head',
        name: 'Face detail proxy',
        semanticType: 'detail_cluster',
        primitive: 'sphere',
        transform: { position: [0, -0.06, 0.5], rotation: [0, 0, 0], scale: [0.34, 0.23, 0.16] },
        materialId: 'detail_material',
        deformable: true,
        evidenceIds,
        confidence: 0.48
      }
    ],
    materials: [
      {
        id: 'character_material',
        name: 'Character body',
        type: 'toon',
        baseColor: '#a78bfa',
        roughness: 0.72,
        metalness: 0,
        opacity: 1,
        transparent: false,
        textureIntents: ['albedo', 'normal']
      },
      {
        id: 'detail_material',
        name: 'Character detail',
        type: 'standard',
        baseColor: '#1f2937',
        roughness: 0.48,
        metalness: 0.06,
        opacity: 1,
        transparent: false,
        textureIntents: []
      }
    ],
    details: [{
      id: 'face_anchor',
      componentId: 'face_detail',
      kind: 'facial',
      priority: 'must',
      description: 'A deterministic face anchor marks the character forward direction.',
      evidenceIds,
      acceptance: 'The face anchor remains centered in the front review render.'
    }],
    featureReviewTargets: [
      {
        id: 'character_silhouette',
        label: 'Character body silhouette',
        evidenceId: fixedEvidenceId,
        componentIds: ['torso', 'head'],
        view: fixedView,
        region: { x: 0.08, y: 0.02, width: 0.84, height: 0.96 },
        metric: 'silhouette',
        criticality: 'critical',
        threshold: 0.5,
        confidence: 0.62,
        acceptance: 'Head-to-torso proportions remain aligned to the fixed reference view.'
      },
      {
        id: 'face_placement',
        label: 'Face feature placement',
        evidenceId: fixedEvidenceId,
        componentIds: ['face_detail'],
        view: fixedView,
        region: { x: 0.3, y: 0.05, width: 0.4, height: 0.35 },
        metric: 'edge',
        criticality: 'important',
        threshold: 0.35,
        confidence: 0.52,
        acceptance: 'The principal face-feature cluster remains legible in the reference-aligned render.'
      }
    ],
    runtime: {
      pivots: [
        {
          id: 'root_pivot',
          componentId: 'torso',
          name: 'Root motion pivot',
          kind: 'root_motion',
          origin: [0, 0, 0],
          axis: [0, 1, 0],
          min: -180,
          max: 180
        },
        {
          id: 'head_pivot',
          componentId: 'head',
          name: 'Head rotation pivot',
          kind: 'rotation',
          origin: [0, -0.55, 0],
          axis: [0, 1, 0],
          min: -55,
          max: 55
        }
      ],
      sockets: [{
        id: 'handheld_socket',
        componentId: 'torso',
        name: 'Accessory socket',
        purpose: 'Attach a future character prop.',
        transform: { position: [0.78, 0.35, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
      }],
      colliders: [{
        id: 'torso_collider',
        componentId: 'torso',
        shape: 'capsule',
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.72, torsoHeight, 0.58] },
        isTrigger: false
      }],
      animationClips: [{
        name: 'idle',
        durationSeconds: 2.4,
        pivotIds: ['root_pivot', 'head_pivot']
      }]
    },
    qualityContract: qualityContract(requiredViews, 30_000, 28),
    nextDecision: 'continue'
  }
}

function qualityContract(
  requiredViews: ReviewView[],
  maximumTriangles: number,
  maximumDrawCalls: number
): SculptSpec['qualityContract'] {
  return {
    minimumEvidenceCoverage: 1,
    minimumDeterministicScore: 0.8,
    requireHumanVisualApproval: true,
    maximumTriangles,
    maximumDrawCalls,
    minimumComponentCount: 3,
    minimumMaterialCount: 2,
    requiredViews,
    minimumSilhouetteIoU: 0.32,
    minimumScaleScore: 0.72,
    minimumEdgeScore: 0.18,
    minimumPerceptualScore: 0.12,
    minimumReferenceMaskConfidence: 0.25,
    minimumMultiAngleSilhouetteRetention: 0.12,
    minimumVolumeAxisRatio: 0.015,
    maximumCorrectionIterations: 4,
    mustPassStages: 8
  }
}

function starterReferenceCamera(
  evidenceId: string,
  view: ReviewView,
  subjectHeight: number
): SculptSpec['referenceCamera'] {
  const radius = Math.max(4, subjectHeight * 3.5)
  const positions: Record<ReviewView, [number, number, number]> = {
    front: [0, subjectHeight * 0.45, radius],
    back: [0, subjectHeight * 0.45, -radius],
    left: [-radius, subjectHeight * 0.45, 0],
    right: [radius, subjectHeight * 0.45, 0],
    top: [0, radius, 0.001],
    bottom: [0, -radius, 0.001],
    'three-quarter': [radius * 0.72, subjectHeight * 0.72, radius * 0.72]
  }
  return {
    evidenceId,
    view,
    projection: 'perspective',
    position: positions[view],
    target: [0, subjectHeight * 0.45, 0],
    up: view === 'top' || view === 'bottom' ? [0, 0, -1] : [0, 1, 0],
    fovDegrees: 35,
    orthographicHeight: null,
    framing: { subjectFillRatio: 0.62, tolerance: 0.18 },
    confidence: 0.64
  }
}

function requiredReviewViews(evidence: StarterEvidence[]): ReviewView[] {
  const explicit = evidence
    .map((item) => item.view)
    .filter(isReviewView)
  const unique = [...new Set(explicit)]
  if (unique.length >= 2) return unique.slice(0, 7)
  const fallback: ReviewView = unique[0] === 'three-quarter' ? 'front' : 'three-quarter'
  return [...unique, fallback].slice(0, 2)
}

function averageAspectRatio(evidence: StarterEvidence[]): number {
  const ratios = evidence
    .filter(hasDimensions)
    .map((item) => item.width / item.height)
  return ratios.length
    ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
    : 1
}

function isReviewView(view: StarterEvidence['view']): view is ReviewView {
  return view !== 'detail' && view !== 'unknown'
}

function hasDimensions(
  evidence: StarterEvidence
): evidence is StarterEvidence & { width: number; height: number } {
  return typeof evidence.width === 'number' &&
    evidence.width > 0 &&
    typeof evidence.height === 'number' &&
    evidence.height > 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
