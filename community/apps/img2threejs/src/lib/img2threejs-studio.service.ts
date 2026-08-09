import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import { BUILD_STAGES, IMG2THREEJS_ARTIFACT_NAMESPACE } from './constants.js'
import { createImageDerivedSculptSpec } from './domain/image-derived-sculpt-spec.js'
import { analyzeImageRelief } from './domain/image-relief-analysis.js'
import type { BuildStage, ModelingMode, ModelRoute, Scope } from './domain/types.js'
import { ImageEvidenceEntity, ModelProjectEntity } from './entities/index.js'
import { Img2ThreeJsService } from './img2threejs.service.js'
import {
  requireRevision,
  scopedIdWhere,
  scopedProjectWhere
} from './img2threejs.service-support.js'
import { WorkspaceFilesAdapter } from './platform/capability-adapters.js'

const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type StudioImageView = ImageEvidenceEntity['view']

@Injectable()
export class Img2ThreeJsStudioService {
  private readonly workspaceFiles: WorkspaceFilesAdapter

  constructor(
    @InjectRepository(ModelProjectEntity)
    private readonly projects: Repository<ModelProjectEntity>,
    @InjectRepository(ImageEvidenceEntity)
    private readonly images: Repository<ImageEvidenceEntity>,
    private readonly service: Img2ThreeJsService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    runtimeCapabilities?: RuntimeCapabilityRegistry
  ) {
    this.workspaceFiles = new WorkspaceFilesAdapter(runtimeCapabilities)
  }

  createProject(scope: Scope, input: {
    name: string
    route: ModelRoute
    modelingMode: ModelingMode
  }) {
    return this.service.createProject(scope, input)
  }

  async uploadReference(scope: Scope, input: {
    projectId: string
    baseRevision: number
    label: string
    view: StudioImageView
    fileName: string
    mimeType: string
    buffer: Buffer
  }) {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (!ACCEPTED_IMAGE_TYPES.has(input.mimeType)) throw new Error('UNSUPPORTED_IMAGE_TYPE')
    if (input.buffer.length === 0) throw new Error('EMPTY_IMAGE')
    const fileName = safeFileName(input.fileName)
    const asset = await this.workspaceFiles.write(scope, {
      folder: `${IMG2THREEJS_ARTIFACT_NAMESPACE}/${project.id}/references`,
      fileName,
      mimeType: input.mimeType,
      buffer: input.buffer
    })
    return this.service.submitImages(scope, {
      projectId: project.id,
      baseRevision: input.baseRevision,
      images: [{
        filePath: asset.filePath,
        label: input.label,
        view: input.view
      }]
    })
  }

