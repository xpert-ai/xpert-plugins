import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, HumanMessage, isAIMessage, isHumanMessage, isToolMessage } from '@langchain/core/messages'
import { LongTermMemoryTypeEnum, MEMORY_PROFILE_PROMPT, MEMORY_QA_PROMPT } from '@metad/contracts'
import z from 'zod'
import { createInternalRunnableConfig } from './internal-runnable-config.js'
import {
  defaultSemanticKindForLegacyKind,
  describeSemanticKind,
  isSemanticMemoryKind,
  resolveStorageKindForSemanticKind,
  SEMANTIC_MEMORY_KINDS,
  SemanticMemoryKind
} from './memory-taxonomy.js'
import { MemoryRecord, MemoryWriteDecision } from './types.js'

const MEMORY_WRITE_DECISION_SCHEMA = z.object({
  action: z.enum(['noop', 'upsert', 'archive']),
  semanticKind: z.enum(SEMANTIC_MEMORY_KINDS).nullable(),
  kind: z.nativeEnum(LongTermMemoryTypeEnum).nullable(),
  audience: z.enum(['user', 'shared']).nullable(),
  memoryId: z.string().nullable(),
  title: z.string().nullable(),
  content: z.string().nullable(),
  context: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  reason: z.string().nullable()
})

const MEMORY_WRITE_DECISION_FALLBACK_SCHEMA = z.object({
  action: z.enum(['noop', 'upsert', 'archive']).optional(),
  semanticKind: z.enum(SEMANTIC_MEMORY_KINDS).nullable().optional(),
  kind: z.nativeEnum(LongTermMemoryTypeEnum).nullable().optional(),
  audience: z.enum(['user', 'shared']).nullable().optional(),
  memoryId: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  reason: z.string().nullable().optional()
})

export async function decideMemoryWriteback(
  model: BaseChatModel,
  semanticKind: SemanticMemoryKind,
  messages: BaseMessage[],
  candidates: MemoryRecord[],
  customPrompt?: string
): Promise<MemoryWriteDecision> {
  const prompt = buildWriteDecisionPrompt(semanticKind, customPrompt, candidates)
  const raw = await invokeWriteDecision(model, [
    ...trimMessagesForWriteback(messages),
    new HumanMessage(prompt)
  ])
  return normalizeDecision(semanticKind, raw)
}

function buildWriteDecisionPrompt(
  semanticKind: SemanticMemoryKind,
  customPrompt: string | undefined,
  candidates: MemoryRecord[]
) {
  const basePrompt = customPrompt || (semanticKind === 'user' ? MEMORY_PROFILE_PROMPT : MEMORY_QA_PROMPT)
  const formatHint =
    semanticKind === 'user'
      ? `For user memories:
- title should be a short label
- content should be the durable preference, collaboration style, or profile fact
- context is optional`
      : semanticKind === 'feedback'
        ? `For feedback memories:
- title should identify the durable rule or convention
- content should be the stable policy, workflow, or instruction
- context is optional`
        : semanticKind === 'project'
          ? `For project memories:
- title should identify the initiative, issue, deadline, or owner context
- content should capture the durable project fact
- context is optional`
          : `For reference memories:
- title should be the canonical question or reference label
- content should be the reusable answer, destination, or pointer
- context is optional`

  const languageHint = `Language rules for saved memory fields:
- Write title, content, context, tags, and reason in Simplified Chinese by default.
- Preserve English only for code identifiers, API names, model names, commands, file paths, log snippets, and standard technical proper nouns that should not be translated.
- Do not mix English prose into an otherwise Chinese sentence.
- If a technical term must stay in English, keep the surrounding explanation in Chinese.
- For updates, every field you output should follow these language rules.`

  return `${basePrompt}

You are writing durable file-backed memory for semanticKind "${semanticKind}" (${describeSemanticKind(semanticKind)}).

Return exactly one action object:
- action="noop" when there is nothing worth saving
- action="upsert" when there is a durable memory to create or update
- action="archive" when one existing memory is wrong, obsolete, or should be removed from normal use
- Always include every JSON field in the schema. Use null for fields that do not apply.

${formatHint}
${languageHint}

Choose audience="user" for personal habits, preferences, and user-specific context.
Choose audience="shared" for project rules, standard talk tracks, reusable semantics, and team conventions.
Prefer updating an existing memory instead of creating a duplicate. If you update one, reuse its memoryId.

Existing candidate memories:
<memories>
${candidates.length ? formatCandidateMemories(candidates) : 'None'}
</memories>`
}

