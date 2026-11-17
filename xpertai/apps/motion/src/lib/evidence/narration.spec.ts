import { compositionChecksum, narrationInput, narratedComposition, pcmWave } from './narration.js'
const id = '00000000-0000-4000-8000-000000000001',
  digest = 'a'.repeat(64)
const html =
  '<!doctype html><html><body><main data-composition-id="evidence" data-width="1280" data-height="720" data-duration="12" data-no-timeline><div class="caption" data-start="3" data-duration="1">stale</div></main><script type="application/json" id="evidence-narration">' +
  JSON.stringify({
    schema: 'xpert.evidence-narration@1',
    evidenceId: id,
    sha256: digest,
    audio: 'not_generated',
    captions: [
      {
        start: 3,
        duration: 1,
        text: '金额: 9007199254740993.125 元',
        citations: [{ datasetId: 'sales', row: 0, field: 'amount' }]
      }
    ]
  }) +
  '</script></body></html>'
it('binds exact spoken text and caption to immutable evidence and real audio duration', () => {
  const input = narrationInput(html, id, digest, compositionChecksum(html))
  const output = narratedComposition(html, input, 5.25, id)
  expect(output).toContain('data-duration="11.25"')
  expect(output).toContain('9007199254740993.125')
  expect(output).toContain('"duration":5.25')
  expect(output).not.toContain('>stale<')
  expect(() => narrationInput(html + ' ', id, digest, compositionChecksum(html))).toThrow('UNEDITED')
  expect(() => narrationInput(html, id, 'b'.repeat(64), compositionChecksum(html))).toThrow('MISMATCH')
})
it('encodes bounded 24kHz mono PCM without changing duration or samples', () => {
  const pcm = Buffer.alloc(48000)
  pcm.writeInt16LE(1234)
  const wav = pcmWave(pcm)
  expect(wav.length).toBe(48044)
  expect(wav.readUInt32LE(24)).toBe(24000)
  expect(wav.subarray(44)).toEqual(pcm)
  expect(() => pcmWave(Buffer.alloc(3))).toThrow('LIMIT')
  expect(() => pcmWave(Buffer.alloc(0))).toThrow('LIMIT')
})
