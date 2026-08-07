import {
  playableVideoUrl,
  previewFrameTime,
  primeVideoPreview,
  selectedVideoCandidate,
  selectVideoPreviewCandidate
} from './director-storyboard-media.js'
import type { Candidate } from './production-data.js'

function videoCandidate(
  id: string,
  fileUrl: string | null,
  selected = false
): Candidate {
  return {
    id,
    kind: 'video',
    label: id,
    selected,
    fileUrl,
    workspacePath: `/workspace/${id}.mp4`,
    originalName: `${id}.mp4`,
    mimeType: 'video/mp4',
    size: 1024,
    sha256: null,
    prompt: null,
    providerReceipt: null
  }
}

describe('director storyboard media', () => {
  it('chooses a playable user-previewed Take before the locked Take', () => {
    const locked = videoCandidate('take-1', '/files/take-1.mp4', true)
    const previewed = videoCandidate('take-2', '/files/take-2.mp4')

    expect(
      selectVideoPreviewCandidate([locked, previewed], previewed.id)
    ).toBe(previewed)
    expect(selectVideoPreviewCandidate([locked, previewed], null)).toBe(
      locked
    )
  })

  it('falls through candidates whose preview grant is unavailable', () => {
    const unavailable = videoCandidate('take-1', null, true)
    const playable = videoCandidate('take-2', '/files/take-2.mp4')

    expect(
      selectVideoPreviewCandidate([unavailable, playable], unavailable.id)
    ).toBe(playable)
    expect(playableVideoUrl(videoCandidate('inline', 'data:video/mp4;base64,AAAA'))).toBeNull()
  })

  it('uses a locked video or an unambiguous sole video for assembly preview', () => {
    const alternate = videoCandidate('take-1', '/files/take-1.mp4')
    const locked = videoCandidate('take-2', '/files/take-2.mp4', true)

    expect(selectedVideoCandidate([alternate, locked])).toBe(locked)
    expect(selectedVideoCandidate([alternate])).toBe(alternate)
    expect(selectedVideoCandidate([
      alternate,
      videoCandidate('take-2', '/files/take-2.mp4')
    ])).toBeNull()
  })

  it('seeks a paused video away from a potentially black zero frame', () => {
    const video = { currentTime: 0, duration: 8, paused: true }
    primeVideoPreview(video)

    expect(video.currentTime).toBe(previewFrameTime(8))
    expect(video.currentTime).toBeGreaterThan(0)
  })
})
