import { createHash } from 'node:crypto'
import { BUILD_STAGES } from '../constants.js'
import type { BuildStage, DeterministicReview, StageGateResult } from './types.js'
import type { SculptSpec } from './sculpt-spec.schema.js'

export type PipelineSnapshot = {
  completedStages: StageGateResult[]
  status: 'ready' | 'building' | 'blocked' | 'complete'
}

export function nextBuildStage(results: StageGateResult[]): BuildStage | null {
  for (const stage of BUILD_STAGES) {
    const result = results.find((item) => item.stage === stage)
    if (!result || result.status !== 'passed') {
      return stage
    }
  }
  return null
}

export function assertStageMayRun(stage: BuildStage, results: StageGateResult[]): void {
  const expected = nextBuildStage(results)
  if (expected !== stage) {
    throw new Error(`PIPELINE_STAGE_ORDER: expected '${expected ?? 'complete'}', received '${stage}'.`)
  }
  const failure = results.find((item) => item.status !== 'passed')
  if (failure) {
    throw new Error(`PIPELINE_GATE_BLOCKED: '${failure.stage}' is ${failure.status}.`)
  }
}

export function evaluateStage(stage: BuildStage, spec: SculptSpec): StageGateResult {
  const checks = stageChecks(stage, spec)
  const passedCount = checks.filter((item) => item.passed).length
  const score = checks.length === 0 ? 1 : passedCount / checks.length
  return {
    stage,
    status: checks.every((item) => item.passed) ? 'passed' : 'failed',
    score,
    checks,
    completedAt: new Date().toISOString()
  }
}

function stageChecks(stage: BuildStage, spec: SculptSpec): StageGateResult['checks'] {
  const featureTargets = spec.featureReviewTargets ?? []
  switch (stage) {
    case 'blockout':
      return [
        check('components_present', spec.components.length > 0, `${spec.components.length} components`),
        check(
          'component_contract',
          spec.components.length >= spec.qualityContract.minimumComponentCount,
          `${spec.components.length}/${spec.qualityContract.minimumComponentCount} required components`
        ),
        check(
          'semantic_volume',
          spec.modelingMode === 'relief' || spec.components.every((item) => item.geometry?.type !== 'heightfield'),
          spec.modelingMode === 'relief'
            ? 'Explicit 2.5D relief mode.'
            : 'Semantic 3D uses volumetric procedural components.'
        ),
        check('proportions_present', spec.proportions.length > 0, `${spec.proportions.length} proportion rules`)
      ]
    case 'structural-pass':
      return [
        check('single_root_or_explicit_hierarchy', spec.components.filter((item) => item.parentId === null).length >= 1, 'Hierarchy has a root.'),
        check('materials_resolved', spec.components.every((item) => spec.materials.some((material) => material.id === item.materialId)), 'Every component has a material.')
      ]
    case 'form-refinement':
      return [
        check('evidence_backed_forms', spec.components.every((item) => item.evidenceIds.length > 0), 'Every form cites evidence.'),
        check(
          'critical_silhouette_target',
          featureTargets.some((item) => item.criticality === 'critical' && item.metric === 'silhouette'),
          'At least one critical silhouette review target is defined.'
        )
      ]
    case 'material-pass':
      return [
        check('materials_present', spec.materials.length > 0, `${spec.materials.length} materials`),
        check(
          'material_zone_contract',
          spec.materials.length >= spec.qualityContract.minimumMaterialCount,
          `${spec.materials.length}/${spec.qualityContract.minimumMaterialCount} required material zones`
        )
      ]
    case 'surface-pass':
      return [
        check('must_details_present', spec.details.filter((item) => item.priority === 'must').length > 0, 'At least one must-have detail exists.'),
        check(
          'feature_targets_mapped',
          featureTargets.length > 0 && featureTargets.every((target) =>
            target.componentIds.every((componentId) => spec.components.some((component) => component.id === componentId))
          ),
          `${featureTargets.length} feature targets map to generated components.`
        )
      ]
    case 'lighting-pass':
      return [
        check('review_views', spec.qualityContract.requiredViews.length >= 2, `${spec.qualityContract.requiredViews.length} required views`),
        check(
          'fixed_reference_camera',
          Boolean(
            spec.referenceCamera &&
            spec.qualityContract.requiredViews.includes(spec.referenceCamera.view) &&
            spec.referenceCamera.confidence >= 0.5
          ),
          spec.referenceCamera
            ? `${spec.referenceCamera.view} fixed camera at confidence ${spec.referenceCamera.confidence.toFixed(2)}`
            : 'No fixed reference camera is present.'
        )
      ]
    case 'interaction-pass':
      return [
        check('runtime_handles', spec.runtime.pivots.length + spec.runtime.sockets.length > 0, 'At least one pivot or socket exists.'),
        check('colliders_present', spec.runtime.colliders.length > 0, `${spec.runtime.colliders.length} colliders`)
      ]
    case 'optimization-pass':
      const estimatedTriangles = spec.components.reduce((total, component) => {
        const geometry = component.geometry
        if (!geometry) return total + 100
        if (geometry.type === 'heightfield') {
          const faces = (geometry.columns - 1) * (geometry.rows - 1) * 4
          const sides = (geometry.columns * 2 + geometry.rows * 2 - 4) * 2
          return total + faces + sides
        }
        if (geometry.type === 'rounded-box') return total + geometry.segments * geometry.segments * 96
        if (geometry.type === 'torus-arc') return total + geometry.radialSegments * geometry.tubularSegments * 2
        return total + geometry.points.length * Math.max(2, geometry.curveSegments) * 8
      }, 0)
      return [
        check(
          'triangle_budget',
          spec.qualityContract.maximumTriangles >= estimatedTriangles,
          `Triangle budget ${spec.qualityContract.maximumTriangles} covers estimated ${estimatedTriangles} triangles.`
        ),
        check('draw_call_budget', spec.qualityContract.maximumDrawCalls >= spec.materials.length, 'Draw-call budget covers materials.')
      ]
  }
}

