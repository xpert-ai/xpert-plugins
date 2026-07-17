import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import type { CutClip, CutEditOperation, CutProjectDocument, CutTimeRange, CutTrack, CutTrackMutation } from './types.js'

const finite = z.number().finite()
const transformSchema = z.object({
  x: finite,
  y: finite,
  width: finite.positive(),
  height: finite.positive(),
  rotation: finite,
  opacity: finite.min(0).max(1)
})
const visualEffectsSchema = z.object({
  brightness: finite.min(0).max(4),
  contrast: finite.min(0).max(4),
  saturation: finite.min(0).max(4),
  blur: finite.min(0).max(100),
  grayscale: finite.min(0).max(1),
  sepia: finite.min(0).max(1)
})
const maskSchema = z.object({
  shape: z.enum(['none', 'rectangle', 'circle', 'rounded']),
  inset: finite.min(0).max(0.49),
  radius: finite.min(0).max(1)
})
const transitionSchema = z.object({
  type: z.enum(['fade', 'slide', 'zoom']),
  duration: finite.min(0.05).max(10)
})
const addClipDraftSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(['video', 'image', 'audio', 'text', 'color']),
  name: z.string().min(1).max(240),
  start: finite.min(0),
  duration: finite.positive(),
  trimIn: finite.min(0).optional(),
  trimOut: finite.min(0).optional(),
  mediaAssetId: z.string().min(1).optional(),
  source: z.lazy(() => portableFileSchema).optional(),
  previewUrl: z.string().optional(),
  text: z.string().max(20_000).optional(),
  color: z.string().min(1).max(120).optional(),
  volume: finite.min(0).max(2).optional(),
  audioDetached: z.boolean().optional(),
  playbackRate: finite.min(0.1).max(8).optional(),
  fadeIn: finite.min(0).optional(),
  fadeOut: finite.min(0).optional(),
  fontSize: finite.min(1).max(1000).optional(),
  fontWeight: finite.min(100).max(900).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  effects: visualEffectsSchema.optional(),
  blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']).optional(),
  mask: maskSchema.optional(),
  transitionIn: transitionSchema.optional(),
  transitionOut: transitionSchema.optional(),
  mediaFit: z.enum(['contain', 'cover', 'stretch']).optional(),
  transform: transformSchema.optional()
})
export const cutAddClipOperationSchema = z.object({ kind: z.literal('add_clip'), trackId: z.string().min(1), clip: addClipDraftSchema })
export const cutDeleteClipsOperationSchema = z.object({ kind: z.literal('delete_clips'), clipIds: z.array(z.string().min(1)).min(1).max(100) })
export const cutDuplicateClipsOperationSchema = z.object({
  kind: z.literal('duplicate_clips'),
  clipIds: z.array(z.string().min(1)).min(1).max(100),
  offsetSeconds: finite.min(-3600).max(3600).optional(),
  trackId: z.string().min(1).optional()
})
export const cutUpdateClipTimingOperationSchema = z.object({
  kind: z.literal('update_clip_timing'), clipId: z.string().min(1), start: finite.min(0).optional(),
  duration: finite.positive().optional(), trimIn: finite.min(0).optional(), trimOut: finite.min(0).optional(),
  playbackRate: finite.min(0.1).max(8).optional()
})
export const cutUpdateTransformOperationSchema = z.object({
  kind: z.literal('update_transform'), clipId: z.string().min(1),
  transform: z.object({
    x: finite.optional(), y: finite.optional(), width: finite.positive().optional(), height: finite.positive().optional(),
    rotation: finite.optional(), opacity: finite.min(0).max(1).optional()
  }),
  mediaFit: z.enum(['contain', 'cover', 'stretch']).optional()
})
export const cutUpdateProjectSettingsOperationSchema = z.object({
  kind: z.literal('update_project_settings'),
  settings: z.object({
    width: z.number().int().min(16).max(7680).optional(),
    height: z.number().int().min(16).max(4320).optional(),
    fps: z.number().int().min(1).max(120).optional(),
    background: z.string().min(1).max(120).optional()
  }).refine((settings) => Object.values(settings).some((value) => value !== undefined), {
    message: 'update_project_settings requires a non-empty settings patch.'
  }),
  reframe: z.enum(['preserve', 'contain', 'cover', 'stretch']).default('preserve')
})
export const cutUpdateTextOperationSchema = z.object({
  kind: z.literal('update_text'), clipId: z.string().min(1), text: z.string().max(20_000).optional(),
  fontSize: finite.min(1).max(1000).optional(), fontWeight: finite.min(100).max(900).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(), color: z.string().min(1).max(120).optional()
})
export const cutUpdateAudioOperationSchema = z.object({
  kind: z.literal('update_audio'), clipId: z.string().min(1), volume: finite.min(0).max(2).optional(),
  fadeIn: finite.min(0).optional(), fadeOut: finite.min(0).optional()
})
export const cutUpdateEffectsOperationSchema = z.object({
  kind: z.literal('update_effects'), clipId: z.string().min(1),
  effects: z.object({
    brightness: finite.min(0).max(4).optional(), contrast: finite.min(0).max(4).optional(),
    saturation: finite.min(0).max(4).optional(), blur: finite.min(0).max(100).optional(),
    grayscale: finite.min(0).max(1).optional(), sepia: finite.min(0).max(1).optional()
  }).nullable().optional(),
  blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']).optional()
})
export const cutUpdateMaskOperationSchema = z.object({ kind: z.literal('update_mask'), clipId: z.string().min(1), mask: maskSchema.nullable() })
export const cutUpdateTransitionOperationSchema = z.object({
  kind: z.literal('update_transition'), clipId: z.string().min(1), edge: z.enum(['in', 'out']), transition: transitionSchema.nullable()
})
export const cutManageTrackOperationSchema = z.object({
  kind: z.literal('manage_track'),
  mutation: z.discriminatedUnion('action', [
    z.object({
      action: z.literal('add'),
      track: z.object({ id: z.string().min(1).optional(), name: z.string().min(1).max(240), kind: z.enum(['visual', 'audio']), index: z.number().int().min(0).max(127).optional() })
    }),
    z.object({ action: z.literal('update'), trackId: z.string().min(1), name: z.string().min(1).max(240).optional(), muted: z.boolean().optional(), hidden: z.boolean().optional() }),
    z.object({ action: z.literal('delete'), trackId: z.string().min(1), deleteClips: z.boolean().optional() }),
    z.object({ action: z.literal('move'), trackId: z.string().min(1), index: z.number().int().min(0).max(127) })
  ])
})
const cutTimeRangeSchema = z.object({
  start: finite.min(0),
  end: finite.positive()
}).strict().refine((range) => range.end > range.start, { message: 'end must be greater than start', path: ['end'] })
export const cutRippleDeleteRangesOperationSchema = z.object({
  kind: z.literal('ripple_delete_ranges'),
  ranges: z.array(cutTimeRangeSchema).min(1).max(200)
})
export const cutAddCoverOperationSchema = z.object({
  kind: z.literal('add_cover'),
  title: z.string().trim().min(1).max(240),
  subtitle: z.string().trim().min(1).max(500).optional(),
  duration: finite.min(0.5).max(10),
  background: z.string().trim().min(1).max(120),
  color: z.string().trim().min(1).max(120)
})
export const cutEditOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('split'), clipId: z.string().min(1), at: finite.min(0) }),
  z.object({ kind: z.literal('trim'), clipId: z.string().min(1), edge: z.enum(['start', 'end']), time: finite.min(0) }),
  z.object({ kind: z.literal('move'), clipId: z.string().min(1), start: finite.min(0), trackId: z.string().min(1).optional() }),
  cutAddClipOperationSchema,
  cutDeleteClipsOperationSchema,
  cutDuplicateClipsOperationSchema,
  cutUpdateClipTimingOperationSchema,
  cutUpdateTransformOperationSchema,
  cutUpdateProjectSettingsOperationSchema,
  cutUpdateTextOperationSchema,
  cutUpdateAudioOperationSchema,
  cutUpdateEffectsOperationSchema,
  cutUpdateMaskOperationSchema,
  cutUpdateTransitionOperationSchema,
  cutManageTrackOperationSchema,
  cutRippleDeleteRangesOperationSchema,
  cutAddCoverOperationSchema
]) as unknown as z.ZodType<CutEditOperation>
const portableFileSchema = z.object({
  source: z.literal('platform.workspace.files'),
  filePath: z.string().min(1),
  workspacePath: z.string().min(1),
  catalog: z.enum(['projects', 'users', 'knowledges', 'skills', 'xperts']),
  scopeId: z.string().nullish(),
  originalName: z.string().nullish(),
  name: z.string().nullish(),
  mimeType: z.string().nullish(),
  size: z.number().nullish()
}).passthrough()
const clipSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['video', 'image', 'audio', 'text', 'color']),
  name: z.string().min(1),
  start: finite.min(0),
  duration: finite.positive(),
  trimIn: finite.min(0),
  trimOut: finite.min(0),
  mediaAssetId: z.string().optional(),
  source: portableFileSchema.optional(),
  previewUrl: z.string().optional(),
  text: z.string().optional(),
  color: z.string().optional(),
  volume: finite.min(0).max(2).optional(),
  audioDetached: z.boolean().optional(),
  playbackRate: finite.min(0.1).max(8).optional(),
  fadeIn: finite.min(0).optional(),
  fadeOut: finite.min(0).optional(),
  fontSize: finite.min(1).max(1000).optional(),
  fontWeight: finite.min(100).max(900).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  effects: visualEffectsSchema.optional(),
  blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']).optional(),
  mask: maskSchema.optional(),
  transitionIn: transitionSchema.optional(),
  transitionOut: transitionSchema.optional(),
  mediaFit: z.enum(['contain', 'cover', 'stretch']).optional(),
  transform: transformSchema.optional()
})
const trackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['visual', 'audio']),
  muted: z.boolean(),
  hidden: z.boolean(),
  clips: z.array(clipSchema)
})
export const cutProjectDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  settings: z.object({
    width: z.number().int().min(16).max(7680),
    height: z.number().int().min(16).max(4320),
    fps: z.number().int().min(1).max(120),
    durationSeconds: finite.min(0.1).max(3600),
    background: z.string().min(1)
  }),
  tracks: z.array(trackSchema).max(128),
  bookmarks: z.array(z.object({ id: z.string().min(1), time: finite.min(0), label: z.string().min(1).max(120) })).max(256).optional()
}) as unknown as z.ZodType<CutProjectDocument>

