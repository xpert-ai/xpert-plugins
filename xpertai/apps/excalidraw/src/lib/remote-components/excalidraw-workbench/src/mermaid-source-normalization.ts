const LABEL_BREAK_REPLACEMENT = ' / '
const HTML_BREAK_TAG_PATTERN = /<br\s*\/?>/gi

export function normalizeMermaidSourceForExcalidrawConversion(source: string) {
  const normalizedSource = source.replace(HTML_BREAK_TAG_PATTERN, LABEL_BREAK_REPLACEMENT)
  let output = ''
  let index = 0
  let inQuote = false
  let escaped = false

  while (index < normalizedSource.length) {
    const char = normalizedSource[index]

    if (inQuote && escaped) {
      output += char === 'n' ? LABEL_BREAK_REPLACEMENT : `\\${char}`
      escaped = false
      index += 1
      continue
    }

    if (inQuote && char === '\\') {
      escaped = true
      index += 1
      continue
    }

    if (char === '"') {
      inQuote = !inQuote
      output += char
      index += 1
      continue
    }

    if (inQuote && (char === '\n' || char === '\r')) {
      output += LABEL_BREAK_REPLACEMENT
      index = skipLineBreakAndIndentation(normalizedSource, index)
      continue
    }

    output += char
    index += 1
  }

  if (escaped) {
    output += '\\'
  }

  return output
}

function skipLineBreakAndIndentation(source: string, index: number) {
  let nextIndex = index
  if (source[nextIndex] === '\r' && source[nextIndex + 1] === '\n') {
    nextIndex += 2
  } else {
    nextIndex += 1
  }
  while (source[nextIndex] === ' ' || source[nextIndex] === '\t') {
    nextIndex += 1
  }
  return nextIndex
}
