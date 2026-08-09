import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HumanMessage, ToolMessage } from '@langchain/core/messages'
import {
  IMG2THREEJS_ARTIFACT_NAMESPACE,
  IMG2THREEJS_QUEUE_NAME,
  IMG2THREEJS_ROUTE_PREFIX,
  IMG2THREEJS_TABLES,
  IMG2THREEJS_VIEW_KEY
} from '../dist/lib/constants.js'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import {
  assertBaseRevision,
  assertStageMayRun,
  deterministicReview,
  evaluateStage,
  nextBuildStage,
  queueJobKey,
  stableCursor
} from '../dist/lib/domain/pipeline.js'
import { SculptSpecSchema } from '../dist/lib/domain/sculpt-spec.schema.js'
import { deriveRenderGateOutcome } from '../dist/lib/domain/review-routing.js'
import { createStarterSculptSpec } from '../dist/lib/domain/starter-sculpt-spec.js'
import { generateThreeJsFactory } from '../dist/lib/domain/threejs-generator.js'
import { toViewerScene } from '../dist/lib/contracts/viewer-scene.js'
import {
  AuthorCodeFileToolSchema,
  AuthorCodeToolSchema,
  CancelRunToolSchema,
  ChangeSummaryProbeSchema,
  EnqueueStageToolSchema,
  InspectCodeFileToolSchema,
  PatchCodeToolSchema,
  PatchSpecToolSchema,
  PatchRuntimeContractToolSchema,
  RevalidateCodeToolSchema,
  SubmitImagesToolSchema
} from '../dist/lib/tool-schemas.js'
import { Img2ThreeJsController } from '../dist/lib/img2threejs.controller.js'
import { diagnoseAssistantSourceImports } from '../dist/lib/img2threejs-agent-query.service.js'
import {
  img2ThreeJsActionAllowsSandbox,
  img2ThreeJsToolsForNextAction,
  isImg2ThreeJsToolAllowedForNextAction
} from '../dist/lib/img2threejs.middleware.js'
import { minimumComponentCountFromReview } from '../dist/lib/img2threejs.service.js'
import { Img2ThreeJsViewProvider } from '../dist/lib/img2threejs-view.provider.js'
import {
  isAssistantSourceBuildFailure,
  isTransientWorkspaceInputVisibilityFailure,
  runNextAction,
  scopedIdWhere,
  summarizeAsset,
  validateReviewDecision
} from '../dist/lib/img2threejs.service-support.js'
import img2ThreeJsPlugin from '../dist/index.js'
import { crownChestSpec } from '../tests/fixtures/crown-chest-spec.mjs'

const evidenceId = '123e4567-e89b-42d3-a456-426614174000'
const runId = '123e4567-e89b-42d3-a456-426614174001'
const spec = {
  schemaVersion: '1.0.0',
  projectName: 'Test Character',
  route: 'character',
  modelingMode: 'semantic-3d',
  coordinateSystem: { up: 'Y', forward: 'Z-', units: 'meters' },
  referenceCamera: {
    evidenceId,
    view: 'front',
    projection: 'perspective',
    position: [0, 0, 4],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fovDegrees: 35,
    orthographicHeight: null,
    framing: { subjectFillRatio: 0.62, tolerance: 0.18 },
    confidence: 0.9
  },
  silhouetteIntent: 'Compact stylized character with a readable head-to-body ratio.',
  proportions: [{ subject: 'root', relation: 'head is half of body height', evidenceIds: [evidenceId], confidence: 0.9 }],
  components: [{
    id: 'root',
    parentId: null,
    name: 'Root body',
    semanticType: 'primary_form',
    primitive: 'capsule',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1.5, 1] },
    materialId: 'body_material',
    deformable: true,
    evidenceIds: [evidenceId],
    confidence: 0.9
  }],
  materials: [{
    id: 'body_material',
    name: 'Body material',
    type: 'standard',
    baseColor: '#7c3aed',
    roughness: 0.7,
    metalness: 0,
    opacity: 1,
    transparent: false,
    textureIntents: []
  }],
  details: [{
    id: 'front_seam',
    componentId: 'root',
    kind: 'seam',
    priority: 'must',
    description: 'Front seam visible in the reference.',
    evidenceIds: [evidenceId],
    acceptance: 'Seam follows the center line.'
  }],
  featureReviewTargets: [{
    id: 'root_silhouette',
    label: 'Root body silhouette',
    evidenceId,
    componentIds: ['root'],
    view: 'front',
    region: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
    metric: 'silhouette',
    criticality: 'critical',
    threshold: 0.5,
    confidence: 0.9,
    acceptance: 'The root body silhouette matches the fixed reference view.'
  }],
  runtime: {
    pivots: [{
      id: 'root_pivot',
      componentId: 'root',
      name: 'Root pivot',
      kind: 'rotation',
      origin: [0, 0, 0],
      axis: [0, 1, 0],
      min: -180,
      max: 180
    }],
    sockets: [{
      id: 'top_socket',
      componentId: 'root',
      name: 'Top socket',
      purpose: 'Attach accessories.',
      transform: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    }],
    colliders: [{
      id: 'root_collider',
      componentId: 'root',
      shape: 'capsule',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1.5, 1] },
      isTrigger: false
    }],
    animationClips: [{ name: 'idle', durationSeconds: 2, pivotIds: ['root_pivot'] }]
  },
  qualityContract: {
    minimumEvidenceCoverage: 1,
    minimumDeterministicScore: 0.8,
    requireHumanVisualApproval: true,
    maximumTriangles: 10000,
    maximumDrawCalls: 20,
    minimumComponentCount: 1,
    minimumMaterialCount: 1,
    requiredViews: ['front', 'three-quarter'],
    minimumSilhouetteIoU: 0.3,
    minimumScaleScore: 0.7,
    minimumEdgeScore: 0.15,
    minimumPerceptualScore: 0.1,
    minimumReferenceMaskConfidence: 0.2,
    minimumMultiAngleSilhouetteRetention: 0.1,
    minimumVolumeAxisRatio: 0.02,
    maximumCorrectionIterations: 4,
    mustPassStages: 8
  },
  nextDecision: 'continue'
}

