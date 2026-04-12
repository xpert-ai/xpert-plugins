import { LongTermMemoryTypeEnum } from '@xpert-ai/contracts'

export const SEMANTIC_MEMORY_KINDS = ['user', 'feedback', 'project', 'reference'] as const
export type SemanticMemoryKind = (typeof SEMANTIC_MEMORY_KINDS)[number]
export const MEMORY_LAYER_DIRECTORY_NAMES = ['private', 'shared'] as const
export type MemoryLayerDirectoryName = (typeof MEMORY_LAYER_DIRECTORY_NAMES)[number]

export const WRITE_MEMORY_TYPES = [
  LongTermMemoryTypeEnum.PROFILE,
  LongTermMemoryTypeEnum.QA,
  ...SEMANTIC_MEMORY_KINDS
] as const

export type WriteMemoryType = (typeof WRITE_MEMORY_TYPES)[number]

const USER_HINTS = [
  'prefer',
  'preference',
  'usually',
  'likes',
  'dislikes',
  'personal',
  'habit',
  'profile',
  'style',
  'tone',
  '个人',
  '偏好',
  '习惯',
  '口味',
  '常用',
  '我的',
  'i prefer',
  'i like',
  'i dislike'
]

const FEEDBACK_HINTS = [
  'policy',
  'rule',
  'workflow',
  'playbook',
  'guideline',
  'convention',
  'should',
  'must',
  'avoid',
  'do not',
  'stop doing',
  'keep doing',
  'rule of thumb',
  'testing policy',
  '规则',
  '标准',
  '流程',
  '约定',
  '规范',
  '注意',
  '不要',
  '必须'
]

const PROJECT_HINTS = [
  'deadline',
  'owner',
  'milestone',
  'incident',
  'release',
  'roadmap',
  'ticket',
  'backlog',
  'freeze',
  'migration',
  'launch',
  'rollout',
  '负责人',
  '截止',
  '里程碑',
  '事故',
  '发布',
  '版本',
  '排期',
  '工单',
  '迭代',
  '冻结'
]

const REFERENCE_HINTS = [
  'dashboard',
  'slack',
  'linear',
  'notion',
  'wiki',
  'runbook',
  'reference',
  'doc',
  'docs',
  'url',
  'link',
  'endpoint',
  'grafana',
  'jira',
  '文档',
  '链接',
  '地址',
  '手册',
  '看板',
  '知识库'
]

const KNOWN_ISSUE_HINTS = ['warning', 'warn', 'gotcha', 'issue', 'pitfall', '注意', '坑', '风险']

export function isSemanticMemoryKind(value: unknown): value is SemanticMemoryKind {
  return typeof value === 'string' && SEMANTIC_MEMORY_KINDS.includes(value as SemanticMemoryKind)
}

export function isLegacyMemoryKind(value: unknown): value is LongTermMemoryTypeEnum {
  return value === LongTermMemoryTypeEnum.PROFILE || value === LongTermMemoryTypeEnum.QA
}

export function isWriteMemoryType(value: unknown): value is WriteMemoryType {
  return typeof value === 'string' && WRITE_MEMORY_TYPES.includes(value as WriteMemoryType)
}

export function defaultSemanticKindForLegacyKind(kind?: LongTermMemoryTypeEnum | null): SemanticMemoryKind {
  return kind === LongTermMemoryTypeEnum.PROFILE ? 'user' : 'reference'
}

export function resolveStorageKindForSemanticKind(semanticKind: SemanticMemoryKind): LongTermMemoryTypeEnum {
  return semanticKind === 'user' ? LongTermMemoryTypeEnum.PROFILE : LongTermMemoryTypeEnum.QA
}

export function getSupportedMemoryDirectoryNames() {
  return Array.from(new Set<string>([...SEMANTIC_MEMORY_KINDS, LongTermMemoryTypeEnum.PROFILE, LongTermMemoryTypeEnum.QA]))
}

export function getDirectoryNamesForKinds(kinds?: readonly LongTermMemoryTypeEnum[] | null) {
  if (!kinds?.length) {
    return getSupportedMemoryDirectoryNames()
  }

  const directories = new Set<string>()
  for (const kind of kinds) {
    if (kind === LongTermMemoryTypeEnum.PROFILE) {
      directories.add(LongTermMemoryTypeEnum.PROFILE)
      directories.add('user')
      continue
    }

    directories.add(LongTermMemoryTypeEnum.QA)
    directories.add('feedback')
    directories.add('project')
    directories.add('reference')
  }

  return Array.from(directories)
}

export function resolveMemoryDirectoryName(params: {
  semanticKind?: SemanticMemoryKind | null
  kind?: LongTermMemoryTypeEnum | null
}) {
  return params.semanticKind ?? (params.kind ? String(params.kind) : 'reference')
}

export function isMemoryLayerDirectoryName(value: unknown): value is MemoryLayerDirectoryName {
  return typeof value === 'string' && MEMORY_LAYER_DIRECTORY_NAMES.includes(value as MemoryLayerDirectoryName)
}

export function normalizeWriteMemoryType(type: WriteMemoryType) {
  if (isSemanticMemoryKind(type)) {
    return {
      semanticKind: type,
      kind: resolveStorageKindForSemanticKind(type)
    }
  }

  return {
    semanticKind: defaultSemanticKindForLegacyKind(type),
    kind: type
  }
}

