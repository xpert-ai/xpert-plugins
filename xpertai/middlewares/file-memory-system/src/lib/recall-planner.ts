import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Injectable, Logger } from '@nestjs/common'
import z from 'zod'
import { createInternalRunnableConfig } from './internal-runnable-config.js'
import {
  describeSemanticKind,
  inferRelativeMemoryPath,
  isUsageReferenceForRecentTools,
  semanticKindRankBoost
} from './memory-taxonomy.js'
import { MemoryRecallPlanner, MemoryRecallSelectionResult, MemoryRecordHeader } from './types.js'

const MEMORY_QUERY_SELECTOR_SYSTEM_PROMPT = `You are selecting file-based memories that should be returned for an explicit memory search query.

You will receive:
- the user's current query
- a shortlist manifest of candidate memory files, each with id, kind, semanticKind, audience, relative path, title, tags, summary, and modified time
- an optional list of recently used tools

Return a JSON object with a "selectedIds" array containing up to 5 memory ids.

Be selective. Only include memories that are clearly useful for the explicit search query.
If you are unsure whether a memory is useful, leave it out.
It is good to return an empty list when nothing is clearly relevant.
Do not select archived or frozen memories.
Do not select usage-reference memories for tools already active in the current loop unless the memory contains warnings, gotchas, or known issues.
Your final answer must be valid JSON.`

const MEMORY_ASYNC_SELECTOR_SYSTEM_PROMPT = `You are selecting file-based memories that will be useful to the main model as it processes a user's query.

The main model already sees lightweight memory summaries elsewhere.
You are selecting which memory bodies are worth injecting next.

You will receive:
- the user's current query
- a manifest of available memory files, each with id, kind, semanticKind, audience, relative path, title, tags, summary, and modified time
- an optional list of recently used tools

Return a JSON object with a "selectedIds" array containing up to 5 memory ids.

Only include memories that you are confident will be helpful beyond the lightweight summary.
If you are unsure whether a memory will be useful, leave it out.
It is good to return an empty list when no memory body is clearly worth surfacing.
Do not select archived or frozen memories.
Do not select usage-reference memories for tools already active in the current loop unless the memory contains warnings, gotchas, or known issues.
Your final answer must be valid JSON.`

const DEFAULT_SELECTOR_WAIT_BUDGET_MS = 1_500
const DEFAULT_SHORTLIST_SIZE = 20
const MAX_DETACHED_SELECTOR_RUNS = 2
const SELECTOR_TIMEOUT = Symbol('file-memory-selector-timeout')

type SelectorSchemaResult = {
  selectedIds?: string[]
}

type SelectorOutcome =
  | {
      status: 'fulfilled'
      result: SelectorSchemaResult
    }
  | {
      status: 'rejected'
      error: unknown
    }

type RecallManifestItem = {
  header: MemoryRecordHeader
  score?: number
}

@Injectable()
export class FileMemoryRecallPlanner implements MemoryRecallPlanner {
  private readonly logger = new Logger(FileMemoryRecallPlanner.name)
  private readonly detachedSelectorTokens = new Set<symbol>()

  async selectSummaryDigestHeaders(
    query: string,
    headers: MemoryRecordHeader[],
    options: {
      limit?: number
      recentTools?: readonly string[]
      alreadySurfaced?: ReadonlySet<string>
      enableLogging?: boolean
    } = {}
  ): Promise<MemoryRecallSelectionResult> {
    const limit = options.limit ?? 5
    const candidates = headers.filter((header) => !options.alreadySurfaced?.has(header.filePath))
    if (!candidates.length) {
      return {
        headers: [],
        strategy: 'disabled'
      }
    }

    this.debugRecall(
      options.enableLogging,
      `[FileMemorySystem] summary_digest_start queryLength=${query.trim().length} totalHeaders=${headers.length} candidateHeaders=${candidates.length}`
    )

    const rankedHeaders = rankHeaders(query, candidates, options.recentTools).filter((item) => item.score > 0)
    return {
      headers: rankedHeaders.slice(0, limit).map((item) => item.header),
      strategy: 'fallback'
    }
  }

