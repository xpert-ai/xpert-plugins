import {
  buildTermDocuments, compileGovernedContext, createCachedDensePort, retrieveTerms,
  CLARIFY_FIRST_DENSE_FLOOR,
  type DenseRecallPort, type JudgePort, type TermDocument,
} from './dsh-ontology-core/index.js'
import type { AutoSyncManifest } from './dsh-auto-ontology-adapter/index.js'
import type { BootstrapResult, Pipeline, PipelineStats, PreparedPrompt } from './pipeline-types.js'
import type { AutoContextService } from './pipeline-types.js'

/** auto-clarify-v1：唯一启用“非完美命中先澄清”的 gateVersion；旧版本保持旧门行为。 */
export const AUTO_CLARIFY_GATE_VERSION = 'auto-clarify-v1'

/** 注入门配置：阈值必须由 dev 校准后冻结，并带版本号。 */
export interface AutoContextGateOptions {
  /** 门基于 dense top1（默认）或 Jev top1；auto-clarify-v1 固定 dense 候选下限 */
  gateOn?: 'dense' | 'jev'
  threshold: number
  thresholdVersion?: string
  denseLimit?: number
  rerankLimit?: number
}

export interface AutoContextPipelineOptions {
  service: AutoContextService
  manifest?: AutoSyncManifest | null | (() => AutoSyncManifest | null)
  stale?: boolean
  maxTerms?: number
  maxAssertions?: number
  maxChars?: number
  /**
   * 可选 dense/Jev 端口。不注入 = 保持当前纯词法路径（不依赖模型）。
   * 注入 dense + gate 才启用“精确层 → dense 候选 → Jev”的分层检索；
   * gateVersion=auto-clarify-v1 时非 exact 先澄清，其余版本保持原分数门。
   */
  dense?: DenseRecallPort
  judge?: JudgePort
  gate?: AutoContextGateOptions
}

