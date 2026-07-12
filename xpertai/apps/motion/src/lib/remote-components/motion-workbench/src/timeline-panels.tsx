import * as React from 'react'
import { Badge } from '@xpert-ai/plugin-shadcn-ui'
import { Card } from '@xpert-ai/plugin-shadcn-ui'
import { Input } from '@xpert-ai/plugin-shadcn-ui'
import { getSceneList } from '../../../workbench-model'
import type { HtmlTimelineLayout } from '../../../workbench-model'
import type { MotionVideoLayer } from '../../../types'
import type { MotionVideoComposition } from './video-renderer'
import { TRANSITION_OPTIONS } from './motion-types'
import { localizeOptions, type Translator } from './i18n'
import { Button, MotionSelect, MotionSlider, h } from './ui'

export function TimelinePanel(props: {
  layout: HtmlTimelineLayout
  selectedId: string
  scope: 'all' | 'selection'
  time: number
  t: Translator
  onSelect: (id: string) => void
  onSeek: (time: number) => void
}) {
  const duration = Math.max(1, props.layout.duration)
  const [playing, setPlaying] = React.useState(false)
  const playStateRef = React.useRef({ time: props.time, duration, onSeek: props.onSeek })
  const playbackStartRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    playStateRef.current = { time: props.time, duration, onSeek: props.onSeek }
  }, [duration, props.onSeek, props.time])

  React.useEffect(() => {
    if (!playing) {
      return undefined
    }
    let frame = 0
    let startAt = 0
    const startTime = playbackStartRef.current ?? Math.min(playStateRef.current.time, playStateRef.current.duration)
    playbackStartRef.current = null
    const tick = (now: number) => {
      if (!startAt) {
        startAt = now
      }
      const state = playStateRef.current
      const nextTime = Math.min(state.duration, startTime + now - startAt)
      state.onSeek(nextTime)
      if (nextTime >= state.duration) {
        setPlaying(false)
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [playing])

  function togglePlayback() {
    if (playing) {
      setPlaying(false)
      return
    }
    const startTime = 0
    playbackStartRef.current = startTime
    props.onSeek(startTime)
    playStateRef.current = { ...playStateRef.current, time: startTime }
    setPlaying(true)
  }

  return (
    <Card className="html-timeline">
      <div className="timeline-head">
        <Button className="play-button small" onClick={togglePlayback} title={props.t(playing ? 'timelinePause' : 'timelinePlay')}>
          {playing ? '||' : '▶'}
        </Button>
        <strong>{(props.time / 1000).toFixed(2)}s</strong>
        <span>{props.t('timeline')}</span>
        <Badge variant="secondary">{props.t(props.scope === 'all' ? 'timelineScopeAll' : 'timelineScopeSelection')}</Badge>
        {props.layout.restraintWarning ? <Badge variant="outline" data-status="warning">{props.t('timelineRestraintWarning')}</Badge> : null}
        <MotionSlider min={0} max={duration} step={20} value={props.time} onChange={props.onSeek} />
      </div>
      <div className="timeline-ruler">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <span key={ratio} style={{ left: timelineLabelPosition(ratio) }}>
            {((duration * ratio) / 1000).toFixed(1)}s
          </span>
        ))}
      </div>
      <div className="timeline-body">
        <div className="timeline-playhead" style={{ left: `${(props.time / duration) * 100}%` }} />
        {props.layout.items.map((item) => (
          <Button key={item.id} variant="ghost" className={item.id === props.selectedId ? 'timeline-row active' : 'timeline-row'} onClick={() => props.onSelect(item.id)}>
            <span>{item.label}</span>
            <i className={item.startsEarly ? 'starts-early' : ''} style={{ left: `${item.leftPct}%`, width: `${item.widthPct}%` }} />
          </Button>
        ))}
      </div>
    </Card>
  )
}

export function SceneStrip(props: {
  composition: MotionVideoComposition
  activeSceneIndex: number
  t: Translator
  onSelect: (index: number) => void
  onAdd: () => void
  onDuration: (duration: number) => void
  onTransition: (transition: string) => void
}) {
  const scenes = getSceneList(props.composition)
  return (
    <div className="scene-strip">
      <div className="scene-strip-head">
        <strong>{props.t('sceneStrip')}</strong>
        <span>{props.t('sceneStripHelp')}</span>
      </div>
      <div className="scene-strip-controls">
        {scenes.length === 0 ? (
          <Button variant="secondary" className="scene-chip active" onClick={() => props.onSelect(-1)}>
            {props.t('main')}
          </Button>
        ) : (
          scenes.map((scene, index) => (
            <React.Fragment key={scene.id || index}>
              <Button variant={index === props.activeSceneIndex ? 'secondary' : 'outline'} className={index === props.activeSceneIndex ? 'scene-chip active' : 'scene-chip'} onClick={() => props.onSelect(index)}>
                {scene.name || `${props.t('scenes')} ${index + 1}`}
              </Button>
              {index < scenes.length - 1 ? (
                <MotionSelect value={scene.transition || 'cut'} options={localizeOptions(TRANSITION_OPTIONS, props.t)} onValueChange={props.onTransition} className="transition-select" />
              ) : null}
            </React.Fragment>
          ))
        )}
        <Button variant="outline" className="scene-chip" onClick={props.onAdd}>
          + {props.t('addScene')}
        </Button>
        <label className="scene-duration">
          <span>{props.t('sceneLength')}</span>
          <Input type="number" min="0.5" max="30" step="0.5" value={scenes[props.activeSceneIndex]?.duration || props.composition.duration || 5} onChange={(event) => props.onDuration(Number(event.target.value))} />
          <em>s</em>
        </label>
      </div>
    </div>
  )
}

