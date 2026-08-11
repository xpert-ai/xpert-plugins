import { Injectable } from '@nestjs/common'
import {
  HumanMessage,
  ToolMessage,
  isToolMessage,
  type BaseMessage
} from '@langchain/core/messages'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  RequestContext,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { defineAgentTool } from './agent-tool-boundary.js'
import {
  IMG2THREEJS_FEATURE,
  IMG2THREEJS_ICON,
  IMG2THREEJS_MIDDLEWARE_NAME,
  TOOL_NAMES
} from './constants.js'
import type { Scope } from './domain/types.js'
import { Img2ThreeJsAgentQueryService } from './img2threejs-agent-query.service.js'
import type {
  ReferenceImageAttachment,
  VisualDiagnosticsAttachment
} from './img2threejs-agent-query.service.js'
import { Img2ThreeJsService } from './img2threejs.service.js'
import { stripConcurrencyControlFields } from './img2threejs.service-support.js'
import {
  CancelRunToolSchema,
  AuthorCodeFileToolSchema,
  AuthorCodeToolSchema,
  ChangeSummaryProbeSchema,
  CreateProjectToolSchema,
  EnqueueStageToolSchema,
  ExportArtifactToolSchema,
  GetStatusToolSchema,
  InspectCodeFileToolSchema,
  ListEvidenceToolSchema,
  ListProjectsToolSchema,
  PatchCodeToolSchema,
  PatchSpecToolSchema,
  PatchRuntimeContractToolSchema,
  RevalidateCodeToolSchema,
  RefineCodeToolSchema,
  ReadCodeToolSchema,
  ReadArtifactToolSchema,
  ReadEvidenceToolSchema,
  ReadVisualDiagnosticsToolSchema,
  ReadSpecToolSchema,
  RetryRunToolSchema,
  SubmitImagesToolSchema,
  SubmitReviewToolSchema,
  UpdateSpecToolSchema,
  ValidateSpecToolSchema,
  WaitRunToolSchema
} from './tool-schemas.js'

const ReferenceImageAttachmentSchema = z.object({
  type: z.literal('img2threejs.reference-image'),
  projectId: z.string().uuid(),
  revision: z.number().int().positive(),
  evidenceId: z.string().uuid(),
  label: z.string().min(1).max(160),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  dataUrl: z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
}).strict()

const VisualDiagnosticsAttachmentSchema = z.object({
  type: z.literal('img2threejs.visual-diagnostics'),
  projectId: z.string().uuid(),
  revision: z.number().int().positive(),
  runId: z.string().uuid(),
  runRevision: z.number().int().positive(),
  images: z.array(z.object({
    kind: z.enum(['comparison', 'render']),
    view: z.string().min(1).max(80),
    name: z.string().min(1).max(160),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    dataUrl: z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
  }).strict()).min(1).max(2)
}).strict()

// The host may recreate strategy instances between the evidence-read model
// node and the following tool node. Keep the turn-scoped inspection ledger at
// module lifetime so that exact revision/checksum verification survives that
// legitimate lifecycle boundary. The host does not guarantee that optional
// conversation/Xpert fields are present on every node, so keys use the stable
// tenant/user identity plus project, evidence and revision.
const inspectedEvidenceByScope = new Map<string, ReferenceImageAttachment>()
const visualDiagnosticsByScope = new Map<string, VisualDiagnosticsAttachment>()
const activeTurnFingerprintsByScope = new Map<string, string>()

