import { formatWechatOutgoingText } from './wechat-text-format.js'

export type WechatOutgoingContentPart =
  | {
      type: 'text'
      content: string
    }
  | {
      type: 'image'
      imageUrl: string
      alt?: string
    }

type ContentMatch = {
  index: number
  end: number
  type: 'image'
  imageUrl: string
  alt?: string
}

const CODE_BLOCK_PLACEHOLDER_PREFIX = '@@WXP_OUT_CODE_BLOCK_'
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g
const MARKDOWN_LINK_RE = /(^|[^!])\[([^\]]+)\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g
const BARE_URL_LINE_RE = /^[ \t]*(https?:\/\/\S+)[ \t]*$/gim
const INLINE_URL_RE = /https?:\/\/[^\s<>()]+/gi
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'])

export function parseWechatOutgoingContent(value: unknown): WechatOutgoingContentPart[] {
  if (typeof value !== 'string') {
    return []
  }

  const codeBlocks: string[] = []
  const protectedText = protectCodeBlocks(normalizeLineEndings(value), codeBlocks)
  const matches = collectImageMatches(protectedText)
  if (!matches.length) {
    return pushFormattedText([], restoreCodeBlocks(protectedText, codeBlocks))
  }

  const parts: WechatOutgoingContentPart[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.index < cursor) {
      continue
    }
    pushFormattedText(parts, restoreCodeBlocks(protectedText.slice(cursor, match.index), codeBlocks))
    parts.push({
      type: 'image',
      imageUrl: match.imageUrl,
      ...(match.alt ? { alt: match.alt } : {})
    })
    cursor = match.end
  }
  pushFormattedText(parts, restoreCodeBlocks(protectedText.slice(cursor), codeBlocks))
  return parts
}

function collectImageMatches(text: string): ContentMatch[] {
  const matches: ContentMatch[] = []

  for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) {
    const imageUrl = normalizeImageUrlToken(match[2])
    if (!imageUrl) {
      continue
    }
    matches.push({
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      type: 'image',
      imageUrl,
      alt: match[1]?.trim() || undefined
    })
  }

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const imageUrl = normalizeImageUrlToken(match[3])
    if (!imageUrl || !looksLikeImageUrl(imageUrl)) {
      continue
    }
    const prefixLength = match[1]?.length ?? 0
    const index = (match.index ?? 0) + prefixLength
    matches.push({
      index,
      end: (match.index ?? 0) + match[0].length,
      type: 'image',
      imageUrl,
      alt: match[2]?.trim() || undefined
    })
  }

  for (const match of text.matchAll(BARE_URL_LINE_RE)) {
    const imageUrl = normalizeImageUrlToken(match[1])
    if (!imageUrl) {
      continue
    }
    matches.push({
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      type: 'image',
      imageUrl
    })
  }

  for (const match of text.matchAll(INLINE_URL_RE)) {
    const imageUrl = normalizeImageUrlToken(match[0])
    if (!imageUrl || !looksLikeImageUrl(imageUrl)) {
      continue
    }
    matches.push({
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      type: 'image',
      imageUrl
    })
  }

  return matches.sort((a, b) => a.index - b.index || b.end - a.end)
}

function pushFormattedText(
  parts: WechatOutgoingContentPart[],
  rawText: string
): WechatOutgoingContentPart[] {
  const content = formatWechatOutgoingText(rawText)
  if (content) {
    parts.push({
      type: 'text',
      content
    })
  }
  return parts
}

function normalizeImageUrlToken(value: string): string {
  let text = value.trim()
  if (text.startsWith('<') && text.endsWith('>')) {
    text = text.slice(1, -1).trim()
  }
  text = text.replace(/[.,;!?]+$/g, '')
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function looksLikeImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const pathname = url.pathname.toLowerCase()
    if (Array.from(IMAGE_EXTENSIONS).some((extension) => pathname.endsWith(extension))) {
      return true
    }
    return /(^|\/)images?(\/|$)/i.test(url.pathname)
  } catch {
    return false
  }
}

function protectCodeBlocks(value: string, blocks: string[]): string {
  return value
    .replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (match: string) => stashCodeBlock(blocks, match))
    .replace(/~~~([^\n~]*)\n?([\s\S]*?)~~~/g, (match: string) => stashCodeBlock(blocks, match))
}

function stashCodeBlock(blocks: string[], block: string): string {
  const index = blocks.push(block) - 1
  return `\n${CODE_BLOCK_PLACEHOLDER_PREFIX}${index}@@\n`
}

function restoreCodeBlocks(value: string, blocks: string[]): string {
  let text = value
  for (const [index, block] of blocks.entries()) {
    text = text.replace(new RegExp(`${CODE_BLOCK_PLACEHOLDER_PREFIX}${index}@@`, 'g'), block)
  }
  return text
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}