export function createStarterCutProject(input: {
  width?: number
  height?: number
  fps?: number
  durationSeconds?: number
} = {}): CutProjectDocument {
  return {
    schemaVersion: 1,
    settings: {
      width: input.width ?? 1920,
      height: input.height ?? 1080,
      fps: input.fps ?? 30,
      durationSeconds: input.durationSeconds ?? 30,
      background: '#080b12'
    },
    tracks: [
      { id: randomUUID(), name: 'Video 1', kind: 'visual', muted: false, hidden: false, clips: [] },
      { id: randomUUID(), name: 'Audio 1', kind: 'audio', muted: false, hidden: false, clips: [] }
    ]
  }
}

export function validateCutProjectDocument(value: CutProjectDocument): CutProjectDocument {
  const document = cutProjectDocumentSchema.parse(value) as CutProjectDocument
  const clipIds = new Set<string>()
  for (const track of document.tracks) {
    for (const clip of track.clips) {
      if (clipIds.has(clip.id)) throw new Error(`Duplicate clip id: ${clip.id}`)
      clipIds.add(clip.id)
      if (clip.start + clip.duration > document.settings.durationSeconds + 0.0001) {
        throw new Error(`Clip ${clip.id} exceeds the project duration.`)
      }
      if (clip.trimOut < clip.trimIn) throw new Error(`Clip ${clip.id} has invalid trim bounds.`)
    }
  }
  for (const bookmark of document.bookmarks ?? []) {
    if (bookmark.time > document.settings.durationSeconds + 0.0001) throw new Error(`Bookmark ${bookmark.id} exceeds the project duration.`)
  }
  return structuredClone(document)
}