@Injectable()
@AgentMiddlewareStrategy(IMG2THREEJS_MIDDLEWARE_NAME)
export class Img2ThreeJsMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: IMG2THREEJS_MIDDLEWARE_NAME,
    label: { en_US: 'Image to Three.js', zh_Hans: '图片转 Three.js' },
    icon: { type: 'svg', value: IMG2THREEJS_ICON },
    description: {
      en_US: 'Build quality-gated procedural Three.js TypeScript models from admitted image evidence and durable Sculpt Specs.',
      zh_Hans: '基于准入图片证据和持久 Sculpt Spec 构建质量门控的程序化 Three.js TypeScript 模型。'
    },
    features: [IMG2THREEJS_FEATURE],
    configSchema: { type: 'object', properties: {} }
  }

  constructor(
    private readonly service: Img2ThreeJsService,
    private readonly agentQuery: Img2ThreeJsAgentQueryService
  ) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromMiddleware(context)
    const serialize = (value: unknown): string => JSON.stringify(stripConcurrencyControlFields(value))
    const json = async <T>(operation: Promise<T>): Promise<string> => serialize(await operation)
    const currentProjectRevision = async (projectId: string): Promise<number> =>
      (await this.service.getStatus(scope, projectId)).revision
    const withCurrentProjectRevision = async <T extends { projectId: string }>(input: T) => ({
      ...input,
      baseRevision: await currentProjectRevision(input.projectId)
    })
    const withCurrentExpectedRevision = async <T extends { projectId: string }>(input: T) => ({
      ...input,
      expectedRevision: await currentProjectRevision(input.projectId)
    })
    const withCurrentRunRevision = async <T extends { projectId: string; runId: string }>(input: T) => {
      const status = await this.service.getStatus(scope, input.projectId)
      if (status.runId !== input.runId || status.runRevision == null) throw new Error('RUN_NOT_CURRENT')
      return { ...input, baseRevision: status.runRevision }
    }
    const inspectionNamespace = [
      scope.tenantId,
      scope.userId
    ].join(':')
    const inspectionKey = (projectId: string, evidenceId: string, revision: number) =>
      `${inspectionNamespace}:${projectId}:${evidenceId}:${revision}`
    const inspectEvidence = async (input: z.infer<typeof ReadEvidenceToolSchema>) => {
      const currentInput = await withCurrentExpectedRevision(input)
      const [result, attachment] = await Promise.all([
        this.agentQuery.readEvidence(scope, currentInput),
        this.agentQuery.readEvidenceImage(scope, currentInput)
      ])
      inspectedEvidenceByScope.set(
        inspectionKey(input.projectId, input.evidenceId, attachment.revision),
        attachment
      )
      return result
    }
    const assertSpecEvidenceInspected = (input: {
      projectId: string
      baseRevision: number
      spec: z.infer<typeof UpdateSpecToolSchema>['spec']
    }) => {
      const missing = collectSpecEvidenceIds(input.spec).filter((evidenceId) =>
        !inspectedEvidenceByScope.has(inspectionKey(input.projectId, evidenceId, input.baseRevision))
      )
      if (missing.length > 0) {
        throw new Error(
          `EVIDENCE_INSPECTION_REQUIRED: call ${TOOL_NAMES.readEvidence} for every Sculpt Spec evidenceId ` +
          `immediately before ${TOOL_NAMES.updateSpec}. ` +
          `Missing: ${missing.join(', ')}`
        )
      }
    }
    const consumeProjectInspections = (projectId: string) => {
      for (const [key, attachment] of inspectedEvidenceByScope) {
        if (key.startsWith(`${inspectionNamespace}:`) && attachment.projectId === projectId) {
          inspectedEvidenceByScope.delete(key)
        }
      }
    }
    const resetInspectionForNewTurn = (messages: BaseMessage[]) => {
      let latestHumanIndex = -1
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].getType() === 'human') {
          latestHumanIndex = index
          break
        }
      }
      if (latestHumanIndex < 0) return
      const latestHuman = messages[latestHumanIndex]
      const fingerprint = `${latestHumanIndex}:${latestHuman.id ?? JSON.stringify(latestHuman.content)}`
      const activeTurnFingerprint = activeTurnFingerprintsByScope.get(inspectionNamespace)
      if (activeTurnFingerprint !== undefined && activeTurnFingerprint !== fingerprint) {
        for (const key of inspectedEvidenceByScope.keys()) {
          if (key.startsWith(`${inspectionNamespace}:`)) inspectedEvidenceByScope.delete(key)
        }
      }
      activeTurnFingerprintsByScope.set(inspectionNamespace, fingerprint)
    }
    const tools = [
      defineAgentTool(
        async (input: z.infer<typeof CreateProjectToolSchema>) =>
          json(this.service.createProject(scope, input)),
        {
          name: TOOL_NAMES.createProject,
          description: 'Create one durable modeling project. Call before submitting reference images.',
          schema: CreateProjectToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ListProjectsToolSchema>) =>
          json(this.agentQuery.listProjects(scope, input)),
        {
          name: TOOL_NAMES.listProjects,
          description: 'Discover scoped modeling projects before choosing one. Prefer the most recently updated matching project; never guess a project id.',
          schema: ListProjectsToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof SubmitImagesToolSchema>) =>
          json(this.service.submitImages(scope, await withCurrentProjectRevision(input))),
        {
          name: TOOL_NAMES.submitImages,
          description: 'Admit one to twelve scoped Workspace Files images and persist deterministic hash/dimension evidence. Call after project creation and before writing the Sculpt Spec.',
          schema: SubmitImagesToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ListEvidenceToolSchema>) =>
          json(this.agentQuery.listEvidence(scope, input)),
        {
          name: TOOL_NAMES.listEvidence,
          description: 'List compact admitted/rejected evidence metadata for one project. Call before reading individual images or authoring a Sculpt Spec.',
          schema: ListEvidenceToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ReadEvidenceToolSchema>) =>
          json(inspectEvidence(input)),
        {
          name: TOOL_NAMES.readEvidence,
          description: 'Resolve one admitted reference image and keep its checksum-verified pixels attached to later model calls in the current user turn. The service always reads the current authoritative project state. Call it after other read-only context tools and immediately before update_spec.',
          schema: ReadEvidenceToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ReadSpecToolSchema>) =>
          json(this.service.readCurrentSpec(scope, input.projectId)),
        {
          name: TOOL_NAMES.readSpec,
          description: 'Read the current exact Sculpt Spec after discovering a project id. This is the only tool that returns the full spec, its freshly recomputed validation issues, and machine-readable correctionHints. When a camera hint exists, copy its recommendedReferenceCamera values exactly instead of guessing a FOV or distance.',
          schema: ReadSpecToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof UpdateSpecToolSchema>) => {
          const currentInput = await withCurrentProjectRevision(input)
          assertSpecEvidenceInspected(currentInput)
          const result = await this.service.updateSpec(scope, currentInput)
          consumeProjectInspections(input.projectId)
          return serialize(result)
        },
        {
          name: TOOL_NAMES.updateSpec,
          description: 'Create a new immutable Sculpt Spec version against the current authoritative project state. This mutation is rejected unless every evidenceId used by the Spec was checksum-verified through read_evidence in the current user turn.',
          schema: UpdateSpecToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof PatchSpecToolSchema>) => {
          const currentInput = await withCurrentProjectRevision(input)
          const current = await this.service.readCurrentSpec(scope, input.projectId, currentInput.baseRevision)
          if (current.specVersionId !== input.sourceSpecVersionId) throw new Error('STALE_SPEC_VERSION')
          assertSpecEvidenceInspected({
            projectId: input.projectId,
            baseRevision: currentInput.baseRevision,
            spec: current.spec
          })
          const result = await this.service.patchSpec(scope, currentInput)
          consumeProjectInspections(input.projectId)
          return serialize(result)
        },
        {
          name: TOOL_NAMES.patchSpec,
          description: 'Clone the exact current Sculpt Spec and atomically apply only bounded camera, silhouette, existing-component, or existing-material corrections. Prefer this after read_spec, visual diagnostics, and read_evidence when refinement does not require replacing the whole semantic blueprint. Component geometry may be replaced or set to null to use a primitive default. Quality thresholds cannot be changed by this tool. If validation returns correctionHints, copy the recommended values exactly in the next bounded patch; do not invert the suggested camera correction.',
          schema: PatchSpecToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof PatchRuntimeContractToolSchema>) => {
          const currentInput = await withCurrentProjectRevision(input)
          const current = await this.service.readCurrentSpec(scope, input.projectId, currentInput.baseRevision)
          if (current.specVersionId !== input.sourceSpecVersionId) throw new Error('STALE_SPEC_VERSION')
          assertSpecEvidenceInspected({
            projectId: input.projectId,
            baseRevision: currentInput.baseRevision,
            spec: current.spec
          })
          const result = await this.service.patchRuntimeContract(scope, currentInput)
          consumeProjectInspections(input.projectId)
          return serialize(result)
        },
        {
          name: TOOL_NAMES.patchRuntimeContract,
          description: 'Clone the exact current semantic Spec into a new immutable version while only raising qualityContract.minimumComponentCount as the browser runtime Mesh floor. Use this compact mutation after read_spec and read_evidence when the semantic blueprint is already correct; never enumerate repeated runtime details as Spec JSON.',
          schema: PatchRuntimeContractToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ValidateSpecToolSchema>) =>
          json(this.service.validateCurrentSpec(scope, input.projectId)),
        {
          name: TOOL_NAMES.validateSpec,
          description: 'Strictly validate the current Sculpt Spec, hierarchy, fixed camera, feature targets, runtime references, route, and admitted evidence coverage before queueing blockout. Invalid camera framing returns a machine-readable correctionHint with an exact recommended position or orthographic height.',
          schema: ValidateSpecToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ReadCodeToolSchema>) =>
          json(this.service.readCurrentCode(scope, await withCurrentExpectedRevision(input))),
        {
          name: TOOL_NAMES.readCode,
          description: 'Resolve the exact current checksum-verified Three.js TypeScript version for refinement. By default returns its sandbox/Workspace Files path, SHA-256, and size without retransmitting source; set includeSource=true only for the small inline compatibility path.',
          schema: ReadCodeToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof InspectCodeFileToolSchema>) =>
          json(this.service.inspectCodeFile(scope, await withCurrentProjectRevision(input))),
        {
          name: TOOL_NAMES.inspectCodeFile,
          description: 'Optionally inspect a TypeScript model file from the current scoped Xpert sandbox/Workspace Files without returning its source. Returns its canonical workspace path, byte size, and SHA-256 for diagnostics and audit; author_code_file resolves and snapshots the current bytes itself.',
          schema: InspectCodeFileToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof AuthorCodeFileToolSchema>) =>
          json(this.service.authorCodeFile(scope, await withCurrentProjectRevision(input))),
        {
          name: TOOL_NAMES.authorCodeFile,
          description: 'Primary large-model authoring path. Import a complete Assistant-authored Three.js TypeScript module previously written with Sandbox Files. The service reads the exact path and snapshots its current bytes into an immutable code version before applying all security, Spec coverage, runtime, and procedural geometry gates; no caller checksum or concurrency field is required.',
          schema: AuthorCodeFileToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof AuthorCodeToolSchema>) =>
          json(this.service.authorCode(scope, await withCurrentProjectRevision(input))),
        {
          name: TOOL_NAMES.authorCode,
          description: 'Inline compatibility path for small complete Assistant-authored Three.js TypeScript modules. Prefer Sandbox Files plus inspect_code_file and author_code_file for production models or any source likely to approach a function-call output limit.',
          schema: AuthorCodeToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof RevalidateCodeToolSchema>) =>
          json(this.service.revalidateCode(scope, await withCurrentProjectRevision(input))),
        {
          name: TOOL_NAMES.revalidateCode,
          description: 'Re-run the current deterministic and security review against the service-verified immutable Assistant-authored source after the plugin review policy changes. This cannot edit or replace source bytes and returns enqueue_stage only when the same source passes.',
          schema: RevalidateCodeToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof PatchCodeToolSchema>) =>
          json(this.service.patchCode(scope, await withCurrentProjectRevision(input))),
        {
          name: TOOL_NAMES.patchCode,
          description: 'Apply one to eight exact text replacements to the current service-verified immutable Assistant source. By default each oldText must match exactly once. For a bounded identifier rename, set allOccurrences=true; both values must be legal TypeScript identifiers, exact token matches are replaced, and at most 500 occurrences are allowed. The complete patched source is persisted immutably and must pass every author_code security and Spec gate.',
          schema: PatchCodeToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof RefineCodeToolSchema>) =>
          json(this.service.refineCode(scope, await withCurrentProjectRevision(input))),
        {
          name: TOOL_NAMES.refineCode,
          description: 'Validate and save a refined Three.js TypeScript source file from scoped Workspace Files after the next decision is refine-code. The service resolves current project state and snapshots the current file bytes internally; no caller checksum or concurrency field is required.',
          schema: RefineCodeToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof EnqueueStageToolSchema>) =>
          json(this.service.enqueueStage(scope, await withCurrentProjectRevision(input))),
        {
          name: TOOL_NAMES.enqueueStage,
          description: 'Start the ordered Managed Queue build chain by enqueueing blockout once. Remaining deterministic stages chain automatically; use wait_run instead of enqueueing them individually.',
          schema: EnqueueStageToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof WaitRunToolSchema>, config: RunnableConfig) =>
          json(this.service.waitRun(scope, input, config.signal)),
        {
          name: TOOL_NAMES.waitRun,
          description: 'Bounded long-poll for run progress. Reuse the returned projectId and cursor while terminal=false; do not replace this with tight status polling.',
          schema: WaitRunToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof GetStatusToolSchema>) =>
          json(this.service.getStatus(scope, input.projectId)),
        {
          name: TOOL_NAMES.getStatus,
          description: 'Get compact project/run status for a later user message or recovery after an interrupted wait loop. Concurrency versions are internal and are not returned. Follow nextAction: retry_run is reserved for transient infrastructure/input visibility failures; read_visual_diagnostics_then_refine_code means the same immutable code must not be retried and the Assistant must inspect the diagnostic, author a new Workspace Files candidate, and submit it in refine mode. When nextAction=author_code and an interrupted Agent already wrote the standard current source candidate, assistantCodeCandidate returns its path, SHA-256, and size so it can be inspected and checksum-locked instead of regenerated or overwritten.',
          schema: GetStatusToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof SubmitReviewToolSchema>) =>
          json(this.service.submitReview(scope, await withCurrentRunRevision(input))),
        {
          name: TOOL_NAMES.submitReview,
          description: 'Persist human review and choose exactly continue, refine-spec, refine-code, request-input, or stop against the current run state. A failed persisted reference-fidelity hard gate cannot be approved. If alreadyPersisted=true, stop calling tools and report the existing next action.',
          schema: SubmitReviewToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ReadVisualDiagnosticsToolSchema>) =>
          json(this.agentQuery.readVisualDiagnostics(scope, input)),
        {
          name: TOOL_NAMES.readVisualDiagnostics,
          description: 'Read the latest browser-render quality metrics and attach checksum-verified comparison/render pixels to the vision-capable model. Use after every completed render before choosing refine-spec or refine-code; do not diagnose visual defects from metrics alone.',
          schema: ReadVisualDiagnosticsToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ReadArtifactToolSchema>) =>
          json(this.service.readArtifact(scope, input.projectId)),
        {
          name: TOOL_NAMES.readArtifact,
          description: 'Read compact generated code/comparison asset metadata and runtime capability availability. Does not return file bytes or full source.',
          schema: ReadArtifactToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ExportArtifactToolSchema>) =>
          json(this.service.exportArtifact(scope, input.projectId)),
        {
          name: TOOL_NAMES.exportArtifact,
          description: 'Publish the generated model package and comparison evidence through the platform Artifacts capability when registered; otherwise return the recoverable Workspace Files package.',
          schema: ExportArtifactToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof CancelRunToolSchema>) =>
          json(this.service.cancelRun(scope, await withCurrentRunRevision(input))),
        {
          name: TOOL_NAMES.cancelRun,
          description: 'Cancel the current known Managed Queue run. This is a consequential action and requires confirmed user intent.',
          schema: CancelRunToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof RetryRunToolSchema>) =>
          json(this.service.retryRun(scope, await withCurrentRunRevision(input))),
        {
          name: TOOL_NAMES.retryRun,
          description: 'Retry only when current status explicitly returns nextAction=retry_run, without duplicating passed stages. Persistent source/build failures are rejected with RUN_REQUIRES_CODE_REFINEMENT so the Assistant reads diagnostics and submits new code. The service resolves current run state internally.',
          schema: RetryRunToolSchema,
          verboseParsingErrors: true
        }
      )
    ]

    const scopeToolsForCurrentProject = async <T extends {
      messages: BaseMessage[]
      tools?: unknown[]
      systemPrompt?: string
    }>(request: T): Promise<T> => {
      const projectId = findLatestImg2ThreeJsProjectId(request.messages)
      if (!projectId || !request.tools?.length) return request
      try {
        const status = await this.service.getStatus(scope, projectId)
        const allowed = img2ThreeJsToolsForNextAction(status.nextAction)
        if (!allowed) return request
        const allowSandbox = img2ThreeJsActionAllowsSandbox(status.nextAction)
        const completedCandidate = findLatestCompletedWorkspaceCodeCandidate(
          request.messages,
          projectId
        )
        const candidateInstruction = completedCandidate
          ? candidateContinuationInstruction(
              status,
              completedCandidate.sourceFilePath,
              hasSuccessfulCodeFileInspection(
                request.messages,
                projectId,
                completedCandidate.sourceFilePath,
                completedCandidate.messageIndex
              )
            )
          : null
        const refineSpecInstruction = refineSpecContinuationInstruction(
          status,
          request.messages
        )
        const continuationInstruction = [candidateInstruction, refineSpecInstruction]
          .filter(Boolean)
          .join('\n\n') || null
        return {
          ...request,
          ...(continuationInstruction
            ? {
                systemPrompt: [request.systemPrompt?.trim(), continuationInstruction]
                  .filter(Boolean)
                  .join('\n\n')
              }
            : {}),
          tools: request.tools.filter((candidate) => {
            const name = agentToolName(candidate)
            if (name?.startsWith('img2threejs_')) return allowed.has(name)
            if (name?.startsWith('sandbox_')) return allowSandbox
            return true
          })
        }
      } catch (error) {
        // Tool availability is an ergonomic optimization, never an authority
        // boundary. Preserve the full surface if authoritative state cannot be
        // resolved so recovery remains possible.
        if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') return request
        throw error
      }
    }

    return {
      name: IMG2THREEJS_MIDDLEWARE_NAME,
      tools,
      wrapModelCall: async (request, handler) => {
        resetInspectionForNewTurn(request.messages)
        const scopedRequest = await scopeToolsForCurrentProject(request)
        const attachments = findReferenceImageAttachments(scopedRequest.messages)
        const visualDiagnostics = findVisualDiagnosticsAttachments(scopedRequest.messages)
        if (attachments.length === 0 && visualDiagnostics.length === 0) {
          return handler(appendWorkflowContinuationMessage(scopedRequest))
        }
        if (!modelExplicitlySupportsImageInputs(scopedRequest.model)) {
          let unavailableRequest = scopedRequest
          if (attachments.length > 0) {
            unavailableRequest = attachVisionUnavailableNotice(unavailableRequest, attachments)
          }
          if (visualDiagnostics.length > 0) {
            unavailableRequest = attachVisualDiagnosticsUnavailableNotice(
              unavailableRequest,
              visualDiagnostics
            )
          }
          return handler(appendWorkflowContinuationMessage(unavailableRequest))
        }
        let visionRequest = scopedRequest
        if (attachments.length > 0) {
          visionRequest = attachReferenceImagesToModelRequest(visionRequest, attachments)
        }
        if (visualDiagnostics.length > 0) {
          visionRequest = attachVisualDiagnosticsToModelRequest(visionRequest, visualDiagnostics)
        }
        const response = await handler(appendWorkflowContinuationMessage(visionRequest))
        for (const attachment of attachments) {
          inspectedEvidenceByScope.set(
            inspectionKey(attachment.projectId, attachment.evidenceId, attachment.revision),
            attachment
          )
        }
        return response
      },
      wrapToolCall: async (request, handler) => {
        const toolName = request.toolCall.name
        const stateMessages = request.state?.messages ?? []
        const projectId = recordString(request.toolCall.args, 'projectId')
        if (toolName.startsWith('img2threejs_') && projectId && toolName !== TOOL_NAMES.getStatus) {
          const status = await this.service.getStatus(scope, projectId)
          if (!isImg2ThreeJsToolAllowedForNextAction(toolName, status.nextAction)) {
            const allowed = img2ThreeJsToolsForNextAction(status.nextAction)
            throw new Error(
              `TOOL_NOT_AVAILABLE_FOR_NEXT_ACTION: current nextAction=${status.nextAction}; ` +
              `allowed tools=${allowed ? [...allowed].join(',') : 'full recovery surface'}`
            )
          }
        }
        if (toolName.startsWith('sandbox_')) {
          const sandboxProjectId = projectId ?? findLatestImg2ThreeJsProjectId(stateMessages)
          if (sandboxProjectId) {
            const status = await this.service.getStatus(scope, sandboxProjectId)
            const policyError = sandboxToolPolicyError(toolName, status.nextAction)
            if (policyError) throw new Error(policyError)
          }
        }
        const parsed = ChangeSummaryProbeSchema.safeParse(request.toolCall.args)
        const summary = parsed.success ? parsed.data.changeSummary : null
        if (summary) await emit(context, toolName, summary, 'running')
        try {
          if (
            toolName === TOOL_NAMES.updateSpec ||
            toolName === TOOL_NAMES.patchSpec ||
            toolName === TOOL_NAMES.patchRuntimeContract
          ) {
            const updateInput = toolName === TOOL_NAMES.updateSpec
              ? UpdateSpecToolSchema.parse(request.toolCall.args)
              : null
            const specPatchInput = toolName === TOOL_NAMES.patchSpec
              ? PatchSpecToolSchema.parse(request.toolCall.args)
              : null
            const patchInput = toolName === TOOL_NAMES.patchRuntimeContract
              ? PatchRuntimeContractToolSchema.parse(request.toolCall.args)
              : null
            const projectId = updateInput?.projectId ?? specPatchInput?.projectId ?? patchInput!.projectId
            const baseRevision = await currentProjectRevision(projectId)
            const spec = updateInput?.spec ??
              (await this.service.readCurrentSpec(scope, projectId, baseRevision)).spec
            const citedEvidenceIds = new Set(collectSpecEvidenceIds(spec))
            for (const descriptor of findReferenceImageDescriptors(request.state.messages)) {
              if (descriptor.projectId !== projectId || !citedEvidenceIds.has(descriptor.evidenceId)) {
                continue
              }
              const current = await this.agentQuery.readEvidenceImage(scope, {
                projectId,
                evidenceId: descriptor.evidenceId,
                expectedRevision: baseRevision
              })
              if (current.sha256 === descriptor.sha256) {
                inspectedEvidenceByScope.set(
                  inspectionKey(current.projectId, current.evidenceId, current.revision),
                  current
                )
              }
            }
            assertSpecEvidenceInspected({
              projectId,
              baseRevision,
              spec
            })
          }
          let result = await handler(request)
          if (toolName === TOOL_NAMES.readEvidence && isToolMessage(result)) {
            const input = ReadEvidenceToolSchema.parse(request.toolCall.args)
            let attachment = [...inspectedEvidenceByScope.entries()]
              .filter(([key, candidate]) =>
                key.startsWith(`${inspectionNamespace}:`) &&
                candidate.projectId === input.projectId &&
                candidate.evidenceId === input.evidenceId
              )
              .map(([, candidate]) => candidate)
              .sort((left, right) => right.revision - left.revision)[0]
            if (!attachment) {
              attachment = await this.agentQuery.readEvidenceImage(scope, {
                projectId: input.projectId,
                evidenceId: input.evidenceId
              })
              inspectedEvidenceByScope.set(
                inspectionKey(input.projectId, input.evidenceId, attachment.revision),
                attachment
              )
            }
            result = attachReferenceImageToToolMessage(result, attachment)
          }
          if (toolName === TOOL_NAMES.readVisualDiagnostics && isToolMessage(result)) {
            const input = ReadVisualDiagnosticsToolSchema.parse(request.toolCall.args)
            const attachment = await this.agentQuery.readVisualDiagnosticImages(scope, input).catch((error) => {
              if (error instanceof Error && error.message.startsWith('VISUAL_DIAGNOSTICS_UNAVAILABLE:')) return null
              throw error
            })
            if (attachment) {
              visualDiagnosticsByScope.set(
                `${inspectionNamespace}:${attachment.projectId}:${attachment.runId}:${attachment.runRevision}`,
                attachment
              )
              result = attachVisualDiagnosticsToToolMessage(result, attachment)
            }
          }
          if (summary) await emit(context, toolName, summary, 'success')
          return result
        } catch (error) {
          if (summary) await emit(context, toolName, summary, 'fail')
          throw error
        }
      }
    }
  }
}

