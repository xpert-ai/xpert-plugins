import type { PencilRenderDiagnostic } from './types.js'

const FLOW_LAYOUT_VALUES = new Map([
  ['col', 'col'],
  ['column', 'col'],
  ['vertical', 'col'],
  ['v', 'col'],
  ['row', 'row'],
  ['horizontal', 'row'],
  ['h', 'row']
])

const VALUE_NORMALIZED_ATTRIBUTES = new Set([
  'align',
  'items',
  'alignItems',
  'justify',
  'justifyContent',
  'textAlign',
  'textAlignHorizontal',
  'textAlignVertical'
])

const ATTRIBUTE_ALIASES = new Map([['strokeW', 'strokeWidth']])

const JSX_STRING_VALUE_PATTERN = /"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\}/
const RENDERER_SOURCE_LINE_OFFSET = 9

/**
 * Normalizes common Agent-authored JSX aliases to the renderer's supported DSL.
 * This compatibility pass is intentionally syntax-limited and does not evaluate JSX.
 */
export function normalizePencilRenderJsx(jsx: string) {
  return jsx.replace(/<([A-Za-z][\w.]*)\b([^<>]*?)>/g, (tag, name: string, attrs: string) => {
    if (tag.startsWith('</')) {
      return tag
    }

    let normalizedAttrs = normalizeAttributeAliases(attrs)
    normalizedAttrs = normalizeEnumLikeAttributeValues(normalizedAttrs)
    normalizedAttrs = normalizeFlowLayoutAttribute(normalizedAttrs)

    return `<${name}${normalizedAttrs}>`
  })
}

/** Applies JSX normalization only to the selected core render tool. */
export function normalizePencilCoreToolArgs(toolName: string, args: Record<string, unknown>) {
  if (toolName !== 'render') {
    return args
  }

  if (typeof args.jsx !== 'string') {
    return args
  }

  const jsx = normalizePencilRenderJsx(args.jsx)
  return jsx === args.jsx ? args : { ...args, jsx }
}

/** Identifies source-level render failures that can be repaired without regenerating the full design. */
export function isRecoverablePencilRenderError(error: unknown) {
  const message = getRenderErrorMessage(error)
  return /Unexpected token|Unexpected end|Unterminated|Expected |JSX must return|Adjacent JSX|transform/i.test(message)
}

/** Converts parser text into a bounded code frame suitable for an Agent tool result. */
export function diagnosePencilRenderError(error: unknown, jsx: string): PencilRenderDiagnostic {
  const message = getRenderErrorMessage(error)
  const position = /(?:\(|\b)(\d+):(\d+)\)?/.exec(message)
  const reportedLine = position ? Number(position[1]) : undefined
  const column = position ? Number(position[2]) : undefined
  const line = sourceRelativeLine(jsx, reportedLine)
  return {
    code: /Unexpected token|Unexpected end|Unterminated|Expected |Adjacent JSX|transform/i.test(message)
      ? 'JSX_PARSE_ERROR'
      : 'JSX_RENDER_ERROR',
    message,
    ...(line ? { line } : {}),
    ...(column ? { column } : {}),
    ...(line ? { snippet: buildRenderCodeFrame(jsx, line, column ?? 1) } : {}),
    sourceLength: jsx.length
  }
}

function sourceRelativeLine(source: string, reportedLine: number | undefined) {
  if (!reportedLine) {
    return undefined
  }
  const lineCount = source.split(/\r?\n/).length
  const adjusted = reportedLine - RENDERER_SOURCE_LINE_OFFSET
  if (adjusted >= 1 && adjusted <= lineCount) {
    return adjusted
  }
  return reportedLine <= lineCount ? reportedLine : undefined
}

function normalizeFlowLayoutValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized ? FLOW_LAYOUT_VALUES.get(normalized) : undefined
}

function normalizeAttributeAliases(attrs: string) {
  return attrs.replace(/\b([A-Za-z][\w-]*)\s*=/g, (match, name: string) => `${ATTRIBUTE_ALIASES.get(name) ?? name}=`)
}

function normalizeEnumLikeAttributeValues(attrs: string) {
  return attrs.replace(
    /\b([A-Za-z][\w-]*)\s*=\s*("([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/g,
    (match, name: string, _raw: string, doubleQuoted?: string, singleQuoted?: string, bracedQuoted?: string) => {
      if (!VALUE_NORMALIZED_ATTRIBUTES.has(name)) {
        return match
      }
      const value = normalizeEnumLikeValue(doubleQuoted ?? singleQuoted ?? bracedQuoted)
      return value ? `${name}="${value}"` : match
    }
  )
}

function normalizeFlowLayoutAttribute(attrs: string) {
  if (/\bflex\s*=/.test(attrs)) {
    return attrs
  }
  return attrs.replace(new RegExp(`\\bflow\\s*=\\s*(${JSX_STRING_VALUE_PATTERN.source})`), (match, _raw: string, doubleQuoted?: string, singleQuoted?: string, bracedQuoted?: string) => {
    const value = normalizeFlowLayoutValue(doubleQuoted ?? singleQuoted ?? bracedQuoted)
    return value ? `flex="${value}"` : match
  })
}

function normalizeEnumLikeValue(value: string | undefined) {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }
  const key = normalized.toUpperCase()
  if (key === 'SPACE_BETWEEN') {
    return 'between'
  }
  if (key === 'MIN' || key === 'START') {
    return 'start'
  }
  if (key === 'MAX' || key === 'END') {
    return 'end'
  }
  if (key === 'CENTER' || key === 'STRETCH' || key === 'LEFT' || key === 'RIGHT' || key === 'TOP' || key === 'BOTTOM') {
    return key.toLowerCase()
  }
  return normalized
}

function buildRenderCodeFrame(source: string, line: number, column: number) {
  const lines = source.split(/\r?\n/)
  const start = Math.max(0, line - 2)
  const end = Math.min(lines.length, line + 1)
  return lines.slice(start, end).map((value, index) => {
    const lineNumber = start + index + 1
    return `${String(lineNumber).padStart(4, ' ')} | ${boundedSourceLine(value, lineNumber === line ? column : 1)}`
  }).join('\n')
}

function boundedSourceLine(value: string, column: number) {
  const maxLength = 320
  if (value.length <= maxLength) {
    return value
  }
  const start = Math.max(0, Math.min(value.length - maxLength, column - 120))
  const end = Math.min(value.length, start + maxLength)
  return `${start ? '...' : ''}${value.slice(start, end)}${end < value.length ? '...' : ''}`
}

function getRenderErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
