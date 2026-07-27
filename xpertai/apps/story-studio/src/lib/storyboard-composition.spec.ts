import {
  createStoryboardComposition,
  totalProductionDuration
} from './storyboard-composition.js'
import type { StoryProductionDocument } from './production-types.js'

const production: StoryProductionDocument = {
  sourceSynopsis: 'A pilot follows a signal into a silent storm.',
  adaptationGoal: 'Create an eight-second atmospheric teaser.',
  visualStyle: 'Deep blue radar glow and amber cockpit instruments.',
  characters: [{ id: 'pilot', name: 'Mara', role: 'Pilot' }],
  scenes: [
    {
      id: 'storm',
      order: 1,
      title: 'Signal',
      summary: 'The impossible signal answers.',
      location: 'Cockpit',
      timeOfDay: 'Night',
      shots: [
        {
          id: 'radar',
          title: 'Radar bloom',
          composition: 'Mara framed behind a circular radar display.',
          action: 'A second pulse appears inside the storm.',
          camera: 'Locked medium close-up',
          dialogue: 'That is not our echo.',
          durationSeconds: 4
        },
        {
          id: 'storm-eye',
          title: 'Storm eye',
          composition: 'The aircraft enters a geometric opening in the clouds.',
          action: 'Lightning freezes into a luminous corridor.',
          camera: 'Forward tracking point of view',
          durationSeconds: 4
        }
      ]
    }
  ]
}

describe('Storyboard composition', () => {
  it('builds a self-contained vertical HyperFrames composition', () => {
    const html = createStoryboardComposition({
      title: 'Signal in the Storm',
      aspectRatio: '9:16',
      production
    })
    expect(html).toContain('data-composition-id="story-studio"')
    expect(html).toContain('data-width="720"')
    expect(html).toContain('data-height="1280"')
    expect(html).toContain('data-duration="8"')
    expect(html).toContain('data-hf-id="shot-radar"')
    expect(html).toContain(
      '.shot-0{--accent:#22d3ee;animation:shot-0 8s linear both}'
    )
    expect(html).toContain(
      '.shot-1{--accent:#a78bfa;animation:shot-1 8s linear both}'
    )
    expect(html).toContain(
      '@keyframes shot-1{0%,50.0000%{opacity:0;transform:scale(1.025)}'
    )
    expect(html).not.toMatch(/\bsrc\s*=/)
    expect(totalProductionDuration(production)).toBe(8)
  })

  it('escapes production text before embedding it in the Action payload', () => {
    const html = createStoryboardComposition({
      title: '<script>alert(1)</script>',
      aspectRatio: '16:9',
      production: {
        ...production,
        scenes: [
          {
            ...production.scenes[0],
            shots: [
              {
                ...production.scenes[0].shots[0],
                dialogue: '<img src=x onerror=alert(1)>'
              }
            ]
          }
        ]
      }
    })
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img src=')
    expect(html).toContain('&lt;img src=x')
  })

  it('renders only an explicitly selected, staged media candidate', () => {
    const html = createStoryboardComposition({
      title: 'Signal in the Storm',
      aspectRatio: '9:16',
      production: {
        ...production,
        scenes: [
          {
            ...production.scenes[0],
            shots: [
              {
                ...production.scenes[0].shots[0],
                candidates: [
                  {
                    id: 'radar-selected',
                    kind: 'image',
                    label: 'Selected radar frame',
                    selected: true
                  },
                  {
                    id: 'radar-unselected',
                    kind: 'image',
                    label: 'Unselected radar frame',
                    selected: false
                  }
                ]
              }
            ]
          }
        ]
      },
      mediaSources: {
        'radar-selected': 'media/radar-selected/frame.png',
        'radar-unselected': 'media/radar-unselected/frame.png'
      }
    })
    expect(html).toContain('src="media/radar-selected/frame.png"')
    expect(html).not.toContain('media/radar-unselected/frame.png')
  })

  it('gives every staged video an independent HyperFrames media timeline', () => {
    const html = createStoryboardComposition({
      title: 'Signal in the Storm',
      aspectRatio: '9:16',
      production: {
        ...production,
        scenes: [
          {
            ...production.scenes[0],
            shots: production.scenes[0].shots.map((shot) => ({
              ...shot,
              candidates: [
                {
                  id: `${shot.id}-video`,
                  kind: 'video' as const,
                  label: `${shot.title} video`,
                  selected: true
                }
              ]
            }))
          }
        ]
      },
      mediaSources: {
        'radar-video': 'media/radar-video/clip.mp4',
        'storm-eye-video': 'media/storm-eye-video/clip.mp4'
      }
    })

    expect(html).toContain(
      'id="media-radar" src="media/radar-video/clip.mp4"'
    )
    expect(html).toContain(
      'data-start="0" data-duration="4" data-media-start="0"'
    )
    expect(html).toContain(
      'id="media-storm-eye" src="media/storm-eye-video/clip.mp4"'
    )
    expect(html).toContain(
      'data-start="4" data-duration="4" data-media-start="0"'
    )
    expect(html).toContain('data-track-index="0"')
    expect(html).not.toContain(
      'data-hf-id="shot-storm-eye" data-start="4"'
    )
    expect(html).not.toContain('<video src=')
    expect(html).not.toContain('autoplay')
  })
})
