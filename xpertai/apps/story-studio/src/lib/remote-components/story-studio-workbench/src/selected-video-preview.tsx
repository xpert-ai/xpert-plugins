import * as React from 'react'
import {
  Badge,
  Button,
  ChevronLeft,
  ChevronRight,
  Play
} from '@xpert-ai/plugin-shadcn-ui'
import type { MessageKey } from './i18n'

const h: typeof React.createElement = React.createElement

type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

export type SelectedVideoClip = {
  id: string
  src: string
  label: string
  sceneTitle: string
  shotTitle: string
  durationSeconds: number
}

export function SelectedVideoPreview(props: {
  clips: SelectedVideoClip[]
  t: Translator
}) {
  const { clips, t } = props
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const [continuePlayback, setContinuePlayback] = React.useState(false)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const current = clips[currentIndex] ?? null

  React.useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(0, clips.length - 1)))
  }, [clips.length])

  React.useEffect(() => {
    if (!continuePlayback || !current) return
    const video = videoRef.current
    if (!video) return
    void video.play().catch(() => setContinuePlayback(false))
  }, [continuePlayback, current?.id])

  function playFromCurrent() {
    setContinuePlayback(true)
    void videoRef.current?.play()
  }

  function selectClip(index: number, keepPlaying = false) {
    setContinuePlayback(keepPlaying)
    setCurrentIndex(index)
  }

  function playNext() {
    if (currentIndex >= clips.length - 1) {
      setContinuePlayback(false)
      return
    }
    selectClip(currentIndex + 1, true)
  }

  return (
    <section className="ss-sequence-preview">
      <header>
        <div>
          <strong>{t('preview.title')}</strong>
          <p>{t('preview.help')}</p>
        </div>
        <Badge variant="outline">
          {t('preview.readyCount', { count: clips.length })}
        </Badge>
      </header>
      {current ? (
        <div className="ss-sequence-body">
          <div className="ss-sequence-player">
            <video
              key={current.id}
              ref={videoRef}
              controls
              crossOrigin="use-credentials"
              playsInline
              preload="metadata"
              src={current.src}
              onPlay={() => setContinuePlayback(true)}
              onEnded={playNext}
            >
              <track kind="captions" />
            </video>
            <div className="ss-sequence-meta">
              <div>
                <small>{current.sceneTitle}</small>
                <strong>{current.shotTitle}</strong>
                <span>{current.label}</span>
              </div>
              <code>
                {t('preview.position', {
                  current: currentIndex + 1,
                  total: clips.length
                })}
              </code>
            </div>
            <div className="ss-sequence-controls">
              <Button
                variant="outline"
                size="sm"
                disabled={currentIndex === 0}
                onClick={() => selectClip(currentIndex - 1)}
              >
                <ChevronLeft aria-hidden="true" />
                {t('preview.previous')}
              </Button>
              <Button size="sm" onClick={playFromCurrent}>
                <Play aria-hidden="true" />
                {t('preview.playSequence')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentIndex === clips.length - 1}
                onClick={() => selectClip(currentIndex + 1)}
              >
                {t('preview.next')}
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
          <ol className="ss-sequence-list">
            {clips.map((clip, index) => (
              <li className={index === currentIndex ? 'is-active' : ''} key={clip.id}>
                <button type="button" onClick={() => selectClip(index)}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <strong>{clip.shotTitle}</strong>
                    <small>{clip.sceneTitle} · {clip.durationSeconds}s</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="ss-sequence-empty">
          <Play aria-hidden="true" />
          <strong>{t('preview.empty')}</strong>
          <p>{t('preview.emptyHelp')}</p>
        </div>
      )}
    </section>
  )
}
