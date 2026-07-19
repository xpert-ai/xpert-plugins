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

export type CutTimelineRange = { start: number; end: number }

export type CutSpeechSourceRange = {
  mediaAssetId: string
  sourceStart: number
  sourceEnd: number
  scopeClipIds?: readonly string[]
}

type CutFollowingProperty =
  | 'color'
  | 'volume'
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
  | 'effects'
  | 'blendMode'
  | 'mask'
  | 'mediaFit'
  | 'transform'

const VISUAL_FOLLOWING_PROPERTIES: readonly CutFollowingProperty[] = ['effects', 'blendMode', 'mask', 'transform']

/**
 * Updates the selected clip, then copies only safe presentation properties to
 * later clips of the same type on the same track. Content, timing, trims,
 * speed, fades, transitions, media identity, and source references remain
 * independent per clip.
 */
export function updateCutClipAndFollowing(
  document: CutProjectDocument,
  clipId: string,
  update: (clip: CutClip) => CutClip
): CutProjectDocument {
  const track = document.tracks.find((candidate) => candidate.clips.some((clip) => clip.id === clipId))
  const original = track?.clips.find((clip) => clip.id === clipId)
  if (!track || !original) return document
  const updated = update(original)
  const changedProperties = followingPropertiesFor(original)
    .filter((property) => !clipPropertyEqual(original[property], updated[property]))
  if (!changedProperties.length) {
    return replaceClip(document, clipId, updated)
  }

  return {
    ...document,
    tracks: document.tracks.map((candidate) => candidate.id !== track.id ? candidate : {
      ...candidate,
      clips: candidate.clips.map((clip) => {
        if (clip.id === clipId) return updated
        if (clip.type !== original.type || clip.start <= original.start + 0.0001) return clip
        const next = { ...clip }
        for (const property of changedProperties) assignClipProperty(next, property, updated[property])
        return next
      })
    })
  }
}

