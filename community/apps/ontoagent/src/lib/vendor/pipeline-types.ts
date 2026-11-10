import type { Assertion, Node, RetrievalArm } from './dsh-ontology-core/index.js'

/**
 * 从 dsh-ontology-plugin/src/pipeline.ts 抽取的 Auto 只读 pipeline 类型。
 * 仅保留 Auto 主链所需部分；legacy 生成/累积语义（extract、createPipeline）不随 vendor 带入。
 */
export interface CorpusDoc { id: string; text: string }

export type BootstrapStage = 'no-input' | 'extract' | 'parse' | 'gate' | 'conflict' | 'done'

export interface BootstrapResult {
  stage: BootstrapStage
  ok: boolean
  /** 模型声称提交的断言数 */
  proposed: number
  accepted: number
  /** 与库内已有断言键重复、未新增的数量 */
  duplicates: number
  rejected: number
  reasons: string[]
  version: string
  addedKeys: string[]
  /** base_version 是否与当前版本不符；必须可见 */
  baseVersionMismatch: boolean
  raw: string
}

export interface PipelineStats {
  bootstraps: number
  totalAdded: number
  lastVersion: string
}

export interface RetrievalSummary {
  arm: RetrievalArm
  indexVersion: string
  candidates: number
  hits: number
  noSignal: boolean
  degraded: boolean
  reason?: string
  relationIds: string[]
  stage?: 'exact' | 'dense' | 'blocked' | 'ambiguous'
  denseTop1?: number | null
  jevTop1?: number | null
  threshold?: number
  thresholdVersion?: string
  gateOn?: 'dense' | 'jev'
  exactMatches?: number
  cost: { embedded: number; judged: number; injected: number; chars: number }
}

export interface PreparedPrompt {
  prompt: string
  focus: string[]
  bootstrapped: boolean
  bootstrapResults: BootstrapResult[]
  version: string
  retrieval: RetrievalSummary
}

export interface Pipeline {
  ingestCorpus(corpus: CorpusDoc[]): Promise<BootstrapResult>
  prepareForTask(task: string): Promise<PreparedPrompt>
  stats(): PipelineStats
}

/**
 * Auto 只读 pipeline 对镜像服务的结构要求（原 dsh-ontology-plugin OntologyService 的调用面子集）。
 * 由插件服务以只读镜像实现：nodes/assertions 来自当前物化视图，health().version 为 mirrorVersion。
 */
export interface AutoContextService {
  nodes(): Node[]
  assertions(): Assertion[]
  health(): { version: string }
}