function attachReferenceImageToToolMessage(
  message: ToolMessage,
  attachment: ReferenceImageAttachment
): ToolMessage {
  const verified = ReferenceImageAttachmentSchema.parse(attachment)
  return new ToolMessage({
    content: buildReferenceImageToolContent(verified),
    name: message.name ?? TOOL_NAMES.readEvidence,
    tool_call_id: message.tool_call_id,
    status: message.status,
    artifact: {
      type: verified.type,
      projectId: verified.projectId,
      revision: verified.revision,
      evidenceId: verified.evidenceId,
      label: verified.label,
      mimeType: verified.mimeType,
      width: verified.width,
      height: verified.height,
      sha256: verified.sha256,
      imageBytesOmitted: true
    },
    metadata: message.metadata,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    id: message.id
  })
}

function attachVisualDiagnosticsToToolMessage(
  message: ToolMessage,
  attachment: VisualDiagnosticsAttachment
): ToolMessage {
  const verified = VisualDiagnosticsAttachmentSchema.parse(attachment)
  return new ToolMessage({
    content: message.content,
    name: message.name ?? TOOL_NAMES.readVisualDiagnostics,
    tool_call_id: message.tool_call_id,
    status: message.status,
    artifact: {
      type: verified.type,
      projectId: verified.projectId,
      revision: verified.revision,
      runId: verified.runId,
      runRevision: verified.runRevision,
      images: verified.images.map((image) => ({
        kind: image.kind,
        view: image.view,
        name: image.name,
        mimeType: image.mimeType,
        size: image.size,
        sha256: image.sha256
      })),
      imageBytesOmitted: true
    },
    metadata: message.metadata,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    id: message.id
  })
}

