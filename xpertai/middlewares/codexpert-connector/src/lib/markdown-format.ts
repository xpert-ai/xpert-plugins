type VisibleMarkdownOptions = {
  standalone?: boolean
}

export function formatVisibleMarkdown(text: string, options: VisibleMarkdownOptions = {}): string {
  const formatted = preserveMarkdownLineBreaks(normalizeMarkdownBlockSyntax(text))
  return options.standalone ? ensureTrailingParagraphBreak(formatted) : formatted
}

export function preserveMarkdownLineBreaks(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  if (lines.length <= 1) {
    return normalized
  }

  let inFence = false
  let result = ''
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    result += line
    if (index === lines.length - 1) {
      break
    }

    const isFenceLine = /^(```|~~~)/.test(line.trimStart())
    const nextLine = lines[index + 1] ?? ''
    const needsHardBreak =
      !inFence &&
      !isFenceLine &&
      !isMarkdownBlockLine(line) &&
      !isMarkdownBlockLine(nextLine) &&
      line.trim().length > 0 &&
      (nextLine.trim().length > 0 || index + 1 === lines.length - 1) &&
      !line.endsWith('  ')
    result += needsHardBreak ? '  \n' : '\n'

    if (isFenceLine) {
      inFence = !inFence
    }
  }

  return result
}

function normalizeMarkdownBlockSyntax(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/([^#\n])(?=#{2,6}\S)/g, '$1\n\n')
    .replace(/(^|\n)(#{1,6})(?=\S)/g, '$1$2 ')
    .replace(/(^|\n)(\d+\.)(?=\S)/g, '$1$2 ')
    .replace(/(^|\n)([-*+])(?=\S)/g, '$1$2 ')
}

function ensureTrailingParagraphBreak(text: string): string {
  if (!text || /\n\n$/.test(text)) {
    return text
  }
  return text.endsWith('\n') ? `${text}\n` : `${text}\n\n`
}

function isMarkdownBlockLine(line: string): boolean {
  const trimmed = line.trimStart()
  return (
    /^#{1,6}\s+/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^>/.test(trimmed) ||
    /^\|/.test(trimmed)
  )
}