export function applyCutEdit(documentInput: CutProjectDocument, operation: CutEditOperation): CutProjectDocument {
  const document = validateCutProjectDocument(documentInput)
  if (operation.kind === 'ripple_delete_ranges') {
    applyRippleDeleteRanges(document, operation.ranges)
  } else if (operation.kind === 'add_cover') {
    applyCover(document, operation)
  } else if (operation.kind === 'update_project_settings') {
    applyProjectSettings(document, operation.settings, operation.reframe)
  } else if (operation.kind === 'add_clip') {
    const track = requireTrack(document.tracks, operation.trackId)
    const trimIn = operation.clip.trimIn ?? 0
    const clip: CutClip = {
      ...operation.clip,
      id: operation.clip.id ?? randomUUID(),
      trimIn,
      trimOut: operation.clip.trimOut ?? trimIn + operation.clip.duration
    }
    assertClipCanUseTrack(clip, track)
    assertClipHasSource(clip)
    track.clips.push(clip)
    sortClips(track)
  } else if (operation.kind === 'delete_clips') {
    const clipIds = uniqueIds(operation.clipIds, 'delete_clips')
    clipIds.forEach((clipId) => requireClip(document.tracks, clipId))
    for (const track of document.tracks) track.clips = track.clips.filter((clip) => !clipIds.includes(clip.id))
  } else if (operation.kind === 'duplicate_clips') {
    const clipIds = uniqueIds(operation.clipIds, 'duplicate_clips')
    const located = clipIds.map((clipId) => requireClip(document.tracks, clipId))
    const requestedTrack = operation.trackId ? requireTrack(document.tracks, operation.trackId) : undefined
    for (const source of located) {
      const track = requestedTrack ?? source.track
      const clip: CutClip = {
        ...structuredClone(source.clip),
        id: randomUUID(),
        name: `${source.clip.name} Copy`,
        start: source.clip.start + (operation.offsetSeconds ?? 0.5)
      }
      assertClipCanUseTrack(clip, track)
      track.clips.push(clip)
      sortClips(track)
    }
  } else if (operation.kind === 'manage_track') {
    applyTrackMutation(document, operation.mutation)
  } else {
    const { track, clip, index } = requireClip(document.tracks, operation.clipId)
    if (operation.kind === 'split') {
      const relative = operation.at - clip.start
      if (relative <= 0.001 || relative >= clip.duration - 0.001) throw new Error('Split point must be inside the clip.')
      const left = { ...clip, duration: relative, trimOut: clip.trimIn + relative }
      const rightDuration = clip.duration - relative
      const right: CutClip = {
        ...clip,
        id: randomUUID(),
        name: `${clip.name} B`,
        start: operation.at,
        duration: rightDuration,
        trimIn: clip.trimIn + relative,
        trimOut: clip.trimOut
      }
      track.clips.splice(index, 1, left, right)
    } else if (operation.kind === 'trim') {
      if (operation.edge === 'start') {
        const delta = operation.time - clip.start
        if (delta <= -clip.trimIn || delta >= clip.duration - 0.001) throw new Error('Invalid start trim.')
        clip.start = operation.time
        clip.duration -= delta
        clip.trimIn += delta
      } else {
        const duration = operation.time - clip.start
        if (duration <= 0.001) throw new Error('Invalid end trim.')
        clip.duration = duration
        clip.trimOut = clip.trimIn + duration
      }
    } else if (operation.kind === 'move') {
      const target = operation.trackId ? requireTrack(document.tracks, operation.trackId) : track
      assertClipCanUseTrack(clip, target)
      if (operation.start < 0 || operation.start + clip.duration > document.settings.durationSeconds + 0.0001) {
        throw new Error('Moved clip would exceed the project bounds.')
      }
      track.clips.splice(index, 1)
      clip.start = operation.start
      target.clips.push(clip)
      sortClips(target)
    } else if (operation.kind === 'update_clip_timing') {
      assertDefinedPatch(operation, ['start', 'duration', 'trimIn', 'trimOut', 'playbackRate'], operation.kind)
      if (operation.start !== undefined) clip.start = operation.start
      if (operation.playbackRate !== undefined) clip.playbackRate = operation.playbackRate
      if (operation.trimIn !== undefined) clip.trimIn = operation.trimIn
      if (operation.duration !== undefined) clip.duration = operation.duration
      if (operation.trimOut !== undefined) {
        clip.trimOut = operation.trimOut
        if (operation.duration === undefined) clip.duration = operation.trimOut - clip.trimIn
      } else if (operation.duration !== undefined || operation.trimIn !== undefined) {
        clip.trimOut = clip.trimIn + clip.duration
      }
      sortClips(track)
    } else if (operation.kind === 'update_transform') {
      if (operation.mediaFit !== undefined && clip.type !== 'video' && clip.type !== 'image') {
        throw new Error(`Clip ${clip.id} has no media fit mode.`)
      }
      if (operation.mediaFit === undefined) {
        assertDefinedPatch(operation.transform, ['x', 'y', 'width', 'height', 'rotation', 'opacity'], operation.kind)
      }
      clip.transform = {
        x: 0, y: 0, width: document.settings.width, height: document.settings.height, rotation: 0, opacity: 1,
        ...clip.transform,
        ...operation.transform
      }
      if (operation.mediaFit !== undefined) clip.mediaFit = operation.mediaFit
    } else if (operation.kind === 'update_text') {
      if (clip.type !== 'text') throw new Error(`Clip ${clip.id} is not a text clip.`)
      assertDefinedPatch(operation, ['text', 'fontSize', 'fontWeight', 'textAlign', 'color'], operation.kind)
      assignDefined(clip, operation, ['text', 'fontSize', 'fontWeight', 'textAlign', 'color'])
    } else if (operation.kind === 'update_audio') {
      if (clip.type !== 'audio' && clip.type !== 'video') throw new Error(`Clip ${clip.id} has no editable audio.`)
      assertDefinedPatch(operation, ['volume', 'fadeIn', 'fadeOut'], operation.kind)
      assignDefined(clip, operation, ['volume', 'fadeIn', 'fadeOut'])
    } else if (operation.kind === 'update_effects') {
      if (clip.type === 'audio') throw new Error(`Clip ${clip.id} has no visual effects.`)
      if (operation.effects === undefined && operation.blendMode === undefined) throw new Error(`${operation.kind} requires a non-empty patch.`)
      if (operation.effects === null) delete clip.effects
      else if (operation.effects) {
        clip.effects = {
          brightness: 1, contrast: 1, saturation: 1, blur: 0, grayscale: 0, sepia: 0,
          ...clip.effects,
          ...operation.effects
        }
      }
      if (operation.blendMode !== undefined) clip.blendMode = operation.blendMode
    } else if (operation.kind === 'update_mask') {
      if (clip.type === 'audio') throw new Error(`Clip ${clip.id} has no visual mask.`)
      if (operation.mask) clip.mask = operation.mask
      else delete clip.mask
    } else if (operation.kind === 'update_transition') {
      if (clip.type === 'audio') throw new Error(`Clip ${clip.id} has no visual transition.`)
      const key = operation.edge === 'in' ? 'transitionIn' : 'transitionOut'
      if (operation.transition) clip[key] = operation.transition
      else delete clip[key]
    }
  }
  return validateCutProjectDocument(document)
}

