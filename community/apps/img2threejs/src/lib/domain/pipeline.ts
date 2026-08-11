import { createHash } from 'node:crypto'
import ts from 'typescript'
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
  const semanticBlueprintMinimum = spec.modelingMode === 'semantic-3d'
    ? Math.min(spec.qualityContract.minimumComponentCount, 12)
    : spec.qualityContract.minimumComponentCount
  switch (stage) {
    case 'blockout':
      return [
        check('components_present', spec.components.length > 0, `${spec.components.length} components`),
        check(
          'component_contract',
          spec.components.length >= semanticBlueprintMinimum,
          spec.modelingMode === 'semantic-3d'
            ? `${spec.components.length}/${semanticBlueprintMinimum} semantic blueprint components; ${spec.qualityContract.minimumComponentCount} runtime meshes required in browser review`
            : `${spec.components.length}/${semanticBlueprintMinimum} required components`
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

export function deterministicReview(
  spec: SculptSpec,
  code: string,
  authorship: NonNullable<DeterministicReview['authorship']> = 'deterministic-generator',
  changeSummary?: string
): DeterministicReview {
  const codeSha256 = createHash('sha256').update(code).digest('hex')
  const importSpecifiers = [...code.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)]
    .map((match) => match[1] ?? '')
  const allowedImports = importSpecifiers.every((specifier) =>
    specifier === 'three' ||
    specifier.startsWith('three/examples/jsm/') ||
    specifier.startsWith('three/addons/')
  )
  const hasDynamicCode = /\b(?:eval|Function)\s*\(|\bnew\s+Function\b|\bimport\s*\(|\brequire\s*\(/.test(code)
  const hasExternalIo = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|SharedWorker|Worker)\s*\(|\bnavigator\.sendBeacon\b|\b(?:localStorage|sessionStorage|indexedDB)\b|\bdocument\.cookie\b/.test(code)
  const missingComponentIds = spec.components
    .map((component) => component.id)
    .filter((componentId) => !containsStringLiteral(code, componentId))
  const missingTypedGeometries = [...new Set(spec.components
    .filter((component) => component.geometry)
    .map((component) => component.geometry!.type))]
    .map((type) => ({
      type,
      marker: type === 'heightfield'
        ? 'createHeightfieldGeometry'
        : type === 'rounded-box'
          ? 'RoundedBoxGeometry'
          : type === 'torus-arc'
            ? 'TorusGeometry'
            : 'ExtrudeGeometry',
      relatedIdentifiers: relatedGeometryIdentifiers(code, type),
      componentIds: spec.components
        .filter((component) => component.geometry?.type === type)
        .map((component) => component.id)
    }))
    .filter(({ marker }) => !code.includes(marker))
  const syntaxDiagnostic = firstTypeScriptSyntaxDiagnostic(code)
  const checks = [
    check('bounded_typescript_source', Buffer.byteLength(code, 'utf8') <= 1_000_000, 'TypeScript source is at most 1 MB.'),
    check(
      'typescript_syntax',
      syntaxDiagnostic === null,
      syntaxDiagnostic ?? 'TypeScript source parses without syntax diagnostics.'
    ),
    check('allowed_module_imports', allowedImports, 'Imports are restricted to Three.js browser modules.'),
    check('no_dynamic_code_execution', !hasDynamicCode, 'Dynamic code loading and evaluation are absent.'),
    check('no_external_io', !hasExternalIo, 'Network, worker, browser storage, and cookie APIs are absent.'),
    check('typescript_factory_export', /export function create[A-Za-z0-9_]+Model/.test(code), 'Factory export is present.'),
    check('no_python_runtime', !/\bpython\b|\.py\b/i.test(code), 'No Python runtime references.'),
    check('procedural_three_import', /from ['"]three['"]/.test(code), 'Three.js import is present.'),
    check('runtime_metadata', /userData\.img2threejs/.test(code), 'Runtime metadata is attached.'),
    check(
      'component_coverage',
      missingComponentIds.length === 0,
      missingComponentIds.length === 0
        ? 'Every component id is emitted as a TypeScript string literal.'
        : `Missing component ids: ${missingComponentIds.join(', ')}.`
    ),
    check(
      'typed_procedural_geometry',
      missingTypedGeometries.length === 0,
      missingTypedGeometries.length === 0
        ? 'Every typed procedural geometry is emitted by the generated TypeScript factory.'
        : `Missing required typed geometry source marker(s): ${missingTypedGeometries
          .map(({ type, marker, relatedIdentifiers, componentIds }) =>
            `${marker} for ${type} components [${componentIds.join(', ')}]${relatedIdentifiers.length > 0
              ? `; related source identifier(s) already present: ${relatedIdentifiers.join(', ')}`
              : ''}`)
          .join('; ')}. Use the required exact case-sensitive Three.js/helper names in executable geometry construction. When a related identifier already implements that geometry, a bounded exact identifier rename with img2threejs_patch_code and allOccurrences=true is sufficient; do not alter its dimensions or topology.`
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
    codeSha256,
    authorship,
    changeSummary
  }
}

function relatedGeometryIdentifiers(code: string, type: NonNullable<SculptSpec['components'][number]['geometry']>['type']): string[] {
  const needles = type === 'rounded-box'
    ? ['roundedbox']
    : type === 'torus-arc'
      ? ['torus']
      : type === 'heightfield'
        ? ['heightfield']
        : ['extrude']
  return [...new Set(code.match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g) ?? [])]
    .filter((identifier) => {
      const normalized = identifier.toLowerCase().replaceAll('_', '')
      return needles.some((needle) => normalized.includes(needle))
    })
    .slice(0, 8)
}

function firstTypeScriptSyntaxDiagnostic(code: string): string | null {
  const result = ts.transpileModule(code, {
    fileName: 'model.ts',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext
    }
  })
  const diagnostic = result.diagnostics?.find((item) => item.category === ts.DiagnosticCategory.Error)
  if (!diagnostic) return null
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
  if (!diagnostic.file || diagnostic.start === undefined) return message
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  return `model.ts:${position.line + 1}:${position.character + 1} ${message}`
}

function containsStringLiteral(code: string, value: string): boolean {
  return code.includes(`'${value}'`) || code.includes(`"${value}"`) || code.includes(`\`${value}\``)
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
