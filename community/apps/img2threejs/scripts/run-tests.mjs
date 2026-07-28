import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  CancelRunToolSchema,
  EnqueueStageToolSchema,
  SubmitImagesToolSchema
} from '../dist/lib/tool-schemas.js'
import { Img2ThreeJsController } from '../dist/lib/img2threejs.controller.js'
import { Img2ThreeJsViewProvider } from '../dist/lib/img2threejs-view.provider.js'
import {
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
      status: 'succeeded',
      action: 'img2threejs.review-render',
      actionVersion: '1.0.0',
      quality: failedGateQuality
    }
  }, 'approved', 'continue'),
  /REFERENCE_FIDELITY_GATE_BLOCKED/
)

const viewProvider = new Img2ThreeJsViewProvider(
  {},
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
      projectId: evidenceId,
      baseRevision: 7
    }
  }
)
assert.equal(semanticAction.success, true)
assert.equal(semanticAction.data.clientCommand.commandKey, 'assistant.chat.send_message')
assert.equal(semanticAction.data.clientCommand.payload.state.img2threejs.projectId, evidenceId)
assert.equal(semanticAction.data.clientCommand.payload.state.img2threejs.expectedRevision, 7)
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
  baseRevision: 1,
  images: [{ filePath: '/workspace/a.png', label: 'front', view: 'front' }],
  changeSummary: 'Admit the front reference.',
  tenantId: 'must-not-be-model-visible'
}).success, false)
assert.equal(EnqueueStageToolSchema.safeParse({
  projectId: evidenceId,
  baseRevision: 1,
  stage: 'material-pass',
  changeSummary: 'Queue material pass.'
}).success, true)
assert.equal(CancelRunToolSchema.safeParse({
  projectId: evidenceId,
  runId,
  baseRevision: 1,
  changeSummary: 'Cancel this run.',
  extra: true
}).success, false)

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
assert.match(skillContent, /img2threejs_wait_run/)
assert.match(skillContent, /optimization-pass/)
const assistantDsl = readFileSync(join(packageRoot, 'src', 'xpert-img2threejs-assistant.yaml'), 'utf8')
assert.match(assistantDsl, /Use the installed img2threejs-semantic-modeling Skill/)
assert.doesNotMatch(assistantDsl, /Follow this durable workflow/)
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

console.log('img2threejs focused contract tests passed')
