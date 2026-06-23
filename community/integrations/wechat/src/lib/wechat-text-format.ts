export function formatWechatOutgoingText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const codeBlocks: string[] = []
  let text = normalizeLineEndings(value)
    .replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, language: string, body: string) =>
      stashCodeBlock(codeBlocks, language, body)
    )
    .replace(/~~~([^\n~]*)\n?([\s\S]*?)~~~/g, (_match, language: string, body: string) =>
      stashCodeBlock(codeBlocks, language, body)
    )

  text = text
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, '$1')
    .replace(/^(.+)\n[ \t]*(={2,}|-{2,})[ \t]*$/gm, '$1')
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+\[(?:x|X| )[ \t]*\][ \t]+/gm, '- ')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '- ')
    .replace(/^[ \t]*(\d+)[.)][ \t]+/gm, '$1. ')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, alt: string, url: string) =>
      joinLabelAndUrl(alt, url)
    )
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, label: string, url: string) =>
      joinLabelAndUrl(label, url)
    )
    .replace(/<((?:https?|mailto):[^>]+)>/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(\*\*|__)([\s\S]*?)\1/g, '$2')
    .replace(/(^|[^\w])\*([^*\n]+)\*(?=$|[^\w])/g, '$1$2')
    .replace(/(^|[^\w])_([^_\n]+)_(?=$|[^\w])/g, '$1$2')
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$\n?/gm, '')
    .replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_match, row: string) =>
      row
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(' | ')
    )
    .replace(/^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  text = decodeBasicHtmlEntities(text)

  for (const [index, block] of codeBlocks.entries()) {
    text = text.replace(new RegExp(`@@WXP_CODE_BLOCK_${index}@@`, 'g'), block)
  }

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function stashCodeBlock(blocks: string[], _language: string, body: string): string {
  const content = body.replace(/^\n+|\n+$/g, '')
  const index = blocks.push(content) - 1
  return `\n@@WXP_CODE_BLOCK_${index}@@\n`
}

function joinLabelAndUrl(label: string, url: string): string {
  const normalizedLabel = label.trim()
  const normalizedUrl = url.trim()
  if (!normalizedLabel || normalizedLabel === normalizedUrl) {
    return normalizedUrl
  }
  return `${normalizedLabel}: ${normalizedUrl}`
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