function buildReferenceImageToolContent(attachment: ReferenceImageAttachment): string {
  return JSON.stringify({
    imageAttachmentAvailable: true,
    modelVisionRequired: true,
    projectId: attachment.projectId,
    evidenceId: attachment.evidenceId,
    label: attachment.label,
    mimeType: attachment.mimeType,
    width: attachment.width,
    height: attachment.height,
    sha256: attachment.sha256,
    nextAction: 'verify_model_vision_then_inspect_attached_image_pixels'
  })
}

function collectSpecEvidenceIds(spec: z.infer<typeof UpdateSpecToolSchema>['spec']): string[] {
  return [...new Set([
    spec.referenceCamera.evidenceId,
    ...spec.proportions.flatMap((item) => item.evidenceIds),
    ...spec.components.flatMap((item) => item.evidenceIds),
    ...spec.details.flatMap((item) => item.evidenceIds),
    ...spec.featureReviewTargets.map((item) => item.evidenceId)
  ])]
}

const PROJECT_ID_PATTERN =
  /(?:["']?projectId["']?\s*[:=]\s*["']?|\bproject\s+|项目\s*)([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i

function findLatestImg2ThreeJsProjectId(messages: BaseMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (isToolMessage(message) && message.name?.startsWith('img2threejs_')) {
      const artifactProjectId = recordString(message.artifact, 'projectId')
      if (artifactProjectId) return artifactProjectId
    }
    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content)
    const match = PROJECT_ID_PATTERN.exec(content)
    if (match) return match[1]
  }
  return null
}