  async selectRecallHeaders(
    query: string,
    headers: MemoryRecordHeader[],
    chatModel?: BaseChatModel | null,
    options: {
      limit?: number
      recentTools?: readonly string[]
      alreadySurfaced?: ReadonlySet<string>
      timeoutMs?: number
      prompt?: string
      enableLogging?: boolean
    } = {}
  ): Promise<MemoryRecallSelectionResult> {
    const limit = options.limit ?? 5
    const candidates = headers.filter((header) => !options.alreadySurfaced?.has(header.filePath))
    if (!candidates.length) {
      return {
        headers: [],
        strategy: 'disabled'
      }
    }

    this.debugRecall(
      options.enableLogging,
      `[FileMemorySystem] query_recall_start queryLength=${query.trim().length} totalHeaders=${headers.length} candidateHeaders=${candidates.length}`
    )

    const rankedShortlist = rankHeaders(query, candidates, options.recentTools).filter((item) => item.score > 0)
    const shortlist = rankedShortlist.slice(0, Math.max(limit, DEFAULT_SHORTLIST_SIZE))
    const fallbackHeaders = shortlist.slice(0, limit).map((item) => item.header)
    if (!shortlist.length) {
      return {
        headers: [],
        strategy: 'fallback'
      }
    }

    return this.runSelector(query, shortlist, fallbackHeaders, chatModel, {
      limit,
      recentTools: options.recentTools,
      timeoutMs: options.timeoutMs,
      prompt: options.prompt?.trim() || MEMORY_QUERY_SELECTOR_SYSTEM_PROMPT,
      enableLogging: options.enableLogging,
      debugLabel: 'query_selector',
      manifestFormatter: ({ header, score }) => formatQuerySelectorManifestLine(header, score)
    })
  }

  async selectAsyncRecallHeaders(
    query: string,
    headers: MemoryRecordHeader[],
    chatModel?: BaseChatModel | null,
    options: {
      limit?: number
      recentTools?: readonly string[]
      alreadySurfaced?: ReadonlySet<string>
      timeoutMs?: number
      prompt?: string
      enableLogging?: boolean
    } = {}
  ): Promise<MemoryRecallSelectionResult> {
    const limit = options.limit ?? 5
    const candidates = headers.filter((header) => !options.alreadySurfaced?.has(header.filePath))
    if (!candidates.length) {
      return {
        headers: [],
        strategy: 'disabled'
      }
    }

    this.debugRecall(
      options.enableLogging,
      `[FileMemorySystem] async_recall_start queryLength=${query.trim().length} totalHeaders=${headers.length} candidateHeaders=${candidates.length}`
    )

    const rankedFallback = rankHeaders(query, candidates, options.recentTools).filter((item) => item.score > 0)
    const fallbackHeaders = rankedFallback.slice(0, limit).map((item) => item.header)

    return this.runSelector(
      query,
      candidates.map((header) => ({ header })),
      fallbackHeaders,
      chatModel,
      {
        limit,
        recentTools: options.recentTools,
        timeoutMs: options.timeoutMs,
        prompt: options.prompt?.trim() || MEMORY_ASYNC_SELECTOR_SYSTEM_PROMPT,
        enableLogging: options.enableLogging,
        debugLabel: 'async_selector',
        manifestFormatter: ({ header }) => formatAsyncSelectorManifestLine(header)
      }
    )
  }