function check(code: string, passed: boolean, detail: string): StageGateResult['checks'][number] {
  return { code, passed, detail }
}

export function deterministicReview(spec: SculptSpec, code: string): DeterministicReview {
  const codeSha256 = createHash('sha256').update(code).digest('hex')
  const checks = [
    check('typescript_factory_export', /export function create[A-Za-z0-9_]+Model/.test(code), 'Factory export is present.'),
    check('no_python_runtime', !/\bpython\b|\.py\b/i.test(code), 'No Python runtime references.'),
    check('procedural_three_import', /from ['"]three['"]/.test(code), 'Three.js import is present.'),
    check('runtime_metadata', /userData\.img2threejs/.test(code), 'Runtime metadata is attached.'),
    check('component_coverage', spec.components.every((component) => code.includes(JSON.stringify(component.id))), 'Every component id is emitted.'),
    check(
      'typed_procedural_geometry',
      spec.components.every((component) => {
        if (!component.geometry) return true
        if (component.geometry.type === 'heightfield') return code.includes('createHeightfieldGeometry')
        if (component.geometry.type === 'rounded-box') return code.includes('RoundedBoxGeometry')
        if (component.geometry.type === 'torus-arc') return code.includes('TorusGeometry')
        return code.includes('ExtrudeGeometry')
      }),
      'Every typed procedural geometry is emitted by the generated TypeScript factory.'
    ),
    check(
      'animation_runtime',
      spec.runtime.animationClips.length === 0 || code.includes('applyPivot'),
      'Animation clips are backed by executable pivot controls.'
    )
  ]
  const score = checks.filter((item) => item.passed).length / checks.length
  return {
    status: checks.every((item) => item.passed) && score >= spec.qualityContract.minimumDeterministicScore ? 'passed' : 'failed',
    score,
    checks,
    codeSha256
  }
}

export function stableCursor(input: {
  status: string
  revision: number
  stageResults: StageGateResult[]
  failureCodes: string[]
}): string {
  const canonical = JSON.stringify({
    status: input.status,
    revision: input.revision,
    stages: [...input.stageResults]
      .sort((left, right) => BUILD_STAGES.indexOf(left.stage) - BUILD_STAGES.indexOf(right.stage))
      .map(({ stage, status, score }) => ({ stage, status, score })),
    failures: [...input.failureCodes].sort()
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24)
}

export function assertBaseRevision(actual: number, expected: number): void {
  if (!Number.isInteger(expected) || expected < 1 || actual !== expected) {
    throw new Error(`REVISION_CONFLICT:${actual}`)
  }
}

export function queueJobKey(runId: string, stage: BuildStage, revision: number): string {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error('INVALID_RUN_ID')
  if (!Number.isInteger(revision) || revision < 1) throw new Error('INVALID_REVISION')
  // BullMQ rejects custom job ids containing a colon. Keep the key deterministic
  // while using only separators accepted by the platform Managed Queue.
  return `img2threejs__${runId}__${stage}__r${revision}`
}