function recordString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' ? candidate : null
}

const WORKSPACE_CODE_WRITE_TOOLS = new Set([
  'sandbox_write_file',
  'sandbox_append_file',
  'sandbox_edit_file',
  'sandbox_multi_edit_file'
])

const COMPLETED_CANDIDATE_MARKER = 'IMG2THREEJS_COMPLETED_CANDIDATE:'
const REFINE_SPEC_CONTINUATION_MARKER = 'IMG2THREEJS_REFINE_SPEC_CONTINUATION:'

function findLatestCompletedWorkspaceCodeCandidate(
  messages: BaseMessage[],
  projectId: string
): { sourceFilePath: string; messageIndex: number } | null {
  const prefix = `/workspace/img2threejs-assistant/${projectId}/`
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isToolMessage(message) || !message.name || !WORKSPACE_CODE_WRITE_TOOLS.has(message.name)) {
      continue
    }
    if (message.status === 'error') continue
    const output = parseToolMessageRecord(message)
    if (!output || typeof output.error === 'string' && output.error.trim()) continue
    const sourceFilePath = typeof output.path === 'string'
      ? output.path
      : typeof output.file_path === 'string'
        ? output.file_path
        : null
    if (
      sourceFilePath?.startsWith(prefix) &&
      sourceFilePath.endsWith('.ts') &&
      !sourceFilePath.slice(prefix.length).includes('/')
    ) {
      return { sourceFilePath, messageIndex: index }
    }
  }
  return null
}

function hasSuccessfulCodeFileInspection(
  messages: BaseMessage[],
  projectId: string,
  sourceFilePath: string,
  afterMessageIndex: number
): boolean {
  for (let index = messages.length - 1; index > afterMessageIndex; index -= 1) {
    const message = messages[index]
    if (!isToolMessage(message) || message.name !== TOOL_NAMES.inspectCodeFile) continue
    if (message.status === 'error') continue
    const output = parseToolMessageRecord(message)
    if (
      output?.projectId === projectId &&
      output.sourceFilePath === sourceFilePath &&
      typeof output.sourceSha256 === 'string' &&
      output.sourceSha256.length > 0
    ) {
      return true
    }
  }
  return false
}