  private trackDetachedSelector(selectorOutcomePromise: Promise<SelectorOutcome>, enableLogging?: boolean) {
    const token = Symbol('detached-selector')
    this.detachedSelectorTokens.add(token)

    void selectorOutcomePromise.then((outcome) => {
      this.detachedSelectorTokens.delete(token)
      if (outcome.status === 'fulfilled') {
        this.debugRecall(
          enableLogging,
          `[FileMemorySystem] selector_late_ignored selected=${(outcome.result.selectedIds ?? []).length}`
        )
        return
      }

      this.debugRecall(
        enableLogging,
        `[FileMemorySystem] selector_late_ignored error=${JSON.stringify(getErrorMessage(outcome.error))}`
      )
    })
  }

  private debugRecall(enableLogging: boolean | undefined, message: string) {
    if (enableLogging && Logger.isLevelEnabled('debug')) {
      this.logger.debug(message)
    }
  }

  private async runSelector(
    query: string,
    manifestItems: RecallManifestItem[],
    fallbackHeaders: MemoryRecordHeader[],
    chatModel: BaseChatModel | null | undefined,
    options: {
      limit: number
      recentTools?: readonly string[]
      timeoutMs?: number
      prompt: string
      enableLogging?: boolean
      debugLabel: string
      manifestFormatter: (item: { header: MemoryRecordHeader; score?: number }) => string
    }
  ): Promise<MemoryRecallSelectionResult> {
    if (!chatModel?.withStructuredOutput) {
      this.debugRecall(
        options.enableLogging,
        `[FileMemorySystem] ${options.debugLabel}_fallback reason=no_model_selector`
      )
      return {
        headers: fallbackHeaders,
        strategy: 'fallback'
      }
    }

    if (this.detachedSelectorTokens.size >= MAX_DETACHED_SELECTOR_RUNS) {
      this.debugRecall(
        options.enableLogging,
        `[FileMemorySystem] selector_backpressure_skip detachedRunning=${this.detachedSelectorTokens.size} limit=${MAX_DETACHED_SELECTOR_RUNS}`
      )
      return {
        headers: fallbackHeaders,
        strategy: 'fallback'
      }
    }

    const schema = z.object({
      selectedIds: z.array(z.string())
    })

    const waitBudgetMs = normalizeWaitBudgetMs(options.timeoutMs)
    const manifest = manifestItems.map((item) => options.manifestFormatter(item)).join('\n')
    const recentToolsSection = options.recentTools?.length
      ? `\n\nRecently used tools: ${options.recentTools.join(', ')}`
      : ''
    const humanInput = `Query: ${query}\n\nAvailable memories:\n${manifest}${recentToolsSection}\n\nRespond with JSON only, for example: {"selectedIds":["memory-1"]}`

    this.debugRecall(
      options.enableLogging,
      `[FileMemorySystem] ${options.debugLabel}_candidate_count manifest=${manifestItems.length} fallback=${fallbackHeaders.length}`
    )
    this.debugRecall(
      options.enableLogging,
      `[FileMemorySystem] ${options.debugLabel}_budget_ms budget=${waitBudgetMs}`
    )

    if (options.enableLogging && Logger.isLevelEnabled('debug')) {
      this.logger.debug(
        [
          '[FileMemorySystem] recall selector model input begin',
          `label=${options.debugLabel}`,
          `waitBudgetMs=${waitBudgetMs}`,
          `manifestCandidates=${manifestItems.length}`,
          '<system>',
          options.prompt,
          '</system>',
          '<human>',
          humanInput,
          '</human>',
          '[FileMemorySystem] recall selector model input end'
        ].join('\n')
      )
    }

    const selectorOutcomePromise = Promise.resolve()
      .then(() =>
        chatModel
          .withStructuredOutput(schema)
          .withConfig(createInternalRunnableConfig('file-memory-recall-selector'))
          .invoke([
            { role: 'system', content: options.prompt },
            {
              role: 'human',
              content: humanInput
            }
          ])
      )
      .then(
        (result): SelectorOutcome => ({
          status: 'fulfilled',
          result: (result ?? {}) as SelectorSchemaResult
        })
      )
      .catch(
        (error): SelectorOutcome => ({
          status: 'rejected',
          error
        })
      )

    const outcome = await waitForSelectorWithinBudget(selectorOutcomePromise, waitBudgetMs)
    if (outcome === SELECTOR_TIMEOUT) {
      this.trackDetachedSelector(selectorOutcomePromise, options.enableLogging)
      this.debugRecall(
        options.enableLogging,
        `[FileMemorySystem] ${options.debugLabel}_timeout_fallback budget=${waitBudgetMs} detachedRunning=${this.detachedSelectorTokens.size}`
      )
      return {
        headers: fallbackHeaders,
        strategy: 'fallback'
      }
    }

    if (outcome.status === 'rejected') {
      const message = getErrorMessage(outcome.error)
      this.logger.warn(`Memory recall selector failed: ${message}`)
      return {
        headers: fallbackHeaders,
        strategy: 'fallback'
      }
    }

    const selectedIds = new Set((outcome.result.selectedIds ?? []).slice(0, options.limit))
    const headersById = new Map(manifestItems.map(({ header }) => [header.id, header]))
    const selectedHeaders = Array.from(selectedIds)
      .map((id) => headersById.get(String(id)))
      .filter((item): item is MemoryRecordHeader => Boolean(item))

    this.debugRecall(
      options.enableLogging,
      `[FileMemorySystem] ${options.debugLabel}_model_success selected=${selectedHeaders.length} requestedLimit=${options.limit}`
    )

    return {
      headers: selectedHeaders,
      strategy: 'model'
    }
  }
}