export function createAutoContextPipeline(options: AutoContextPipelineOptions): Pipeline {
  // 文档按文本缓存；视图版本变化时清空并重算术语文档。
  const dense = options.dense === undefined ? undefined : createCachedDensePort(options.dense)
  let docCache: { version: string; docs: TermDocument[] } | null = null
  const documentsFor = (version: string): TermDocument[] => {
    if (docCache?.version !== version) {
      docCache = { version, docs: buildTermDocuments(options.service.nodes(), options.service.assertions()) }
    }
    return docCache.docs
  }

  return {
    async ingestCorpus(): Promise<BootstrapResult> {
      const version = options.service.health().version
      return {
        stage: 'no-input', ok: false, proposed: 0, accepted: 0, duplicates: 0, rejected: 0,
        reasons: ['ontology_generation_disabled: 语料必须交由 Auto-Ontology 治理'],
        version, addedKeys: [], baseVersionMismatch: false, raw: '',
      }
    },

    async prepareForTask(task: string): Promise<PreparedPrompt> {
      const version = options.service.health().version
      const manifest = typeof options.manifest === 'function' ? options.manifest() : options.manifest
      const stale = options.stale === true || manifest?.stale === true
      const nodes = options.service.nodes()
      const assertions = options.service.assertions()
      const missing = manifest == null && assertions.length === 0
      const base = {
        baseVersion: { hash: version, scope: 'gov:auto' },
        sourceDigest: manifest?.sourceDigest,
        stale,
        maxTerms: options.maxTerms,
        maxAssertions: options.maxAssertions,
        maxChars: options.maxChars,
      }

      if (missing) {
        const prompt = [
          '# GOVERNED ONTOLOGY CONTEXT',
          '- auto_snapshot_missing：尚未同步 Auto-Ontology 认证快照；不得生成本体或猜测口径。',
          '- 可以回答通用问题，但不得把通用知识说成已认证本体口径。',
          '- mirror=' + version,
        ].join('\n')
        return {
          prompt, focus: [], bootstrapped: false, bootstrapResults: [], version,
          retrieval: {
            arm: 'lexical', indexVersion: version, candidates: 0, hits: 0, noSignal: true,
            degraded: true, reason: 'auto_snapshot_missing', relationIds: [],
            cost: { embedded: 0, judged: 0, injected: 0, chars: prompt.length },
          },
        }
      }

      // auto-clarify-v1 明确要求新管道；dense 端口缺失时显式 degraded，不回退词法。
      if (
        options.gate !== undefined && options.gate.threshold > 0
        && options.gate.thresholdVersion === AUTO_CLARIFY_GATE_VERSION && dense === undefined
      ) {
        const prompt = [
          '# GOVERNED ONTOLOGY CONTEXT',
          '- 本体检索降级（dense_unavailable）；本轮不注入本体，避免把未验证术语当成依据。',
          '- 可以回答通用问题，但不得声称来自已认证本体口径。',
          '- mirror=' + version + (stale ? '；stale=true' : ''),
        ].join('\n')
        return {
          prompt, focus: [], bootstrapped: false, bootstrapResults: [], version,
          retrieval: {
            arm: 'dense', indexVersion: version, candidates: 0, hits: 0,
            noSignal: true, degraded: true, reason: 'dense_unavailable', relationIds: [],
            stage: 'blocked', denseTop1: null, jevTop1: null,
            threshold: CLARIFY_FIRST_DENSE_FLOOR, thresholdVersion: options.gate.thresholdVersion,
            gateOn: 'dense', exactMatches: 0,
            cost: { embedded: 0, judged: 0, injected: 0, chars: prompt.length },
          },
        }
      }

      // 注入 dense + gate 才启用分层检索；缺一个都保持纯词法路径（红线 5）。
      if (dense !== undefined && options.gate !== undefined) {
        const clarifyFirst = options.gate.thresholdVersion === AUTO_CLARIFY_GATE_VERSION
        const retrieval = await retrieveTerms({
          task, nodes, assertions, dense, judge: options.judge,
          ...(options.gate.gateOn === undefined ? {} : { gateOn: options.gate.gateOn }),
          threshold: options.gate.threshold,
          thresholdVersion: options.gate.thresholdVersion,
          denseLimit: options.gate.denseLimit,
          rerankLimit: options.gate.rerankLimit,
          ...(clarifyFirst ? { clarifyFirst: true } : {}),
          documents: documentsFor(version),
        })
        if (retrieval.degraded) {
          const prompt = [
            '# GOVERNED ONTOLOGY CONTEXT',
            '- 本体检索降级（' + String(retrieval.reason ?? 'unknown') + '）；本轮不注入本体，避免把未验证术语当成依据。',
            '- 可以回答通用问题，但不得声称来自已认证本体口径。',
            '- mirror=' + version + (stale ? '；stale=true' : ''),
          ].join('\n')
          return {
            prompt, focus: [], bootstrapped: false, bootstrapResults: [], version,
            retrieval: {
              arm: options.judge === undefined ? 'dense' : 'jev',
              indexVersion: version,
              candidates: retrieval.denseHits.length,
              hits: 0, noSignal: true, degraded: true,
              reason: retrieval.reason, relationIds: [], stage: retrieval.stage,
              denseTop1: retrieval.denseTop1, jevTop1: retrieval.jevTop1,
              threshold: retrieval.decision.threshold, thresholdVersion: options.gate.thresholdVersion,
              gateOn: retrieval.decision.gateOn,
              exactMatches: retrieval.exact.termIds.length,
              cost: { embedded: retrieval.cost.embedded, judged: retrieval.cost.judged, injected: 0, chars: prompt.length },
            },
          }
        }
        if (retrieval.stage === 'ambiguous' && retrieval.clarification !== undefined) {
          const result = compileGovernedContext({
            ...base, task, nodes, assertions, clarification: retrieval.clarification,
          })
          return {
            prompt: result.prompt,
            focus: [],
            bootstrapped: false,
            bootstrapResults: [],
            version,
            retrieval: {
              arm: options.judge === undefined ? 'dense' : 'jev',
              indexVersion: version,
              candidates: retrieval.clarification.options.length,
              hits: 0, noSignal: false, degraded: stale,
              ...(stale ? { reason: 'auto_snapshot_stale' } : retrieval.reason === undefined ? {} : { reason: retrieval.reason }),
              relationIds: [], stage: 'ambiguous',
              denseTop1: retrieval.denseTop1,
              jevTop1: retrieval.jevTop1,
              threshold: retrieval.decision.threshold,
              thresholdVersion: options.gate.thresholdVersion,
              gateOn: retrieval.decision.gateOn,
              exactMatches: retrieval.exact.termIds.length,
              cost: { embedded: retrieval.cost.embedded, judged: retrieval.cost.judged, injected: 0, chars: result.prompt.length },
            },
          }
        }
        const result = compileGovernedContext({
          ...base, task, nodes, assertions,
          candidateTerms: retrieval.candidates,
          ...(clarifyFirst && retrieval.stage === 'exact' ? { requireAllCandidates: true } : {}),
          ...(retrieval.stage === 'blocked' ? { noCoverageReason: 'low_relevance' as const } : {}),
        })
        return {
          prompt: result.prompt,
          focus: result.focus,
          bootstrapped: false,
          bootstrapResults: [],
          version,
          retrieval: {
            arm: retrieval.stage === 'exact' ? 'lexical' : (options.judge === undefined ? 'dense' : 'jev'),
            indexVersion: version,
            candidates: retrieval.stage === 'exact' ? retrieval.exact.termIds.length : retrieval.denseHits.length,
            hits: result.packet.assertions.length,
            noSignal: result.noCoverage,
            degraded: stale,
            // stale 仍由 degraded 表示；预算整体失败时 reason 优先于 stale，避免被 auto_snapshot_stale 覆盖。
            ...(result.budgetFailure !== undefined
              ? { reason: result.budgetFailure }
              : stale ? { reason: 'auto_snapshot_stale' } : retrieval.reason === undefined ? {} : { reason: retrieval.reason }),
            relationIds: [],
            stage: retrieval.stage,
            denseTop1: retrieval.denseTop1,
            jevTop1: retrieval.jevTop1,
            threshold: retrieval.decision.threshold,
            thresholdVersion: options.gate.thresholdVersion,
            gateOn: retrieval.decision.gateOn,
            exactMatches: retrieval.exact.termIds.length,
            cost: {
              embedded: retrieval.cost.embedded,
              judged: retrieval.cost.judged,
              injected: result.packet.assertions.length,
              chars: result.prompt.length,
            },
          },
        }
      }

      const result = compileGovernedContext({ ...base, task, nodes, assertions })
      return {
        prompt: result.prompt,
        focus: result.focus,
        bootstrapped: false,
        bootstrapResults: [],
        version,
        retrieval: {
          arm: 'lexical',
          indexVersion: version,
          candidates: result.matchedTerms.length,
          hits: result.packet.assertions.length,
          noSignal: result.noCoverage,
          degraded: stale,
          ...(stale ? { reason: 'auto_snapshot_stale' } : {}),
          relationIds: [],
          cost: { embedded: 0, judged: 0, injected: result.packet.assertions.length, chars: result.prompt.length },
        },
      }
    },

    stats(): PipelineStats {
      return { bootstraps: 0, totalAdded: 0, lastVersion: options.service.health().version }
    },
  }
}