function parseToolMessageRecord(message: ToolMessage): Record<string, unknown> | null {
  if (typeof message.content !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(message.content)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function candidateContinuationInstruction(
  status: Awaited<ReturnType<Img2ThreeJsService['getStatus']>>,
  sourceFilePath: string,
  inspected: boolean
): string | null {
  const inspectCall = `${TOOL_NAMES.inspectCodeFile}({"projectId":"${status.projectId}","sourceFilePath":"${sourceFilePath}"})`
  if (
    status.nextAction === 'refine_code' ||
    status.nextAction === 'read_visual_diagnostics_then_refine_code'
  ) {
    if (!status.currentCodeVersionId) return null
    return [
      `${COMPLETED_CANDIDATE_MARKER} an Assistant-authored TypeScript candidate is already durably present in Workspace Files.`,
      `Exact candidate: ${sourceFilePath}.`,
      'Do not draft source, call any sandbox write/append/edit tool, or create another candidate before this one receives plugin feedback.',
      inspected
        ? 'Inspection of this exact candidate already succeeded in the current message history. Do not call inspect_code_file again.'
        : `Call ${inspectCall} now.`,
      inspected
        ? `Call ${TOOL_NAMES.refineCode} now with projectId=${status.projectId}, codeVersionId=${status.currentCodeVersionId}, this exact sourceFilePath, and a concise factual changeSummary.`
        : `If inspection succeeds, call ${TOOL_NAMES.refineCode} with projectId=${status.projectId}, codeVersionId=${status.currentCodeVersionId}, this exact sourceFilePath, and a concise factual changeSummary.`,
      'Only a returned deterministic failure may justify a bounded repair; visual speculation never justifies abandoning this unreviewed candidate.'
    ].join(' ')
  }
  if (status.nextAction === 'author_code' && status.currentSpecVersionId) {
    const mode = status.currentCodeVersionId ? 'refine' : 'create'
    return [
      `${COMPLETED_CANDIDATE_MARKER} an Assistant-authored TypeScript candidate is already durably present in Workspace Files.`,
      `Exact candidate: ${sourceFilePath}.`,
      'Do not draft source, call any sandbox write/append/edit tool, or create another candidate before this one receives plugin feedback.',
      inspected
        ? 'Inspection of this exact candidate already succeeded in the current message history. Do not call inspect_code_file again.'
        : `Call ${inspectCall} now.`,
      inspected
        ? `Call ${TOOL_NAMES.authorCodeFile} now with projectId=${status.projectId}, specVersionId=${status.currentSpecVersionId}, mode=${mode}, baseCodeVersionId=${status.currentCodeVersionId ?? 'null'}, this exact sourceFilePath, and a concise factual changeSummary.`
        : `If inspection succeeds, call ${TOOL_NAMES.authorCodeFile} with projectId=${status.projectId}, specVersionId=${status.currentSpecVersionId}, mode=${mode}, baseCodeVersionId=${status.currentCodeVersionId ?? 'null'}, this exact sourceFilePath, and a concise factual changeSummary.`,
      'Only a returned deterministic failure may justify a bounded repair.'
    ].join(' ')
  }
  return null
}

function refineSpecContinuationInstruction(
  status: Awaited<ReturnType<Img2ThreeJsService['getStatus']>>,
  messages: BaseMessage[]
): string | null {
  const invalidSpecRepair = status.nextAction === 'update_spec' &&
    Boolean(status.currentSpecVersionId) &&
    status.failureCodes.length > 0
  if (
    status.nextAction !== 'refine_spec' &&
    status.nextAction !== 'patch_spec_or_update_spec' &&
    !invalidSpecRepair
  ) {
    return null
  }

  const latestHumanIndex = findLatestHumanMessageIndex(messages)
  const readSpec = findLatestSuccessfulToolRecord(
    messages,
    TOOL_NAMES.readSpec,
    latestHumanIndex
  )
  if (!readSpec) {
    return [
      `${REFINE_SPEC_CONTINUATION_MARKER} the persisted workflow requires ${invalidSpecRepair ? 'repairing the current invalid Sculpt Spec' : 'refine-spec'}.`,
      `Call ${TOOL_NAMES.readSpec} now for projectId=${status.projectId}.`,
      `Do not call ${TOOL_NAMES.readVisualDiagnostics} or ${TOOL_NAMES.readCode}; those observations cannot replace the required current Sculpt Spec read.`
    ].join(' ')
  }

  const evidenceIds = collectEvidenceIdsFromUnknown(readSpec.output)
  const inspectedEvidenceIds = new Set(
    findSuccessfulToolRecords(messages, TOOL_NAMES.readEvidence, latestHumanIndex)
      .flatMap(({ message, output }) => [
        recordString(message.artifact, 'evidenceId'),
        recordString(output, 'evidenceId')
      ])
      .filter((value): value is string => Boolean(value))
  )
  const nextEvidenceId = evidenceIds.find((evidenceId) => !inspectedEvidenceIds.has(evidenceId))
  if (nextEvidenceId) {
    return [
      `${REFINE_SPEC_CONTINUATION_MARKER} the current Sculpt Spec is already read in this user turn.`,
      `Call ${TOOL_NAMES.readEvidence} now with projectId=${status.projectId} and evidenceId=${nextEvidenceId}.`,
      `This is the next exact Spec-cited evidence not yet inspected this turn; do not re-read visual diagnostics, code, or the Spec.`
    ].join(' ')
  }

  if (evidenceIds.length === 0) {
    return [
      `${REFINE_SPEC_CONTINUATION_MARKER} the current Sculpt Spec read returned no discoverable evidence IDs.`,
      `Call ${TOOL_NAMES.listEvidence} now for projectId=${status.projectId}, then inspect the admitted evidence before mutating the Spec.`,
      `Do not call ${TOOL_NAMES.readVisualDiagnostics} or ${TOOL_NAMES.readCode}.`
    ].join(' ')
  }

  return [
    `${REFINE_SPEC_CONTINUATION_MARKER} the current Sculpt Spec and every Spec-cited evidence image have already been inspected in this user turn.`,
    ...(invalidSpecRepair
      ? [
          `The current Spec is invalid only for these persisted validation issues: ${status.failureCodes.join(' | ')}.`,
          'Repair exactly those validation issues first; do not restart visual diagnosis or broaden the mutation.'
        ]
      : []),
    `Call ${TOOL_NAMES.patchSpec} now with projectId=${status.projectId} and sourceSpecVersionId=${status.currentSpecVersionId}.`,
    'Patch only the evidence-backed referenceCamera, materials, or existing component fields needed by the persisted review; do not recreate components already present.',
    `Then call ${TOOL_NAMES.validateSpec}. Do not call visual diagnostics, read_spec, read_evidence, or read_code again before this patch.`
  ].join(' ')
}

function findLatestHumanMessageIndex(messages: BaseMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].getType() === 'human') return index
  }
  return -1
}

function findLatestSuccessfulToolRecord(
  messages: BaseMessage[],
  toolName: string,
  afterMessageIndex: number
): { message: ToolMessage; output: Record<string, unknown> } | null {
  return findSuccessfulToolRecords(messages, toolName, afterMessageIndex).at(-1) ?? null
}

function findSuccessfulToolRecords(
  messages: BaseMessage[],
  toolName: string,
  afterMessageIndex: number
): Array<{ message: ToolMessage; output: Record<string, unknown> }> {
  const records: Array<{ message: ToolMessage; output: Record<string, unknown> }> = []
  for (let index = afterMessageIndex + 1; index < messages.length; index += 1) {
    const message = messages[index]
    if (!isToolMessage(message) || message.name !== toolName || message.status === 'error') continue
    const output = parseToolMessageRecord(message)
    if (output && typeof output.error !== 'string') records.push({ message, output })
  }
  return records
}

function collectEvidenceIdsFromUnknown(value: unknown): string[] {
  const evidenceIds = new Set<string>()
  const visit = (candidate: unknown, key?: string): void => {
    if (typeof candidate === 'string') {
      if (
        (key === 'evidenceId' || key === 'evidenceIds') &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
      ) {
        evidenceIds.add(candidate)
      }
      return
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, key)
      return
    }
    if (!candidate || typeof candidate !== 'object') return
    for (const [childKey, childValue] of Object.entries(candidate)) visit(childValue, childKey)
  }
  visit(value)
  return [...evidenceIds]
}

function appendWorkflowContinuationMessage<T extends {
  messages: BaseMessage[]
  systemPrompt?: string
}>(request: T): T {
  const markerIndex = Math.max(
    request.systemPrompt?.lastIndexOf(COMPLETED_CANDIDATE_MARKER) ?? -1,
    request.systemPrompt?.lastIndexOf(REFINE_SPEC_CONTINUATION_MARKER) ?? -1
  )
  if (markerIndex < 0) return request
  const instruction = request.systemPrompt!.slice(markerIndex).trim()
  const latestMessage = request.messages.at(-1)
  if (
    latestMessage?.getType() === 'human' &&
    typeof latestMessage.content === 'string' &&
    (
      latestMessage.content.includes(COMPLETED_CANDIDATE_MARKER) ||
      latestMessage.content.includes(REFINE_SPEC_CONTINUATION_MARKER)
    )
  ) {
    return request
  }
  return {
    ...request,
    messages: [
      ...request.messages,
      new HumanMessage(instruction)
    ]
  }
}

