import type { CutCaptionItem } from './types.js'

export type CutSubtitleFormat = 'srt' | 'vtt' | 'ass'

const MAX_CUES = 5_000
const MAX_CUE_TEXT = 10_000

export function parseCutSubtitle(content: string, requestedFormat?: CutSubtitleFormat): CutCaptionItem[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) throw new Error('Subtitle file is empty.')
  const format = requestedFormat ?? detectCutSubtitleFormat(normalized)
  const cues = format === 'ass' ? parseAss(normalized) : parseTimedBlocks(normalized, format)
  if (!cues.length) throw new Error(`No ${format.toUpperCase()} subtitle cues were found.`)
  if (cues.length > MAX_CUES) throw new Error(`Subtitle files are limited to ${MAX_CUES} cues.`)
  cues.sort((a, b) => a.start - b.start || a.end - b.end)
  cues.forEach((cue, index) => {
    cue.id = `caption-${index + 1}`
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start) {
      throw new Error(`Subtitle cue ${index + 1} has invalid timing.`)
    }
    if (!cue.text.trim()) throw new Error(`Subtitle cue ${index + 1} has no text.`)
    if (cue.text.length > MAX_CUE_TEXT) throw new Error(`Subtitle cue ${index + 1} exceeds ${MAX_CUE_TEXT} characters.`)
  })
  return cues
}

export function serializeCutSubtitle(captions: CutCaptionItem[], format: CutSubtitleFormat) {
  if (!captions.length) throw new Error('Caption draft has no cues to export.')
  const ordered = [...captions].sort((a, b) => a.start - b.start || a.end - b.end)
  if (format === 'vtt') {
    return `WEBVTT\n\n${ordered.map((caption, index) => `${index + 1}\n${formatTimestamp(caption.start, '.')} --> ${formatTimestamp(caption.end, '.')}\n${caption.text}`).join('\n\n')}\n`
  }
  if (format === 'ass') {
    const events = ordered.map((caption) => {
      const text = caption.text.replace(/\r?\n/g, '\\N')
      return `Dialogue: 0,${formatAssTimestamp(caption.start)},${formatAssTimestamp(caption.end)},Default,,0,0,0,,${text}`
    }).join('\n')
    return `[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,24,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`
  }
  return `${ordered.map((caption, index) => `${index + 1}\n${formatTimestamp(caption.start, ',')} --> ${formatTimestamp(caption.end, ',')}\n${caption.text}`).join('\n\n')}\n`
}

export function detectCutSubtitleFormat(content: string): CutSubtitleFormat {
  const sample = content.trimStart()
  if (/^WEBVTT(?:\s|$)/i.test(sample)) return 'vtt'
  if (/^\[Script Info\]/i.test(sample) || /^\[Events\]/im.test(sample)) return 'ass'
  return 'srt'
}

function parseTimedBlocks(content: string, format: 'srt' | 'vtt') {
  const body = format === 'vtt' ? content.replace(/^WEBVTT[^\n]*\n?/i, '') : content
  const blocks = body.split(/\n{2,}/)
  const cues: CutCaptionItem[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trimEnd())
    if (!lines.length || /^(NOTE|STYLE|REGION)(?:\s|$)/i.test(lines[0] ?? '')) continue
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) continue
    const [rawStart, rawEnd] = lines[timingIndex]!.split('-->').map((value) => value.trim())
    const endToken = rawEnd?.split(/\s+/)[0]
    if (!rawStart || !endToken) throw new Error(`Invalid subtitle timing line: ${lines[timingIndex]}`)
    const text = lines.slice(timingIndex + 1).join('\n').trim()
    cues.push({ id: '', start: parseTimestamp(rawStart), end: parseTimestamp(endToken), text })
  }
  return cues
}

function parseAss(content: string) {
  const lines = content.split('\n')
  let inEvents = false
  let fields = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text']
  const cues: CutCaptionItem[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\[Events\]$/i.test(trimmed)) {
      inEvents = true
      continue
    }
    if (/^\[.+\]$/.test(trimmed)) {
      inEvents = false
      continue
    }
    if (!inEvents) continue
    if (/^Format:/i.test(trimmed)) {
      fields = trimmed.slice(trimmed.indexOf(':') + 1).split(',').map((field) => field.trim())
      continue
    }
    if (!/^Dialogue:/i.test(trimmed)) continue
    const values = splitAssDialogue(trimmed.slice(trimmed.indexOf(':') + 1), fields.length)
    const record = new Map(fields.map((field, index) => [field.toLowerCase(), values[index]?.trim() ?? '']))
    const text = (record.get('text') ?? '').replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').trim()
    cues.push({
      id: '',
      start: parseTimestamp(record.get('start') ?? ''),
      end: parseTimestamp(record.get('end') ?? ''),
      text
    })
  }
  return cues
}

function splitAssDialogue(value: string, fieldCount: number) {
  const parts = value.split(',')
  if (parts.length <= fieldCount) return parts
  return [...parts.slice(0, fieldCount - 1), parts.slice(fieldCount - 1).join(',')]
}

function parseTimestamp(value: string) {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})([,.])(\d{1,3})$/)
  if (!match) throw new Error(`Invalid subtitle timestamp: ${value}`)
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const fraction = Number(match[5].padEnd(3, '0').slice(0, 3))
  if (minutes > 59 || seconds > 59) throw new Error(`Invalid subtitle timestamp: ${value}`)
  return hours * 3600 + minutes * 60 + seconds + fraction / 1000
}

function formatTimestamp(secondsInput: number, separator: ',' | '.') {
  const totalMilliseconds = Math.max(0, Math.round(secondsInput * 1000))
  const hours = Math.floor(totalMilliseconds / 3_600_000)
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000)
  const milliseconds = totalMilliseconds % 1000
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${separator}${pad(milliseconds, 3)}`
}

function formatAssTimestamp(secondsInput: number) {
  const totalCentiseconds = Math.max(0, Math.round(secondsInput * 100))
  const hours = Math.floor(totalCentiseconds / 360_000)
  const minutes = Math.floor((totalCentiseconds % 360_000) / 6_000)
  const seconds = Math.floor((totalCentiseconds % 6_000) / 100)
  const centiseconds = totalCentiseconds % 100
  return `${hours}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(centiseconds, 2)}`
}

function pad(value: number, length: number) {
  return String(value).padStart(length, '0')
}