export function normalizeCutTimeRanges(input: readonly CutTimeRange[], duration: number): CutTimeRange[] {
  const ranges = input.map((range, index) => {
    const start = roundMilliseconds(Math.max(0, range.start))
    const end = roundMilliseconds(Math.min(duration, range.end))
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`Cut time range ${index + 1} is outside the project duration.`)
    }
    return { start, end }
  }).sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: CutTimeRange[] = []
  for (const range of ranges) {
    const previous = merged.at(-1)
    if (previous && range.start <= previous.end + 0.001) previous.end = Math.max(previous.end, range.end)
    else merged.push({ ...range })
  }
  return merged
}

export function cutTimeAfterRippleDelete(time: number, rangesInput: readonly CutTimeRange[]) {
  let removed = 0
  for (const range of rangesInput) {
    if (time >= range.end) removed += range.end - range.start
    else if (time > range.start) return roundMilliseconds(range.start - removed)
    else break
  }
  return roundMilliseconds(Math.max(0, time - removed))
}

function applyRippleDeleteRanges(document: CutProjectDocument, rangesInput: CutTimeRange[]) {
  const ranges = normalizeCutTimeRanges(rangesInput, document.settings.durationSeconds)
  const removedDuration = ranges.reduce((total, range) => total + range.end - range.start, 0)
  if (document.settings.durationSeconds - removedDuration < 0.1) throw new Error('Ripple delete must leave at least 0.1 seconds in the project.')
  for (const track of document.tracks) {
    const next: CutClip[] = []
    for (const clip of track.clips) {
      const portions = subtractRanges({ start: clip.start, end: clip.start + clip.duration }, ranges)
      portions.forEach((portion, index) => {
        const rate = clip.playbackRate ?? 1
        const sourceStart = clip.trimIn + (portion.start - clip.start) * rate
        const duration = portion.end - portion.start
        const part: CutClip = {
          ...structuredClone(clip),
          id: index === 0 ? clip.id : randomUUID(),
          name: index === 0 ? clip.name : `${clip.name} ${index + 1}`,
          start: cutTimeAfterRippleDelete(portion.start, ranges),
          duration: roundMilliseconds(duration),
          trimIn: roundMilliseconds(sourceStart),
          trimOut: roundMilliseconds(sourceStart + duration * rate)
        }
        if (index > 0) delete part.transitionIn
        if (index < portions.length - 1) delete part.transitionOut
        next.push(part)
      })
    }
    track.clips = next.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
  }
  document.bookmarks = document.bookmarks?.map((bookmark) => ({
    ...bookmark,
    time: cutTimeAfterRippleDelete(bookmark.time, ranges)
  }))
  document.settings.durationSeconds = roundMilliseconds(document.settings.durationSeconds - removedDuration)
}

