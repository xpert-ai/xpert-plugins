import { audibleTimelineClips, restoreClipSourceDuration } from './cut-media-playback.js'
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
})