function agentToolName(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = (value as { name?: unknown }).name
  return typeof candidate === 'string' ? candidate : null
}

const toolSet = (...names: string[]) => new Set([TOOL_NAMES.getStatus, ...names])

/**
 * Enforce the durable project state at the actual Sandbox tool boundary. Tool
 * list filtering is only a model ergonomics optimization and cannot be relied
 * on for authority because independently registered middleware tools may still
 * be visible to the model.
 */
export function sandboxToolPolicyError(
  toolName: string,
  nextAction: string
): string | null {
  if (!toolName.startsWith('sandbox_')) return null
  if (!img2ThreeJsActionAllowsSandbox(nextAction)) {
    return `SANDBOX_TOOL_NOT_AVAILABLE_FOR_NEXT_ACTION: current nextAction=${nextAction}; ` +
      'follow the img2threejs status and use only its allowed workflow tools'
  }
  return null
}

/**
 * Keep the model-facing tool surface aligned with durable project state. This
 * does not gate any capability: every tool remains registered, and unknown
 * states deliberately fall back to the full surface. It only avoids sending
 * large, irrelevant schemas to the model on each reasoning step.
 */
export function img2ThreeJsToolsForNextAction(nextAction: string): ReadonlySet<string> | null {
  switch (nextAction) {
    case 'submit_images':
    case 'request_input':
      return toolSet(TOOL_NAMES.listEvidence, TOOL_NAMES.submitImages)
    case 'update_spec':
    case 'validate_spec':
    case 'refine_spec':
    case 'patch_spec_or_update_spec':
      return toolSet(
        TOOL_NAMES.listEvidence,
        TOOL_NAMES.readEvidence,
        TOOL_NAMES.readSpec,
        TOOL_NAMES.updateSpec,
        TOOL_NAMES.patchSpec,
        TOOL_NAMES.patchRuntimeContract,
        TOOL_NAMES.validateSpec,
        TOOL_NAMES.readVisualDiagnostics
      )
    case 'author_code':
      return toolSet(
        TOOL_NAMES.readSpec,
        TOOL_NAMES.readCode,
        TOOL_NAMES.inspectCodeFile,
        TOOL_NAMES.authorCodeFile,
        TOOL_NAMES.authorCode
      )
    case 'refine_code':
      return toolSet(
        TOOL_NAMES.readVisualDiagnostics,
        TOOL_NAMES.readCode,
        TOOL_NAMES.inspectCodeFile,
        TOOL_NAMES.authorCodeFile,
        TOOL_NAMES.authorCode,
        TOOL_NAMES.revalidateCode,
        TOOL_NAMES.patchCode,
        TOOL_NAMES.refineCode
      )
    case 'read_visual_diagnostics_then_refine_code':
      return toolSet(
        TOOL_NAMES.readVisualDiagnostics,
        TOOL_NAMES.readCode,
        TOOL_NAMES.inspectCodeFile,
        TOOL_NAMES.authorCodeFile,
        TOOL_NAMES.refineCode
      )
    case 'enqueue_stage':
    case 'enqueue_next_stage':
      return toolSet(TOOL_NAMES.enqueueStage)
    case 'wait_run':
      return toolSet(TOOL_NAMES.waitRun)
    case 'submit_review':
      return toolSet(TOOL_NAMES.readVisualDiagnostics, TOOL_NAMES.submitReview)
    case 'retry_run':
      return toolSet(TOOL_NAMES.readVisualDiagnostics, TOOL_NAMES.retryRun)
    case 'reply_summary':
      return toolSet(TOOL_NAMES.readArtifact, TOOL_NAMES.exportArtifact)
    default:
      return null
  }
}

export function img2ThreeJsActionAllowsSandbox(nextAction: string): boolean {
  return nextAction === 'author_code' ||
    nextAction === 'refine_code' ||
    nextAction === 'read_visual_diagnostics_then_refine_code'
}

export function isImg2ThreeJsToolAllowedForNextAction(toolName: string, nextAction: string): boolean {
  const allowed = img2ThreeJsToolsForNextAction(nextAction)
  return allowed === null || allowed.has(toolName)
}

function findReferenceImageAttachments(messages: BaseMessage[]): ReferenceImageAttachment[] {
  const attachmentsByEvidenceId = new Map<string, ReferenceImageAttachment>()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    // Keep admitted pixels visible for the whole current user turn. A Sculpt
    // Spec commonly needs several tool calls, and limiting the attachment to
    // the immediately following call lets later reasoning drift toward old
    // renders or generated artifacts.
    if (message.getType() === 'human') break
    if (!isToolMessage(message)) continue
    if (message.name !== TOOL_NAMES.readEvidence) continue
    const persisted = ReferenceImageAttachmentSchema.safeParse(message.artifact)
    const attachment = persisted.success
      ? persisted.data
      : findCachedReferenceImageAttachment(message.artifact)
    if (attachment && !attachmentsByEvidenceId.has(attachment.evidenceId)) {
      attachmentsByEvidenceId.set(attachment.evidenceId, attachment)
    }
  }
  return [...attachmentsByEvidenceId.values()].reverse()
}

function findReferenceImageDescriptors(messages: BaseMessage[]): Array<{
  projectId: string
  evidenceId: string
  revision: number
  sha256: string
}> {
  const descriptorsByEvidenceId = new Map<string, {
    projectId: string
    evidenceId: string
    revision: number
    sha256: string
  }>()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.getType() === 'human') break
    if (!isToolMessage(message) || message.name !== TOOL_NAMES.readEvidence) continue
    const projectId = recordString(message.artifact, 'projectId')
    const evidenceId = recordString(message.artifact, 'evidenceId')
    const revision = recordNumber(message.artifact, 'revision')
    const sha256 = recordString(message.artifact, 'sha256')
    if (
      projectId && evidenceId && revision !== null && sha256 &&
      !descriptorsByEvidenceId.has(evidenceId)
    ) {
      descriptorsByEvidenceId.set(evidenceId, { projectId, evidenceId, revision, sha256 })
    }
  }
  return [...descriptorsByEvidenceId.values()].reverse()
}

function findVisualDiagnosticsAttachments(messages: BaseMessage[]): VisualDiagnosticsAttachment[] {
  const attachmentsByRun = new Map<string, VisualDiagnosticsAttachment>()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.getType() === 'human') break
    if (!isToolMessage(message) || message.name !== TOOL_NAMES.readVisualDiagnostics) continue
    const persisted = VisualDiagnosticsAttachmentSchema.safeParse(message.artifact)
    const attachment = persisted.success
      ? persisted.data
      : findCachedVisualDiagnosticsAttachment(message.artifact)
    if (attachment && !attachmentsByRun.has(attachment.runId)) {
      attachmentsByRun.set(attachment.runId, attachment)
    }
  }
  return [...attachmentsByRun.values()].reverse()
}