function applyCover(document: CutProjectDocument, operation: Extract<CutEditOperation, { kind: 'add_cover' }>) {
  if (document.settings.durationSeconds + operation.duration > 3_600) throw new Error('Cover would exceed the 3600-second project limit.')
  const duration = roundMilliseconds(operation.duration)
  for (const track of document.tracks) {
    for (const clip of track.clips) clip.start = roundMilliseconds(clip.start + duration)
  }
  document.bookmarks = document.bookmarks?.map((bookmark) => ({ ...bookmark, time: roundMilliseconds(bookmark.time + duration) }))
  document.settings.durationSeconds = roundMilliseconds(document.settings.durationSeconds + duration)
  const fullFrame = { x: 0, y: 0, width: document.settings.width, height: document.settings.height, rotation: 0, opacity: 1 }
  document.tracks.push({
    id: randomUUID(), name: 'Cover background', kind: 'visual', muted: false, hidden: false,
    clips: [{
      id: randomUUID(), type: 'color', name: 'Cover background', start: 0, duration, trimIn: 0, trimOut: duration,
      color: operation.background, transform: fullFrame
    }]
  })
  document.tracks.push({
    id: randomUUID(), name: 'Cover title', kind: 'visual', muted: false, hidden: false,
    clips: [{
      id: randomUUID(), type: 'text', name: 'Cover title', start: 0, duration, trimIn: 0, trimOut: duration,
      text: operation.title, color: operation.color, fontSize: Math.round(document.settings.height * 0.075), fontWeight: 800,
      textAlign: 'center', transform: { ...fullFrame, x: document.settings.width * 0.08, y: document.settings.height * 0.28, width: document.settings.width * 0.84, height: document.settings.height * 0.28 }
    }]
  })
  if (operation.subtitle) {
    document.tracks.push({
      id: randomUUID(), name: 'Cover subtitle', kind: 'visual', muted: false, hidden: false,
      clips: [{
        id: randomUUID(), type: 'text', name: 'Cover subtitle', start: 0, duration, trimIn: 0, trimOut: duration,
        text: operation.subtitle, color: operation.color, fontSize: Math.round(document.settings.height * 0.034), fontWeight: 500,
        textAlign: 'center', transform: { ...fullFrame, x: document.settings.width * 0.12, y: document.settings.height * 0.56, width: document.settings.width * 0.76, height: document.settings.height * 0.16 }
      }]
    })
  }
}