/** Removes the legacy empty starter audio lane; real or explicitly named audio tracks are preserved. */
export function removeUnusedStarterAudioTrack(document: CutProjectDocument): CutProjectDocument {
  const tracks = document.tracks.filter((track) => !(
    track.kind === 'audio'
    && track.name === 'Audio 1'
    && track.clips.length === 0
  ))
  return tracks.length === document.tracks.length ? document : { ...document, tracks }
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

/** Maps one immutable transcript/source interval onto every matching current video clip. */
export function mapCutSpeechSourceRange(
  document: CutProjectDocument,
  input: CutSpeechSourceRange
): CutTimelineRange[] {
  const scopedClipIds = new Set(input.scopeClipIds ?? [])
  const ranges = document.tracks.flatMap((track) => track.clips.flatMap((clip) => {
    if (clip.type !== 'video' || clip.mediaAssetId !== input.mediaAssetId) return []
    if (scopedClipIds.size && !scopedClipIds.has(clip.id)) return []
    const rate = clip.playbackRate ?? 1
    const clipSourceStart = clip.trimIn
    const clipSourceEnd = clip.trimIn + clip.duration * rate
    const sourceStart = Math.max(input.sourceStart, clipSourceStart)
    const sourceEnd = Math.min(input.sourceEnd, clipSourceEnd)
    if (sourceEnd <= sourceStart + 0.0001) return []
    return [{
      start: roundTime(clip.start + (sourceStart - clipSourceStart) / rate),
      end: roundTime(clip.start + (sourceEnd - clipSourceStart) / rate)
    }]
  }))
  return mergeTimelineRanges(ranges)
}

/**
 * Applies an in-memory ripple delete for Workbench direct editing. Caption
 * lanes are sliced proportionally so transcript text and picture stay aligned.
 */
export function rippleDeleteCutRanges(
  documentInput: CutProjectDocument,
  rangesInput: readonly CutTimelineRange[],
  makeId: () => string
): CutProjectDocument {
  const ranges = normalizeTimelineRanges(rangesInput, documentInput.settings.durationSeconds)
  if (!ranges.length) return documentInput
  const removedDuration = ranges.reduce((total, range) => total + range.end - range.start, 0)
  if (documentInput.settings.durationSeconds - removedDuration < 0.1) return documentInput
  const document = structuredClone(documentInput)
  for (const track of document.tracks) {
    const captionLane = /caption|subtitle|字幕/i.test(track.name)
    const next = track.clips.flatMap((clip) => {
      const portions = subtractTimelineRanges({ start: clip.start, end: clip.start + clip.duration }, ranges)
      return portions.flatMap((portion, index) => {
        const rate = clip.playbackRate ?? 1
        const duration = roundTime(portion.end - portion.start)
        const part = {
          ...structuredClone(clip),
          id: index === 0 ? clip.id : makeId(),
          name: index === 0 ? clip.name : `${clip.name} ${index + 1}`,
          start: cutTimeAfterRippleDelete(portion.start, ranges),
          duration,
          trimIn: roundTime(clip.trimIn + (portion.start - clip.start) * rate),
          trimOut: roundTime(clip.trimIn + (portion.end - clip.start) * rate)
        }
        if (captionLane && part.type === 'text' && clip.text) {
          part.text = sliceTimedText(clip.text, clip.start, clip.duration, portion)
          if (!part.text) return []
        }
        if (index > 0) delete part.transitionIn
        if (index < portions.length - 1) delete part.transitionOut
        return [part]
      })
    })
    track.clips = next.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
  }
  document.bookmarks = document.bookmarks?.map((bookmark) => ({
    ...bookmark,
    time: cutTimeAfterRippleDelete(bookmark.time, ranges)
  }))
  document.settings.durationSeconds = roundTime(document.settings.durationSeconds - removedDuration)
  return document
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

function normalizeTimelineRanges(ranges: readonly CutTimelineRange[], duration: number) {
  return mergeTimelineRanges(ranges.flatMap((range) => {
    const start = roundTime(Math.max(0, range.start))
    const end = roundTime(Math.min(duration, range.end))
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : []
  }))
}

function mergeTimelineRanges(ranges: readonly CutTimelineRange[]) {
  const merged: CutTimelineRange[] = []
  for (const range of [...ranges].sort((left, right) => left.start - right.start || left.end - right.end)) {
    const previous = merged.at(-1)
    if (previous && range.start <= previous.end + 0.001) previous.end = Math.max(previous.end, range.end)
    else merged.push({ ...range })
  }
  return merged
}

function subtractTimelineRanges(clip: CutTimelineRange, ranges: readonly CutTimelineRange[]) {
  let portions = [clip]
  for (const range of ranges) {
    portions = portions.flatMap((portion) => {
      if (range.end <= portion.start || range.start >= portion.end) return [portion]
      const next: CutTimelineRange[] = []
      if (range.start > portion.start) next.push({ start: portion.start, end: Math.min(range.start, portion.end) })
      if (range.end < portion.end) next.push({ start: Math.max(range.end, portion.start), end: portion.end })
      return next
    })
  }
  return portions.filter((portion) => portion.end - portion.start > 0.001)
}

function cutTimeAfterRippleDelete(time: number, ranges: readonly CutTimelineRange[]) {
  let removed = 0
  for (const range of ranges) {
    if (time >= range.end) removed += range.end - range.start
    else if (time > range.start) return roundTime(range.start - removed)
    else break
  }
  return roundTime(Math.max(0, time - removed))
}

function sliceTimedText(text: string, clipStart: number, clipDuration: number, portion: CutTimelineRange) {
  const characters = Array.from(text)
  if (!characters.length || clipDuration <= 0) return text
  const startRatio = Math.max(0, Math.min(1, (portion.start - clipStart) / clipDuration))
  const endRatio = Math.max(startRatio, Math.min(1, (portion.end - clipStart) / clipDuration))
  const start = Math.floor(startRatio * characters.length)
  const end = Math.ceil(endRatio * characters.length)
  return characters.slice(start, end).join('').trim()
}

function clipsOverlap(left: CutClip, right: CutClip) {
  return left.start < right.start + right.duration - 0.001
    && right.start < left.start + left.duration - 0.001
}

function followingPropertiesFor(clip: CutClip): readonly CutFollowingProperty[] {
  if (clip.type === 'text') return [
    ...VISUAL_FOLLOWING_PROPERTIES, 'color', 'fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'textDecoration',
    'textAlign', 'verticalAlign', 'letterSpacing', 'lineHeight', 'strokeColor', 'strokeWidth', 'textShadowColor',
    'textShadowBlur', 'textShadowOffsetX', 'textShadowOffsetY', 'textBackgroundColor', 'textBackgroundOpacity'
  ]
  if (clip.type === 'video') return [...VISUAL_FOLLOWING_PROPERTIES, 'mediaFit', 'volume']
  if (clip.type === 'image') return [...VISUAL_FOLLOWING_PROPERTIES, 'mediaFit']
  if (clip.type === 'color') return [...VISUAL_FOLLOWING_PROPERTIES, 'color']
  return ['volume']
}

function replaceClip(document: CutProjectDocument, clipId: string, updated: CutClip) {
  return {
    ...document,
    tracks: document.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.id === clipId ? updated : clip)
    }))
  }
}

function clipPropertyEqual(left: CutClip[CutFollowingProperty], right: CutClip[CutFollowingProperty]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assignClipProperty(clip: CutClip, property: CutFollowingProperty, value: CutClip[CutFollowingProperty]) {
  Object.assign(clip, { [property]: value && typeof value === 'object' ? structuredClone(value) : value })
}
