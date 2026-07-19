import { audibleTimelineClips, restoreClipSourceDuration, shouldMountPreviewMedia, shouldSeekPreviewMedia } from './cut-media-playback.js'
import type { CutProjectDocument } from './types.js'

describe('Cut media playback', () => {
  function document(): CutProjectDocument {
    return {
      schemaVersion: 1,
      settings: { width: 1920, height: 1080, fps: 30, durationSeconds: 30, background: '#000000' },
      tracks: [
        {
          id: 'visual', name: 'Video', kind: 'visual', muted: false, hidden: false,
          clips: [{ id: 'video', type: 'video', name: 'Interview', start: 0, duration: 10, trimIn: 0, trimOut: 10, previewUrl: '/interview.mov', volume: 1 }]
        },
        {
          id: 'audio', name: 'Audio', kind: 'audio', muted: false, hidden: false,
          clips: [{ id: 'music', type: 'audio', name: 'Music', start: 0, duration: 10, trimIn: 0, trimOut: 10, previewUrl: '/music.wav', volume: 0.5 }]
        }
      ]
    }
  }

  it('includes embedded video audio until it is explicitly detached', () => {
    const project = document()
    expect(audibleTimelineClips(project).map((clip) => clip.id)).toEqual(['video', 'music'])
    project.tracks[0]!.clips[0]!.audioDetached = true
    expect(audibleTimelineClips(project).map((clip) => clip.id)).toEqual(['music'])
  })

  it('excludes muted tracks and zero-volume clips', () => {
    const project = document()
    project.tracks[0]!.muted = true
    project.tracks[1]!.clips[0]!.volume = 0
    expect(audibleTimelineClips(project)).toEqual([])
  })

  it('restores a legacy short clip to its source duration and expands the project', () => {
    const restored = restoreClipSourceDuration(document(), 'video', 87.654)
    expect(restored.settings.durationSeconds).toBe(87.654)
    expect(restored.tracks[0]!.clips[0]).toMatchObject({ duration: 87.654, trimOut: 87.654 })
  })

  it('does not repeatedly seek a media element during continuous playback', () => {
    expect(shouldSeekPreviewMedia({
      playing: true,
      wasPlaying: true,
      previousPlayhead: 12,
      playhead: 12.033,
      currentTime: 131.1,
      targetTime: 131.433
    })).toBe(false)
  })

  it('seeks when playback starts, pauses, or the user jumps the playhead', () => {
    const base = { previousPlayhead: 12, playhead: 12.033, currentTime: 0, targetTime: 131.433 }
    expect(shouldSeekPreviewMedia({ ...base, playing: true, wasPlaying: false })).toBe(true)
    expect(shouldSeekPreviewMedia({ ...base, playing: false, wasPlaying: true })).toBe(true)
    expect(shouldSeekPreviewMedia({ ...base, playing: true, wasPlaying: true, playhead: 20 })).toBe(true)
  })

  it('mounts the next media clip shortly before it becomes active', () => {
    const clip = { type: 'video', previewUrl: '/interview.mov', start: 3, duration: 10 }
    expect(shouldMountPreviewMedia(clip, 0)).toBe(true)
    expect(shouldMountPreviewMedia({ ...clip, start: 10 }, 0)).toBe(false)
    expect(shouldMountPreviewMedia({ ...clip, type: 'image' }, 0)).toBe(false)
  })
})