function subtractRanges(source: CutTimeRange, ranges: readonly CutTimeRange[]) {
  const portions: CutTimeRange[] = []
  let cursor = source.start
  for (const range of ranges) {
    if (range.end <= cursor) continue
    if (range.start >= source.end) break
    if (range.start > cursor) portions.push({ start: cursor, end: Math.min(range.start, source.end) })
    cursor = Math.max(cursor, range.end)
    if (cursor >= source.end) break
  }
  if (cursor < source.end) portions.push({ start: cursor, end: source.end })
  return portions.filter((portion) => portion.end - portion.start >= 0.001)
}

function roundMilliseconds(value: number) {
  return Math.round(value * 1_000) / 1_000
}

export function appendCutMediaClip(
  documentInput: CutProjectDocument,
  input: Pick<CutClip, 'id' | 'name' | 'type' | 'mediaAssetId' | 'source' | 'previewUrl'> & { duration?: number }
): CutProjectDocument {
  const document = validateCutProjectDocument(documentInput)
  const kind = input.type === 'audio' ? 'audio' : 'visual'
  const track = document.tracks.find((item) => item.kind === kind) ?? createTrack(kind)
  if (!document.tracks.includes(track)) document.tracks.push(track)
  const requestedDuration = Math.min(Math.max(input.duration ?? (input.type === 'image' ? 5 : 10), 0.1), 3_600)
  if ((input.type === 'video' || input.type === 'audio') && requestedDuration > document.settings.durationSeconds) {
    document.settings.durationSeconds = requestedDuration
  }
  const duration = Math.min(requestedDuration, document.settings.durationSeconds)
  track.clips.push({
    ...input,
    start: 0,
    duration,
    trimIn: 0,
    trimOut: duration,
    ...(kind === 'visual'
      ? {
          ...(input.type === 'video' || input.type === 'image' ? { mediaFit: 'cover' as const } : {}),
          transform: { x: 0, y: 0, width: document.settings.width, height: document.settings.height, rotation: 0, opacity: 1 }
        }
      : {})
  })
  return validateCutProjectDocument(document)
}