  async startGeneration(scope: Scope, input: {
    projectId: string
    baseRevision: number
  }) {
    let project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (project.modelingMode === 'semantic-3d') {
      const reconciled = await this.service.reconcileCurrentSpecRuntimeContract(scope, {
        projectId: project.id,
        baseRevision: project.revision
      })
      if (reconciled) project = await this.requireProject(scope, project.id)
      // A validated Agent-authored Spec is already the semantic hand-off unless
      // it is the rejected Spec restored after an interrupted refinement. In
      // that recovery state the persisted human decision remains authoritative
      // even though startup reconciliation normalizes the project status.
      const codeReady = project.status === 'spec_ready'
        ? await this.service.hasCurrentAssistantCode(scope, project)
        : false
      if (
        project.status === 'spec_ready' &&
        project.humanReviewStatus !== 'changes_requested' &&
        codeReady
      ) {
        return this.enqueueNextStage(scope, project)
      }
      const evidence = await this.images.find({
        where: {
          ...scopedProjectWhere(scope, project.id),
          admissionStatus: 'admitted'
        },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 12
      })
      if (evidence.length === 0) throw new Error('ADMITTED_IMAGE_REQUIRED')
      const evidenceIds = evidence.map((item) => item.id)
      const artifact = project.humanReviewStatus === 'changes_requested'
        ? await this.service.readArtifact(scope, project.id)
        : null
      const reviewContext = artifact?.visualReview ? {
        notes: artifact.visualReview.notes?.slice(0, 1_600) ?? null,
        failureCodes: artifact.renderReport?.quality?.failureCodes ?? [],
        referenceAlignment: artifact.renderReport?.quality?.referenceAlignment ?? null,
        featureResults: artifact.renderReport?.quality?.featureResults?.slice(0, 12) ?? []
      } : null
      return {
        projectId: project.id,
        revision: project.revision,
        status: project.status,
        semanticAnalysisOwner: 'agent-chat' as const,
        nextAction: 'ask_agent_to_analyze_evidence' as const,
        evidenceIds,
        suggestedPrompt: buildSemanticGenerationPrompt({
          projectId: project.id,
          projectName: project.name,
          revision: project.revision,
          evidenceIds,
          currentCodeVersionId: project.currentCodeVersionId,
          needsSpecUpdate:
            project.nextDecision !== 'refine-code' &&
            (project.status !== 'spec_ready' || project.humanReviewStatus === 'changes_requested'),
          reviewContext
        })
      }
    }
    const status = await this.service.getStatus(scope, project.id)
    if (
      status.status === 'queued' ||
      status.status === 'running' ||
      (status.runId && status.completedStages.length > 0 && status.completedStages.length < BUILD_STAGES.length)
    ) {
      return this.enqueueNextStage(scope, project)
    }
    const evidence = await this.images.find({
      where: { ...scopedProjectWhere(scope, project.id), admissionStatus: 'admitted' },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 12
    })
    if (evidence.length === 0) throw new Error('ADMITTED_IMAGE_REQUIRED')

    const primary = selectPrimaryEvidence(evidence)
    const source = await this.workspaceFiles.read(scope, primary.asset.filePath)
    if (source.asset.sha256 !== primary.sha256) throw new Error('REFERENCE_IMAGE_CHECKSUM_MISMATCH')
    const analysis = await analyzeImageRelief(source.buffer, primary.mimeType)
    const spec = createImageDerivedSculptSpec({
      projectName: project.name,
      route: project.route,
      primaryEvidenceId: primary.id,
      evidence: evidence.map(({ id, view }) => ({ id, view })),
      analysis
    })
    const updated = await this.service.updateSpec(scope, {
      projectId: project.id,
      baseRevision: project.revision,
      spec,
      confidence: analysis.confidence,
      changeSummary: `Created ${analysis.algorithm} Sculpt Spec from admitted image pixels.`
    })
    if (updated.validationStatus !== 'valid') throw new Error('IMAGE_DERIVED_SCULPT_SPEC_INVALID')
    return this.service.enqueueStage(scope, {
      projectId: project.id,
      baseRevision: updated.revision,
      stage: 'blockout'
    })
  }

  async advanceGeneration(scope: Scope, input: {
    projectId: string
    baseRevision: number
  }) {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    return this.enqueueNextStage(scope, project)
  }

  private async enqueueNextStage(scope: Scope, project: ModelProjectEntity) {
    const status = await this.service.getStatus(scope, project.id)
    if (status.status === 'queued' || status.status === 'running') {
      return {
        projectId: project.id,
        revision: status.revision,
        runId: status.runId,
        runRevision: status.runRevision,
        status: status.status,
        stage: status.currentStage,
        cursor: status.cursor,
        nextAction: 'wait_run' as const
      }
    }
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(status.status === 'failed' ? 'PIPELINE_REFINEMENT_REQUIRED' : 'PIPELINE_CANCELLED')
    }
    if (status.nextDecision !== 'continue') throw new Error('PIPELINE_DECISION_BLOCKED')
    const completed = new Set(status.completedStages)
    const stage = BUILD_STAGES.find((candidate) => !completed.has(candidate)) ?? null
    if (!stage) {
      return {
        projectId: project.id,
        revision: status.revision,
        runId: status.runId,
        runRevision: status.runRevision,
        status: status.status,
        stage: null,
        cursor: status.cursor,
        nextAction: 'submit_review' as const
      }
    }
    return this.service.enqueueStage(scope, {
      projectId: project.id,
      baseRevision: status.revision,
      stage: stage satisfies BuildStage
    })
  }

  private async requireProject(scope: Scope, projectId: string): Promise<ModelProjectEntity> {
    const project = await this.projects.findOne({ where: scopedIdWhere(scope, projectId) })
    if (!project) throw new Error('PROJECT_NOT_FOUND')
    return project
  }
}

