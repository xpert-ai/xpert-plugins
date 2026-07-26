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
import type { ReferenceImageAttachment } from './img2threejs-agent-query.service.js'
import { Img2ThreeJsService } from './img2threejs.service.js'
import {
  CancelRunToolSchema,
  ChangeSummaryProbeSchema,
  CreateProjectToolSchema,
  EnqueueStageToolSchema,
  ExportArtifactToolSchema,
  GetStatusToolSchema,
  ListEvidenceToolSchema,
  ListProjectsToolSchema,
  RefineCodeToolSchema,
  ReadArtifactToolSchema,
  ReadEvidenceToolSchema,
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
    const json = async <T>(operation: Promise<T>): Promise<string> => JSON.stringify(await operation)
    const inspectedEvidence = new Map<string, ReferenceImageAttachment>()
    let activeTurnFingerprint: string | null = null
    const inspectionKey = (projectId: string, evidenceId: string, revision: number) =>
      `${projectId}:${evidenceId}:${revision}`
    const inspectEvidence = async (input: z.infer<typeof ReadEvidenceToolSchema>) => {
      const [result] = await Promise.all([
        this.agentQuery.readEvidence(scope, input),
        this.agentQuery.readEvidenceImage(scope, input)
      ])
      return result
    }
    const assertSpecEvidenceInspected = (input: z.infer<typeof UpdateSpecToolSchema>) => {
      const missing = collectSpecEvidenceIds(input.spec).filter((evidenceId) =>
        !inspectedEvidence.has(inspectionKey(input.projectId, evidenceId, input.baseRevision))
      )
      if (missing.length > 0) {
        throw new Error(
          `EVIDENCE_INSPECTION_REQUIRED: call ${TOOL_NAMES.readEvidence} for every Sculpt Spec evidenceId ` +
          `at expectedRevision ${input.baseRevision} immediately before ${TOOL_NAMES.updateSpec}. ` +
          `Missing: ${missing.join(', ')}`
        )
      }
    }
    const consumeProjectInspections = (projectId: string) => {
      for (const [key, attachment] of inspectedEvidence) {
        if (attachment.projectId === projectId) inspectedEvidence.delete(key)
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
      if (activeTurnFingerprint !== null && activeTurnFingerprint !== fingerprint) {
        inspectedEvidence.clear()
      }
      activeTurnFingerprint = fingerprint
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
          json(this.service.submitImages(scope, input)),
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
          description: 'Resolve one admitted reference image at the exact project revision and keep its checksum-verified pixels attached to every later model call in the current user turn. Call this for every admitted image after all other read-only context tools and immediately before authoring a Sculpt Spec. update_spec rejects evidence that was not inspected at its baseRevision.',
          schema: ReadEvidenceToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ReadSpecToolSchema>) =>
          json(this.service.readCurrentSpec(scope, input.projectId, input.expectedRevision)),
        {
          name: TOOL_NAMES.readSpec,
          description: 'Read the current exact Sculpt Spec after discovering a project id. This is the only tool that returns the full spec.',
          schema: ReadSpecToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof UpdateSpecToolSchema>) => {
          assertSpecEvidenceInspected(input)
          const result = await this.service.updateSpec(scope, input)
          consumeProjectInspections(input.projectId)
          return JSON.stringify(result)
        },
        {
          name: TOOL_NAMES.updateSpec,
          description: 'Create a new immutable Sculpt Spec version with compare-and-swap protection. This mutation is rejected unless every evidenceId used by the Spec was checksum-verified through read_evidence at the same baseRevision in the current user turn.',
          schema: UpdateSpecToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof ValidateSpecToolSchema>) =>
          json(this.service.validateCurrentSpec(scope, input.projectId, input.expectedRevision)),
        {
          name: TOOL_NAMES.validateSpec,
          description: 'Strictly validate the current Sculpt Spec, hierarchy, fixed camera, feature targets, runtime references, route, and admitted evidence coverage before queueing blockout.',
          schema: ValidateSpecToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof RefineCodeToolSchema>) =>
          json(this.service.refineCode(scope, input)),
        {
          name: TOOL_NAMES.refineCode,
          description: 'Validate and save a refined Three.js TypeScript source file from scoped Workspace Files after the next decision is refine-code. Requires the current project revision and source SHA-256.',
          schema: RefineCodeToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof EnqueueStageToolSchema>) =>
          json(this.service.enqueueStage(scope, input)),
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
          description: 'Get compact project/run status for a later user message or recovery after an interrupted wait loop.',
          schema: GetStatusToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof SubmitReviewToolSchema>) =>
          json(this.service.submitReview(scope, input)),
        {
          name: TOOL_NAMES.submitReview,
          description: 'Persist human review and choose exactly continue, refine-spec, refine-code, request-input, or stop. A failed persisted reference-fidelity hard gate cannot be approved. Use the current run revision. If alreadyPersisted=true, stop calling tools and report the existing next action.',
          schema: SubmitReviewToolSchema,
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
          json(this.service.cancelRun(scope, input)),
        {
          name: TOOL_NAMES.cancelRun,
          description: 'Cancel a known Managed Queue run using its current revision. This is a consequential action and requires confirmed user intent.',
          schema: CancelRunToolSchema,
          verboseParsingErrors: true
        }
      ),
      defineAgentTool(
        async (input: z.infer<typeof RetryRunToolSchema>) =>
          json(this.service.retryRun(scope, input)),
        {
          name: TOOL_NAMES.retryRun,
          description: 'Retry the failed or cancelled stage of a known run without duplicating passed stages.',
          schema: RetryRunToolSchema,
          verboseParsingErrors: true
        }
      )
    ]

    return {
      name: IMG2THREEJS_MIDDLEWARE_NAME,
      tools,
      wrapModelCall: async (request, handler) => {
        resetInspectionForNewTurn(request.messages)
        const attachments = findReferenceImageAttachments(request.messages)
        if (attachments.length === 0) return handler(request)
        if (!modelExplicitlySupportsImageInputs(request.model)) {
          return handler(attachVisionUnavailableNotice(request, attachments))
        }
        const response = await handler(attachReferenceImagesToModelRequest(request, attachments))
        for (const attachment of attachments) {
          inspectedEvidence.set(
            inspectionKey(attachment.projectId, attachment.evidenceId, attachment.revision),
            attachment
          )
        }
        return response
      },
      wrapToolCall: async (request, handler) => {
        const toolName = request.toolCall.name
        const parsed = ChangeSummaryProbeSchema.safeParse(request.toolCall.args)
        const summary = parsed.success ? parsed.data.changeSummary : null
        if (summary) await emit(context, toolName, summary, 'running')
        try {
          let result = await handler(request)
          if (toolName === TOOL_NAMES.readEvidence && isToolMessage(result)) {
            const input = ReadEvidenceToolSchema.parse(request.toolCall.args)
            let attachment = inspectedEvidence.get(
              inspectionKey(input.projectId, input.evidenceId, input.expectedRevision)
            )
            if (!attachment) {
              attachment = await this.agentQuery.readEvidenceImage(scope, input)
              inspectedEvidence.set(
                inspectionKey(input.projectId, input.evidenceId, input.expectedRevision),
                attachment
              )
            }
            result = attachReferenceImageToToolMessage(result, attachment)
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
    artifact: verified,
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
    projectRevision: attachment.revision,
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
    const parsed = ReferenceImageAttachmentSchema.safeParse(message.artifact)
    if (parsed.success && !attachmentsByEvidenceId.has(parsed.data.evidenceId)) {
      attachmentsByEvidenceId.set(parsed.data.evidenceId, parsed.data)
    }
  }
  return [...attachmentsByEvidenceId.values()].reverse()
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
          `Do not claim visual inspection and do not call ${TOOL_NAMES.updateSpec}. Choose request-input.`
        ].join(' ')
      })
    ]
  }
}

function modelExplicitlySupportsImageInputs(model: unknown): boolean {
  if (!model || typeof model !== 'object') return false
  const candidate = model as {
    profile?: { imageInputs?: unknown }
    metadata?: { profile?: { imageInputs?: unknown } }
  }
  return candidate.profile?.imageInputs === true ||
    candidate.metadata?.profile?.imageInputs === true
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