function applyProjectSettings(
  document: CutProjectDocument,
  settings: { width?: number; height?: number; fps?: number; background?: string },
  reframe: 'preserve' | 'contain' | 'cover' | 'stretch'
) {
  const previousWidth = document.settings.width
  const previousHeight = document.settings.height
  const nextWidth = settings.width ?? previousWidth
  const nextHeight = settings.height ?? previousHeight
  const widthScale = nextWidth / previousWidth
  const heightScale = nextHeight / previousHeight

  if (reframe !== 'preserve' && (nextWidth !== previousWidth || nextHeight !== previousHeight)) {
    const uniformScale = reframe === 'contain' ? Math.min(widthScale, heightScale) : Math.max(widthScale, heightScale)
    for (const track of document.tracks) {
      if (track.kind !== 'visual') continue
      for (const clip of track.clips) {
        const transform = clip.transform
        if (!transform) continue
        if (reframe === 'stretch') {
          clip.transform = {
            ...transform,
            x: transform.x * widthScale,
            y: transform.y * heightScale,
            width: transform.width * widthScale,
            height: transform.height * heightScale
          }
          continue
        }
        const centerX = nextWidth / 2 + (transform.x + transform.width / 2 - previousWidth / 2) * uniformScale
        const centerY = nextHeight / 2 + (transform.y + transform.height / 2 - previousHeight / 2) * uniformScale
        const width = transform.width * uniformScale
        const height = transform.height * uniformScale
        clip.transform = { ...transform, x: centerX - width / 2, y: centerY - height / 2, width, height }
      }
    }
  }

  document.settings = { ...document.settings, ...settings }
}

