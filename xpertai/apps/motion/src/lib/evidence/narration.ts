import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { validateHyperframesComposition } from '../hyperframes-composition.js'

const citation = z.object({ datasetId: z.string(), row: z.number().int().nonnegative(), field: z.string() }).strict()
const metadata = z
  .object({
    schema: z.literal('xpert.evidence-narration@1'),
    evidenceId: z.string().uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    audio: z.literal('not_generated'),
    captions: z
      .array(
        z.object({ start: z.number(), duration: z.number(), text: z.string(), citations: z.array(citation) }).strict()
      )
      .min(1)
  })
  .strict()
export const compositionChecksum = (html: string) =>
  createHash('sha256')
    .update('video\nhyperframes\n' + html)
    .digest('hex')
/** Narrate one fixed observation. No model generates facts or rewrites a numeric string. */
export function narrationInput(html: string, evidenceId: string, digest: string, initialChecksum: string) {
  if (compositionChecksum(html) !== initialChecksum)
    throw new Error('MOTION_NARRATION_REQUIRES_UNEDITED_EVIDENCE_DRAFT')
  const match = html.match(/<script type="application\/json" id="evidence-narration">([^]*?)<\/script>/)
  const parsed = metadata.parse(JSON.parse(match?.[1] ?? 'null'))
  if (parsed.evidenceId !== evidenceId || parsed.sha256 !== digest)
    throw new Error('MOTION_NARRATION_EVIDENCE_MISMATCH')
  const caption = parsed.captions[0]
  if (!caption.text.trim() || Array.from(caption.text).length > 600) throw new Error('MOTION_NARRATION_TEXT_LIMIT')
  return { ...parsed, captions: [caption], text: caption.text }
}
export function pcmWave(pcm: Buffer) {
  if (!pcm.length || pcm.length % 2 || pcm.length > 24000 * 2 * 120) throw new Error('MOTION_NARRATION_AUDIO_LIMIT')
  const header = Buffer.alloc(44)
  header.write('RIFF')
  header.writeUInt32LE(pcm.length + 36, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(24000, 24)
  header.writeUInt32LE(48000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
export function narratedComposition(
  html: string,
  input: ReturnType<typeof narrationInput>,
  duration: number,
  exportId: string
) {
  if (!(duration > 0 && duration <= 120)) throw new Error('MOTION_NARRATION_AUDIO_LIMIT')
  const seconds = Math.ceil(duration * 1000) / 1000
  let result = html
    .replace('data-duration="12"', `data-duration="${seconds + 6}"`)
    .replace('style="--window-duration:6s"', `style="--window-duration:${seconds}s"`)
    .replace('data-start="3" data-duration="6"', `data-start="3" data-duration="${seconds}"`)
    .replace(/<div class="caption"[^]*?<\/div>/g, '')
    .replace('data-start="9" data-duration="3"', `data-start="${seconds + 3}" data-duration="3"`)
    .replace('.caption{position:', '.caption{position:')
    .replace(
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.scene',
      'white-space:normal;overflow-wrap:anywhere;line-height:1.4}\n.scene'
    )
    .replace('此初稿未生成配音。', '配音引用第一行固定观测值。')
    .replace('This draft has no generated voice-over.', 'Voice-over cites the first fixed observation.')
  const escape = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
  const caption = `<div class="caption" style="--window-duration:${seconds}s" data-hf-id="narration-caption" data-start="3" data-duration="${seconds}">${escape(
    input.text
  )}</div>`
  result = result
    .replace('</main>', caption + '</main>')
    .replace(
      /(<script type="application\/json" id="evidence-narration">)[^]*?(<\/script>)/,
      (_, open, close) =>
        open +
        JSON.stringify({
          schema: input.schema,
          evidenceId: input.evidenceId,
          sha256: input.sha256,
          audio: 'generated',
          exportId,
          captions: [{ ...input.captions[0], start: 3, duration: seconds }]
        }).replace(/</g, '\\u003c') +
        close
    )
  return validateHyperframesComposition(result)
}