function formatQuerySelectorManifestLine(header: MemoryRecordHeader, score?: number) {
  const tags = normalizeTags(header.tags)
  const tagPart = tags.length ? ` tags=[${tags.join(', ')}]` : ''
  const summaryPart = header.summary ? ` summary="${header.summary}"` : ''
  const ownerPart = header.ownerUserId ? ` ownerUserId=${header.ownerUserId}` : ''
  const modifiedAt = new Date(header.mtimeMs).toISOString()
  const semanticKind = header.semanticKind ?? (header.kind === 'profile' ? 'user' : 'reference')
  const scorePart = typeof score === 'number' ? ` score=${score.toFixed(4)}` : ''
  return `- id=${header.id} kind=${header.kind} semanticKind=${semanticKind} semanticHint="${describeSemanticKind(semanticKind)}"${scorePart} layer="${header.layerLabel}" audience=${header.audience}${ownerPart} path="${inferRelativeMemoryPath(header.filePath)}" title="${header.title}" modifiedAt=${modifiedAt}${tagPart}${summaryPart}`
}

function formatAsyncSelectorManifestLine(header: MemoryRecordHeader) {
  const tags = normalizeTags(header.tags)
  const tagPart = tags.length ? ` tags=[${tags.join(', ')}]` : ''
  const summaryPart = header.summary ? ` summary="${header.summary}"` : ''
  const ownerPart = header.ownerUserId ? ` ownerUserId=${header.ownerUserId}` : ''
  const modifiedAt = new Date(header.mtimeMs).toISOString()
  const semanticKind = header.semanticKind ?? (header.kind === 'profile' ? 'user' : 'reference')
  return `- id=${header.id} kind=${header.kind} semanticKind=${semanticKind} semanticHint="${describeSemanticKind(semanticKind)}" layer="${header.layerLabel}" audience=${header.audience}${ownerPart} path="${inferRelativeMemoryPath(header.filePath)}" title="${header.title}" modifiedAt=${modifiedAt}${tagPart}${summaryPart}`
}

