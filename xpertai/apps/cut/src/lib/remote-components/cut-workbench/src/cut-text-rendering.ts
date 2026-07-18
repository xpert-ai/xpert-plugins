import type { CutClip, CutDocument } from './cut-types'

export const CUT_FONT_FAMILY_OPTIONS = ['system', 'sans', 'serif', 'mono'] as const

export type CutTextStylePatch = Partial<Pick<CutClip,
  | 'color'
  | 'fontSize'
  | 'fontWeight'
  | 'fontFamily'
  | 'fontStyle'
  | 'textDecoration'
  | 'textAlign'
  | 'verticalAlign'
  | 'letterSpacing'
  | 'lineHeight'
  | 'strokeColor'
  | 'strokeWidth'
  | 'textShadowColor'
  | 'textShadowBlur'
  | 'textShadowOffsetX'
  | 'textShadowOffsetY'
  | 'textBackgroundColor'
  | 'textBackgroundOpacity'
>>

export const CUT_TEXT_STYLE_PRESETS: ReadonlyArray<{ id: string; patch: CutTextStylePatch }> = [
  { id: 'clean', patch: { color: '#ffffff', strokeWidth: 0, textShadowBlur: 0, textBackgroundOpacity: 0 } },
  { id: 'outline', patch: { color: '#ffffff', strokeColor: '#111827', strokeWidth: 3, textShadowBlur: 0, textBackgroundOpacity: 0 } },
  { id: 'yellow', patch: { color: '#fde047', strokeColor: '#111827', strokeWidth: 4, textShadowBlur: 0, textBackgroundOpacity: 0 } },
  { id: 'red', patch: { color: '#ffffff', strokeColor: '#dc2626', strokeWidth: 4, textShadowBlur: 0, textBackgroundOpacity: 0 } },
  { id: 'bubble', patch: { color: '#ffffff', strokeWidth: 0, textBackgroundColor: '#111827', textBackgroundOpacity: 0.78, textShadowBlur: 0 } },
  { id: 'shadow', patch: { color: '#ffffff', strokeWidth: 0, textShadowColor: '#000000', textShadowBlur: 12, textShadowOffsetX: 2, textShadowOffsetY: 4, textBackgroundOpacity: 0 } }
]

export function cutTextFontFamilyCss(fontFamily: CutClip['fontFamily']) {
  if (fontFamily === 'sans') return 'Arial, "Noto Sans SC", "PingFang SC", sans-serif'
  if (fontFamily === 'serif') return 'Georgia, "Noto Serif SC", "Songti SC", serif'
  if (fontFamily === 'mono') return 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}

export function cutTextBackgroundCss(color: string | undefined, opacity: number | undefined) {
  const alpha = clamp(opacity ?? 0, 0, 1)
  if (!color || alpha <= 0) return 'transparent'
  const rgb = parseHexColor(color)
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : color
}

export function cutTextShadowCss(clip: CutClip) {
  const blur = Math.max(0, clip.textShadowBlur ?? 0)
  if (!blur && !clip.textShadowOffsetX && !clip.textShadowOffsetY) return 'none'
  return `${clip.textShadowOffsetX ?? 0}px ${clip.textShadowOffsetY ?? 0}px ${blur}px ${clip.textShadowColor ?? '#000000'}`
}

export function cutTextProjectFontSize(clip: CutClip, document: Pick<CutDocument, 'settings'>) {
  return clip.fontSize ?? Math.max(32, Math.round(document.settings.height * 0.08))
}

