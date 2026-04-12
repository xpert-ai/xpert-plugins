type RecallSource = 'auto' | 'tool'
type RecallStrategy = 'model' | 'fallback' | 'disabled'

const MAX_RECALL_TITLE_COUNT = 3
const MAX_RECALL_TITLE_LENGTH = 20

export function buildRecallProgressMessage(source: RecallSource, rawQuery: string) {
  const preview = previewRecallQuery(rawQuery)
  if (source === 'tool') {
    return preview ? `正在检索与“${preview}”相关的长期记忆` : '正在检索相关长期记忆'
  }
  return preview ? `正在为“${preview}”补充相关长期记忆` : '正在补充相关长期记忆'
}

export function buildRecallResultMessage(params: {
  strategy: RecallStrategy
  selectedCount: number
  selectedTitles?: readonly string[]
  usedModelSelector: boolean
  source: RecallSource
}) {
  const titleSuffix = formatSelectedTitleSuffix(params.selectedTitles ?? [], params.selectedCount)

  if (params.strategy === 'disabled') {
    return params.source === 'tool' ? '当前未启用记忆检索' : '当前未启用自动召回'
  }

  if (params.selectedCount <= 0) {
    if (params.strategy === 'fallback') {
      if (params.source === 'tool') {
        return params.usedModelSelector
          ? '检索模型响应较慢，已改用快速召回，但没有命中相关记忆'
          : '已使用快速召回，但没有命中相关记忆'
      }
      return params.usedModelSelector
        ? '召回模型响应较慢，已改用快速召回，但没有命中相关记忆'
        : '已使用快速召回，但没有命中相关记忆'
    }

    return params.source === 'tool' ? '没有命中相关记忆' : '没有命中需要补充的相关记忆'
  }

  if (params.strategy === 'fallback') {
    if (params.source === 'tool') {
      const base = params.usedModelSelector
        ? `检索模型响应较慢，已改用快速召回，命中 ${params.selectedCount} 条记忆`
        : `已使用快速召回，命中 ${params.selectedCount} 条记忆`
      return appendTitleSuffix(base, titleSuffix)
    }

    const base = params.usedModelSelector
      ? `召回模型响应较慢，已改用快速召回，命中 ${params.selectedCount} 条相关记忆`
      : `已使用快速召回，命中 ${params.selectedCount} 条相关记忆`
    return appendTitleSuffix(base, titleSuffix)
  }

  if (params.source === 'tool') {
    return appendTitleSuffix(`已命中 ${params.selectedCount} 条记忆`, titleSuffix)
  }

  return appendTitleSuffix(`已选中 ${params.selectedCount} 条相关记忆`, titleSuffix)
}

function appendTitleSuffix(base: string, titleSuffix: string) {
  return titleSuffix ? `${base}：${titleSuffix}` : base
}

function formatSelectedTitleSuffix(selectedTitles: readonly string[], selectedCount: number) {
  const normalizedTitles = Array.from(
    new Set(
      selectedTitles
        .map((title) => normalizeTitle(title))
        .filter(Boolean)
    )
  )

  if (!normalizedTitles.length) {
    return ''
  }

  const visibleTitles = normalizedTitles.slice(0, MAX_RECALL_TITLE_COUNT)
  const titleList = visibleTitles.join('、')
  const totalCount = Math.max(selectedCount, normalizedTitles.length)
  return totalCount > MAX_RECALL_TITLE_COUNT
    ? `${titleList}等 ${totalCount} 条`
    : titleList
}

function normalizeTitle(title: string) {
  const normalized = title.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return ''
  }

  const glyphs = Array.from(normalized)
  if (glyphs.length <= MAX_RECALL_TITLE_LENGTH) {
    return normalized
  }

  return `${glyphs.slice(0, MAX_RECALL_TITLE_LENGTH - 1).join('').trimEnd()}…`
}

function previewRecallQuery(query: string, maxLength = 24) {
  const trimmed = query.trim().replace(/\s+/g, ' ')
  if (!trimmed) {
    return ''
  }

  const glyphs = Array.from(trimmed)
  if (glyphs.length <= maxLength) {
    return trimmed
  }

  return `${glyphs.slice(0, maxLength - 1).join('').trimEnd()}…`
}
