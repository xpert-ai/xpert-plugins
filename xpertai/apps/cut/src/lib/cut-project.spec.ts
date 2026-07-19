import {
  appendCutMediaClip,
  applyCutEdit,
  createStarterCutProject,
  cutEditOperationSchema,
  cutProjectDocumentSchema,
  validateCutProjectDocument
} from './cut-project.js'

describe('Cut project IR', () => {
  it('creates a 1080p, 30 second starter project', () => {
    const document = createStarterCutProject()
    expect(document.settings).toMatchObject({ width: 1920, height: 1080, fps: 30, durationSeconds: 30 })
    expect(validateCutProjectDocument(document)).toEqual(document)
  })

  it('uses the full media duration and expands the project when imported media is longer', () => {
    const document = appendCutMediaClip(createStarterCutProject(), {
      id: 'long-interview',
      name: 'Long interview',
      type: 'video',
      mediaAssetId: 'asset-long',
      duration: 87.654
    })
    expect(document.settings.durationSeconds).toBe(87.654)
    expect(document.tracks[0]!.clips[0]).toMatchObject({ duration: 87.654, trimIn: 0, trimOut: 87.654 })
  })

  it('splits, trims, and moves a media clip deterministically', () => {
    let document = appendCutMediaClip(createStarterCutProject(), {
      id: 'asset-clip',
      name: 'Demo',
      type: 'video',
      mediaAssetId: 'asset-1',
      duration: 12
    })
    document = applyCutEdit(document, { kind: 'split', clipId: 'asset-clip', at: 5 })
    const clips = document.tracks[0]!.clips
    expect(clips).toHaveLength(2)
    expect(clips[0]).toMatchObject({ start: 0, duration: 5, trimOut: 5 })
    const secondId = clips[1]!.id
    document = applyCutEdit(document, { kind: 'trim', clipId: secondId, edge: 'end', time: 10 })
    document = applyCutEdit(document, { kind: 'move', clipId: secondId, start: 15 })
    expect(document.tracks[0]!.clips.find((clip) => clip.id === secondId)).toMatchObject({ start: 15, duration: 5 })
  })

  it('rejects clips outside the project duration', () => {
    const document = appendCutMediaClip(createStarterCutProject(), {
      id: 'asset-clip',
      name: 'Demo',
      type: 'video',
      mediaAssetId: 'asset-1',
      duration: 12
    })
    expect(() => applyCutEdit(document, { kind: 'move', clipId: 'asset-clip', start: 25 })).toThrow('project bounds')
  })

  it('changes project dimensions without treating a clip rotation as source orientation', () => {
    const document = appendCutMediaClip(createStarterCutProject(), {
      id: 'sideways-source', name: 'Sideways source', type: 'video', mediaAssetId: 'asset-sideways', duration: 10
    })
    document.tracks[0]!.clips[0]!.transform = { x: 0, y: 0, width: 1920, height: 1080, rotation: -90, opacity: 1 }
    const portrait = applyCutEdit(document, {
      kind: 'update_project_settings', settings: { width: 1080, height: 1920 }, reframe: 'preserve'
    })
    expect(portrait.settings).toMatchObject({ width: 1080, height: 1920 })
    expect(portrait.tracks[0]!.clips[0]!.transform).toEqual({ x: 0, y: 0, width: 1920, height: 1080, rotation: -90, opacity: 1 })
  })

  it('reframes existing composition geometry while always preserving rotation', () => {
    const document = appendCutMediaClip(createStarterCutProject(), {
      id: 'landscape-clip', name: 'Landscape', type: 'video', mediaAssetId: 'asset-landscape', duration: 10
    })
    document.tracks[0]!.clips[0]!.transform = { x: 480, y: 270, width: 960, height: 540, rotation: -90, opacity: 1 }
    const portrait = applyCutEdit(document, {
      kind: 'update_project_settings', settings: { width: 1080, height: 1920 }, reframe: 'cover'
    })
    const transform = portrait.tracks[0]!.clips[0]!.transform!
    expect(transform.rotation).toBe(-90)
    expect(transform.x + transform.width / 2).toBeCloseTo(540)
    expect(transform.y + transform.height / 2).toBeCloseTo(960)
    expect(transform.width).toBeCloseTo(1_706.667)
    expect(transform.height).toBeCloseTo(960)
  })

  it('preserves editor playback, volume, and transition properties', () => {
    const document = appendCutMediaClip(createStarterCutProject(), {
      id: 'styled-clip',
      name: 'Styled demo',
      type: 'video',
      mediaAssetId: 'asset-2',
      duration: 8
    })
    const clip = document.tracks[0]!.clips[0]!
    clip.playbackRate = 1.5
    clip.volume = 0.65
    clip.fadeIn = 0.4
    clip.fadeOut = 0.7
    clip.fontSize = 84
    clip.fontWeight = 700
    clip.fontFamily = 'sans'
    clip.fontStyle = 'italic'
    clip.textDecoration = 'underline'
    clip.textAlign = 'center'
    clip.verticalAlign = 'bottom'
    clip.letterSpacing = 3
    clip.lineHeight = 1.3
    clip.strokeColor = '#111827'
    clip.strokeWidth = 3
    clip.textShadowColor = '#000000'
    clip.textShadowBlur = 12
    clip.textShadowOffsetX = 2
    clip.textShadowOffsetY = 4
    clip.textBackgroundColor = '#111827'
    clip.textBackgroundOpacity = 0.75
    clip.effects = { brightness: 1.05, contrast: 1.2, saturation: 0.9, blur: 0.5, grayscale: 0, sepia: 0.1 }
    clip.blendMode = 'overlay'
    clip.mask = { shape: 'rounded', inset: 0.08, radius: 0.25 }
    clip.transitionIn = { type: 'slide', duration: 0.5 }
    clip.transitionOut = { type: 'zoom', duration: 0.75 }
    document.bookmarks = [{ id: 'marker-1', time: 3.5, label: 'First cut' }]
    const parsed = cutProjectDocumentSchema.parse(document)
    expect(parsed.tracks[0]!.clips[0]).toMatchObject({
      playbackRate: 1.5,
      volume: 0.65,
      fadeIn: 0.4,
      fadeOut: 0.7,
      fontSize: 84,
      fontWeight: 700,
      fontFamily: 'sans',
      fontStyle: 'italic',
      textDecoration: 'underline',
      textAlign: 'center',
      verticalAlign: 'bottom',
      letterSpacing: 3,
      lineHeight: 1.3,
      strokeColor: '#111827',
      strokeWidth: 3,
      textShadowColor: '#000000',
      textShadowBlur: 12,
      textShadowOffsetX: 2,
      textShadowOffsetY: 4,
      textBackgroundColor: '#111827',
      textBackgroundOpacity: 0.75,
      effects: { brightness: 1.05, contrast: 1.2, saturation: 0.9, blur: 0.5, grayscale: 0, sepia: 0.1 },
      blendMode: 'overlay',
      mask: { shape: 'rounded', inset: 0.08, radius: 0.25 },
      transitionIn: { type: 'slide', duration: 0.5 },
      transitionOut: { type: 'zoom', duration: 0.75 }
    })
    expect(parsed.bookmarks).toEqual([{ id: 'marker-1', time: 3.5, label: 'First cut' }])
    expect(validateCutProjectDocument(parsed)).toEqual(document)
  })

  it('rejects unsafe playback and audio ranges', () => {
    const document = appendCutMediaClip(createStarterCutProject(), {
      id: 'invalid-clip',
      name: 'Invalid demo',
      type: 'video',
      mediaAssetId: 'asset-3',
      duration: 8
    })
    document.tracks[0]!.clips[0]!.playbackRate = 0
    document.tracks[0]!.clips[0]!.volume = 3
    expect(() => validateCutProjectDocument(document)).toThrow()
  })

  it('applies narrow text, transform, effects, mask, transition, timing, duplicate, and delete operations', () => {
    const starter = createStarterCutProject()
    const visualTrackId = starter.tracks[0]!.id
    let document = applyCutEdit(starter, {
      kind: 'add_clip',
      trackId: visualTrackId,
      clip: { type: 'text', name: 'Opening title', text: 'Hello', start: 1, duration: 4 }
    })
    const clipId = document.tracks[0]!.clips[0]!.id
    document = applyCutEdit(document, {
      kind: 'update_text', clipId, text: 'Hello Xpert', fontSize: 96, fontWeight: 700, fontFamily: 'sans', fontStyle: 'italic',
      textDecoration: 'underline', textAlign: 'center', verticalAlign: 'bottom', letterSpacing: 2, lineHeight: 1.25,
      color: '#ffffff', strokeColor: '#111827', strokeWidth: 3, textShadowColor: '#000000', textShadowBlur: 10,
      textShadowOffsetX: 2, textShadowOffsetY: 4, textBackgroundColor: '#111827', textBackgroundOpacity: 0.7
    })
    document = applyCutEdit(document, { kind: 'update_transform', clipId, transform: { x: 120, y: 80, opacity: 0.9 } })
    document = applyCutEdit(document, { kind: 'update_effects', clipId, effects: { brightness: 1.2, blur: 0.5 }, blendMode: 'screen' })
    document = applyCutEdit(document, { kind: 'update_mask', clipId, mask: { shape: 'rounded', inset: 0.05, radius: 0.2 } })
    document = applyCutEdit(document, { kind: 'update_transition', clipId, edge: 'in', transition: { type: 'fade', duration: 0.4 } })
    document = applyCutEdit(document, { kind: 'update_clip_timing', clipId, start: 2, duration: 3, playbackRate: 1.25 })
    document = applyCutEdit(document, { kind: 'duplicate_clips', clipIds: [clipId], offsetSeconds: 4 })

    expect(document.tracks[0]!.clips).toHaveLength(2)
    expect(document.tracks[0]!.clips[0]).toMatchObject({
      id: clipId,
      text: 'Hello Xpert',
      start: 2,
      duration: 3,
      trimOut: 3,
      playbackRate: 1.25,
      fontSize: 96,
      fontFamily: 'sans',
      fontStyle: 'italic',
      textDecoration: 'underline',
      verticalAlign: 'bottom',
      letterSpacing: 2,
      lineHeight: 1.25,
      strokeWidth: 3,
      textShadowBlur: 10,
      textBackgroundOpacity: 0.7,
      transform: { x: 120, y: 80, opacity: 0.9 },
      effects: { brightness: 1.2, blur: 0.5 },
      blendMode: 'screen',
      mask: { shape: 'rounded' },
      transitionIn: { type: 'fade', duration: 0.4 }
    })
    expect(document.tracks[0]!.clips[1]).toMatchObject({ name: 'Opening title Copy', start: 6 })

    document = applyCutEdit(document, { kind: 'delete_clips', clipIds: [clipId] })
    expect(document.tracks[0]!.clips).toHaveLength(1)
    expect(document.tracks[0]!.clips[0]!.id).not.toBe(clipId)
  })

  it('manages tracks and rejects unsafe cross-kind or empty patch operations', () => {
    let document = createStarterCutProject()
    document = applyCutEdit(document, { kind: 'manage_track', mutation: { action: 'add', track: { id: 'visual-2', name: 'Overlay', kind: 'visual', index: 1 } } })
    document = applyCutEdit(document, { kind: 'manage_track', mutation: { action: 'update', trackId: 'visual-2', name: 'Titles', hidden: true } })
    expect(document.tracks[1]).toMatchObject({ id: 'visual-2', name: 'Titles', hidden: true })
    document = applyCutEdit(document, { kind: 'manage_track', mutation: { action: 'move', trackId: 'visual-2', index: 0 } })
    expect(document.tracks[0]!.id).toBe('visual-2')
    document = applyCutEdit(document, { kind: 'manage_track', mutation: { action: 'delete', trackId: 'visual-2' } })
    expect(document.tracks.some((track) => track.id === 'visual-2')).toBe(false)

    const withVideo = appendCutMediaClip(document, { id: 'video-clip', name: 'Video', type: 'video', mediaAssetId: 'asset-1', duration: 5 })
    expect(() => applyCutEdit(withVideo, {
      kind: 'move', clipId: 'video-clip', start: 1, trackId: withVideo.tracks.find((track) => track.kind === 'audio')!.id
    })).toThrow('cannot be placed')
    expect(() => applyCutEdit(withVideo, { kind: 'update_transform', clipId: 'video-clip', transform: {} })).toThrow('non-empty patch')
  })

  it('ripple-deletes multiple ranges across tracks while preserving source trims and sync', () => {
    let document = appendCutMediaClip(createStarterCutProject({ durationSeconds: 12 }), {
      id: 'video-clip', name: 'Interview', type: 'video', mediaAssetId: 'asset-1', duration: 12
    })
    document.tracks[1]!.clips.push({
      id: 'audio-clip', name: 'Interview audio', type: 'audio', mediaAssetId: 'asset-1',
      start: 0, duration: 12, trimIn: 0, trimOut: 12
    })
    document.bookmarks = [{ id: 'marker', time: 9, label: 'Topic' }]
    document = applyCutEdit(document, {
      kind: 'ripple_delete_ranges', ranges: [{ start: 2, end: 3 }, { start: 7, end: 9 }]
    })
    expect(document.settings.durationSeconds).toBe(9)
    expect(document.tracks[0]!.clips.map(({ start, duration, trimIn, trimOut }) => ({ start, duration, trimIn, trimOut }))).toEqual([
      { start: 0, duration: 2, trimIn: 0, trimOut: 2 },
      { start: 2, duration: 4, trimIn: 3, trimOut: 7 },
      { start: 6, duration: 3, trimIn: 9, trimOut: 12 }
    ])
    expect(document.tracks[1]!.clips.map(({ start, duration, trimIn }) => ({ start, duration, trimIn }))).toEqual([
      { start: 0, duration: 2, trimIn: 0 },
      { start: 2, duration: 4, trimIn: 3 },
      { start: 6, duration: 3, trimIn: 9 }
    ])
    expect(document.bookmarks).toEqual([{ id: 'marker', time: 6, label: 'Topic' }])
  })

  it('inserts a rendered cover and shifts the existing program without overlap', () => {
    let document = appendCutMediaClip(createStarterCutProject({ width: 1080, height: 1920, durationSeconds: 10 }), {
      id: 'video-clip', name: 'Interview', type: 'video', mediaAssetId: 'asset-1', duration: 10
    })
    document = applyCutEdit(document, {
      kind: 'add_cover', title: 'Product Story', subtitle: 'Built with Xpert', duration: 2.5,
      background: '#07111f', color: '#ffffff'
    })
    expect(document.settings.durationSeconds).toBe(12.5)
    expect(document.tracks[0]!.clips[0]).toMatchObject({ id: 'video-clip', start: 2.5 })
    expect(document.tracks.slice(-3).map((track) => track.clips[0]!.type)).toEqual(['color', 'text', 'text'])
    expect(document.tracks.at(-2)!.clips[0]).toMatchObject({ text: 'Product Story', start: 0, duration: 2.5 })
  })

  it('bounds multi-clip operation inputs in the shared schema', () => {
    expect(() => cutEditOperationSchema.parse({
      kind: 'delete_clips', clipIds: Array.from({ length: 101 }, (_, index) => `clip-${index}`)
    })).toThrow()
  })
})