function buildSemanticGenerationPrompt(input: {
  projectId: string
  projectName: string
  revision: number
  evidenceIds: string[]
  currentCodeVersionId: string | null
  needsSpecUpdate: boolean
  reviewContext: {
    notes: string | null
    failureCodes: string[]
    referenceAlignment: unknown
    featureResults: unknown[]
  } | null
}): string {
  const context = {
    intent: 'regenerate_from_references',
    projectId: input.projectId,
    projectName: input.projectName,
    admittedEvidenceIds: input.evidenceIds,
    needsSpecUpdate: input.needsSpecUpdate,
    currentCodeVersionId: input.currentCodeVersionId,
    review: input.reviewContext
  }
  const instructions = [
    `宿主可信任务上下文：${JSON.stringify(context)}`,
    '若当前或最近 run 已有成功浏览器渲染，必须调用 img2threejs_read_visual_diagnostics，实际观察其附带的最新 render 与 comparison 像素后，自主判断缺陷属于 semantic Spec 还是可执行 TypeScript；禁止仅根据分数、文件名、文字摘要或外部给定几何参数猜测纠错。生成图只用于诊断，已接纳原图仍是主体真值。',
    '严格使用上述项目、证据和内嵌 review；review.notes 与门禁指标是必须逐条落实的宿主可信硬约束。仍须调用只读工具核验完整记录，但不得遗漏、弱化或改写这些要求，也禁止通过降低质量阈值过关。并发状态由服务端内部管理，Agent 不应自行传递并发控制参数。',
    '绝对协议覆盖：semantic-3d 的 spec.components 禁止超过 30，后端也会拒绝；不得生成 55/60/80 个 Spec JSON 部件。旧会话、旧 tool output 或人审 notes 中任何“实际 components 至少 55”的表述现统一解释为运行时 Mesh 门槛，旧解释已经废止。后端仍从未完成人审提取 minimumComponentCount，并强制 qualityContract 下限、原 featureReviewTargets 及阈值不得降低。Spec 保持 12–30 个可审计语义部件；Assistant 编写的 TypeScript 必须用循环或辅助函数实例化至少 minimumComponentCount 个真实、可见、非空 Mesh，浏览器按运行时对象硬计数。',
    '若 read_spec 表明当前 semantic blueprint 已覆盖房屋、屋顶、人物、树木、电线杆等主要语义，且只需把人审 55 门槛落实为运行时计数，禁止重传完整 Spec；read_evidence 后调用 img2threejs_patch_runtime_contract，传精确 sourceSpecVersionId 和 minimumRuntimeMeshCount=55。该小工具会复制当前 Spec、只提高运行时质量契约并生成新不可变版本。',
    '若视觉诊断要求 refine-spec，但当前有效蓝图只需调整 referenceCamera、silhouetteIntent、已有 component 的 transform/geometry/materialId 或已有 material 外观，read_spec 与 read_evidence 后优先调用 img2threejs_patch_spec，传精确 sourceSpecVersionId；该工具合并并验证完整 Spec，且不能修改质量阈值。只有新增语义部件或更换整体蓝图时才重传完整 update_spec。',
    '单次视觉纠正迭代最多允许一次成功的 Spec mutation。patch_spec、patch_runtime_contract 或 update_spec 首次返回 valid 后必须冻结该 Spec：只 validate 一次，随后完整写完、inspect 并提交 TypeScript 候选，浏览器渲染后才能再次修改 Spec。禁止在 sandbox_write_file/sandbox_append_file 分段之间重复 patch_spec。STALE_SPEC_VERSION 只要求重新读取当前状态，不得重放已经成功的补丁；若已有未完成 Assistant candidate，保持当前 Spec 冻结并先完成候选。',
    '所有 component.transform 都是 parent-local 坐标；子部件不得重复叠加父部件的世界位置。referenceCamera 必须让完整世界包围盒留有至少 15% 画面边距，不得裁切主体。若相机校验给出 available 与 required，至少将 (position-target) 向量放大到 required/available 的 1.10 倍后再试，不要逐小步猜测。',
    '写入前逐项预检几何字段：rounded-box 的 width/height/depth 均不得超过 20，radius 不得超过三者最小值的一半；extrude-shape.depth 不得超过 10；所有字段必须满足工具 schema。',
    'Assistant 必须亲自编写完整、对象专属的 Three.js TypeScript，不能只提交元素配置，也不能复制原仓库源码。源码只允许 three/three examples imports，必须导出 create*Model、覆盖 Spec 中每个 component id、写入 root.userData.img2threejs，并以独立 Mesh 或 InstancedMesh 实例满足 qualityContract.minimumComponentCount；不得使用动态代码、网络、Worker、浏览器存储或 Python。',
    'validate_spec 成功后采用文件优先协议：用 sandbox_write_file/sandbox_append_file 把完整源码写到 /workspace/img2threejs-assistant/<projectId>/model-spec-<specVersionId>.ts；这个路径由不可变 Spec 版本标识确定，不依赖并发状态。每次文件调用都必须传精确 file_path，content 不得超过 8000 字符，等待当前分段成功后才顺序追加下一段，禁止把完整生产模块塞进一次工具调用。首次 sandbox_write_file 成功后该路径已存在，本次尝试后续只能 sandbox_append_file，绝不能再次 write；任何返回 JSON 只要含非空 error 就是失败，即使外层 status=success。already exists 后先用 get_status 检查 assistantCodeCandidate：若候选路径可用就直接 author_code_file，不要重写；若它是未完成内容，再选择新的 model-repair-<intent>.ts 继续。不要因未经工具验证的语法猜测反复重建候选，先写完计划分段并让 author_code_file 返回确定性诊断。文件工具 schema/error 只表示该源码分段未持久化，不会使当前有效 Spec 失效；此时只重试更小且 schema 完整的文件分段，禁止因此再次 update_spec、patch_spec 或 patch_runtime_contract。author_code_file 只需精确路径，服务端会读取并固化当前字节，不要传 checksum 或并发字段。currentCodeVersionId 为空时用 mode=create、baseCodeVersionId=null；非空时先用 includeSource=false 调 read_code，再通过其 sourceFilePath 使用 sandbox_read_file 读取并在新工作文件中精修，最后用 mode=refine 和该精确版本提交。只有 Sandbox Files 不可用且完整源码小于 12000 字符时才用内联 author_code。author_code_file 通过后停止本轮，由 Studio 启动八阶段构建。'
  ]
  if (input.needsSpecUpdate) {
    instructions.splice(3, 0,
      '所有只读上下文读取完成后，必须对每个 admittedEvidenceId 调用 read_evidence，再写入一个新 Spec；若当前有效蓝图只需局部视觉纠正，优先用 patch_spec；只需提升运行时 Mesh 门槛则用 patch_runtime_contract，均禁止重传完整 Spec。工具会自动使用当前权威状态。后端会拒绝未在当前轮次复核像素的 update_spec、patch_spec 或 patch_runtime_contract。',
      '成功持久化的 update_spec 会消费证据授权；未持久化任何内容的 schema/tool error 不会消费。若历史模型消息中已有相同 SHA-256 的真实像素附件，middleware 会重新解析当前证据，仅在 checksum 未变化时续期授权。update_spec 返回 validationStatus=invalid 时，按返回的 issues 修正并重新 read_evidence。第一次返回 validationStatus=valid 后禁止再次调用 update_spec，立即调用 validate_spec；valid 后继续文件优先的 author_code_file，禁止再次改 Spec。'
    )
  } else {
    instructions.splice(3, 0,
      '当前 Spec 不需要重写：读取并验证精确当前 Spec。若 currentCodeVersionId 非空，必须用 includeSource=false 调 read_code，通过返回的 sourceFilePath 用 Sandbox Files 读取，写入新的唯一工作文件，inspect 后以 author_code_file mode=refine 提交完整 Assistant 替换源码；只有 currentCodeVersionId 为空时才从零编写首版源码。不得调用 update_spec 或 patch_runtime_contract。'
    )
  }
  instructions.push('无法读取真实像素或无法通过 Sandbox Files 读取完整当前源码时选择 request-input。')
  return instructions.join('\n')
}

function selectPrimaryEvidence(evidence: ImageEvidenceEntity[]): ImageEvidenceEntity {
  return evidence.find((item) => item.view === 'front') ??
    evidence.find((item) => item.view === 'three-quarter') ??
    evidence[0]!
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 120)
  return normalized || 'reference-image'
}