function findClip(tracks: CutTrack[], clipId: string) {
  for (const track of tracks) {
    const index = track.clips.findIndex((clip) => clip.id === clipId)
    if (index >= 0) return { track, clip: track.clips[index]!, index }
  }
  return null
}

function requireClip(tracks: CutTrack[], clipId: string) {
  const located = findClip(tracks, clipId)
  if (!located) throw new Error(`Clip ${clipId} was not found.`)
  return located
}

function requireTrack(tracks: CutTrack[], trackId: string) {
  const track = tracks.find((item) => item.id === trackId)
  if (!track) throw new Error(`Track ${trackId} was not found.`)
  return track
}

function assertClipCanUseTrack(clip: CutClip, track: CutTrack) {
  const expected = clip.type === 'audio' ? 'audio' : 'visual'
  if (track.kind !== expected) throw new Error(`${clip.type} clip ${clip.id} cannot be placed on a ${track.kind} track.`)
}

function assertClipHasSource(clip: CutClip) {
  if (clip.type === 'text' && clip.text === undefined) throw new Error(`Text clip ${clip.id} requires text.`)
  if (clip.type === 'color' && !clip.color) throw new Error(`Color clip ${clip.id} requires a color.`)
  if (['video', 'image', 'audio'].includes(clip.type) && !clip.mediaAssetId && !clip.source && !clip.previewUrl) {
    throw new Error(`${clip.type} clip ${clip.id} requires an imported media reference.`)
  }
}

function uniqueIds(ids: string[], operation: string) {
  const unique = [...new Set(ids)]
  if (unique.length !== ids.length) throw new Error(`${operation} contains duplicate clip ids.`)
  return unique
}

function sortClips(track: CutTrack) {
  track.clips.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
}

function assertDefinedPatch(value: object, keys: string[], operation: string) {
  if (!keys.some((key) => (value as Record<string, unknown>)[key] !== undefined)) {
    throw new Error(`${operation} requires a non-empty patch.`)
  }
}

function assignDefined<T extends object, U extends object>(target: T, source: U, keys: string[]) {
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key]
    if (value !== undefined) (target as Record<string, unknown>)[key] = value
  }
}

function applyTrackMutation(document: CutProjectDocument, mutation: CutTrackMutation) {
  if (mutation.action === 'add') {
    const track: CutTrack = {
      id: mutation.track.id ?? randomUUID(),
      name: mutation.track.name,
      kind: mutation.track.kind,
      muted: false,
      hidden: false,
      clips: []
    }
    if (document.tracks.some((item) => item.id === track.id)) throw new Error(`Duplicate track id: ${track.id}`)
    const index = mutation.track.index ?? document.tracks.length
    if (index > document.tracks.length) throw new Error(`Track index ${index} exceeds the track list.`)
    document.tracks.splice(index, 0, track)
    return
  }
  const track = requireTrack(document.tracks, mutation.trackId)
  if (mutation.action === 'update') {
    assertDefinedPatch(mutation, ['name', 'muted', 'hidden'], 'manage_track update')
    assignDefined(track, mutation, ['name', 'muted', 'hidden'])
  } else if (mutation.action === 'delete') {
    if (track.clips.length && !mutation.deleteClips) throw new Error(`Track ${track.id} is not empty; set deleteClips to confirm deletion.`)
    document.tracks.splice(document.tracks.indexOf(track), 1)
  } else {
    if (mutation.index >= document.tracks.length) throw new Error(`Track index ${mutation.index} exceeds the track list.`)
    const current = document.tracks.indexOf(track)
    document.tracks.splice(current, 1)
    document.tracks.splice(mutation.index, 0, track)
  }
}

function createTrack(kind: CutTrack['kind']): CutTrack {
  return { id: randomUUID(), name: kind === 'audio' ? 'Audio' : 'Video', kind, muted: false, hidden: false, clips: [] }
}
