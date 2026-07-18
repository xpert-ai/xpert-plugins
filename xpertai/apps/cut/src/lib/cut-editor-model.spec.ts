import {
  copyCutClips,
  duplicateCutClips,
  extractCutAudio,
  pasteCutClips,
  placeCutMediaClip,
  removeCutClips,
  removeUnusedStarterAudioTrack,
  splitCutClips,
  toggleCutBookmark,
  updateCutClipAndFollowing
} from './cut-editor-model.js'
import { appendCutMediaClip, createStarterCutProject, validateCutProjectDocument } from './cut-project.js'

describe('Cut editor model', () => {
  const ids = ['new-1', 'new-2', 'new-3', 'new-4']
  const makeId = () => ids.shift() ?? 'new-id'

  function project() {
    return appendCutMediaClip(createStarterCutProject(), {
      id: 'video-clip', name: 'Demo', type: 'video', mediaAssetId: 'asset-1', duration: 10
    })
  }

  beforeEach(() => ids.splice(0, ids.length, 'new-1', 'new-2', 'new-3', 'new-4'))

  it('copies, pastes, duplicates, and removes selected clips', () => {
    const source = project()
    const clipboard = copyCutClips(source, ['video-clip'])
    expect(clipboard).not.toBeNull()
    const pasted = pasteCutClips(source, clipboard!, 12, makeId)
    expect(pasted.clipIds).toEqual(['new-1'])
    expect(pasted.document.tracks[0]!.clips[1]).toMatchObject({ id: 'new-1', start: 12, duration: 10 })
    const duplicated = duplicateCutClips(source, ['video-clip'], makeId)
    expect(duplicated.document.tracks[0]!.clips[1]).toMatchObject({ start: 0.25 })
    expect(removeCutClips(pasted.document, pasted.clipIds).tracks[0]!.clips).toHaveLength(1)
  })

  it('splits multiple selections and extracts video audio', () => {
    const source = project()
    const split = splitCutClips(source, ['video-clip'], 4, makeId)
    expect(split.document.tracks[0]!.clips).toHaveLength(2)
    expect(split.document.tracks[0]!.clips[1]).toMatchObject({ start: 4, duration: 6, trimIn: 4 })
    const extracted = extractCutAudio(source, 'video-clip', makeId)
    expect(extracted.document.tracks[0]!.clips[0]).toMatchObject({ type: 'video', audioDetached: true })
    expect(extracted.document.tracks.find((track) => track.kind === 'audio')!.clips[0]).toMatchObject({ type: 'audio', duration: 10 })
    expect(validateCutProjectDocument(extracted.document)).toEqual(extracted.document)
  })

  it('toggles a bookmark at the playhead', () => {
    const added = toggleCutBookmark(project(), 3.5, makeId)
    expect(added.bookmarks).toEqual([{ id: 'new-1', time: 3.5, label: 'Bookmark 1' }])
    expect(toggleCutBookmark(added, 3.52, makeId).bookmarks).toEqual([])
  })

  it('hides only the legacy empty starter audio track', () => {
    const starter = createStarterCutProject()
    expect(removeUnusedStarterAudioTrack(starter).tracks.map((track) => track.kind)).toEqual(['visual'])
    starter.tracks[1]!.clips.push({
      id: 'audio-clip', name: 'Voice', type: 'audio', start: 0, duration: 2, trimIn: 0, trimOut: 2
    })
    expect(removeUnusedStarterAudioTrack(starter).tracks).toHaveLength(2)
  })

  it('creates a new video track when dropped media overlaps the target track', () => {
    const source = project()
    const placed = placeCutMediaClip(source, {
      id: 'new-video', name: '新素材.mov', type: 'video', mediaAssetId: 'asset-2',
      start: 2, duration: 5, trimIn: 0, trimOut: 5
    }, 'visual', source.tracks[0]!.id, makeId)

    expect(placed.tracks).toHaveLength(3)
    expect(placed.tracks[0]!.clips).toHaveLength(1)
    expect(placed.tracks[1]).toMatchObject({ id: 'new-1', name: 'Video 2', kind: 'visual' })
    expect(placed.tracks[1]!.clips[0]).toMatchObject({ id: 'new-video', start: 2 })
  })

  it('keeps dropped media on the requested track when its time range is free', () => {
    const source = project()
    const placed = placeCutMediaClip(source, {
      id: 'new-video', name: 'Later.mov', type: 'video', mediaAssetId: 'asset-2',
      start: 10, duration: 5, trimIn: 0, trimOut: 5
    }, 'visual', source.tracks[0]!.id, makeId)

    expect(placed.tracks).toHaveLength(2)
    expect(placed.tracks[0]!.clips.map((clip) => clip.id)).toEqual(['video-clip', 'new-video'])
  })

  it('propagates text presentation changes to later text clips on the same track', () => {
    const source = createStarterCutProject()
    source.tracks[0]!.clips = [
      { id: 'caption-1', name: 'Caption 1', text: 'First', type: 'text', start: 0, duration: 2, trimIn: 0, trimOut: 2, fontSize: 42, color: '#fff' },
      { id: 'caption-2', name: 'Caption 2', text: 'Second', type: 'text', start: 2, duration: 2, trimIn: 0, trimOut: 2, fontSize: 42, color: '#fff' },
      { id: 'video-1', name: 'Video', type: 'video', start: 4, duration: 2, trimIn: 0, trimOut: 2, fontSize: 12 }
    ]

    const updated = updateCutClipAndFollowing(source, 'caption-1', (clip) => ({
      ...clip,
      text: 'Edited only once',
      start: 0.5,
      fontSize: 56,
      fontFamily: 'sans',
      fontStyle: 'italic',
      textDecoration: 'underline',
      verticalAlign: 'bottom',
      letterSpacing: 2,
      lineHeight: 1.25,
      color: '#f97316',
      strokeColor: '#111827',
      strokeWidth: 3,
      textShadowColor: '#000000',
      textShadowBlur: 10,
      textShadowOffsetX: 2,
      textShadowOffsetY: 4,
      textBackgroundColor: '#111827',
      textBackgroundOpacity: 0.7,
      transform: { x: 10, y: 20, width: 800, height: 160, rotation: 0, opacity: 1 }
    }))

    expect(updated.tracks[0]!.clips[0]).toMatchObject({ text: 'Edited only once', start: 0.5, fontSize: 56, color: '#f97316' })
    expect(updated.tracks[0]!.clips[1]).toMatchObject({
      text: 'Second', start: 2, fontSize: 56, fontFamily: 'sans', fontStyle: 'italic', textDecoration: 'underline',
      verticalAlign: 'bottom', letterSpacing: 2, lineHeight: 1.25, color: '#f97316', strokeColor: '#111827',
      strokeWidth: 3, textShadowColor: '#000000', textShadowBlur: 10, textShadowOffsetX: 2, textShadowOffsetY: 4,
      textBackgroundColor: '#111827', textBackgroundOpacity: 0.7, transform: { x: 10, y: 20 }
    })
    expect(updated.tracks[0]!.clips[2]).toMatchObject({ type: 'video', fontSize: 12 })
  })

  it('keeps timing-sensitive video properties independent while syncing presentation', () => {
    const source = project()
    source.tracks[0]!.clips.push({
      ...structuredClone(source.tracks[0]!.clips[0]!), id: 'video-clip-2', name: 'Demo B', start: 10
    })
    const updated = updateCutClipAndFollowing(source, 'video-clip', (clip) => ({
      ...clip,
      volume: 0.4,
      playbackRate: 2,
      fadeIn: 1,
      mediaFit: 'contain',
      transform: { x: 20, y: 30, width: 1280, height: 720, rotation: -5, opacity: 0.8 }
    }))

    expect(updated.tracks[0]!.clips[1]).toMatchObject({ volume: 0.4, mediaFit: 'contain', transform: { x: 20, y: 30 } })
    expect(updated.tracks[0]!.clips[1]!.playbackRate).toBeUndefined()
    expect(updated.tracks[0]!.clips[1]!.fadeIn).toBeUndefined()
  })
})