export function VideoTimeline(props: {
  layers: MotionVideoLayer[]
  selectedLayerId: string
  duration: number
  time: number
  t: Translator
  onSeek: (time: number) => void
}) {
  const duration = Math.max(0.1, props.duration)
  const currentTime = Math.min(duration, Math.max(0, props.time))
  return (
    <Card className="video-timeline">
      <div className="timeline-head compact-head">
        <div className="timeline-title">
          <strong>{props.t('keyframeTimeline')}</strong>
          <span>{props.t('keyframeTimelineHelp')}</span>
        </div>
        <div className="timeline-legend" aria-hidden="true">
          <span>
            <i className="legend-playhead" />
            {props.t('timelineCurrentTime')}
          </span>
          <span>
            <i className="legend-keyframe" />
            {props.t('keyframeLegend')}
          </span>
        </div>
      </div>
      <div className="timeline-ruler">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <span key={ratio} style={{ left: timelineLabelPosition(ratio) }}>
            {(duration * ratio).toFixed(1)}s
          </span>
        ))}
      </div>
      <div className="timeline-body">
        <div className="timeline-playhead" style={{ left: `${(currentTime / duration) * 100}%` }} />
        {props.layers.map((layer) => {
          const keyframes = collectLayerKeyframes(layer, props.t)
          const seekFromRow = (event: React.MouseEvent<HTMLDivElement>) => {
            const track = event.currentTarget.querySelector<HTMLElement>('.timeline-track')
            const rect = (track || event.currentTarget).getBoundingClientRect()
            const position = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
            props.onSeek(position * duration)
          }
          return (
            <div
              key={layer.id || layer.text}
              role="button"
              tabIndex={0}
              className={layer.id === props.selectedLayerId ? 'timeline-row active' : 'timeline-row'}
              onClick={seekFromRow}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  props.onSeek(currentTime)
                }
              }}
            >
              <span>{layer.text || layer.id || layer.type}</span>
              <div className="timeline-track">
                {keyframes.length === 0 ? <em className="timeline-row-empty">{props.t('noKeyframes')}</em> : null}
                {keyframes.map((point) => {
                  const label = props.t('keyframeDot', { properties: point.properties.join(', '), time: point.t.toFixed(2) })
                  return (
                    <button
                      key={`${layer.id || layer.text}-${point.t}-${point.properties.join('-')}`}
                      type="button"
                      className={Math.abs(point.t - currentTime) < 0.04 ? 'timeline-keyframe-dot active' : 'timeline-keyframe-dot'}
                      style={{ left: `${(point.t / duration) * 100}%` }}
                      title={label}
                      aria-label={label}
                      onClick={(event) => {
                        event.stopPropagation()
                        props.onSeek(point.t)
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export function Stat(props: { label: string; value?: number }) {
  return (
    <div className="motion-stat">
      <strong>{props.value ?? 0}</strong>
      <span>{props.label}</span>
    </div>
  )
}

function timelineLabelPosition(ratio: number) {
  if (ratio <= 0) {
    return 'var(--timeline-edge-offset)'
  }
  if (ratio >= 1) {
    return 'calc(100% - var(--timeline-edge-offset))'
  }
  return `${ratio * 100}%`
}

function collectLayerKeyframes(layer: MotionVideoLayer, t: Translator) {
  const grouped = new Map<string, { t: number; properties: string[] }>()
  for (const [property, track] of Object.entries(layer.tracks || {})) {
    if (!Array.isArray(track)) {
      continue
    }
    for (const point of track) {
      const time = Number(point.t ?? 0)
      if (!Number.isFinite(time)) {
        continue
      }
      const key = time.toFixed(3)
      const group = grouped.get(key) ?? { t: time, properties: [] }
      group.properties.push(labelForTrackProperty(property, t))
      grouped.set(key, group)
    }
  }
  return [...grouped.values()]
    .map((point) => ({ ...point, properties: [...new Set(point.properties)] }))
    .sort((a, b) => a.t - b.t)
}

function labelForTrackProperty(property: string, t: Translator) {
  if (property === 'offset') {
    return t('motionPath')
  }
  return property
}