function findCachedReferenceImageAttachment(value: unknown): ReferenceImageAttachment | null {
  const projectId = recordString(value, 'projectId')
  const evidenceId = recordString(value, 'evidenceId')
  const sha256 = recordString(value, 'sha256')
  const revision = recordNumber(value, 'revision')
  if (!projectId || !evidenceId || !sha256 || revision === null) return null
  return [...inspectedEvidenceByScope.values()].find((attachment) =>
    attachment.projectId === projectId &&
    attachment.evidenceId === evidenceId &&
    attachment.revision === revision &&
    attachment.sha256 === sha256
  ) ?? null
}

function findCachedVisualDiagnosticsAttachment(value: unknown): VisualDiagnosticsAttachment | null {
  const projectId = recordString(value, 'projectId')
  const runId = recordString(value, 'runId')
  const revision = recordNumber(value, 'revision')
  const runRevision = recordNumber(value, 'runRevision')
  if (!projectId || !runId || revision === null || runRevision === null) return null
  const descriptorImages = recordArray(value, 'images')
  const descriptorHashes = descriptorImages
    .map((image) => recordString(image, 'sha256'))
    .filter((hash): hash is string => Boolean(hash))
  return [...visualDiagnosticsByScope.values()].find((attachment) =>
    attachment.projectId === projectId &&
    attachment.runId === runId &&
    attachment.revision === revision &&
    attachment.runRevision === runRevision &&
    attachment.images.length === descriptorHashes.length &&
    attachment.images.every((image, index) => image.sha256 === descriptorHashes[index])
  ) ?? null
}

function recordNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null
}

function recordArray(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const candidate = (value as Record<string, unknown>)[key]
  return Array.isArray(candidate) ? candidate : []
}

function attachReferenceImagesToModelRequest<T extends { messages: BaseMessage[] }>(
  request: T,
  attachments: ReferenceImageAttachment[]
): T {
  return {
    ...request,
    messages: [
      ...request.messages,
      new HumanMessage({
        content: [
          {
            type: 'text',
            text: [
              'The admitted img2threejs reference image pixels are attached below.',
              'Reinspect these authoritative uploaded pixels on every reasoning step before writing or revising the Sculpt Spec.',
              'Do not infer visual content from hashes, dimensions, filenames, intake observations, or prior generated artifacts.',
              'Viewer scenes, model renders, and comparison images are outputs; they must never redefine the reference subject.',
              `Evidence ids: ${attachments.map((attachment) => attachment.evidenceId).join(', ')}.`
            ].join(' ')
          },
          ...attachments.map((attachment) => ({
            type: 'image_url' as const,
            image_url: {
              url: attachment.dataUrl,
              detail: 'high' as const
            }
          }))
        ]
      })
    ]
  }
}

function attachVisualDiagnosticsToModelRequest<T extends { messages: BaseMessage[] }>(
  request: T,
  attachments: VisualDiagnosticsAttachment[]
): T {
  const images = attachments.flatMap((attachment) => attachment.images.map((image) => ({
    runId: attachment.runId,
    image
  })))
  return {
    ...request,
    messages: [
      ...request.messages,
      new HumanMessage({
        content: [
          {
            type: 'text',
            text: [
              'The latest checksum-verified img2threejs browser output pixels are attached below.',
              'Inspect the generated render and reference-versus-render comparison visually before choosing any correction.',
              'Own the diagnosis: decide whether the defect belongs in the semantic Sculpt Spec or the executable TypeScript model.',
              'Metrics are measurements, not a substitute for inspecting these pixels.',
              `Runs: ${attachments.map((attachment) => attachment.runId).join(', ')}.`,
              `Image order: ${images.map(({ image }) => `${image.kind}:${image.view}`).join(', ')}.`
            ].join(' ')
          },
          ...images.map(({ image }) => ({
            type: 'image_url' as const,
            image_url: {
              url: image.dataUrl,
              detail: 'high' as const
            }
          }))
        ]
      })
    ]
  }
}

function attachVisionUnavailableNotice<T extends { messages: BaseMessage[] }>(
  request: T,
  attachments: ReferenceImageAttachment[]
): T {
  return {
    ...request,
    messages: [
      ...request.messages,
      new HumanMessage({
        content: [
          'MODEL_VISION_UNAVAILABLE: the active model profile does not explicitly declare imageInputs=true.',
          `Checksum-verified image attachments exist for evidence ids ${attachments.map((item) => item.evidenceId).join(', ')}, but their pixels were not sent to this model.`,
          `Do not claim visual inspection and do not call ${TOOL_NAMES.updateSpec} or ${TOOL_NAMES.patchRuntimeContract}. Choose request-input.`
        ].join(' ')
      })
    ]
  }
}

function attachVisualDiagnosticsUnavailableNotice<T extends { messages: BaseMessage[] }>(
  request: T,
  attachments: VisualDiagnosticsAttachment[]
): T {
  return {
    ...request,
    messages: [
      ...request.messages,
      new HumanMessage({
        content: [
          'MODEL_VISION_UNAVAILABLE: latest checksum-verified render diagnostics exist, but the active model profile does not explicitly declare imageInputs=true.',
          `Run ids: ${attachments.map((item) => item.runId).join(', ')}.`,
          'Do not claim visual inspection and do not guess geometry or camera corrections from metrics alone; choose request-input or a vision-capable model.'
        ].join(' ')
      })
    ]
  }
}

function modelExplicitlySupportsImageInputs(model: unknown): boolean {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: model, depth: 0 }]
  const visited = new Set<object>()
  const wrapperKeys = ['bound', 'model', 'client', 'runnable', 'lc_kwargs', 'config', 'kwargs', 'fields'] as const

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || !current.value || typeof current.value !== 'object') continue
    const candidate = current.value as Record<string, unknown>
    if (visited.has(candidate)) continue
    visited.add(candidate)
    const profile = candidate.profile
    if (profile && typeof profile === 'object' && (profile as Record<string, unknown>).imageInputs === true) {
      return true
    }
    const metadata = candidate.metadata
    if (metadata && typeof metadata === 'object') {
      const metadataProfile = (metadata as Record<string, unknown>).profile
      if (metadataProfile && typeof metadataProfile === 'object' &&
        (metadataProfile as Record<string, unknown>).imageInputs === true) {
        return true
      }
    }
    if (current.depth >= 4) continue
    for (const key of wrapperKeys) {
      const nested = candidate[key]
      if (nested && typeof nested === 'object') {
        queue.push({ value: nested, depth: current.depth + 1 })
      }
    }
  }
  return false
}

async function emit(
  context: IAgentMiddlewareContext,
  toolName: string,
  summary: string,
  status: 'running' | 'success' | 'fail'
): Promise<void> {
  try {
    await context.runtime.emitMiddlewareEvent?.({
      type: 'middleware_event',
      middlewareName: IMG2THREEJS_MIDDLEWARE_NAME,
      title: summary,
      message: summary,
      status,
      phase: 'tool',
      tool: toolName,
      data: { tool: toolName }
    })
  } catch {
    // Event delivery is informative and must never fail the business mutation.
  }
}

function scopeFromMiddleware(context: IAgentMiddlewareContext): Scope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined
      ? RequestContext.getOrganizationId()
      : context.organizationId,
    userId: context.userId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    xpertId: context.xpertId ?? null
  }
}