function scoreHeader(header: MemoryRecordHeader, query: string, recentTools?: readonly string[]) {
  const titleScore = scoreText(query, header.title)
  const summaryScore = scoreText(query, header.summary)
  const tagScore = scoreText(query, normalizeTags(header.tags).join(' '))
  const exactTitle = includesNormalized(header.title, query) ? 0.2 : 0
  const layerBoost = header.audience === 'user' ? 0.05 : 0
  const semanticKind = header.semanticKind ?? (header.kind === 'profile' ? 'user' : 'reference')
  const semanticBoost = semanticKindRankBoost(query, semanticKind)
  const lexicalScore = titleScore * 0.44 + summaryScore * 0.22 + tagScore * 0.14 + exactTitle
  if (lexicalScore <= 0 && semanticBoost <= 0) {
    return 0
  }
  const recencyBoost = calculateRecencyBoost(header.mtimeMs)
  const recentToolPenalty = isUsageReferenceForRecentTools({
    title: header.title,
    summary: header.summary,
    semanticKind,
    recentTools
  })
    ? 0.24
    : 0
  return Number(
    Math.min(
      1,
      lexicalScore + layerBoost + semanticBoost + recencyBoost - recentToolPenalty
    ).toFixed(4)
  )
}

function rankHeaders(query: string, headers: MemoryRecordHeader[], recentTools?: readonly string[]) {
  return headers
    .map((header) => ({
      header,
      score: scoreHeader(header, query, recentTools)
    }))
    .sort((a, b) => b.score - a.score || b.header.mtimeMs - a.header.mtimeMs)
}

function normalizeTags(tags?: string[] | null) {
  return Array.from(
    new Set(
      (tags ?? [])
        .filter(Boolean)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )
}

function tokenize(value?: string | null) {
  const chunks = (value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const tokens = new Set<string>()
  for (const chunk of chunks) {
    if (chunk.length > 1) {
      tokens.add(chunk)
    }
    if (containsHan(chunk)) {
      const chars = Array.from(chunk).filter(Boolean)
      for (const char of chars) {
        if (containsHan(char)) {
          tokens.add(char)
        }
      }
      for (let size = 2; size <= Math.min(4, chars.length); size++) {
        for (let index = 0; index <= chars.length - size; index++) {
          tokens.add(chars.slice(index, index + size).join(''))
        }
      }
    }
  }
  return tokens
}

function scoreText(query: string, text?: string | null) {
  const queryTokens = Array.from(tokenize(query))
  if (!queryTokens.length) {
    return 0
  }
  const textTokens = tokenize(text)
  if (!textTokens.size) {
    return 0
  }
  let matched = 0
  queryTokens.forEach((token) => {
    if (textTokens.has(token)) {
      matched += 1
    }
  })
  const ratio = matched / queryTokens.length
  const exact = includesNormalized(text, query) ? 0.2 : 0
  return Math.min(1, ratio + exact)
}

function includesNormalized(text?: string | null, query?: string | null) {
  const left = (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const right = (query ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  return Boolean(left && right && left.includes(right))
}

function calculateRecencyBoost(mtimeMs: number) {
  const ageMs = Math.max(0, Date.now() - mtimeMs)
  const dayMs = 86_400_000
  if (ageMs <= 3 * dayMs) {
    return 0.06
  }
  if (ageMs <= 14 * dayMs) {
    return 0.03
  }
  if (ageMs <= 45 * dayMs) {
    return 0.01
  }
  return 0
}

function containsHan(value: string) {
  return /\p{Script=Han}/u.test(value)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return typeof error === 'string' ? error : JSON.stringify(error)
}

function normalizeWaitBudgetMs(timeoutMs?: number) {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_SELECTOR_WAIT_BUDGET_MS
  }
  return Math.floor(timeoutMs)
}

function waitForSelectorWithinBudget(
  selectorOutcomePromise: Promise<SelectorOutcome>,
  waitBudgetMs: number
): Promise<SelectorOutcome | typeof SELECTOR_TIMEOUT> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(SELECTOR_TIMEOUT), Math.max(1, waitBudgetMs))
    if (typeof timer === 'object' && timer && 'unref' in timer) {
      ;(timer as { unref?: () => void }).unref?.()
    }

    void selectorOutcomePromise.then((outcome) => {
      clearTimeout(timer)
      resolve(outcome)
    })
  })
}
