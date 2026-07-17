import type { CutClip, CutProjectDocument, CutTrackKind } from './types.js'

export type CutClipboardItem = {
  clip: CutClip
  trackKind: CutTrackKind
  offset: number
}

export type CutClipboard = {
  items: CutClipboardItem[]
  span: number
}

/** Places imported media without hiding an existing clip under an overlapping clip. */
export function placeCutMediaClip(
  document: CutProjectDocument,
  clip: CutClip,
  trackKind: CutTrackKind,
  targetTrackId: string | undefined,
  makeId: () => string
): CutProjectDocument {
  const compatibleTracks = document.tracks.filter((track) => track.kind === trackKind)
  const requestedTrack = compatibleTracks.find((track) => track.id === targetTrackId)
  const destination = requestedTrack
    ? (requestedTrack.clips.some((candidate) => clipsOverlap(candidate, clip)) ? null : requestedTrack)
    : compatibleTracks.find((track) => !track.clips.some((candidate) => clipsOverlap(candidate, clip))) ?? null

  if (destination) {
    return {
      ...document,
      tracks: document.tracks.map((track) => track.id === destination.id
        ? { ...track, clips: [...track.clips, clip].sort((left, right) => left.start - right.start) }
        : track)
    }
  }

  const newTrack = {
    id: makeId(),
    name: `${trackKind === 'audio' ? 'Audio' : 'Video'} ${compatibleTracks.length + 1}`,
    kind: trackKind,
    muted: false,
    hidden: false,
    clips: [clip]
  }
  const requestedIndex = targetTrackId ? document.tracks.findIndex((track) => track.id === targetTrackId) : -1
  const insertAt = requestedIndex >= 0 ? requestedIndex + 1 : document.tracks.length
  return { ...document, tracks: [...document.tracks.slice(0, insertAt), newTrack, ...document.tracks.slice(insertAt)] }
}

export function copyCutClips(document: CutProjectDocument, clipIds: readonly string[]): CutClipboard | null {
  const ids = new Set(clipIds)
  const selected = document.tracks.flatMap((track) => track.clips.filter((clip) => ids.has(clip.id)).map((clip) => ({ clip, trackKind: track.kind })))
  if (!selected.length) return null
  const origin = Math.min(...selected.map(({ clip }) => clip.start))
  const end = Math.max(...selected.map(({ clip }) => clip.start + clip.duration))
  return {
    items: selected.map(({ clip, trackKind }) => ({ clip: structuredClone(clip), trackKind, offset: clip.start - origin })),
    span: end - origin
  }
}

export function pasteCutClips(
  documentInput: CutProjectDocument,
  clipboard: CutClipboard,
  at: number,
  makeId: () => string
): { document: CutProjectDocument; clipIds: string[] } {
  const document = structuredClone(documentInput)
  const anchor = Math.min(Math.max(0, at), Math.max(0, document.settings.durationSeconds - clipboard.span))
  const clipIds: string[] = []
  for (const item of clipboard.items) {
    const id = makeId()
    clipIds.push(id)
    const clip = { ...structuredClone(item.clip), id, start: roundTime(anchor + item.offset) }
    let track = document.tracks.find((candidate) => candidate.kind === item.trackKind)
    if (!track) {
      track = { id: makeId(), name: item.trackKind === 'audio' ? 'Audio' : 'Video', kind: item.trackKind, muted: false, hidden: false, clips: [] }
      document.tracks.push(track)
    }
    track.clips.push(clip)
    track.clips.sort((left, right) => left.start - right.start)
  }
  return { document, clipIds }
}

export function duplicateCutClips(
  document: CutProjectDocument,
  clipIds: readonly string[],
  makeId: () => string
) {
  const clipboard = copyCutClips(document, clipIds)
  if (!clipboard) return { document, clipIds: [] }
  const origin = Math.min(...clipboard.items.map(({ clip }) => clip.start))
  return pasteCutClips(document, clipboard, origin + 0.25, makeId)
}

export function removeCutClips(document: CutProjectDocument, clipIds: readonly string[]) {
  const ids = new Set(clipIds)
  return {
    ...document,
    tracks: document.tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => !ids.has(clip.id)) }))
  }
}

export function splitCutClips(
  documentInput: CutProjectDocument,
  clipIds: readonly string[],
  at: number,
  makeId: () => string
): { document: CutProjectDocument; clipIds: string[] } {
  const ids = new Set(clipIds)
  const document = structuredClone(documentInput)
  const nextSelection: string[] = []
  for (const track of document.tracks) {
    track.clips = track.clips.flatMap((clip) => {
      if (!ids.has(clip.id) || at <= clip.start + 0.001 || at >= clip.start + clip.duration - 0.001) return [clip]
      const leftDuration = roundTime(at - clip.start)
      const rightDuration = roundTime(clip.duration - leftDuration)
      const rightId = makeId()
      nextSelection.push(rightId)
      return [
        { ...clip, duration: leftDuration, trimOut: roundTime(clip.trimIn + leftDuration) },
        { ...clip, id: rightId, name: `${clip.name} B`, start: roundTime(at), duration: rightDuration, trimIn: roundTime(clip.trimIn + leftDuration) }
      ]
    })
  }
  return { document, clipIds: nextSelection }
}

export function extractCutAudio(
  documentInput: CutProjectDocument,
  videoClipId: string,
  makeId: () => string
): { document: CutProjectDocument; clipId: string | null } {
  const document = structuredClone(documentInput)
  const source = document.tracks.flatMap((track) => track.clips).find((clip) => clip.id === videoClipId && clip.type === 'video')
  if (!source) return { document: documentInput, clipId: null }
  source.audioDetached = true
  const id = makeId()
  const audio: CutClip = {
    id,
    type: 'audio',
    name: `${source.name} audio`,
    start: source.start,
    duration: source.duration,
    trimIn: source.trimIn,
    trimOut: source.trimOut,
    mediaAssetId: source.mediaAssetId,
    source: source.source,
    previewUrl: source.previewUrl,
    volume: source.volume ?? 1,
    playbackRate: source.playbackRate ?? 1,
    fadeIn: source.fadeIn,
    fadeOut: source.fadeOut
  }
  let track = document.tracks.find((candidate) => candidate.kind === 'audio')
  if (!track) {
    track = { id: makeId(), name: 'Audio', kind: 'audio', muted: false, hidden: false, clips: [] }
    document.tracks.push(track)
  }
  track.clips.push(audio)
  track.clips.sort((left, right) => left.start - right.start)
  return { document, clipId: id }
}

export function toggleCutBookmark(documentInput: CutProjectDocument, time: number, makeId: () => string) {
  const document = structuredClone(documentInput)
  const bookmarks = document.bookmarks ?? []
  const existing = bookmarks.find((bookmark) => Math.abs(bookmark.time - time) <= 0.05)
  document.bookmarks = existing
    ? bookmarks.filter((bookmark) => bookmark.id !== existing.id)
    : [...bookmarks, { id: makeId(), time: roundTime(time), label: `Bookmark ${bookmarks.length + 1}` }].sort((left, right) => left.time - right.time)
  return document
}

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000
}

function clipsOverlap(left: CutClip, right: CutClip) {
  return left.start < right.start + right.duration - 0.001
    && right.start < left.start + left.duration - 0.001
}
