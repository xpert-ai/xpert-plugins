import 'reflect-metadata'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import {
  ArtifactsRuntimeCapability,
  DefaultRuntimeCapabilityRegistry,
  MANAGED_QUEUE_SERVICE_TOKEN,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { BUILD_STAGES, TOOL_NAMES } from '../dist/lib/constants.js'
import { IMG2THREEJS_ENTITIES } from '../dist/lib/entities/index.js'
import { Img2ThreeJsAgentQueryService } from '../dist/lib/img2threejs-agent-query.service.js'
import { Img2ThreeJsMiddleware } from '../dist/lib/img2threejs.middleware.js'
import { Img2ThreeJsRenderService } from '../dist/lib/img2threejs-render.service.js'
import { Img2ThreeJsService } from '../dist/lib/img2threejs.service.js'
import { Img2ThreeJsStudioService } from '../dist/lib/img2threejs-studio.service.js'
import { Img2ThreeJsWorkbenchService } from '../dist/lib/img2threejs-workbench.service.js'

const scope = {
  tenantId: 'tenant-integration',
  organizationId: 'organization-integration',
  userId: 'user-integration',
  workspaceId: 'workspace-integration',
  projectId: '90000000-0000-4000-8000-000000000001',
  xpertId: null
}

test('Agent tools and backend services complete the persisted quality-gated pipeline', async () => {
  const dataSource = new DataSource({
    type: 'sqljs',
    entities: [...IMG2THREEJS_ENTITIES],
    synchronize: true,
    dropSchema: true,
    logging: false
  })
  await dataSource.initialize()
  const workspace = new InMemoryWorkspaceFiles()
  workspace.seed('references/front.png', pngFixture(640, 640), 'image/png')
  workspace.seed('references/three-quarter.png', pngFixture(800, 600), 'image/png')
  const queue = new InMemoryManagedQueue()
  const artifacts = new InMemoryArtifacts()
  const sandbox = new InMemorySandboxJobs(workspace)
  const runtimeCapabilities = new DefaultRuntimeCapabilityRegistry()
    .register(WorkspaceFilesRuntimeCapability, workspace)
    .register(ArtifactsRuntimeCapability, artifacts)
    .register(SandboxJobsRuntimeCapability, sandbox)
  const pluginContext = createPluginContext(queue)
  const renderService = new Img2ThreeJsRenderService(
    dataSource.getRepository(IMG2THREEJS_ENTITIES[0]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[1]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[2]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[3]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[4]),
    pluginContext,
    runtimeCapabilities
  )
  const service = new Img2ThreeJsService(
    dataSource.getRepository(IMG2THREEJS_ENTITIES[0]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[1]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[2]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[3]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[4]),
    pluginContext,
    runtimeCapabilities,
    renderService
  )
  const studio = new Img2ThreeJsStudioService(
    dataSource.getRepository(IMG2THREEJS_ENTITIES[0]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[1]),
    service,
    runtimeCapabilities
  )
  const workbenchService = new Img2ThreeJsWorkbenchService(
    dataSource.getRepository(IMG2THREEJS_ENTITIES[0]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[1]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[4]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[2]),
    service,
    runtimeCapabilities
  )
  const agentQuery = new Img2ThreeJsAgentQueryService(
    dataSource.getRepository(IMG2THREEJS_ENTITIES[0]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[1]),
    runtimeCapabilities
  )
  const middleware = new Img2ThreeJsMiddleware(service, agentQuery)
  const emittedEvents = []
  const agentMiddleware = await middleware.createMiddleware({}, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    node: {},
    tools: new Map(),
    runtime: {
      capabilities: runtimeCapabilities,
      createModelClient: async () => {
        throw new Error('MODEL_CLIENT_NOT_USED')
      },
      wrapWorkflowNodeExecution: async () => {
        throw new Error('WORKFLOW_NODE_NOT_USED')
      },
      emitMiddlewareEvent: async (event) => emittedEvents.push(event)
    }
  })

  try {
    const invoke = createToolInvoker(agentMiddleware.tools)
    const created = await invoke(TOOL_NAMES.createProject, {
      name: 'Integration Character',
      route: 'character',
      modelingMode: 'semantic-3d',
      changeSummary: 'Create the integration modeling project.'
    })
    assert.equal(created.revision, 1)

    const admitted = await invoke(TOOL_NAMES.submitImages, {
      projectId: created.projectId,
      baseRevision: created.revision,
      images: [
        { filePath: 'references/front.png', label: 'Front', view: 'front' },
        { filePath: 'references/three-quarter.png', label: 'Three-quarter', view: 'three-quarter' }
      ],
      changeSummary: 'Admit deterministic reference evidence.'
    })
    assert.equal(admitted.admitted, 2)
    assert.equal(admitted.rejected, 0)
    assert.equal(admitted.evidenceIds.length, 2)
    const discovered = await invoke(TOOL_NAMES.listProjects, {
      status: 'awaiting_spec',
      page: 1,
      pageSize: 10
    })
    assert.equal(discovered.items[0].projectId, created.projectId)
    assert.equal(discovered.items[0].modelingMode, 'semantic-3d')
    const listedEvidence = await invoke(TOOL_NAMES.listEvidence, {
      projectId: created.projectId,
      expectedRevision: admitted.revision
    })
    assert.equal(listedEvidence.images.length, 2)
    const spec = sculptSpecFixture(admitted.evidenceIds)
    await assert.rejects(
      invoke(TOOL_NAMES.updateSpec, {
        projectId: created.projectId,
        baseRevision: admitted.revision,
        spec,
        confidence: 0.94,
        changeSummary: 'Attempt a Spec mutation before inspecting image pixels.'
      }),
      new RegExp(`EVIDENCE_INSPECTION_REQUIRED.*${admitted.evidenceIds[0]}.*${admitted.evidenceIds[1]}`)
    )
    const readableEvidence = await invoke(TOOL_NAMES.readEvidence, {
      projectId: created.projectId,
      evidenceId: admitted.evidenceIds[0],
      expectedRevision: admitted.revision
    })
    assert.equal(readableEvidence.semanticAnalysisOwner, 'agent-chat')
    assert.equal(readableEvidence.nextAction, 'inspect_image_multimodally')
    assert.match(readableEvidence.evidence.previewUrl, /^https:\/\/artifacts\.example\//)
    assert.equal(readableEvidence.evidence.workspaceFile.source, 'platform.workspace.files')
    const admittedFrontFile = workspace.files.get('references/front.png')
    const admittedFrontMimeType = admittedFrontFile.mimeType
    delete admittedFrontFile.mimeType
    const readEvidenceTool = agentMiddleware.tools.find((tool) => tool.name === TOOL_NAMES.readEvidence)
    assert.ok(readEvidenceTool)
    const wrapEvidenceRead = async (evidenceId, callId) => {
      const raw = await invoke(TOOL_NAMES.readEvidence, {
        projectId: created.projectId,
        evidenceId,
        expectedRevision: admitted.revision
      })
      return agentMiddleware.wrapToolCall({
        toolCall: {
          id: callId,
          name: TOOL_NAMES.readEvidence,
          args: {
            projectId: created.projectId,
            evidenceId,
            expectedRevision: admitted.revision
          }
        },
        tool: readEvidenceTool,
        state: { messages: [] },
        runtime: {}
      }, async () => new ToolMessage({
        content: JSON.stringify(raw),
        name: TOOL_NAMES.readEvidence,
        tool_call_id: callId,
        status: 'success'
      }))
    }
    const enrichedEvidence = await agentMiddleware.wrapToolCall({
      toolCall: {
        id: 'read-evidence-call',
        name: TOOL_NAMES.readEvidence,
        args: {
          projectId: created.projectId,
          evidenceId: admitted.evidenceIds[0],
          expectedRevision: admitted.revision
        }
      },
      tool: readEvidenceTool,
      state: { messages: [] },
      runtime: {}
    }, async () => new ToolMessage({
      content: JSON.stringify(readableEvidence),
      name: TOOL_NAMES.readEvidence,
      tool_call_id: 'read-evidence-call',
      status: 'success'
    }))
    assert.ok(enrichedEvidence instanceof ToolMessage)
    assert.equal(enrichedEvidence.artifact.type, 'img2threejs.reference-image')
    assert.equal(enrichedEvidence.artifact.revision, admitted.revision)
    assert.equal(enrichedEvidence.artifact.evidenceId, admitted.evidenceIds[0])
    assert.match(enrichedEvidence.artifact.dataUrl, /^data:image\/png;base64,/)
    assert.equal(String(enrichedEvidence.content).includes('base64,'), false)
    const enrichedContent = JSON.parse(enrichedEvidence.content)
    assert.equal(enrichedContent.imageAttachmentAvailable, true)
    assert.equal('multimodalAvailable' in enrichedContent, false)
    assert.equal(enrichedContent.projectRevision, admitted.revision)
    assert.equal(enrichedContent.nextAction, 'verify_model_vision_then_inspect_attached_image_pixels')

    let unavailableVisionRequest
    await agentMiddleware.wrapModelCall({
      messages: [enrichedEvidence],
      model: {},
      systemPrompt: '',
      tools: agentMiddleware.tools,
      state: { messages: [enrichedEvidence] },
      runtime: {}
    }, async (request) => {
      unavailableVisionRequest = request
      return new AIMessage('Request input because this model cannot inspect images.')
    })
    const unavailableNotice = unavailableVisionRequest.messages.at(-1)
    assert.equal(unavailableNotice.getType(), 'human')
    assert.match(unavailableNotice.content, /MODEL_VISION_UNAVAILABLE/)
    assert.equal(unavailableVisionRequest.messages.length, 2)

    let capturedModelRequest
    const modelResponse = await agentMiddleware.wrapModelCall({
      messages: [enrichedEvidence],
      model: { profile: { imageInputs: true } },
      systemPrompt: '',
      tools: agentMiddleware.tools,
      state: { messages: [enrichedEvidence] },
      runtime: {}
    }, async (request) => {
      capturedModelRequest = request
      return new AIMessage('Semantic inspection completed from attached pixels.')
    })
    assert.equal(modelResponse.content, 'Semantic inspection completed from attached pixels.')
    const attachmentMessage = capturedModelRequest.messages.at(-1)
    assert.equal(attachmentMessage.getType(), 'human')
    assert.match(attachmentMessage.content[0].text, /authoritative uploaded pixels/)
    assert.equal(attachmentMessage.content[1].type, 'image_url')
    assert.match(attachmentMessage.content[1].image_url.url, /^data:image\/png;base64,/)
    assert.equal(capturedModelRequest.messages.length, 2)

    let persistedAttachmentRequest
    const interveningToolResult = new ToolMessage({
      content: JSON.stringify({ validationStatus: 'valid' }),
      name: TOOL_NAMES.validateSpec,
      tool_call_id: 'validate-after-evidence',
      status: 'success'
    })
    await agentMiddleware.wrapModelCall({
      messages: [
        new HumanMessage('Regenerate from the admitted reference.'),
        enrichedEvidence,
        new AIMessage('I will validate the evidence-backed draft.'),
        interveningToolResult
      ],
      model: { profile: { imageInputs: true } },
      systemPrompt: '',
      tools: agentMiddleware.tools,
      state: { messages: [] },
      runtime: {}
    }, async (request) => {
      persistedAttachmentRequest = request
      return new AIMessage('The authoritative reference remains attached.')
    })
    const persistedAttachmentMessage = persistedAttachmentRequest.messages.at(-1)
    assert.equal(persistedAttachmentMessage.getType(), 'human')
    assert.match(persistedAttachmentMessage.content[0].text, /authoritative uploaded pixels/)
    assert.equal(persistedAttachmentMessage.content[1].type, 'image_url')
    assert.equal(persistedAttachmentRequest.messages.length, 5)

    let nextTurnRequest
    await agentMiddleware.wrapModelCall({
      messages: [
        enrichedEvidence,
        new HumanMessage('Unrelated next user turn.'),
        new AIMessage('No image tool was called in this turn.')
      ],
      model: {},
      systemPrompt: '',
      tools: agentMiddleware.tools,
      state: { messages: [] },
      runtime: {}
    }, async (request) => {
      nextTurnRequest = request
      return new AIMessage('No stale reference attachment.')
    })
    assert.equal(nextTurnRequest.messages.length, 3)
    admittedFrontFile.mimeType = admittedFrontMimeType

    const admittedFrontBytes = admittedFrontFile.buffer
    admittedFrontFile.buffer = Buffer.from(admittedFrontBytes)
    admittedFrontFile.buffer[20] ^= 0xff
    await assert.rejects(
      agentQuery.readEvidenceImage(scope, {
        projectId: created.projectId,
        evidenceId: admitted.evidenceIds[0]
      }),
      /MULTIMODAL_IMAGE_UNAVAILABLE: reference image checksum changed/
    )
    admittedFrontFile.buffer = admittedFrontBytes

    const regenerationTurn = new HumanMessage('Reinspect all admitted images before revising the Spec.')
    const rereadFront = await wrapEvidenceRead(admitted.evidenceIds[0], 'reread-front')
    await agentMiddleware.wrapModelCall({
      messages: [regenerationTurn, rereadFront],
      model: { profile: { imageInputs: true } },
      systemPrompt: '',
      tools: agentMiddleware.tools,
      state: { messages: [] },
      runtime: {}
    }, async () => new AIMessage('Front pixels inspected.'))
    await assert.rejects(
      invoke(TOOL_NAMES.updateSpec, {
        projectId: created.projectId,
        baseRevision: admitted.revision,
        spec,
        confidence: 0.94,
        changeSummary: 'Attempt a Spec mutation after inspecting only one image.'
      }),
      new RegExp(`EVIDENCE_INSPECTION_REQUIRED.*${admitted.evidenceIds[1]}`)
    )
    const rereadThreeQuarter = await wrapEvidenceRead(
      admitted.evidenceIds[1],
      'reread-three-quarter'
    )
    await agentMiddleware.wrapModelCall({
      messages: [regenerationTurn, rereadFront, rereadThreeQuarter],
      model: { profile: { imageInputs: true } },
      systemPrompt: '',
      tools: agentMiddleware.tools,
      state: { messages: [] },
      runtime: {}
    }, async () => new AIMessage('All admitted pixels inspected.'))
    const specResult = await invoke(TOOL_NAMES.updateSpec, {
      projectId: created.projectId,
      baseRevision: admitted.revision,
      spec,
      confidence: 0.94,
      changeSummary: 'Save the validated integration Sculpt Spec.'
    })
    assert.equal(specResult.validationStatus, 'valid')
    const validation = await invoke(TOOL_NAMES.validateSpec, {
      projectId: created.projectId,
      expectedRevision: specResult.revision
    })
    assert.equal(validation.valid, true)

    await assert.rejects(
      invoke(TOOL_NAMES.enqueueStage, {
        projectId: created.projectId,
        baseRevision: admitted.revision,
        stage: 'blockout',
        changeSummary: 'Attempt a stale stage mutation.'
      }),
      /REVISION_CONFLICT/
    )

    const buildStart = await invoke(TOOL_NAMES.enqueueStage, {
      projectId: created.projectId,
      baseRevision: validation.revision,
      stage: 'blockout',
      changeSummary: 'Start the ordered Managed Queue build chain.'
    })
    assert.equal(buildStart.stage, 'blockout')

    for (const stage of BUILD_STAGES) {
      const queued = queue.last()
      assert.equal(queued.queueName, 'img2threejs.pipeline')
      assert.equal(queued.jobName, 'img2threejs.run-stage')
      assert.equal(queued.payload.requestedStage, stage)
      assert.equal(queued.jobId.includes(':'), false)
      assert.match(queued.jobId, /^img2threejs__[0-9a-f-]{36}__[a-z-]+__r\d+$/)
      assert.equal(queued.tenantId, scope.tenantId)
      assert.equal(queued.organizationId, scope.organizationId)
      assert.equal(containsBinaryPayload(queued), false)
      await service.processStage(scope, queued.payload)
      const after = await invoke(TOOL_NAMES.getStatus, { projectId: created.projectId })
      assert.ok(after.completedStages.includes(stage))
    }

    const renderJob = queue.last()
    assert.equal(renderJob.jobName, 'img2threejs.review-render')
    assert.equal(renderJob.executionPool, 'sandbox-browser')
    assert.deepEqual(Object.keys(renderJob.payload), ['runId'])
    assert.equal(containsBinaryPayload(renderJob), false)
    await renderService.processRender({
      id: renderJob.jobId,
      name: renderJob.jobName,
      data: renderJob.payload,
      attemptsMade: 0,
      opts: { attempts: 3 }
    }, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      userId: scope.userId
    })

    const completedBuild = await invoke(TOOL_NAMES.getStatus, { projectId: created.projectId })
    assert.equal(completedBuild.deterministicStatus, 'passed')
    assert.equal(completedBuild.visualStatus, 'pending_human')
    assert.equal(completedBuild.completedStages.length, 8)
    assert.equal(completedBuild.status, 'review_required')

    const artifact = await invoke(TOOL_NAMES.readArtifact, { projectId: created.projectId })
    assert.equal(artifact.sourceAsset.name, 'model-v1.ts')
    assert.equal(artifact.comparisonAsset.name, 'comparison-browser.png')
    assert.match(artifact.comparisonPreviewUrl, /^https:\/\/artifacts\.example\//)
    assert.deepEqual(Object.keys(artifact.sourceAsset).sort(), ['mimeType', 'name', 'sha256', 'size'])
    assert.equal(artifact.capabilities.artifacts.available, true)
    assert.equal(artifact.capabilities.sandboxRender.available, true)
    assert.equal(artifact.capabilities.sandboxRender.code, 'available')
    assert.equal(artifact.capabilities.sandboxRender.action, 'img2threejs.review-render')
    assert.equal(artifact.capabilities.sandboxRender.workerCount, 1)
    assert.equal(sandbox.runs.length, 1)
    assert.equal(sandbox.runs[0].action, 'img2threejs.review-render')
    assert.equal(sandbox.runs[0].files.length, 3)
    assert.ok(sandbox.runs[0].files.every((file) => file.reference.source === 'platform.workspace.files'))
    assert.equal(containsBinaryPayload(sandbox.runs[0].payload), false)
    const generatedSource = workspace.text('img2threejs/', 'model-v1.ts')
    assert.match(generatedSource, /from 'three'/)
    assert.match(generatedSource, /const component_root = new THREE\.Group\(\)/)
    assert.match(generatedSource, /const component_root_mesh = new THREE\.Mesh\(/)
    assert.match(generatedSource, /component_root_mesh\.scale\.set\(/)
    assert.match(generatedSource, /component_root\.add\(component_root_mesh\)/)
    assert.match(workspace.text('img2threejs/', 'comparison-v1.svg'), /<svg/)

    const exported = await invoke(TOOL_NAMES.exportArtifact, {
      projectId: created.projectId,
      changeSummary: 'Export the generated model package.'
    })
    assert.equal(exported.status, 'artifact_published')
    assert.equal(exported.nextAction, 'read_platform_artifact')
    assert.equal(exported.publishedArtifacts.model.outcome, 'created')
    assert.equal(exported.publishedArtifacts.comparison.outcome, 'created')
    assert.deepEqual(
      Object.keys(exported.publishedArtifacts.model).sort(),
      ['artifactId', 'outcome', 'versionId']
    )
    assert.equal(artifacts.created.length, 6)
    assert.equal(artifacts.versions.length, 6)
    assert.equal(artifacts.created.filter((item) => item.kind === 'image').length, 3)
    assert.equal(artifacts.versions.filter((item) => item.mimeType === 'text/plain').length, 2)
    assert.equal(artifacts.versions.filter((item) => item.mimeType === 'image/png').length, 4)
    assert.ok(artifacts.versions.every((item) =>
      item.workspaceFileRef.source === 'platform.workspace.files' &&
      item.workspaceFileRef.tenantId === scope.tenantId &&
      item.workspaceFileRef.projectId === scope.projectId
    ))

    const reviewed = await invoke(TOOL_NAMES.submitReview, {
      projectId: created.projectId,
      runId: completedBuild.runId,
      baseRevision: completedBuild.runRevision,
      humanReviewStatus: 'approved',
      decision: 'stop',
      notes: 'Integration review approved deterministic and comparison evidence.',
      changeSummary: 'Approve and stop the completed modeling pipeline.'
    })
    assert.equal(reviewed.status, 'completed')
    assert.equal(reviewed.nextDecision, 'stop')
    assert.equal(reviewed.alreadyPersisted, false)
    const duplicateReview = await invoke(TOOL_NAMES.submitReview, {
      projectId: created.projectId,
      runId: completedBuild.runId,
      baseRevision: reviewed.revision,
      humanReviewStatus: 'approved',
      decision: 'stop',
      notes: 'Integration review approved deterministic and comparison evidence.',
      changeSummary: 'Confirm the already persisted review decision.'
    })
    assert.equal(duplicateReview.alreadyPersisted, true)
    assert.equal(duplicateReview.revision, reviewed.revision)

    const runRepository = dataSource.getRepository(IMG2THREEJS_ENTITIES[4])
    const retrySeed = await runRepository.findOneByOrFail({ id: completedBuild.runId })
    retrySeed.status = 'review_required'
    retrySeed.renderReport = {
      status: 'failed',
      action: 'img2threejs.review-render',
      actionVersion: '1.0.0',
      failure: { code: 'BROWSER_LAUNCH_FAILED', message: 'Transient browser failure.', retryable: true }
    }
    retrySeed.visualReview = {
      ...retrySeed.visualReview,
      renderStatus: 'failed',
      capabilityReason: 'Transient browser failure.'
    }
    await runRepository.save(retrySeed)
    const retryableStatus = await invoke(TOOL_NAMES.getStatus, { projectId: created.projectId })
    const retried = await invoke(TOOL_NAMES.retryRun, {
      projectId: created.projectId,
      runId: completedBuild.runId,
      baseRevision: retryableStatus.runRevision,
      changeSummary: 'Retry a retryable browser render.'
    })
    assert.equal(retried.stage, 'browser-render')
    const retriedJob = queue.last()
    assert.equal(retriedJob.executionPool, 'sandbox-browser')
    const cancelStatus = await invoke(TOOL_NAMES.getStatus, { projectId: created.projectId })
    const cancelled = await invoke(TOOL_NAMES.cancelRun, {
      projectId: created.projectId,
      runId: completedBuild.runId,
      baseRevision: cancelStatus.runRevision,
      changeSummary: 'Cancel both queue and Sandbox Job layers.'
    })
    assert.equal(cancelled.status, 'cancelled')
    assert.ok(queue.cancelled.has(retriedJob.jobId))
    assert.ok(sandbox.cancelled.has(completedBuild.runId))
    const cancelledProject = await service.getStatus(scope, created.projectId)
    const regenerated = await studio.startGeneration(scope, {
      projectId: created.projectId,
      baseRevision: cancelledProject.revision
    })
    assert.equal(regenerated.semanticAnalysisOwner, 'agent-chat')
    assert.equal(regenerated.nextAction, 'ask_agent_to_analyze_evidence')
    assert.match(regenerated.suggestedPrompt, /img2threejs-semantic-modeling/)
    assert.match(regenerated.suggestedPrompt, /regenerate_from_references/)
    assert.match(regenerated.suggestedPrompt, new RegExp(created.projectId))
    assert.doesNotMatch(regenerated.suggestedPrompt, /严格顺序/)
    assert.ok(regenerated.suggestedPrompt.length < 900)
    assert.ok(regenerated.evidenceIds.length >= 2)
    assert.ok(regenerated.evidenceIds.every((id) => regenerated.suggestedPrompt.includes(id)))

    await assert.rejects(
      service.getStatus({ ...scope, organizationId: 'another-organization' }, created.projectId),
      /PROJECT_NOT_FOUND/
    )
    await assert.rejects(
      invoke(TOOL_NAMES.createProject, {
        name: 'Unknown key should fail',
        route: 'object',
        modelingMode: 'semantic-3d',
        changeSummary: 'Validate strict tool input.',
        tenantId: scope.tenantId
      }),
      /schema|unrecognized|input/i
    )

    const studioProject = await studio.createProject(scope, {
      name: 'Studio upload integration',
      route: 'object',
      modelingMode: 'relief'
    })
    const studioAdmission = await studio.uploadReference(scope, {
      projectId: studioProject.projectId,
      baseRevision: studioProject.revision,
      label: 'Studio front reference',
      view: 'front',
      fileName: 'studio front.png',
      mimeType: 'image/png',
      buffer: pngFixture(640, 640)
    })
    assert.equal(studioAdmission.admitted, 1)
    const restoredWorkbench = await workbenchService.getData(scope, {
      projectId: studioProject.projectId
    })
    assert.match(restoredWorkbench.selected.images[0].previewUrl, /^https:\/\/artifacts\.example\//)
    assert.equal(artifacts.created.at(-1).kind, 'image')
    assert.equal(artifacts.created.at(-1).source.resourceType, 'reference-image')
    const studioStart = await studio.startGeneration(scope, {
      projectId: studioProject.projectId,
      baseRevision: studioAdmission.revision
    })
    assert.equal(studioStart.stage, 'blockout')
    assert.equal(studioStart.status, 'queued')
    assert.equal(queue.last().jobName, 'img2threejs.run-stage')
    const studioStatus = await service.getStatus(scope, studioProject.projectId)
    assert.equal(studioStatus.completedStages.length, 0)
    const studioProjectEntity = await dataSource.getRepository(IMG2THREEJS_ENTITIES[0])
      .findOneByOrFail({ id: studioProject.projectId })
    const studioSpecEntity = await dataSource.getRepository(IMG2THREEJS_ENTITIES[2])
      .findOneByOrFail({ id: studioProjectEntity.currentSpecVersionId })
    assert.equal(studioSpecEntity.spec.components[0].primitive, 'custom')
    assert.equal(studioSpecEntity.spec.components[0].geometry.type, 'heightfield')
    assert.equal(studioSpecEntity.spec.materials[0].vertexColors, true)
    assert.ok(studioSpecEntity.spec.components[0].geometry.heights.length >= 64)
    await assert.rejects(
      studio.advanceGeneration(scope, {
        projectId: studioProject.projectId,
        baseRevision: studioAdmission.revision
      }),
      /REVISION_CONFLICT/
    )

    assert.ok(queue.jobs.length >= BUILD_STAGES.length)
    const wrappedResult = await agentMiddleware.wrapToolCall({
      toolCall: {
        name: TOOL_NAMES.submitReview,
        args: { changeSummary: 'Publish an integration mutation event.' }
      }
    }, async () => 'wrapped')
    assert.equal(wrappedResult, 'wrapped')
    assert.deepEqual(emittedEvents.map((event) => event.status), ['running', 'success'])
    assert.ok(emittedEvents.every((event) => event.data?.tool && !('tenantId' in event.data)))
  } finally {
    await dataSource.destroy()
  }
})

test('a refined Sculpt Spec starts a new ordered pipeline run', async () => {
  const dataSource = new DataSource({
    type: 'sqljs',
    entities: [...IMG2THREEJS_ENTITIES],
    synchronize: true,
    dropSchema: true,
    logging: false
  })
  await dataSource.initialize()
  const workspace = new InMemoryWorkspaceFiles()
  workspace.seed('references/front.png', pngFixture(640, 640), 'image/png')
  workspace.seed('references/three-quarter.png', pngFixture(800, 600), 'image/png')
  const queue = new InMemoryManagedQueue()
  const artifacts = new InMemoryArtifacts()
  const sandbox = new InMemorySandboxJobs(workspace)
  const runtimeCapabilities = new DefaultRuntimeCapabilityRegistry()
    .register(WorkspaceFilesRuntimeCapability, workspace)
    .register(ArtifactsRuntimeCapability, artifacts)
    .register(SandboxJobsRuntimeCapability, sandbox)
  const pluginContext = createPluginContext(queue)
  const renderService = new Img2ThreeJsRenderService(
    dataSource.getRepository(IMG2THREEJS_ENTITIES[0]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[1]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[2]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[3]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[4]),
    pluginContext,
    runtimeCapabilities
  )
  const service = new Img2ThreeJsService(
    dataSource.getRepository(IMG2THREEJS_ENTITIES[0]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[1]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[2]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[3]),
    dataSource.getRepository(IMG2THREEJS_ENTITIES[4]),
    pluginContext,
    runtimeCapabilities,
    renderService
  )

  try {
    const created = await service.createProject(scope, {
      name: 'Spec refinement integration',
      route: 'character',
      modelingMode: 'semantic-3d'
    })
    const admitted = await service.submitImages(scope, {
      projectId: created.projectId,
      baseRevision: created.revision,
      images: [
        { filePath: 'references/front.png', label: 'Front', view: 'front' },
        { filePath: 'references/three-quarter.png', label: 'Three-quarter', view: 'three-quarter' }
      ]
    })
    const firstSpec = sculptSpecFixture(admitted.evidenceIds)
    const savedFirst = await service.updateSpec(scope, {
      projectId: created.projectId,
      baseRevision: admitted.revision,
      spec: firstSpec,
      confidence: 0.9,
      changeSummary: 'Save the first valid spec.'
    })
    const firstReceipt = await service.enqueueStage(scope, {
      projectId: created.projectId,
      baseRevision: savedFirst.revision,
      stage: 'blockout'
    })
    await service.processStage(scope, queue.last().payload)
    const firstStatus = await service.getStatus(scope, created.projectId)
    assert.equal(firstStatus.status, 'queued')
    assert.equal(firstStatus.currentStage, 'structural-pass')
    assert.deepEqual(firstStatus.completedStages, ['blockout'])

    const firstRun = await dataSource.getRepository(IMG2THREEJS_ENTITIES[4])
      .findOneByOrFail({ id: firstReceipt.runId })
    await service.cancelRun(scope, {
      projectId: created.projectId,
      runId: firstReceipt.runId,
      baseRevision: firstRun.revision
    })
    const cancelledStatus = await service.getStatus(scope, created.projectId)
    const refinedSpec = structuredClone(firstSpec)
    refinedSpec.silhouetteIntent = `${refinedSpec.silhouetteIntent}; enlarged evidence-backed front emblem`
    refinedSpec.qualityContract.maximumDrawCalls += 10
    const savedRefinement = await service.updateSpec(scope, {
      projectId: created.projectId,
      baseRevision: cancelledStatus.revision,
      spec: refinedSpec,
      confidence: 0.94,
      changeSummary: 'Refine proportions and the quality contract after visual review.'
    })
    const refinedReady = await service.getStatus(scope, created.projectId)
    assert.equal(refinedReady.status, 'spec_ready')
    assert.equal(refinedReady.runId, null)
    assert.deepEqual(refinedReady.completedStages, [])
    const secondReceipt = await service.enqueueStage(scope, {
      projectId: created.projectId,
      baseRevision: savedRefinement.revision,
      stage: 'blockout'
    })
    assert.notEqual(secondReceipt.runId, firstReceipt.runId)
    const secondStatus = await service.getStatus(scope, created.projectId)
    assert.equal(secondStatus.runId, secondReceipt.runId)
    assert.deepEqual(secondStatus.completedStages, [])
    const secondRun = await dataSource.getRepository(IMG2THREEJS_ENTITIES[4])
      .findOneByOrFail({ id: secondReceipt.runId })
    assert.equal(secondRun.specVersionId, savedRefinement.specVersionId)
  } finally {
    await dataSource.destroy()
  }
})

function createToolInvoker(tools) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  return async (name, input) => {
    const tool = byName.get(name)
    assert.ok(tool, `Missing Agent middleware tool '${name}'.`)
    return JSON.parse(await tool.invoke(input))
  }
}

function createPluginContext(queue) {
  const logger = {
    child: () => logger,
    debug: () => {},
    log: () => {},
    warn: () => {},
    error: () => {}
  }
  return {
    module: {},
    logger,
    config: {
      debug: false,
      maximumImageBytes: 25_000_000,
      queueAttempts: 3,
      queueBackoffMs: 1000
    },
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    scopeKey: 'tenant-integration:organization-integration',
    resolve(token) {
      assert.equal(token, MANAGED_QUEUE_SERVICE_TOKEN)
      return queue
    }
  }
}

class InMemoryManagedQueue {
  jobs = []
  cancelled = new Set()

  async enqueue(input) {
    this.jobs.push(structuredClone(input))
    return { jobId: input.jobId ?? `mock-job-${this.jobs.length}` }
  }

  async cancel({ jobId }) {
    this.cancelled.add(jobId)
    return { success: true, jobId, state: 'cancelled' }
  }

  async getJob({ jobId }) {
    const job = this.jobs.find((item) => item.jobId === jobId)
    return job ? { id: jobId, name: job.jobName, data: job.payload, attemptsMade: 0, state: 'waiting' } : null
  }

  async getExecutionPoolHealth({ executionPool }) {
    return { executionPool, available: true, workerCount: 1 }
  }

  async getRedis() {
    throw new Error('REDIS_NOT_USED')
  }

  last() {
    const job = this.jobs.at(-1)
    assert.ok(job)
    return job
  }
}

class InMemorySandboxJobs {
  runs = []
  cancelled = new Set()

  constructor(workspace) {
    this.workspace = workspace
  }

  async getActionHealth(input) {
    return {
      ...input,
      pluginName: '@xpert-ai/plugin-img2threejs',
      available: true,
      runtimeProfile: 'browser/playwright-1.61/v1',
      sandboxRuntimeVersion: '1.0.0'
    }
  }

  async run(input) {
    this.runs.push(structuredClone(input))
    const outputs = []
    for (const output of input.outputs) {
      const buffer = output.path === 'render-report.json'
        ? Buffer.from(JSON.stringify({
            contractVersion: '1',
            action: 'img2threejs.review-render',
            actionVersion: '1.0.0',
            projectName: input.payload.projectName,
            codeSha256: input.payload.codeSha256,
            quality: {
              triangles: 1024,
              drawCalls: 4,
              maximumTriangles: input.payload.quality.maximumTriangles,
              maximumDrawCalls: input.payload.quality.maximumDrawCalls,
              referenceAlignment: {
                evidenceId: input.payload.referenceCamera.evidenceId,
                view: input.payload.referenceCamera.view,
                maskConfidence: 0.94,
                silhouetteIoU: 0.88,
                scaleScore: 0.92,
                edgeScore: 0.81,
                perceptualScore: 0.79,
                hardGateEligible: true,
                passed: true
              },
              featureResults: input.payload.featureReviewTargets.map((target) => ({
                id: target.id,
                label: target.label,
                criticality: target.criticality,
                metric: target.metric,
                score: 0.9,
                threshold: target.threshold,
                passed: true
              })),
              multiAngle: {
                minimumSilhouetteRetention: input.payload.quality.minimumMultiAngleSilhouetteRetention,
                minimumVolumeAxisRatio: input.payload.quality.minimumVolumeAxisRatio,
                silhouetteRetention: 0.72,
                volumeAxisRatio: 0.65,
                degenerateView: false,
                passed: true
              },
              failureCodes: [],
              passed: true
            }
          }))
        : Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      const file = await this.workspace.uploadBuffer({
        ...output.destination,
        originalName: output.originalName,
        fileName: output.originalName,
        mimeType: output.mimeType,
        buffer
      })
      outputs.push({
        path: output.path,
        originalName: output.originalName,
        mimeType: output.mimeType,
        size: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        workspacePath: file.workspacePath,
        reference: {
          source: 'platform.workspace.files',
          tenantId: output.destination.tenantId,
          userId: output.destination.userId,
          catalog: output.destination.catalog,
          scopeId: output.destination.scopeId,
          projectId: output.destination.projectId,
          xpertId: output.destination.xpertId,
          isolateByUser: false,
          filePath: file.filePath,
          workspacePath: file.workspacePath,
          originalName: file.name,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size
        }
      })
    }
    return {
      id: input.jobId,
      action: input.action,
      actionVersion: input.actionVersion,
      runtimeProfile: 'browser/playwright-1.61/v1',
      sandboxRuntimeVersion: '1.0.0',
      status: 'succeeded',
      attempt: 1,
      outputs
    }
  }

  async cancel({ jobId }) {
    this.cancelled.add(jobId)
    return { id: jobId, status: 'cancelled', outputs: [] }
  }

  async getJob() {
    return null
  }
}

class InMemoryWorkspaceFiles {
  files = new Map()

  seed(filePath, buffer, mimeType) {
    this.files.set(filePath, {
      name: filePath.split('/').at(-1),
      filePath,
      workspacePath: `/workspace/${filePath}`,
      mimeType,
      size: buffer.length,
      catalog: 'projects',
      scopeId: scope.projectId,
      buffer
    })
  }

  async readBuffer(input) {
    const file = this.files.get(input.filePath)
    if (!file) throw new Error('WORKSPACE_FILE_NOT_FOUND')
    return { ...file, buffer: Buffer.from(file.buffer) }
  }

  async uploadBuffer(input) {
    const filePath = `${input.folder}/${input.fileName ?? input.originalName}`
    const file = {
      name: input.fileName ?? input.originalName,
      filePath,
      workspacePath: `/workspace/${filePath}`,
      mimeType: input.mimeType ?? 'application/octet-stream',
      size: input.buffer.length,
      catalog: input.catalog,
      scopeId: input.scopeId,
      buffer: Buffer.from(input.buffer)
    }
    this.files.set(filePath, file)
    const { buffer: _buffer, ...descriptor } = file
    return descriptor
  }

  async deleteFile(input) {
    this.files.delete(input.filePath)
  }

  text(prefix, suffix) {
    const match = [...this.files.entries()].find(([path]) => path.startsWith(prefix) && path.endsWith(suffix))
    assert.ok(match, `Expected generated workspace asset ending in '${suffix}'.`)
    return match[1].buffer.toString('utf8')
  }
}

class InMemoryArtifacts {
  created = []
  versions = []

  async createArtifact(input) {
    this.created.push(structuredClone(input))
    const index = this.created.length
    return {
      id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      pluginName: input.source.pluginName,
      resourceType: input.source.resourceType,
      resourceId: input.source.resourceId,
      checksum: input.source.checksum,
      kind: input.kind ?? 'file',
      status: 'active',
      title: input.title,
      description: input.description,
      currentVersionId: null,
      ...input.scope
    }
  }

  async ensureArtifactVersion(input) {
    this.versions.push(structuredClone(input))
    const index = this.versions.length
    return {
      outcome: 'created',
      version: {
        id: `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        artifactId: input.artifactId,
        versionNumber: 1,
        status: 'active',
        idempotencyKey: input.idempotencyKey,
        checksum: input.checksum,
        mimeType: input.mimeType,
        fileName: input.fileName,
        size: input.size,
        sha256: input.sha256,
        workspaceFileRef: input.workspaceFileRef
      }
    }
  }

  async createSignedPreviewLink(input) {
    return {
      id: '70000000-0000-4000-8000-000000000001',
      artifactId: input.artifactId,
      artifactVersionId: input.artifactVersionId,
      versionMode: 'version',
      slug: 'browser-comparison',
      publicUrl: `https://artifacts.example/${input.artifactId}/${input.artifactVersionId}`,
      accessMode: 'signed_preview',
      status: 'active',
      disposition: 'inline',
      allowDownload: true
    }
  }
}

function pngFixture(width, height) {
  void width
  void height
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVQ4jWOosXr7nxLMMGrA/9EweDsaBlbDIgwARjiiHypKmFgAAAAASUVORK5CYII=',
    'base64'
  )
}

function sculptSpecFixture(evidenceIds) {
  return {
    schemaVersion: '1.0.0',
    projectName: 'Integration Character',
    route: 'character',
    modelingMode: 'semantic-3d',
    coordinateSystem: { up: 'Y', forward: 'Z-', units: 'meters' },
    referenceCamera: {
      evidenceId: evidenceIds[0],
      view: 'front',
      projection: 'perspective',
      position: [0, 0, 4],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovDegrees: 35,
      orthographicHeight: null,
      framing: { subjectFillRatio: 0.62, tolerance: 0.18 },
      confidence: 0.94
    },
    silhouetteIntent: 'A compact animation-ready character with a clear torso silhouette.',
    proportions: [{
      subject: 'root',
      relation: 'The torso occupies two thirds of the total height.',
      evidenceIds,
      confidence: 0.94
    }],
    components: [{
      id: 'root',
      parentId: null,
      name: 'Root torso',
      semanticType: 'primary_form',
      primitive: 'capsule',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1.5, 1] },
      materialId: 'body_material',
      deformable: true,
      evidenceIds,
      confidence: 0.94
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
      description: 'A centered front seam anchors the visible surface detail.',
      evidenceIds,
      acceptance: 'The seam stays centered through the full animation range.'
    }],
    featureReviewTargets: [{
      id: 'root_silhouette',
      label: 'Root torso silhouette',
      evidenceId: evidenceIds[0],
      componentIds: ['root'],
      view: 'front',
      region: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
      metric: 'silhouette',
      criticality: 'critical',
      threshold: 0.5,
      confidence: 0.94,
      acceptance: 'The root torso remains aligned to the fixed reference view.'
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
        purpose: 'Attach animation-ready accessories.',
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
}

function containsBinaryPayload(value) {
  const serialized = JSON.stringify(value)
  return ['buffer', 'base64', 'fileContent'].some((key) => serialized.includes(`"${key}"`))
}

assert.equal(createHash('sha256').update('integration').digest('hex').length, 64)