export function resolveSemanticKind(params: {
  semanticKind?: unknown
  kind?: LongTermMemoryTypeEnum | null
  title?: string | null
  summary?: string | null
  content?: string | null
  context?: string | null
  tags?: string[] | null
  relativePath?: string | null
}): SemanticMemoryKind {
  if (isSemanticMemoryKind(params.semanticKind)) {
    return params.semanticKind
  }

  const inferred = inferSemanticKindFromText(params)
  if (params.kind === LongTermMemoryTypeEnum.PROFILE) {
    return inferred === 'feedback' || inferred === 'project' || inferred === 'reference' ? inferred : 'user'
  }
  if (params.kind === LongTermMemoryTypeEnum.QA) {
    return inferred ?? 'reference'
  }
  return inferred ?? 'reference'
}

export function describeSemanticKind(semanticKind: SemanticMemoryKind) {
  switch (semanticKind) {
    case 'user':
      return 'durable user preference, profile, or collaboration style'
    case 'feedback':
      return 'durable instruction, policy, or team convention'
    case 'project':
      return 'project fact, deadline, owner, incident, or initiative context'
    case 'reference':
      return 'durable pointer to docs, dashboards, external systems, or reusable answers'
  }
}

export function sectionHeadingForSemanticKind(semanticKind: SemanticMemoryKind) {
  switch (semanticKind) {
    case 'user':
      return '用户记忆'
    case 'feedback':
      return '反馈规则'
    case 'project':
      return '项目信息'
    case 'reference':
      return '参考信息'
  }
}

export function preferredSemanticKindsForQuery(query: string): SemanticMemoryKind[] {
  const haystack = normalizeText(query)
  const matched: SemanticMemoryKind[] = []
  if (containsAny(haystack, USER_HINTS)) {
    matched.push('user')
  }
  if (containsAny(haystack, FEEDBACK_HINTS)) {
    matched.push('feedback')
  }
  if (containsAny(haystack, PROJECT_HINTS)) {
    matched.push('project')
  }
  if (containsAny(haystack, REFERENCE_HINTS)) {
    matched.push('reference')
  }
  return matched
}

export function isUsageReferenceForRecentTools(params: {
  title?: string | null
  summary?: string | null
  semanticKind?: SemanticMemoryKind | null
  recentTools?: readonly string[]
}) {
  if (params.semanticKind !== 'reference' || !params.recentTools?.length) {
    return false
  }
  const haystack = normalizeText(`${params.title ?? ''} ${params.summary ?? ''}`)
  if (!params.recentTools.some((toolName) => haystack.includes(normalizeText(toolName)))) {
    return false
  }
  return !containsAny(haystack, KNOWN_ISSUE_HINTS)
}

export function semanticKindRankBoost(query: string, semanticKind: SemanticMemoryKind) {
  const preferred = preferredSemanticKindsForQuery(query)
  if (!preferred.length) {
    return 0
  }
  if (preferred[0] === semanticKind) {
    return 0.14
  }
  if (preferred.includes(semanticKind)) {
    return 0.08
  }
  return 0
}

export function inferRelativeMemoryPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  const filename = parts.at(-1)
  const directory = parts.at(-2)
  const layer = parts.at(-3)
  if (!filename) {
    return filePath
  }
  if (layer && directory && isMemoryLayerDirectoryName(layer) && getSupportedMemoryDirectoryNames().includes(directory)) {
    return `${layer}/${directory}/${filename}`
  }
  if (directory && getSupportedMemoryDirectoryNames().includes(directory)) {
    return `${directory}/${filename}`
  }
  return filename
}

export function inferLayerRelativeMemoryPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  const filename = parts.at(-1)
  const directory = parts.at(-2)
  if (!filename) {
    return filePath
  }
  if (directory && getSupportedMemoryDirectoryNames().includes(directory)) {
    return `${directory}/${filename}`
  }
  return filename
}

function inferSemanticKindFromText(params: {
  title?: string | null
  summary?: string | null
  content?: string | null
  context?: string | null
  tags?: string[] | null
  relativePath?: string | null
}) {
  const relativeParts = params.relativePath?.split('/').filter(Boolean) ?? []
  const explicitDirectory = isMemoryLayerDirectoryName(relativeParts[0]) ? relativeParts[1] : relativeParts[0]
  if (explicitDirectory && isSemanticMemoryKind(explicitDirectory)) {
    return explicitDirectory
  }

  const haystack = normalizeText(
    [params.title, params.summary, params.content, params.context, ...(params.tags ?? [])]
      .filter(Boolean)
      .join(' ')
  )

  if (!haystack) {
    return null
  }
  if (containsAny(haystack, FEEDBACK_HINTS)) {
    return 'feedback'
  }
  if (containsAny(haystack, PROJECT_HINTS)) {
    return 'project'
  }
  if (containsAny(haystack, REFERENCE_HINTS)) {
    return 'reference'
  }
  if (containsAny(haystack, USER_HINTS)) {
    return 'user'
  }
  return null
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function containsAny(text: string, hints: string[]) {
  return hints.some((hint) => text.includes(hint))
}