function normalizeDecision(
  semanticKind: SemanticMemoryKind,
  payload: z.infer<typeof MEMORY_WRITE_DECISION_FALLBACK_SCHEMA>
): MemoryWriteDecision {
  const action = payload.action ?? 'noop'
  if (action === 'archive' && payload.memoryId) {
    return {
      action: 'archive',
      memoryId: payload.memoryId,
      reason: payload.reason
    }
  }

  if (action === 'upsert') {
    const title = payload.title?.trim()
    const content = payload.content?.trim()
    if (!title || !content) {
      return { action: 'noop' }
    }
    const resolvedSemanticKind = resolveCompatibleSemanticKind(payload.semanticKind, payload.kind, semanticKind)
    return {
      action: 'upsert',
      kind: resolveStorageKindForSemanticKind(resolvedSemanticKind),
      semanticKind: resolvedSemanticKind,
      audience: payload.audience ?? undefined,
      memoryId: payload.memoryId,
      title,
      content,
      context: payload.context?.trim(),
      tags: payload.tags?.filter(Boolean)
    }
  }

  return { action: 'noop' }
}

async function invokeWriteDecision(model: BaseChatModel, messages: BaseMessage[]) {
  try {
    return await model
      .withStructuredOutput(MEMORY_WRITE_DECISION_SCHEMA)
      .withConfig(createInternalRunnableConfig('file-memory-writeback-decision'))
      .invoke(messages)
  } catch (error) {
    const recovered = recoverDecisionFromParserError(error)
    if (recovered) {
      return recovered
    }
    throw error
  }
}

function recoverDecisionFromParserError(error: unknown) {
  const llmOutput = extractLlmOutput(error)
  if (!llmOutput) {
    return null
  }

  const parsed = parseLooseJsonObject(llmOutput)
  if (!parsed) {
    return null
  }

  const result = MEMORY_WRITE_DECISION_FALLBACK_SCHEMA.safeParse(parsed)
  return result.success ? result.data : null
}

function extractLlmOutput(error: unknown) {
  if (error && typeof error === 'object' && 'llmOutput' in error) {
    const value = (error as { llmOutput?: unknown }).llmOutput
    return typeof value === 'string' ? value : null
  }
  return null
}

function parseLooseJsonObject(raw: string) {
  const trimmed = raw.trim()
  const candidates = [trimmed]
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1))
  }

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value
      }
    } catch {}
  }

  return null
}

function trimMessagesForWriteback(messages: BaseMessage[]) {
  const tail = messages.slice(-18)
  return tail.filter((message) => isHumanMessage(message) || isAIMessage(message) || isToolMessage(message))
}

function formatCandidateMemories(candidates: MemoryRecord[]) {
  return candidates
    .map((candidate) => {
      const tags = candidate.tags.length ? ` tags=[${candidate.tags.join(', ')}]` : ''
      const context = candidate.context ? ` context="${candidate.context}"` : ''
      return `- id=${candidate.id} semanticKind=${candidate.semanticKind ?? (candidate.kind === LongTermMemoryTypeEnum.PROFILE ? 'user' : 'reference')} audience=${candidate.audience} title="${candidate.title}" summary="${candidate.summary ?? ''}"${tags}${context}`
    })
    .join('\n')
}

function resolveCompatibleSemanticKind(
  payloadSemanticKind: SemanticMemoryKind | null | undefined,
  payloadKind: LongTermMemoryTypeEnum | null | undefined,
  fallbackSemanticKind: SemanticMemoryKind | string
) {
  if (isSemanticMemoryKind(payloadSemanticKind)) {
    return payloadSemanticKind
  }
  if (payloadKind) {
    return defaultSemanticKindForLegacyKind(payloadKind)
  }
  if (isSemanticMemoryKind(fallbackSemanticKind)) {
    return fallbackSemanticKind
  }
  return defaultSemanticKindForLegacyKind(
    fallbackSemanticKind === 'profile'
      ? LongTermMemoryTypeEnum.PROFILE
      : LongTermMemoryTypeEnum.QA
  )
}
