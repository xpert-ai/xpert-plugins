import type { SculptSpec } from './sculpt-spec.schema.js'
import type { ModelRoute } from './types.js'
import type { ImageReliefAnalysis } from './image-relief-analysis.js'

type ImageEvidence = {
  id: string
  view: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'three-quarter' | 'detail' | 'unknown'
}

const REVIEW_VIEWS = ['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter'] as const
type ReviewView = (typeof REVIEW_VIEWS)[number]

export function createImageDerivedSculptSpec(input: {
  projectName: string
  route: ModelRoute
  primaryEvidenceId: string
  evidence: ImageEvidence[]
  analysis: ImageReliefAnalysis
}): SculptSpec {
  const evidenceIds = input.evidence.map((item) => item.id)
  const requiredViews = requiredReviewViews(input.evidence)
  const primaryEvidence = input.evidence.find((item) => item.id === input.primaryEvidenceId)
  const primaryView: ReviewView = primaryEvidence && isReviewView(primaryEvidence.view)
    ? primaryEvidence.view
    : 'front'
  const componentId = input.route === 'character' ? 'character_relief' : 'image_relief'
  const confidence = input.analysis.confidence
  return {
    schemaVersion: '1.0.0',
    projectName: input.projectName,
    route: input.route,
    modelingMode: 'relief',
    coordinateSystem: { up: 'Y', forward: 'Z-', units: 'meters' },
    referenceCamera: {
      evidenceId: input.primaryEvidenceId,
      view: primaryView,
      projection: 'orthographic',
      position: [0, input.analysis.modelHeight * 0.5, 4],
      target: [0, input.analysis.modelHeight * 0.5, 0],
      up: [0, 1, 0],
      fovDegrees: 35,
      orthographicHeight: input.analysis.modelHeight * 1.12,
      framing: { subjectFillRatio: 0.82, tolerance: 0.08 },
      confidence
    },
    silhouetteIntent:
      `A deterministic image-derived 2.5D relief generated from admitted evidence with ${input.analysis.algorithm}. ` +
      'Pixel color and luminance drive the procedural surface; additional camera views remain required for reliable hidden-side volume.',
    proportions: [{
      subject: componentId,
      relation:
        `The ${input.analysis.sourceWidth}x${input.analysis.sourceHeight} primary image is sampled into a ` +
        `${input.analysis.columns}x${input.analysis.rows} heightfield while preserving its aspect ratio.`,
      evidenceIds,
      confidence
    }],
    components: [{
      id: componentId,
      parentId: null,
      name: input.route === 'character' ? 'Image-derived character relief' : 'Image-derived object relief',
      semanticType: 'primary_form',
      primitive: 'custom',
      geometry: {
        type: 'heightfield',
        columns: input.analysis.columns,
        rows: input.analysis.rows,
        width: input.analysis.modelWidth,
        height: input.analysis.modelHeight,
        depth: input.analysis.modelDepth,
        heights: input.analysis.heights,
        colors: input.analysis.colors
      },
      transform: {
        position: [0, input.analysis.modelHeight * 0.5, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      },
      materialId: 'image_surface',
      deformable: input.route === 'character',
      evidenceIds,
      confidence
    }],
    materials: [{
      id: 'image_surface',
      name: 'Image-derived vertex surface',
      type: 'standard',
      baseColor: input.analysis.averageColor,
      roughness: 0.72,
      metalness: 0.02,
      opacity: 1,
      transparent: false,
      vertexColors: true,
      textureIntents: ['albedo', 'normal']
    }],
    details: [{
      id: 'pixel_relief',
      componentId,
      kind: 'surface_variation',
      priority: 'must',
      description:
        `The admitted primary image '${input.primaryEvidenceId}' contributes ${input.analysis.heights.length} ` +
        'bounded height and color samples to the procedural surface.',
      evidenceIds,
      acceptance: 'The front render preserves the admitted image color layout and visibly changes when the source image changes.'
    }],
    featureReviewTargets: [
      {
        id: 'relief_silhouette',
        label: 'Image-derived relief silhouette',
        evidenceId: input.primaryEvidenceId,
        componentIds: [componentId],
        view: primaryView,
        region: { x: 0.02, y: 0.02, width: 0.96, height: 0.96 },
        metric: 'silhouette',
        criticality: 'critical',
        threshold: 0.5,
        confidence,
        acceptance: 'The reference-aligned relief preserves the admitted subject silhouette and framing.'
      },
      {
        id: 'relief_surface',
        label: 'Image-derived relief surface',
        evidenceId: input.primaryEvidenceId,
        componentIds: [componentId],
        view: primaryView,
        region: { x: 0.02, y: 0.02, width: 0.96, height: 0.96 },
        metric: 'color',
        criticality: 'important',
        threshold: 0.5,
        confidence,
        acceptance: 'The reference-aligned relief preserves the source color layout.'
      }
    ],
    runtime: {
      pivots: [{
        id: 'turntable_pivot',
        componentId,
        name: 'Turntable pivot',
        kind: 'rotation',
        origin: [0, input.analysis.modelHeight * 0.5, 0],
        axis: [0, 1, 0],
        min: -180,
        max: 180
      }],
      sockets: [{
        id: 'relief_socket',
        componentId,
        name: 'Relief attachment socket',
        purpose: 'Attach later image-derived or Agent-authored volumetric refinements.',
        transform: {
          position: [0, input.analysis.modelHeight * 0.5, input.analysis.modelDepth * 0.5],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }],
      colliders: [{
        id: 'relief_collider',
        componentId,
        shape: 'box',
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [input.analysis.modelWidth, input.analysis.modelHeight, input.analysis.modelDepth]
        },
        isTrigger: false
      }],
      animationClips: [{
        name: 'turntable',
        durationSeconds: 6,
        pivotIds: ['turntable_pivot']
      }]
    },
    qualityContract: {
      minimumEvidenceCoverage: 1,
      minimumDeterministicScore: 0.8,
      requireHumanVisualApproval: true,
      maximumTriangles: 50_000,
      maximumDrawCalls: 16,
      minimumComponentCount: 1,
      minimumMaterialCount: 1,
      requiredViews,
      minimumSilhouetteIoU: 0.5,
      minimumScaleScore: 0.8,
      minimumEdgeScore: 0.2,
      minimumPerceptualScore: 0.35,
      minimumReferenceMaskConfidence: 0.1,
      minimumMultiAngleSilhouetteRetention: 0.01,
      minimumVolumeAxisRatio: 0.001,
      maximumCorrectionIterations: 3,
      mustPassStages: 8
    },
    nextDecision: 'continue'
  }
}

function requiredReviewViews(evidence: ImageEvidence[]): ReviewView[] {
  const explicit = evidence.map((item) => item.view).filter(isReviewView)
  const unique = [...new Set(explicit)]
  if (unique.length >= 2) return unique.slice(0, 7)
  const fallback: ReviewView = unique[0] === 'three-quarter' ? 'front' : 'three-quarter'
  return [...unique, fallback].slice(0, 2)
}

function isReviewView(view: ImageEvidence['view']): view is ReviewView {
  return view !== 'detail' && view !== 'unknown'
}
