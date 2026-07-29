import * as React from 'react'
import {
  Badge,
  Button,
  Input,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen
} from '@xpert-ai/plugin-shadcn-ui'
import type { MessageKey } from './i18n'
import { MediaPreview } from './media-preview'
import type {
  Candidate,
  ProductionView,
  Scene,
  Shot
} from './production-data'

const h: typeof React.createElement = React.createElement

type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

type ShotRow = {
  scene: Scene
  shot: Shot
  index: number
}

type GenerationStatus =
  | 'ready'
  | 'running'
  | 'queued'
  | 'failed'
  | 'missing'

export function MediaGenerationConsole(props: {
  production: ProductionView
  projectRevision: number
  aspectRatio: string
  busy: boolean
  generating: boolean
  onGenerate: () => void
  onQueryGeneration: () => void
  onRunInstruction: (instruction: string) => void
  onSelectCandidate: (
    sceneId: string,
    shotId: string,
    candidateId: string
  ) => void
  onReturnToStoryboard: () => void
  t: Translator
}) {
  const {
    production,
    projectRevision,
    aspectRatio,
    busy,
    generating,
    onGenerate,
    onQueryGeneration,
    onRunInstruction,
    onSelectCandidate,
    onReturnToStoryboard,
    t
  } = props
  const rows = React.useMemo(
    () =>
      production.scenes.flatMap((scene) =>
        scene.shots.map((shot, index) => ({
          scene,
          shot,
          index
        }))
      ),
    [production]
  )
  const [selectedShotId, setSelectedShotId] = React.useState(
    rows[0]?.shot.id ?? ''
  )
  const [instruction, setInstruction] = React.useState('')
  const [railCollapsed, setRailCollapsed] = React.useState(false)
  const [settingsCollapsed, setSettingsCollapsed] = React.useState(false)

  React.useEffect(() => {
    if (!rows.some(({ shot }) => shot.id === selectedShotId)) {
      setSelectedShotId(rows[0]?.shot.id ?? '')
    }
  }, [rows, selectedShotId])

  const selectedRow =
    rows.find(({ shot }) => shot.id === selectedShotId) ?? rows[0] ?? null
  const videos =
    selectedRow?.shot.candidates.filter(
      (candidate) => candidate.kind === 'video'
    ) ?? []
  const selectedVideo =
    videos.find((candidate) => candidate.selected) ?? videos[0] ?? null
  const storyboardImage =
    selectedRow?.shot.candidates.find(
      (candidate) => candidate.kind === 'image' && candidate.selected
    ) ??
    selectedRow?.shot.candidates.find(
      (candidate) => candidate.kind === 'image'
    ) ??
    null
  const previewCandidate =
    selectedVideo ??
    storyboardImage ??
    null
  const readyCount = rows.filter(
    ({ shot }) => generationStatus(shot) === 'ready'
  ).length
  const pendingCount = rows.length - readyCount
  const model =
    selectedVideo?.providerReceipt?.model ??
    'doubao-seedance-2-0-fast-260128'

  if (!selectedRow) {
    return (
      <div className="ss-stage-empty">
        <span>SS</span>
        <strong>{t('generation.noShots')}</strong>
        <p>{t('generation.noShotsHelp')}</p>
        <Button size="sm" variant="outline" onClick={onReturnToStoryboard}>
          {t('generation.returnStoryboard')}
        </Button>
      </div>
    )
  }

  const runInstruction = () => {
    const value = instruction.trim()
    if (!value) return
    onRunInstruction(value)
    setInstruction('')
  }

  return (
    <div
      className={[
        'ss-generation-director',
        railCollapsed ? 'is-rail-collapsed' : '',
        settingsCollapsed ? 'is-settings-collapsed' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <section className="ss-generation-command">
        <div>
          <span>{t('generation.agentDirector')}</span>
          <strong>{t('generation.agentDirectorHelp')}</strong>
        </div>
        <Input
          value={instruction}
          disabled={busy || generating}
          placeholder={t('generation.agentPlaceholder')}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') runInstruction()
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || generating}
          onClick={() => setInstruction(t('generation.strategySuggestion'))}
        >
          {t('generation.optimizeStrategy')}
        </Button>
        <Button
          size="sm"
          disabled={busy || generating || !instruction.trim()}
          onClick={runInstruction}
        >
          {t('generation.sendInstruction')}
        </Button>
      </section>

      <section className="ss-generation-lifecycle" aria-label={t('generation.lifecycle')}>
        <span className="is-complete">{t('generation.lifecycleStoryboard')}</span>
        <i aria-hidden="true" />
        <span className={pendingCount ? 'is-active' : 'is-complete'}>
          {t('generation.lifecycleJobs')}
        </span>
        <i aria-hidden="true" />
        <span className={readyCount === rows.length ? 'is-complete' : ''}>
          {t('generation.lifecycleSelection')}
        </span>
      </section>

      <div className="ss-generation-body">
        <aside className="ss-shot-rail">
          <header>
            <div>
              <span>{t('generation.shotQueue')}</span>
              <strong>
                {t('generation.readySummary', {
                  ready: readyCount,
                  total: rows.length
                })}
              </strong>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={t(
                railCollapsed
                  ? 'generation.expandShotRail'
                  : 'generation.collapseShotRail'
              )}
              onClick={() => setRailCollapsed((value) => !value)}
            >
              {railCollapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </Button>
          </header>
          {railCollapsed ? null : (
            <div className="ss-shot-list">
              {rows.map((row, order) => (
                <ShotQueueItem
                  key={row.shot.id}
                  row={row}
                  order={order}
                  active={row.shot.id === selectedRow.shot.id}
                  onSelect={() => setSelectedShotId(row.shot.id)}
                  t={t}
                />
              ))}
            </div>
          )}
        </aside>

        <main className="ss-generation-preview">
          <header>
            <div>
              <small>
                {String(
                  rows.findIndex(
                    ({ shot }) => shot.id === selectedRow.shot.id
                  ) + 1
                ).padStart(2, '0')}{' '}
                · {selectedRow.scene.title}
              </small>
              <strong>{selectedRow.shot.title}</strong>
            </div>
            <Badge className={statusClass(selectedRow.shot)}>
              {t(statusKey(generationStatus(selectedRow.shot)))}
            </Badge>
          </header>
          <div className="ss-generation-player">
            <MediaPreview
              candidate={previewCandidate}
              controls
              posterUrl={storyboardImage?.fileUrl}
            />
            <div className="ss-generation-player-overlay">
              <span>{aspectRatio}</span>
              <span>{selectedRow.shot.durationSeconds}s</span>
              <span>{model}</span>
            </div>
          </div>
          <ShotSpecCard
            row={selectedRow}
            projectRevision={projectRevision}
            onReturnToStoryboard={onReturnToStoryboard}
            t={t}
          />
          <CandidateStrip
            scene={selectedRow.scene}
            shot={selectedRow.shot}
            posterUrl={storyboardImage?.fileUrl}
            onSelectCandidate={onSelectCandidate}
            t={t}
          />
        </main>

        <aside className="ss-generation-settings">
          <header>
            <div>
              <span>{t('generation.settings')}</span>
              <strong>{t('generation.settingsHelp')}</strong>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={t(
                settingsCollapsed
                  ? 'generation.expandSettings'
                  : 'generation.collapseSettings'
              )}
              onClick={() => setSettingsCollapsed((value) => !value)}
            >
              {settingsCollapsed ? (
                <PanelRightOpen aria-hidden="true" />
              ) : (
                <PanelRightClose aria-hidden="true" />
              )}
            </Button>
          </header>
          {settingsCollapsed ? null : (
            <>
              <div className="ss-generation-setting-list">
                <ReadOnlySetting label={t('generation.model')} value={model} />
                <ReadOnlySetting
                  label={t('generation.resolution')}
                  value={`720p · ${aspectRatio}`}
                />
                <ReadOnlySetting
                  label={t('generation.candidateCount')}
                  value={t('generation.onePerShot')}
                />
                <ReadOnlySetting
                  label={t('generation.audioMode')}
                  value={t('generation.audioSynchronized')}
                />
              </div>
              <section className="ss-generation-cost">
                <span>{t('generation.estimatedCost')}</span>
                <strong>—</strong>
                <p>{t('generation.costUnavailable')}</p>
              </section>
              <div className="ss-generation-primary-actions">
                <Button
                  size="sm"
                  disabled={busy || generating || pendingCount === 0}
                  onClick={onGenerate}
                >
                  {generating
                    ? t('generation.sending')
                    : t('generation.generatePending', {
                        count: pendingCount
                      })}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || generating}
                  onClick={onQueryGeneration}
                >
                  {t('generation.queryTasks')}
                </Button>
              </div>
              <GenerationHistory rows={rows} t={t} />
            </>
          )}
        </aside>
      </div>

      <footer className="ss-generation-batch">
        <div>
          <span>{t('generation.batchPlan')}</span>
          <strong>
            {t('generation.batchSummary', {
              total: rows.length,
              pending: pendingCount
            })}
          </strong>
        </div>
        <div className="ss-generation-batch-track">
          {rows.map(({ shot }) => (
            <span
              className={statusClass(shot)}
              key={shot.id}
              style={{ flexGrow: Math.max(1, shot.durationSeconds) }}
            >
              {shot.title}
            </span>
          ))}
        </div>
      </footer>
    </div>
  )
}

function ShotQueueItem(props: {
  row: ShotRow
  order: number
  active: boolean
  onSelect: () => void
  t: Translator
}) {
  const { row, order, active, onSelect, t } = props
  const candidate =
    row.shot.candidates.find(
      (item) => item.kind === 'video' && item.selected
    ) ??
    row.shot.candidates.find((item) => item.kind === 'image') ??
    null
  const posterUrl =
    row.shot.candidates.find((item) => item.kind === 'image')
      ?.fileUrl ?? null
  const status = generationStatus(row.shot)
  return (
    <button
      type="button"
      className={active ? 'is-active' : ''}
      onClick={onSelect}
    >
      <div className="ss-shot-thumbnail">
        <MediaPreview candidate={candidate} posterUrl={posterUrl} />
        <span>{String(order + 1).padStart(2, '0')}</span>
      </div>
      <div>
        <strong>{row.shot.title}</strong>
        <small>{row.scene.title}</small>
        <em className={statusClass(row.shot)}>{t(statusKey(status))}</em>
      </div>
    </button>
  )
}

function ShotSpecCard(props: {
  row: ShotRow
  projectRevision: number
  onReturnToStoryboard: () => void
  t: Translator
}) {
  const { row, projectRevision, onReturnToStoryboard, t } = props
  return (
    <section className="ss-shot-spec">
      <header>
        <div>
          <span>{t('generation.lockedShotSpec')}</span>
          <strong>
            {t('generation.shotSpecRevision', {
              revision: projectRevision
            })}
          </strong>
        </div>
        <Badge variant="outline">{t('generation.readOnly')}</Badge>
      </header>
      <dl>
        <div>
          <dt>{t('storyboard.camera')}</dt>
          <dd>{row.shot.camera}</dd>
        </div>
        <div>
          <dt>{t('generation.composition')}</dt>
          <dd>{row.shot.composition}</dd>
        </div>
        <div>
          <dt>{t('generation.action')}</dt>
          <dd>{row.shot.action}</dd>
        </div>
        <div>
          <dt>{t('storyboard.dialogue')}</dt>
          <dd>{row.shot.dialogue ?? t('workflow.notSet')}</dd>
        </div>
      </dl>
      <Button size="sm" variant="outline" onClick={onReturnToStoryboard}>
        {t('generation.returnStoryboard')}
      </Button>
    </section>
  )
}

function CandidateStrip(props: {
  scene: Scene
  shot: Shot
  posterUrl: string | null | undefined
  onSelectCandidate: (
    sceneId: string,
    shotId: string,
    candidateId: string
  ) => void
  t: Translator
}) {
  const { scene, shot, posterUrl, onSelectCandidate, t } = props
  const videos = shot.candidates.filter(
    (candidate) => candidate.kind === 'video'
  )
  return (
    <section className="ss-candidate-review">
      <header>
        <div>
          <span>{t('generation.candidateReview')}</span>
          <strong>
            {t('generation.candidateReviewHelp', {
              count: videos.length
            })}
          </strong>
        </div>
      </header>
      {videos.length ? (
        <div className="ss-candidate-strip">
          {videos.map((candidate, index) => (
            <button
              type="button"
              className={candidate.selected ? 'is-selected' : ''}
              key={candidate.id}
              disabled={candidate.selected}
              onClick={() =>
                onSelectCandidate(scene.id, shot.id, candidate.id)
              }
            >
              <div>
                <MediaPreview
                  candidate={candidate}
                  posterUrl={posterUrl}
                />
                <span>{String.fromCharCode(65 + index)}</span>
              </div>
              <strong>{candidate.label}</strong>
              <small>
                {candidate.selected
                  ? t('generation.selected')
                  : t('generation.selectCandidate')}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <div className="ss-candidate-empty">
          <strong>{t('generation.noCandidates')}</strong>
          <p>{t('generation.noCandidatesHelp')}</p>
        </div>
      )}
    </section>
  )
}

function ReadOnlySetting(props: { label: string; value: string }) {
  return (
    <div>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function GenerationHistory(props: {
  rows: ShotRow[]
  t: Translator
}) {
  const receipts = props.rows.flatMap(({ shot }) =>
    shot.candidates
      .filter(
        (
          candidate
        ): candidate is Candidate & {
          providerReceipt: NonNullable<Candidate['providerReceipt']>
        } => Boolean(candidate.providerReceipt)
      )
      .map((candidate) => ({
        candidate,
        shot
      }))
  )
  return (
    <section className="ss-generation-history">
      <header>
        <span>{props.t('generation.history')}</span>
        <Badge variant="outline">{receipts.length}</Badge>
      </header>
      {receipts.length ? (
        receipts.slice(0, 5).map(({ candidate, shot }) => (
          <div key={`${shot.id}:${candidate.id}`}>
            <strong>{shot.title}</strong>
            <small>
              {candidate.providerReceipt.status} ·{' '}
              {candidate.providerReceipt.taskId.slice(0, 8)}
            </small>
          </div>
        ))
      ) : (
        <p>{props.t('generation.noHistory')}</p>
      )}
    </section>
  )
}

function generationStatus(shot: Shot): GenerationStatus {
  if (
    shot.candidates.some(
      (candidate) =>
        candidate.kind === 'video' &&
        candidate.selected &&
        Boolean(candidate.workspacePath)
    )
  ) {
    return 'ready'
  }
  const statuses = shot.candidates
    .filter((candidate) => candidate.kind === 'video')
    .map((candidate) =>
      candidate.providerReceipt?.status.toLowerCase()
    )
    .filter((status): status is string => Boolean(status))
  if (
    statuses.some((status) =>
      ['processing', 'running', 'generating'].includes(status)
    )
  ) {
    return 'running'
  }
  if (
    statuses.some((status) =>
      ['queued', 'pending', 'submitted'].includes(status)
    )
  ) {
    return 'queued'
  }
  if (
    statuses.some((status) =>
      ['failed', 'error', 'cancelled'].includes(status)
    )
  ) {
    return 'failed'
  }
  return 'missing'
}

function statusClass(shot: Shot) {
  return `is-${generationStatus(shot)}`
}

function statusKey(status: GenerationStatus): MessageKey {
  return `generation.status.${status}`
}
