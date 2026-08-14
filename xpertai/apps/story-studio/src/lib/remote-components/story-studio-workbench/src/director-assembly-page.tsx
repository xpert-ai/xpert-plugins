import * as React from 'react'
import {
  Button,
  Check,
  ChevronRight,
  Play,
  Send
} from '@xpert-ai/plugin-shadcn-ui'
import type {
  Candidate,
  HandoffView,
  ProductionView,
  Scene,
  Shot
} from './production-data'
import type { DirectorTranslator } from './director-types'
import {
  playableVideoUrl,
  primeVideoPreview,
  selectedVideoCandidate
} from './director-storyboard-media'
import { StudioPanelLayout } from './studio-panel-layout'

const h: typeof React.createElement = React.createElement

type DirectorAssemblyPageProps = {
  production: ProductionView
  handoff: HandoffView | null
  projectRevision: number
  aspectRatio: string
  busy: boolean
  handingOff: boolean
  rightPanelOpen: boolean
  t: DirectorTranslator
  onHandoff: () => void
  onReturnStoryboard: () => void
}

type AssemblyShot = {
  scene: Scene
  shot: Shot
  sequence: number
  code: string
  selectedVideo: Candidate | null
  videoUrl: string | null
}

export function DirectorAssemblyPage(props: DirectorAssemblyPageProps) {
  const {
    production,
    handoff,
    projectRevision,
    aspectRatio,
    busy,
    handingOff,
    t,
    onHandoff,
    onReturnStoryboard
  } = props
  const shots = React.useMemo(
    () => buildAssemblyShots(production),
    [production]
  )
  const [activeShotId, setActiveShotId] = React.useState(
    shots[0]?.shot.id ?? ''
  )
  const active =
    shots.find((item) => item.shot.id === activeShotId) ?? shots[0] ?? null
  const selected = shots.filter((item) => item.selectedVideo).length
  const total = shots.length
  const ready = total > 0 && selected === total
  const canSend = ready || handoff?.status === 'ready'
  const missing = Math.max(0, total - selected)
  const progress = total ? Math.round((selected / total) * 100) : 0

  React.useEffect(() => {
    if (!shots.some((item) => item.shot.id === activeShotId)) {
      setActiveShotId(shots[0]?.shot.id ?? '')
    }
  }, [activeShotId, shots])

  return (
    <StudioPanelLayout storageKey="assembly" leftLabel={t('director.assembly.overview')} rightLabel={t('director.assembly.progress')} rightPanelOpen={props.rightPanelOpen} className="bg-studio-canvas text-studio-ink" testId="director-assembly-page">
      <aside className="row-start-1 flex min-h-0 flex-col border-r border-studio-line bg-studio-paper/80">
        <header className="border-b border-studio-line p-4">
          <p className="text-[10px] font-bold text-studio-muted">
            {t('director.assembly.overview')}
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <strong className="font-display text-xl">
              {t('director.assembly.shotCount', { count: total })}
            </strong>
            <span className="text-xs font-semibold text-studio-brass">
              {t('director.assembly.ready', { selected, total })}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-studio-line">
            <div
              className="h-full rounded-full bg-studio-brass transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {production.scenes.map((scene) => {
            const sceneShots = shots.filter((item) => item.scene.id === scene.id)
            const sceneReady = sceneShots.filter((item) => item.selectedVideo).length
            return (
              <section
                key={scene.id}
                className="mb-3 overflow-hidden rounded-lg border border-studio-line bg-studio-paper"
              >
                <header className="flex items-center justify-between bg-studio-canvas px-3 py-2">
                  <strong className="truncate text-xs">{scene.title}</strong>
                  <span className="text-[10px] text-studio-muted">
                    {t('director.assembly.sceneProgress', {
                      selected: sceneReady,
                      total: sceneShots.length
                    })}
                  </span>
                </header>
                <div className="p-1.5">
                  {sceneShots.map((item) => (
                    <button
                      key={item.shot.id}
                      type="button"
                      data-testid={`director-assembly-shot-${item.shot.id}`}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                        active?.shot.id === item.shot.id
                          ? 'bg-studio-brass text-white'
                          : 'hover:bg-studio-canvas'
                      }`}
                      aria-label={t('director.assembly.openShot', {
                        code: item.code,
                        title: item.shot.title
                      })}
                      onClick={() => setActiveShotId(item.shot.id)}
                    >
                      <span className="w-7 shrink-0 text-[10px] opacity-70">
                        {item.code}
                      </span>
                      <strong className="min-w-0 flex-1 truncate text-xs">
                        {item.shot.title}
                      </strong>
                      <span
                        className={`grid size-4 shrink-0 place-items-center rounded-full border ${
                          item.selectedVideo
                            ? active?.shot.id === item.shot.id
                              ? 'border-white bg-white text-studio-brass'
                              : 'border-studio-success bg-studio-success text-white'
                            : active?.shot.id === item.shot.id
                              ? 'border-white/70'
                              : 'border-studio-line'
                        }`}
                        title={
                          item.selectedVideo
                            ? t('director.assembly.clipLocked')
                            : t('director.assembly.clipPending')
                        }
                      >
                        {item.selectedVideo ? <Check className="size-2.5" /> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </aside>

      <section className="row-start-1 min-w-0 overflow-y-auto">
        {active ? (
          <>
            <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-studio-line bg-studio-canvas/95 px-5 backdrop-blur">
              <span className="rounded bg-studio-ink px-2 py-1 text-xs font-bold text-white">
                {active.code}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-2xl font-bold">
                  {active.shot.title}
                </h2>
                <p className="text-xs text-studio-muted">
                  {active.scene.title} ·{' '}
                  {t('director.storyboard.duration', {
                    seconds: active.shot.durationSeconds
                  })}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onReturnStoryboard}>
                {t('director.assembly.returnStoryboard')}
              </Button>
            </header>

            <div className="grid gap-5 p-5">
              <section className="grid grid-cols-[1.3fr_0.7fr] gap-4">
                <AssemblyPreview item={active} t={t} />
                <div className="grid content-start gap-3 rounded-lg border border-studio-line bg-studio-paper p-4 shadow-sm">
                  <ShotCopy title={t('director.storyboard.intent')}>
                    {active.shot.composition}
                  </ShotCopy>
                  <ShotCopy title={t('director.storyboard.actionPerformance')}>
                    {active.shot.action}
                  </ShotCopy>
                  <ShotCopy title={t('director.storyboard.cameraLanguage')}>
                    {active.shot.camera}
                  </ShotCopy>
                  <ShotCopy title={t('director.storyboard.emotionRhythm')}>
                    {active.shot.emotion || '—'}
                  </ShotCopy>
                </div>
              </section>

              <section className="rounded-lg border border-studio-line bg-studio-paper p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg font-bold">
                      {t('director.assembly.sequence')}
                    </h3>
                    <p className="text-xs text-studio-muted">
                      {t('director.assembly.subtitle')}
                    </p>
                  </div>
                  {missing ? (
                    <Button variant="outline" size="sm" onClick={onReturnStoryboard}>
                      {t('director.assembly.completeMissing')}
                    </Button>
                  ) : null}
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {shots.map((item) => (
                    <AssemblyClipCard
                      key={item.shot.id}
                      item={item}
                      active={active.shot.id === item.shot.id}
                      t={t}
                      onOpen={() => setActiveShotId(item.shot.id)}
                    />
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-studio-muted">
            {t('director.assembly.noShots')}
          </div>
        )}
      </section>

      <aside id="director-right-panel" data-studio-panel="right" className="row-start-1 min-h-0 overflow-y-auto border-l border-studio-line bg-studio-paper/90">
        <header className="border-b border-studio-line p-5">
          <p className="text-[10px] font-bold text-studio-muted">
            {t('director.assembly.progress')}
          </p>
          <h3 className="mt-1 font-display text-xl font-bold">
            {canSend
              ? t('director.assembly.readyTitle')
              : t('director.assembly.pendingTitle')}
          </h3>
          <p className="mt-2 text-xs leading-5 text-studio-muted">
            {canSend
              ? t('director.assembly.readyHelp')
              : t('director.assembly.pendingHelp', { count: missing })}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-studio-line">
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${
                  canSend ? 'bg-studio-success' : 'bg-studio-brass'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <strong className="text-sm">{selected}/{total}</strong>
          </div>
        </header>

        <section className="border-b border-studio-line p-5">
          <h3 className="text-xs font-bold">{t('director.assembly.workflow')}</h3>
          <div className="mt-4 grid gap-4">
            <DeliveryStep
              number={1}
              complete
              title={t('director.assembly.workflowStory')}
              help={t('director.assembly.workflowStoryHelp')}
            />
            <DeliveryStep
              number={2}
              complete={ready}
              title={t('director.assembly.workflowReview')}
              help={t('director.assembly.workflowReviewHelp')}
            />
            <DeliveryStep
              number={3}
              complete={isDelivered(handoff)}
              title={t('director.assembly.workflowEdit')}
              help={t('director.assembly.workflowEditHelp')}
            />
          </div>
        </section>

        <section className="border-b border-studio-line p-5">
          <h3 className="text-xs font-bold">{t('director.assembly.details')}</h3>
          <dl className="mt-3 grid grid-cols-[1fr_auto] text-xs">
            <DetailRow
              label={t('director.assembly.contentVersion')}
              value={t('director.assembly.versionValue', {
                number: handoff?.sourceRevision ?? projectRevision
              })}
            />
            <DetailRow
              label={t('director.assembly.deliveryBatch')}
              value={t('director.assembly.batchValue', {
                number: handoff?.handoffRevision ?? 1
              })}
            />
            <DetailRow label={t('director.assembly.canvas')} value={aspectRatio} />
            <DetailRow
              label={t('director.assembly.duration')}
              value={t('director.assembly.durationValue', {
                seconds: handoff?.durationSeconds ?? production.totalDurationSeconds
              })}
            />
            <DetailRow
              label={t('director.assembly.deliveryMode')}
              value={
                handoff?.mode === 'proposal'
                  ? t('director.assembly.modeProposalLabel')
                  : t('director.assembly.modeCreateLabel')
              }
            />
            <DetailRow
              label={t('director.assembly.deliveryStatus')}
              value={deliveryStatus(handoff, ready, t)}
            />
          </dl>
        </section>

        <section className="p-5">
          <p className="rounded-lg border border-studio-line bg-studio-canvas p-3 text-xs leading-5 text-studio-muted">
            {handoff?.mode === 'proposal'
              ? t('director.assembly.modeProposal')
              : t('director.assembly.modeCreate')}
          </p>
          <Button
            className="mt-3 w-full"
            disabled={busy || handingOff || !canSend}
            onClick={onHandoff}
          >
            <Send aria-hidden="true" />
            {handingOff
              ? t('director.assembly.sending')
              : t('director.assembly.send')}
          </Button>
          {!canSend ? (
            <Button
              variant="outline"
              className="mt-2 w-full"
              onClick={onReturnStoryboard}
            >
              {t('director.assembly.completeMissing')}
            </Button>
          ) : null}
        </section>
      </aside>

      <footer className="col-span-3 row-start-2 flex items-center justify-between border-t border-studio-line bg-studio-paper px-5 text-xs text-studio-muted">
        <span>
          {active
            ? `${active.scene.title} · ${active.shot.title}`
            : t('director.assembly.noShots')}
        </span>
        <span>
          {active?.selectedVideo
            ? t('director.assembly.footerLocked')
            : t('director.assembly.footerPending')}
        </span>
      </footer>
    </StudioPanelLayout>
  )
}

function AssemblyPreview(props: {
  item: AssemblyShot
  t: DirectorTranslator
}) {
  const { item, t } = props
  return (
    <figure className="relative grid min-h-[340px] place-items-center overflow-hidden rounded-lg border border-studio-line bg-black shadow-lg">
      {item.videoUrl ? (
        <video
          key={item.selectedVideo?.id}
          data-testid="director-assembly-main-video"
          className="aspect-video h-full max-h-[430px] w-full object-contain"
          src={item.videoUrl}
          controls
          crossOrigin="use-credentials"
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => primeVideoPreview(event.currentTarget)}
          onLoadedData={(event) => primeVideoPreview(event.currentTarget)}
        />
      ) : (
        <div className="grid max-w-sm place-items-center gap-3 p-8 text-center text-white">
          <span className="grid size-14 place-items-center rounded-full border border-white/25 bg-white/10">
            <Play className="size-6 opacity-70" aria-hidden="true" />
          </span>
          <strong className="text-sm">
            {item.selectedVideo
              ? t('director.assembly.previewUnavailableTitle')
              : t('director.assembly.previewPendingTitle')}
          </strong>
          <p className="m-0 text-xs leading-5 text-white/65">
            {item.selectedVideo
              ? t('director.assembly.previewUnavailableHelp')
              : t('director.assembly.previewPendingHelp')}
          </p>
        </div>
      )}
    </figure>
  )
}

function AssemblyClipCard(props: {
  item: AssemblyShot
  active: boolean
  t: DirectorTranslator
  onOpen: () => void
}) {
  const { item, active, t, onOpen } = props
  return (
    <article
      className={`overflow-hidden rounded-lg border bg-studio-canvas ${
        active
          ? 'border-2 border-studio-brass'
          : item.selectedVideo
            ? 'border-studio-line'
            : 'border-dashed border-studio-line'
      }`}
    >
      <button
        type="button"
        className="block w-full text-left"
        aria-label={t('director.assembly.openShot', {
          code: item.code,
          title: item.shot.title
        })}
        onClick={onOpen}
      >
        <figure className="relative m-0 aspect-video overflow-hidden bg-studio-ink text-white">
          {item.videoUrl ? (
            <video
              key={item.selectedVideo?.id}
              data-testid={`director-assembly-clip-video-${item.shot.id}`}
              className="pointer-events-none h-full w-full bg-studio-ink object-contain"
              src={item.videoUrl}
              crossOrigin="use-credentials"
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => primeVideoPreview(event.currentTarget)}
              onLoadedData={(event) => primeVideoPreview(event.currentTarget)}
            />
          ) : (
            <span className="grid h-full place-items-center text-center text-[10px] text-white/60">
              <span className="grid gap-2 place-items-center">
                <Play className="size-5 opacity-60" aria-hidden="true" />
                {item.selectedVideo
                  ? t('director.assembly.previewUnavailableShort')
                  : t('director.assembly.clipPending')}
              </span>
            </span>
          )}
          {item.selectedVideo ? (
            <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-studio-success text-white shadow-sm">
              <Check className="size-3.5" aria-hidden="true" />
            </span>
          ) : null}
          <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity hover:opacity-100 focus:opacity-100">
            <span className="grid size-9 place-items-center rounded-full bg-black/55">
              <Play className="size-4" aria-hidden="true" />
            </span>
          </span>
        </figure>
        <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2">
          <span className="text-[10px] text-studio-muted">{item.code}</span>
          <strong className="truncate text-xs">{item.shot.title}</strong>
          <small className="text-[10px] text-studio-muted">
            {t('director.assembly.durationValue', {
              seconds: item.shot.durationSeconds
            })}
          </small>
        </span>
      </button>
    </article>
  )
}

function ShotCopy(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-studio-line pb-3 last:border-0">
      <h3 className="text-[10px] font-bold text-studio-muted">{props.title}</h3>
      <p className="mt-1 text-sm leading-6">{props.children}</p>
    </section>
  )
}

function DeliveryStep(props: {
  number: number
  complete: boolean
  title: string
  help: string
}) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)_14px] items-start gap-3">
      <span
        className={`grid size-7 place-items-center rounded-full text-xs font-bold ${
          props.complete
            ? 'bg-studio-success text-white'
            : 'border border-studio-line bg-studio-canvas text-studio-muted'
        }`}
      >
        {props.complete ? <Check className="size-3.5" /> : props.number}
      </span>
      <span className="grid gap-1">
        <strong className="text-xs">{props.title}</strong>
        <small className="text-[10px] leading-4 text-studio-muted">
          {props.help}
        </small>
      </span>
      <ChevronRight className="mt-1 size-3.5 text-studio-muted" aria-hidden="true" />
    </div>
  )
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <>
      <dt className="border-b border-studio-line py-2.5 text-studio-muted">
        {props.label}
      </dt>
      <dd className="m-0 border-b border-studio-line py-2.5 text-right font-semibold">
        {props.value}
      </dd>
    </>
  )
}

function buildAssemblyShots(production: ProductionView): AssemblyShot[] {
  let sequence = 0
  return production.scenes.flatMap((scene) =>
    scene.shots.map((shot) => {
      sequence += 1
      const selectedVideo = selectedVideoCandidate(shot.candidates)
      return {
        scene,
        shot,
        sequence,
        code: `S${String(sequence).padStart(2, '0')}`,
        selectedVideo,
        videoUrl: playableVideoUrl(selectedVideo)
      }
    })
  )
}

function isDelivered(handoff: HandoffView | null) {
  return (
    handoff?.status === 'delivered' || handoff?.status === 'proposal_ready'
  )
}

function deliveryStatus(
  handoff: HandoffView | null,
  ready: boolean,
  t: DirectorTranslator
) {
  if (!handoff) {
    return ready
      ? t('director.assembly.statusReady')
      : t('director.assembly.statusNone')
  }
  if (handoff.status === 'ready') return t('director.assembly.statusReady')
  if (handoff.status === 'delivered') {
    return t('director.assembly.statusDelivered')
  }
  if (handoff.status === 'proposal_ready') {
    return t('director.assembly.statusReview')
  }
  return t('director.assembly.statusFailed')
}