export function drawCutCanvasText(
  context: CanvasRenderingContext2D,
  clip: CutClip,
  document: Pick<CutDocument, 'settings'>,
  width: number,
  height: number
) {
  const fontSize = cutTextProjectFontSize(clip, document)
  const letterSpacing = clip.letterSpacing ?? 0
  const lineHeight = fontSize * (clip.lineHeight ?? 1.15)
  const maxWidth = Math.max(1, width * 0.9)
  const text = clip.text ?? clip.name

  context.save()
  context.font = `${clip.fontStyle ?? 'normal'} ${clip.fontWeight ?? 700} ${fontSize}px ${cutTextFontFamilyCss(clip.fontFamily)}`
  context.textBaseline = 'top'
  const lines = wrapCanvasText(context, text, maxWidth, letterSpacing)
  const widths = lines.map((line) => measureSpacedText(context, line, letterSpacing))
  const blockHeight = Math.max(lineHeight, lines.length * lineHeight)
  const verticalAlign = clip.verticalAlign ?? 'middle'
  const top = verticalAlign === 'top'
    ? -height / 2 + fontSize * 0.12
    : verticalAlign === 'bottom'
      ? height / 2 - blockHeight - fontSize * 0.12
      : -blockHeight / 2
  const textAlign = clip.textAlign ?? 'center'
  const anchorX = textAlign === 'left' ? -maxWidth / 2 : textAlign === 'right' ? maxWidth / 2 : 0

  const maximumLineWidth = Math.max(0, ...widths)
  const paddingX = fontSize * 0.2
  const paddingY = fontSize * 0.12
  const backgroundOpacity = clamp(clip.textBackgroundOpacity ?? 0, 0, 1)
  if (backgroundOpacity > 0 && maximumLineWidth > 0) {
    const backgroundLeft = textAlign === 'left'
      ? anchorX
      : textAlign === 'right'
        ? anchorX - maximumLineWidth
        : anchorX - maximumLineWidth / 2
    context.save()
    context.globalAlpha *= backgroundOpacity
    context.fillStyle = clip.textBackgroundColor ?? '#111827'
    context.fillRect(backgroundLeft - paddingX, top - paddingY, maximumLineWidth + paddingX * 2, blockHeight + paddingY * 2)
    context.restore()
  }

  context.fillStyle = clip.color ?? '#f8fafc'
  context.strokeStyle = clip.strokeColor ?? '#111827'
  context.lineWidth = Math.max(0, clip.strokeWidth ?? 0) * 2
  context.lineJoin = 'round'
  context.shadowColor = clip.textShadowColor ?? '#000000'
  context.shadowBlur = Math.max(0, clip.textShadowBlur ?? 0)
  context.shadowOffsetX = clip.textShadowOffsetX ?? 0
  context.shadowOffsetY = clip.textShadowOffsetY ?? 0

  lines.forEach((line, index) => {
    const y = top + index * lineHeight
    drawCanvasTextLine(context, line, anchorX, y, textAlign, letterSpacing, (clip.strokeWidth ?? 0) > 0)
    if (clip.textDecoration === 'underline' && line) {
      const lineWidth = widths[index] ?? 0
      const startX = textAlign === 'left' ? anchorX : textAlign === 'right' ? anchorX - lineWidth : anchorX - lineWidth / 2
      context.save()
      context.shadowColor = 'transparent'
      context.strokeStyle = clip.color ?? '#f8fafc'
      context.lineWidth = Math.max(1, fontSize * 0.055)
      context.beginPath()
      context.moveTo(startX, y + fontSize * 1.03)
      context.lineTo(startX + lineWidth, y + fontSize * 1.03)
      context.stroke()
      context.restore()
    }
  })
  context.restore()
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number, letterSpacing: number) {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let line = ''
    for (const character of Array.from(paragraph)) {
      const candidate = line + character
      if (line && measureSpacedText(context, candidate, letterSpacing) > maxWidth) {
        lines.push(line.trimEnd())
        line = character.trimStart()
      } else {
        line = candidate
      }
    }
    lines.push(line)
  }
  return lines.length ? lines : ['']
}

function measureSpacedText(context: CanvasRenderingContext2D, text: string, letterSpacing: number) {
  return context.measureText(text).width + Math.max(0, Array.from(text).length - 1) * letterSpacing
}

function drawCanvasTextLine(
  context: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  y: number,
  align: NonNullable<CutClip['textAlign']>,
  letterSpacing: number,
  stroke: boolean
) {
  if (Math.abs(letterSpacing) < 0.001) {
    context.textAlign = align
    if (stroke) context.strokeText(text, anchorX, y)
    context.fillText(text, anchorX, y)
    return
  }

  const totalWidth = measureSpacedText(context, text, letterSpacing)
  let cursor = align === 'left' ? anchorX : align === 'right' ? anchorX - totalWidth : anchorX - totalWidth / 2
  context.textAlign = 'left'
  for (const character of Array.from(text)) {
    if (stroke) context.strokeText(character, cursor, y)
    context.fillText(character, cursor, y)
    cursor += context.measureText(character).width + letterSpacing
  }
}

function parseHexColor(color: string) {
  const normalized = color.trim().replace(/^#/, '')
  const value = normalized.length === 3
    ? normalized.split('').map((character) => `${character}${character}`).join('')
    : normalized
  if (!/^[0-9a-f]{6}$/i.test(value)) return null
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