const parsed = SculptSpecSchema.parse(spec)
assert.deepEqual(diagnoseAssistantSourceImports([
  "import * as THREE from 'three';",
  "import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry';"
].join('\n')), [{
  code: 'ESM_IMPORT_EXTENSION_MISSING',
  line: 2,
  moduleSpecifier: 'three/examples/jsm/geometries/RoundedBoxGeometry',
  detail: "The browser ESM build requires an explicit .js suffix for 'three/examples/jsm/geometries/RoundedBoxGeometry'. Author a new Assistant candidate with a resolvable module specifier; do not retry the immutable code version."
}])
assert.equal(isAssistantSourceBuildFailure({
  code: 'SANDBOX_START_FAILED',
  message: 'Build failed: model/model.ts:2:35: Could not resolve "three/examples/jsm/geometries/RoundedBoxGeometry"'
}), true)
assert.equal(isAssistantSourceBuildFailure({
  code: 'SANDBOX_START_FAILED',
  message: 'Remote runtime was temporarily unavailable'
}), false)
assert.equal(isTransientWorkspaceInputVisibilityFailure({
  code: 'EXPORT_INPUT_INVALID',
  message: 'Unable to read model.ts: Workspace file not found'
}), true)
assert.equal(runNextAction({
  status: 'review_required',
  nextDecision: 'continue',
  failureReasons: ['EXPORT_INPUT_INVALID', 'SANDBOX_START_FAILED'],
  stageResults: [],
  renderReport: {
    status: 'failed',
    failure: {
      code: 'EXPORT_INPUT_INVALID',
      message: 'Unable to read model/model.ts: Conversation file not found',
      retryable: false
    }
  }
}), 'read_visual_diagnostics_then_refine_code')
assert.equal(runNextAction({
  status: 'review_required',
  humanReviewStatus: 'changes_requested',
  nextDecision: 'refine-code',
  failureReasons: [],
  stageResults: [],
  renderReport: { status: 'succeeded' }
}), 'read_visual_diagnostics_then_refine_code')
const overlongSemanticBlueprint = structuredClone(spec)
overlongSemanticBlueprint.components = Array.from({ length: 31 }, (_, index) => ({
  ...structuredClone(spec.components[0]),
  id: index === 0 ? 'root' : `detail_${index}`,
  name: index === 0 ? 'Root body' : `Runtime-authored detail ${index}`
}))
const overlongSemanticBlueprintResult = SculptSpecSchema.safeParse(overlongSemanticBlueprint)
assert.equal(overlongSemanticBlueprintResult.success, false)
assert.match(JSON.stringify(overlongSemanticBlueprintResult.error?.issues), /compact blueprints with at most 30 components/)
const worldOffsetChildSpec = structuredClone(spec)
worldOffsetChildSpec.components.push({
  id: 'floating_child',
  parentId: 'root',
  name: 'Floating child',
  semanticType: 'detail_cluster',
  primitive: 'box',
  geometry: { type: 'rounded-box', width: 0.2, height: 0.2, depth: 0.2, segments: 2, radius: 0.05 },
  transform: { position: [0, 8, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  materialId: 'body_material',
  deformable: false,
  evidenceIds: [evidenceId],
  confidence: 0.9
})
const worldOffsetChildResult = SculptSpecSchema.safeParse(worldOffsetChildSpec)
assert.equal(worldOffsetChildResult.success, false)
assert.match(JSON.stringify(worldOffsetChildResult.error?.issues), /parent-local transform/)
const flatDioramaCameraSpec = structuredClone(spec)
flatDioramaCameraSpec.route = 'object'
flatDioramaCameraSpec.components[0] = {
  ...flatDioramaCameraSpec.components[0],
  primitive: 'custom',
  geometry: { type: 'rounded-box', width: 16, height: 0.3, depth: 14, segments: 4, radius: 0.1 },
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
}
flatDioramaCameraSpec.referenceCamera = {
  ...flatDioramaCameraSpec.referenceCamera,
  position: [0, 8, 23],
  target: [0, 0, 0]
}
const flatDioramaCameraResult = SculptSpecSchema.safeParse(flatDioramaCameraSpec)
assert.equal(
  flatDioramaCameraResult.success,
  true,
  `flat diorama framing must use oriented component extents instead of expanding every axis by each component bounding sphere: ${JSON.stringify(flatDioramaCameraResult.error?.issues ?? [])}`
)
assert.equal(ChangeSummaryProbeSchema.safeParse({ changeSummary: 'x'.repeat(1000) }).success, true)
assert.equal(ChangeSummaryProbeSchema.safeParse({ changeSummary: 'x'.repeat(2001) }).success, false)
assert.equal(PatchRuntimeContractToolSchema.safeParse({
  projectId: evidenceId,
  sourceSpecVersionId: runId,
  minimumRuntimeMeshCount: 55,
  confidence: 0.95,
  changeSummary: 'Raise the browser runtime mesh floor without expanding the semantic blueprint.'
}).success, true)
assert.equal(PatchSpecToolSchema.safeParse({
  projectId: evidenceId,
  sourceSpecVersionId: runId,
  referenceCamera: {
    ...spec.referenceCamera,
    position: [0, 8, 24]
  },
  componentPatches: [{
    componentId: 'root',
    transform: { position: [0.25, 0, 0] }
  }],
  materialPatches: [{ materialId: 'body_material', baseColor: '#ef4444' }],
  confidence: 0.95,
  changeSummary: 'Apply bounded camera, component, and material corrections without resending the full Spec.'
}).success, true)
assert.equal(PatchSpecToolSchema.safeParse({
  projectId: evidenceId,
  sourceSpecVersionId: runId,
  componentPatches: [],
  materialPatches: [],
  confidence: 0.95,
  changeSummary: 'Empty patch.'
}).success, false)
assert.equal(RevalidateCodeToolSchema.safeParse({
  projectId: evidenceId,
  codeVersionId: runId,
  changeSummary: 'Re-run policy review without replacing immutable Assistant source bytes.'
}).success, true)
assert.equal(PatchCodeToolSchema.safeParse({
  projectId: evidenceId,
  codeVersionId: runId,
  replacements: [{ oldText: 'const before = true', newText: 'const after = true' }],
  changeSummary: 'Apply a bounded exact Assistant-authored source refinement.'
}).success, true)
assert.equal(InspectCodeFileToolSchema.safeParse({
  projectId: evidenceId,
  sourceFilePath: '/workspace/img2threejs-work/model.ts'
}).success, true)
assert.equal(AuthorCodeFileToolSchema.safeParse({
  projectId: evidenceId,
  specVersionId: runId,
  mode: 'create',
  baseCodeVersionId: null,
  sourceFilePath: '/workspace/img2threejs-work/model.ts',
  changeSummary: 'Import an Assistant-authored TypeScript module from Workspace Files.'
}).success, true)
assert.equal(AuthorCodeFileToolSchema.safeParse({
  projectId: evidenceId,
  specVersionId: runId,
  mode: 'refine',
  baseCodeVersionId: null,
  sourceFilePath: '/workspace/img2threejs-work/model.ts',
  changeSummary: 'Invalid file refinement request.'
}).success, false)
const legacySourceControlParse = AuthorCodeFileToolSchema.safeParse({
  projectId: evidenceId,
  specVersionId: runId,
  mode: 'create',
  baseCodeVersionId: null,
  sourceFilePath: '/workspace/img2threejs-work/model.ts',
  expectedSourceSha256: 'c'.repeat(64),
  changeSummary: 'Ignore a deprecated caller-managed source concurrency input.'
})
assert.equal(legacySourceControlParse.success, true)
assert.equal('expectedSourceSha256' in legacySourceControlParse.data, false)
const failedGateQuality = {
  triangles: 100,
  drawCalls: 1,
  maximumTriangles: 1000,
  maximumDrawCalls: 10,
  referenceAlignment: {
    evidenceId,
    view: 'front',
    maskConfidence: 0.92,
    silhouetteIoU: 0.12,
    scaleScore: 0.88,
    edgeScore: 0.2,
    perceptualScore: 0.18,
    hardGateEligible: true,
    passed: false
  },
  featureResults: [],
  multiAngle: {
    minimumSilhouetteRetention: 0.1,
    minimumVolumeAxisRatio: 0.02,
    silhouetteRetention: 0.6,
    volumeAxisRatio: 0.4,
    degenerateView: false,
    passed: true
  },
  failureCodes: ['reference_camera_alignment_failed'],
  passed: false
}
const failedGateOutcome = deriveRenderGateOutcome(failedGateQuality, 4)
assert.equal(failedGateOutcome.nextDecision, 'refine-spec')
assert.equal(failedGateOutcome.correction.iteration, 1)
const repeatedGateOutcome = deriveRenderGateOutcome(failedGateQuality, 4, {
  status: 'succeeded',
  action: 'img2threejs.review-render',
  actionVersion: '1.0.0',
  quality: failedGateQuality,
  correction: failedGateOutcome.correction
})
assert.equal(repeatedGateOutcome.correction.repeatedDefectCount, 2)
assert.throws(
  () => validateReviewDecision({
    status: 'review_required',
    renderReport: {
      status: 'failed',
      action: 'img2threejs.review-render',
      actionVersion: '1.0.0'
    },
    visualReview: { renderStatus: 'failed' }
  }, 'approved', 'continue'),
  /VISUAL_REVIEW_APPROVAL_REQUIRES_BROWSER_RENDER/
)
assert.throws(
  () => validateReviewDecision({
    status: 'review_required',
    renderReport: {
      status: 'succeeded',
      action: 'img2threejs.review-render',
      actionVersion: '1.0.0',
      quality: failedGateQuality
    },
    visualReview: {
      renderStatus: 'succeeded',
      comparisonAsset: { filePath: 'comparison.png' }
    }
  }, 'approved', 'continue'),
  /REFERENCE_FIDELITY_GATE_BLOCKED/
)

const viewProvider = new Img2ThreeJsViewProvider(
  {
    async getStatus() {
      return { revision: 7, runId: null, runRevision: null }
    }
  },
  {},
  {
    async startGeneration() {
      return {
        projectId: evidenceId,
        revision: 7,
        status: 'awaiting_spec',
        semanticAnalysisOwner: 'agent-chat',
        nextAction: 'ask_agent_to_analyze_evidence',
        evidenceIds: [runId],
        suggestedPrompt: 'Run img2threejs_read_evidence and img2threejs_update_spec.'
      }
    }
  }
)
const manifest = viewProvider.getViewManifests(
  { hostType: 'agent' },
  'agent.workbench.fixed'
)[0]
assert.ok(manifest)
assert.deepEqual(
  manifest.clientCommands?.map((command) => command.key),
  ['assistant.chat.send_message']
)
const semanticAction = await viewProvider.executeViewAction(
  {
    hostType: 'agent',
    hostId: 'assistant-test',
    tenantId: 'tenant-test',
    organizationId: 'organization-test',
    userId: 'user-test'
  },
  IMG2THREEJS_VIEW_KEY,
  'start_generation',
  {
    input: {
      projectId: evidenceId
    }
  }
)
assert.equal(semanticAction.success, true)
assert.equal('revision' in semanticAction.data, false)
assert.doesNotMatch(JSON.stringify(semanticAction.data), /"(?:revision|runRevision|baseRevision)"\s*:/)
assert.equal(semanticAction.data.clientCommand.commandKey, 'assistant.chat.send_message')
assert.equal(semanticAction.data.clientCommand.payload.state.img2threejs.projectId, evidenceId)
assert.equal('expectedRevision' in semanticAction.data.clientCommand.payload.state.img2threejs, false)
assert.deepEqual(semanticAction.data.clientCommand.payload.state.img2threejs.evidenceIds, [runId])

const semanticHeightfield = {
  ...spec,
  components: [{
    ...spec.components[0],
    primitive: 'custom',
    geometry: {
      type: 'heightfield',
      columns: 4,
      rows: 4,
      width: 1,
      height: 1,
      depth: 0.2,
      heights: Array(16).fill(0.5),
      colors: Array(16).fill('#808080')
    }
  }]
}
assert.equal(SculptSpecSchema.safeParse(semanticHeightfield).success, false)
assert.equal(SculptSpecSchema.safeParse({
  ...semanticHeightfield,
  modelingMode: 'relief'
}).success, true)
const missingCriticalSilhouette = {
  ...spec,
  featureReviewTargets: spec.featureReviewTargets.map((target) => ({
    ...target,
    criticality: 'important'
  }))
}
const missingCriticalSilhouetteResult = SculptSpecSchema.safeParse(missingCriticalSilhouette)
assert.equal(missingCriticalSilhouetteResult.success, false)
assert.match(
  missingCriticalSilhouetteResult.error?.issues
    .map((issue) => issue.message)
    .join('\n') ?? '',
  /critical silhouette review target/i
)
for (const route of ['object', 'character']) {
  const starter = createStarterSculptSpec({
    projectName: `Starter ${route}`,
    route,
    evidence: [
      { id: evidenceId, view: 'front', width: 1024, height: 1024 },
      { id: runId, view: 'three-quarter', width: 1200, height: 900 }
    ]
  })
  assert.equal(SculptSpecSchema.safeParse(starter).success, true)
  assert.equal(starter.route, route)
  assert.equal(starter.qualityContract.mustPassStages, 8)
  assert.deepEqual(starter.qualityContract.requiredViews, ['front', 'three-quarter'])
  assert.ok(starter.runtime.pivots.length > 0)
  assert.ok(starter.runtime.sockets.length > 0)
  assert.ok(starter.runtime.colliders.length > 0)
  assert.ok(starter.runtime.animationClips.length > 0)
}
assert.throws(
  () => createStarterSculptSpec({ projectName: 'Missing evidence', route: 'object', evidence: [] }),
  /ADMITTED_IMAGE_REQUIRED/
)
const results = []
for (const stage of [
  'blockout',
  'structural-pass',
  'form-refinement',
  'material-pass',
  'surface-pass',
  'lighting-pass',
  'interaction-pass',
  'optimization-pass'
]) {
  assertStageMayRun(stage, results)
  const result = evaluateStage(stage, parsed)
  assert.equal(result.status, 'passed')
  results.push(result)
}
assert.equal(nextBuildStage(results), null)
assert.throws(() => assertStageMayRun('optimization-pass', []), /PIPELINE_STAGE_ORDER/)

const code = generateThreeJsFactory(parsed)
const review = deterministicReview(parsed, code)
assert.equal(review.status, 'passed')
assert.equal(review.authorship, 'deterministic-generator')
const singleQuotedComponentCode = code.replaceAll('"root"', "'root'")
const singleQuotedComponentReview = deterministicReview(parsed, singleQuotedComponentCode, 'assistant-authored')
assert.equal(singleQuotedComponentReview.status, 'passed')
assert.equal(singleQuotedComponentReview.checks.find((item) => item.code === 'component_coverage')?.passed, true)
const unsafeReview = deterministicReview(parsed, `${code}\nfetch('https://example.invalid')`, 'assistant-authored')
assert.equal(unsafeReview.status, 'failed')
assert.equal(unsafeReview.authorship, 'assistant-authored')
assert.equal(unsafeReview.checks.find((item) => item.code === 'no_external_io')?.passed, false)
const syntaxReview = deterministicReview(parsed, code.replace(/}\s*$/, ''), 'assistant-authored')
assert.equal(syntaxReview.status, 'failed')
assert.equal(syntaxReview.checks.find((item) => item.code === 'typescript_syntax')?.passed, false)
assert.match(syntaxReview.checks.find((item) => item.code === 'typescript_syntax')?.detail ?? '', /model\.ts:\d+:\d+/)
assert.match(code, /from 'three'/)
assert.doesNotMatch(code, /\bpython\b/i)
const crownSpec = SculptSpecSchema.parse(crownChestSpec(evidenceId))
const crownCode = generateThreeJsFactory(crownSpec)
const crownReview = deterministicReview(crownSpec, crownCode)
assert.equal(crownReview.status, 'passed')
assert.match(crownCode, /RoundedBoxGeometry/)
assert.match(crownCode, /TorusGeometry/)
assert.match(crownCode, /ExtrudeGeometry/)
assert.match(crownCode, /configureHeightColorRamp/)
assert.match(crownCode, /clearcoat: 0\.85/)
assert.match(crownCode, /emissive: "#ffbc2e"/)
assert.match(crownCode, /animations\.set\("open_lid"/)
assert.match(crownCode, /applyPivot/)
assert.equal(crownSpec.components.length, 18)
const viewerScene = toViewerScene(parsed)
assert.equal(viewerScene.schemaVersion, '1.0.0')
assert.deepEqual(Object.keys(viewerScene).sort(), [
  'animationClips',
  'components',
  'materials',
  'pivots',
  'projectName',
  'route',
  'schemaVersion'
])
assert.deepEqual(Object.keys(viewerScene.components[0]).sort(), [
  'geometry',
  'id',
  'materialId',
  'name',
  'parentId',
  'position',
  'primitive',
  'rotation',
  'scale'
])
assert.equal(JSON.stringify(viewerScene).includes('evidenceIds'), false)

assert.doesNotThrow(() => assertBaseRevision(4, 4))
assert.throws(() => assertBaseRevision(5, 4), /REVISION_CONFLICT:5/)

assert.equal(
  queueJobKey(runId, 'blockout', 1),
  `img2threejs__${runId}__blockout__r1`
)
assert.equal(stableCursor({ status: 'running', revision: 1, stageResults: results, failureCodes: [] }).length, 24)

assert.equal(IMG2THREEJS_ARTIFACT_NAMESPACE, 'img2threejs')
assert.equal(
  IMG2THREEJS_TABLES.project,
  pluginArtifactTableName(IMG2THREEJS_ARTIFACT_NAMESPACE, 'project')
)
assert.ok(Object.values(IMG2THREEJS_TABLES).every((name) => name.startsWith('plugin_img2threejs_')))
assert.ok(IMG2THREEJS_QUEUE_NAME.startsWith('img2threejs.'))
assert.ok(IMG2THREEJS_VIEW_KEY.startsWith('img2threejs.'))
assert.ok(IMG2THREEJS_ROUTE_PREFIX.startsWith('img2threejs/'))
const scopedWhere = scopedIdWhere({
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  userId: 'user-a',
  workspaceId: null,
  projectId: null,
  xpertId: null
}, evidenceId)
assert.equal(scopedWhere.tenantId, 'tenant-a')
assert.equal(scopedWhere.organizationId, 'org-a')
assert.equal(scopedWhere.id, evidenceId)

assert.equal(SubmitImagesToolSchema.safeParse({
  projectId: evidenceId,
  images: [{ filePath: '/workspace/a.png', label: 'front', view: 'front' }],
  changeSummary: 'Admit the front reference.',
  tenantId: 'must-not-be-model-visible'
}).success, false)
assert.equal(AuthorCodeToolSchema.safeParse({
  projectId: evidenceId,
  specVersionId: runId,
  mode: 'create',
  baseCodeVersionId: null,
  source: 'x'.repeat(500),
  changeSummary: 'Assistant-authored executable Three.js source.'
}).success, true)
const authorCodeWithoutSummary = AuthorCodeToolSchema.safeParse({
  projectId: evidenceId,
  specVersionId: runId,
  mode: 'create',
  baseCodeVersionId: null,
  source: 'x'.repeat(500)
})
assert.equal(authorCodeWithoutSummary.success, true)
assert.match(
  authorCodeWithoutSummary.success ? authorCodeWithoutSummary.data.changeSummary : '',
  /complete object-specific Three\.js TypeScript replacement/
)
assert.equal(AuthorCodeToolSchema.safeParse({
  projectId: evidenceId,
  specVersionId: runId,
  mode: 'refine',
  baseCodeVersionId: null,
  source: 'x'.repeat(500),
  changeSummary: 'Invalid refine request.'
}).success, false)
assert.equal(EnqueueStageToolSchema.safeParse({
  projectId: evidenceId,
  stage: 'material-pass',
  changeSummary: 'Queue material pass.'
}).success, true)
assert.equal(CancelRunToolSchema.safeParse({
  projectId: evidenceId,
  runId,
  changeSummary: 'Cancel this run.',
  extra: true
}).success, false)
const legacySpecRevisionParse = PatchSpecToolSchema.safeParse({
  projectId: evidenceId,
  sourceSpecVersionId: runId,
  silhouetteIntent: 'Preserve the evidence-backed primary silhouette.',
  confidence: 0.95,
  changeSummary: 'Old caller-managed concurrency input is ignored.',
  baseRevision: 1
})
assert.equal(legacySpecRevisionParse.success, true)
assert.equal('baseRevision' in legacySpecRevisionParse.data, false)
const legacyRunRevisionParse = CancelRunToolSchema.safeParse({
  projectId: evidenceId,
  runId,
  changeSummary: 'Old caller-managed concurrency input is ignored.',
  runRevision: 1
})
assert.equal(legacyRunRevisionParse.success, true)
assert.equal('runRevision' in legacyRunRevisionParse.data, false)

const safeAsset = summarizeAsset({
  name: 'model.ts',
  mimeType: 'text/typescript',
  size: 128,
  sha256: 'a'.repeat(64),
  filePath: 'private/model.ts',
  scopeId: 'private-scope'
})
assert.deepEqual(Object.keys(safeAsset).sort(), ['mimeType', 'name', 'sha256', 'size'])

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
assert.equal(packageJson.xpert.plugin.level, 'system')
assert.equal(packageJson.xpert.plugin.artifactNamespace, IMG2THREEJS_ARTIFACT_NAMESPACE)
assert.equal(packageJson.peerDependencies['@xpert-ai/plugin-sdk'], '^3.15.18')
assert.equal(packageJson.peerDependencies['@xpert-ai/contracts'], '^3.15.18')
assert.ok(packageJson.files.includes('skills'))
assert.deepEqual(
  img2ThreeJsPlugin.templates?.[0]?.dependencies?.skills,
  [{
    componentKey: 'img2threejs-semantic-modeling',
    targetAgentKey: 'Agent_Img2ThreeJs'
  }]
)
const pluginManifest = JSON.parse(readFileSync(join(packageRoot, '.xpertai-plugin', 'plugin.json'), 'utf8'))
assert.equal(pluginManifest.skills, './skills/')
assert.ok(pluginManifest.targetApps.includes('xpert'))
const skillContent = readFileSync(
  join(packageRoot, 'skills', 'img2threejs-semantic-modeling', 'SKILL.md'),
  'utf8'
)
assert.match(skillContent, /img2threejs_read_evidence/)
assert.match(skillContent, /img2threejs_update_spec/)
assert.match(skillContent, /img2threejs_patch_spec/)
assert.match(skillContent, /img2threejs_wait_run/)
assert.match(skillContent, /img2threejs_read_visual_diagnostics/)
assert.match(skillContent, /optimization-pass/)
assert.doesNotMatch(skillContent, /Activate this Skill in every modeling turn/)
assert.doesNotMatch(skillContent, /keep the successful `read_skill_file` result visible/)
assert.doesNotMatch(skillContent, /\b(?:baseRevision|expectedRevision|runRevision|projectRevision)\b/)
assert.match(skillContent, /at or below 8,000 characters/)
assert.match(skillContent, /never call\s+`sandbox_write_file` for that path again/)
assert.match(skillContent, /non-empty `error` field is a failed operation/)
assert.match(skillContent, /does not invalidate or roll back the current\s+valid Spec/)
assert.equal(
  minimumComponentCountFromReview('将 qualityContract.minimumComponentCount 提升到至少 55，实际至少 55 个可见体块。'),
  55
)
assert.equal(
  minimumComponentCountFromReview('Require at least 72 auditable components without lowering thresholds.'),
  72
)
assert.equal(minimumComponentCountFromReview('Refine the camera only.'), null)
const assistantDsl = readFileSync(join(packageRoot, 'src', 'xpert-img2threejs-assistant.yaml'), 'utf8')
assert.match(assistantDsl, /Build reviewable Img2ThreeJs projects/)
assert.doesNotMatch(assistantDsl, /first call read_skill_file/)
assert.doesNotMatch(assistantDsl, /execution record must retain a successful read_skill_file/)
assert.doesNotMatch(assistantDsl, /\b(?:baseRevision|expectedRevision|runRevision|projectRevision)\b/)
assert.match(assistantDsl, /normal progressive-disclosure workflow/)
assert.match(assistantDsl, /detailed modeling procedure belongs to that Skill/)
assert.match(assistantDsl, /Caller-managed concurrency fields do not exist/)
assert.match(assistantDsl, /never\s+copy, translate, or adapt source/)
assert.doesNotMatch(assistantDsl, /Follow this durable workflow/)
assert.match(assistantDsl, /provider: SandboxFile/)
assert.match(assistantDsl, /provider: SandboxShell/)
assert.deepEqual(
  [...img2ThreeJsToolsForNextAction('submit_review')].sort(),
  ['img2threejs_get_status', 'img2threejs_read_visual_diagnostics', 'img2threejs_submit_review'].sort()
)
assert.ok(img2ThreeJsToolsForNextAction('read_visual_diagnostics_then_refine_code').has('img2threejs_read_code'))
assert.ok(img2ThreeJsToolsForNextAction('read_visual_diagnostics_then_refine_code').has('img2threejs_author_code_file'))
assert.equal(img2ThreeJsToolsForNextAction('read_visual_diagnostics_then_refine_code').has('img2threejs_patch_code'), false)
assert.equal(img2ThreeJsToolsForNextAction('read_visual_diagnostics_then_refine_code').has('img2threejs_revalidate_code'), false)
assert.equal(img2ThreeJsToolsForNextAction('unknown_future_action'), null)
assert.equal(img2ThreeJsActionAllowsSandbox('submit_review'), false)
assert.equal(img2ThreeJsActionAllowsSandbox('wait_run'), false)
assert.equal(img2ThreeJsActionAllowsSandbox('author_code'), true)
assert.equal(img2ThreeJsActionAllowsSandbox('read_visual_diagnostics_then_refine_code'), true)
assert.equal(isImg2ThreeJsToolAllowedForNextAction('img2threejs_patch_spec', 'submit_review'), false)
assert.equal(isImg2ThreeJsToolAllowedForNextAction('img2threejs_submit_review', 'submit_review'), true)
assert.equal(isImg2ThreeJsToolAllowedForNextAction('img2threejs_patch_spec', 'unknown_future_action'), true)
const remoteRoot = join(packageRoot, 'src', 'lib', 'remote-components', 'review-workbench')
const remoteScript = readFileSync(join(remoteRoot, 'app.js'), 'utf8')
const remoteStyle = readFileSync(join(remoteRoot, 'app.css'), 'utf8')
assert.match(remoteScript, /xpertai\.remote_component/)
assert.match(remoteScript, /submit_review/)
assert.match(remoteScript, /cancel_run/)
assert.match(remoteScript, /create_project/)
assert.match(remoteScript, /upload_reference/)
assert.match(remoteScript, /start_generation/)
assert.doesNotMatch(remoteScript, /advance_generation/)
assert.match(remoteScript, /semantic-3d/)
assert.match(remoteScript, /WebGLRenderer/)
assert.match(remoteScript, /threejs-viewer/)
assert.doesNotMatch(remoteScript, /window\.confirm/)
assert.match(remoteStyle, /\.stage-monitor/)
assert.match(remoteStyle, /\.new-project-button/)
assert.match(remoteStyle, /\.upload-zone/)
assert.match(remoteStyle, /\.confirm-dialog/)
assert.match(remoteStyle, /\.viewer-viewport/)

const missingProjectController = new Img2ThreeJsController({
  async getStatus() {
    throw new Error('PROJECT_NOT_FOUND')
  }
})
await assert.rejects(
  missingProjectController.getSummary(evidenceId),
  (error) => error?.getStatus?.() === 404 && error?.message === 'PROJECT_NOT_FOUND'
)

const publicSummaryController = new Img2ThreeJsController({
  async getStatus() {
    return {
      projectId: evidenceId,
      revision: 9,
      runRevision: 4,
      status: 'review_required',
      nextActionInput: {
        projectId: evidenceId,
        baseRevision: 9,
        revisionRecovery: { expectedRevision: 8, recoveredFromExpectedRevision: 8 }
      }
    }
  }
})
const publicSummary = await publicSummaryController.getSummary(evidenceId)
assert.deepEqual(publicSummary, {
  projectId: evidenceId,
  status: 'review_required'
})

console.log('img2threejs focused contract tests passed')
