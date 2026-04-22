const FENCED_CODE_BLOCK_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g
const HEADING_RE = /^(\s{0,3}#{1,6})(?!#)\s*(.*)$/
const HORIZONTAL_RULE_RE = /^\s{0,3}(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,})$/
const TABLE_SEPARATOR_CELL_RE = /^:?-{3,}:?$/

export function convertMarkdownToWeComMarkdown(markdown: string): string {
  const normalized = normalizeLineEndings(markdown)
  if (!normalized) {
    return ''
  }

  const extracted = extractFencedCodeBlocks(normalized)
  const converted = convertMarkdownSegment(extracted.content)
  return restoreFencedCodeBlocks(collapseBlankLines(converted).trim(), extracted.blocks)
}

function convertMarkdownSegment(segment: string): string {
  if (!segment) {
    return ''
  }

  const lines = segment.split('\n')
  const result: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    if (isMarkdownTableBlockStart(lines, index)) {
      const { lines: tableLines, nextIndex } = consumeMarkdownTableBlock(lines, index)
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('')
      }
      result.push(...convertMarkdownTableBlock(tableLines))

      const nextLine = lines[nextIndex]
      if (typeof nextLine === 'string' && nextLine.trim() !== '') {
        result.push('')
      }

      index = nextIndex - 1
      continue
    }

    const normalizedLine = normalizeMarkdownLine(lines[index])
    const isBlank = normalizedLine.trim().length === 0
    const isHeading = HEADING_RE.test(normalizedLine)
    const isHorizontalRule = HORIZONTAL_RULE_RE.test(normalizedLine)

    if (isBlank) {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('')
      }
      continue
    }

    if ((isHeading || isHorizontalRule) && result.length > 0 && result[result.length - 1] !== '') {
      result.push('')
    }

    result.push(normalizedLine)

    const nextLine = lines[index + 1]
    if ((isHeading || isHorizontalRule) && typeof nextLine === 'string' && nextLine.trim() !== '') {
      result.push('')
    }
  }

  return collapseBlankLines(result.join('\n'))
}

function normalizeMarkdownLine(line: string): string {
  const trimmedEnd = line.replace(/[ \t]+$/g, '')
  if (!trimmedEnd.trim()) {
    return ''
  }

  const headingMatch = trimmedEnd.match(HEADING_RE)
  if (headingMatch) {
    const [, prefix, title] = headingMatch
    return `${prefix} ${normalizeInlineMarkdown(title.trim())}`.trimEnd()
  }

  if (HORIZONTAL_RULE_RE.test(trimmedEnd)) {
    return '---'
  }

  const unorderedListMatch = trimmedEnd.match(/^(\s*)[-+*]\s*(.*)$/)
  if (unorderedListMatch) {
    const [, indent, content] = unorderedListMatch
    return `${indent}- ${normalizeInlineMarkdown(content.trim())}`.trimEnd()
  }

  const orderedListMatch = trimmedEnd.match(/^(\s*)(\d+)\.\s*(.*)$/)
  if (orderedListMatch) {
    const [, indent, order, content] = orderedListMatch
    return `${indent}${order}. ${normalizeInlineMarkdown(content.trim())}`.trimEnd()
  }

  return normalizeInlineMarkdown(trimmedEnd)
}

function normalizeInlineMarkdown(content: string): string {
  if (!content) {
    return ''
  }

  return content
    .replace(/__(.+?)__/g, '**$1**')
    .replace(/\*\*\s+(.+?)\s+\*\*/g, '**$1**')
}

function isMarkdownTableBlockStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) {
    return false
  }

  const headerLine = lines[index]
  const separatorLine = lines[index + 1]

  return headerLine.includes('|') && isMarkdownTableSeparator(separatorLine)
}

function consumeMarkdownTableBlock(lines: string[], startIndex: number): { lines: string[]; nextIndex: number } {
  const block: string[] = [lines[startIndex], lines[startIndex + 1]]
  let index = startIndex + 2

  while (index < lines.length) {
    const currentLine = lines[index]
    if (!currentLine.trim() || !currentLine.includes('|')) {
      break
    }
    block.push(currentLine)
    index += 1
  }

  return {
    lines: block,
    nextIndex: index
  }
}

function convertMarkdownTableBlock(lines: string[]): string[] {
  const headerRow = splitMarkdownTableRow(lines[0])
  const dataRows = lines.slice(2).map(splitMarkdownTableRow).filter((row) => row.some((cell) => cell.length > 0))

  if (dataRows.length === 0) {
    return [headerRow.map(normalizeInlineMarkdown).join(' | ')]
  }

  const columnCount = Math.max(headerRow.length, ...dataRows.map((row) => row.length))
  const headers = Array.from({ length: columnCount }, (_, index) => normalizeInlineMarkdown(headerRow[index] || `Column ${index + 1}`))

  return dataRows.map((row) => {
    const cells = Array.from({ length: columnCount }, (_, index) => normalizeInlineMarkdown(row[index] || ''))
    const pairs = headers.map((header, index) => `**${header}:** ${cells[index] || '-'}`)
    return `- ${pairs.join('; ')}`
  })
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  let escaped = false

  for (const char of trimmed) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function isMarkdownTableSeparator(line: string): boolean {
  if (!line.includes('|')) {
    return false
  }

  const cells = splitMarkdownTableRow(line)
  return cells.length > 0 && cells.every((cell) => TABLE_SEPARATOR_CELL_RE.test(cell.replace(/\s+/g, '')))
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function collapseBlankLines(value: string): string {
  return value
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
}

function extractFencedCodeBlocks(content: string): { content: string; blocks: string[] } {
  const blocks: string[] = []
  const extractedContent = content.replace(FENCED_CODE_BLOCK_RE, (block) => {
    const token = `@@WECOM_CODE_BLOCK_${blocks.length}@@`
    blocks.push(block)
    return token
  })

  return {
    content: extractedContent,
    blocks
  }
}

function restoreFencedCodeBlocks(content: string, blocks: string[]): string {
  return content.replace(/@@WECOM_CODE_BLOCK_(\d+)@@/g, (_match, indexText: string) => {
    const index = Number.parseInt(indexText, 10)
    return Number.isInteger(index) && blocks[index] ? blocks[index] : ''
  })
}
