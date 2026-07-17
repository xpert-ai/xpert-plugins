import {
  copyCutClips,
  duplicateCutClips,
  extractCutAudio,
  pasteCutClips,
  placeCutMediaClip,
  removeCutClips,
  splitCutClips,
  toggleCutBookmark
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
})
