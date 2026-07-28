import * as React from 'react'
import {
  Badge,
  Button,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Send
} from '@xpert-ai/plugin-shadcn-ui'
import type { MessageKey } from './i18n'
import type {
  ProjectEditDraft,
  StoryEditorSession
} from './editor-state'
import { StageEditor } from './stage-editor'
import {
  SelectedVideoPreview,
  type SelectedVideoClip
} from './selected-video-preview'
import {
  type Asset,
  type Candidate,
  type HandoffView,
  type ProductionView,
  type Scene,
  type Shot
} from './production-data'

export {
  parseHandoffView,
  parseProductionView,
  productionActionDocument
} from './production-data'
export type {
  Candidate,
  HandoffView,
  ProductionView,
  Scene,
  Shot
} from './production-data'

const h: typeof React.createElement = React.createElement

type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

const STAGE_KEYS: Record<number, MessageKey> = {
  1: 'stages.projects',
  2: 'stages.sources',
  3: 'stages.story',
  4: 'stages.episodes',
  5: 'stages.assets',
  6: 'stages.storyboard',
  7: 'stages.generation',
  8: 'stages.handoff'
}

const STAGE_HELP_KEYS: Record<number, MessageKey> = {
  1: 'workflow.help.projects',
  2: 'workflow.help.sources',
  3: 'workflow.help.story',
  4: 'workflow.help.episodes',
  5: 'workflow.help.assets',
  6: 'workflow.help.storyboard',
  7: 'workflow.help.generation',
  8: 'workflow.help.handoff'
}

const STAGE_INPUT_KEYS: Record<number, MessageKey> = {
  1: 'workflow.input.projects',
  2: 'workflow.input.sources',
  3: 'workflow.input.story',
  4: 'workflow.input.episodes',
  5: 'workflow.input.assets',
  6: 'workflow.input.storyboard',
  7: 'workflow.input.generation',
  8: 'workflow.input.handoff'
}

const STAGE_OUTPUT_KEYS: Record<number, MessageKey> = {
  1: 'workflow.output.projects',
  2: 'workflow.output.sources',
  3: 'workflow.output.story',
  4: 'workflow.output.episodes',
  5: 'workflow.output.assets',
  6: 'workflow.output.storyboard',
  7: 'workflow.output.generation',
  8: 'workflow.output.handoff'
}

const ASSET_KIND_KEYS: Record<Asset['kind'], MessageKey> = {
  character: 'asset.kind.character',
  location: 'asset.kind.location',
  prop: 'asset.kind.prop',
  style: 'asset.kind.style'
}

export function ProductionPanel(props: {
  production: ProductionView | null
  handoff: HandoffView | null
  activeStage: number
  busy: boolean
  generating: boolean
  handingOff: boolean
  inspectorCollapsed: boolean
  editor: StoryEditorSession | null
  onEdit: () => void
  onSaveEdit: (rebase?: boolean) => void
  onDiscardEdit: () => void
  onProjectDraftChange: (draft: ProjectEditDraft) => void
  onProductionDraftChange: (draft: ProductionView) => void
  onUseAgentVersion: () => void
  onGenerate: () => void
  onQueryGeneration: () => void
  onHandoff: () => void
  onInspectorCollapsedChange: (collapsed: boolean) => void
  t: Translator
}) {
  const {
    production,
    handoff,
    activeStage,
    busy,
    generating,
    handingOff,
    inspectorCollapsed,
    editor,
    onEdit,
    onSaveEdit,
    onDiscardEdit,
    onProjectDraftChange,
    onProductionDraftChange,
    onUseAgentVersion,
    onGenerate,
    onQueryGeneration,
    onHandoff,
    onInspectorCollapsedChange,
    t
  } = props
  const ready = stageContentReady(activeStage, production, handoff)

  return (
    <section className={`ss-stage-workspace ${inspectorCollapsed ? 'is-inspector-collapsed' : ''}`}>
      <div
        className={`ss-stage-canvas ${
          editor?.pendingRemote ? 'has-editor-conflict' : ''
        }`}
      >
        <header className="ss-canvas-header">
          <div className="ss-canvas-heading">
            <span>{String(activeStage).padStart(2, '0')}</span>
            <div>
              <h3>{t(STAGE_KEYS[activeStage] ?? 'production.title')}</h3>
              <p>{t(STAGE_HELP_KEYS[activeStage] ?? 'production.emptyHelp')}</p>
            </div>
          </div>
          <div className="ss-canvas-actions">
            {editor ? (
              <>
                <Badge variant="outline">
                  {t(editor.dirty ? 'editor.unsaved' : 'actions.edit')}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={editor.saving}
                  onClick={onDiscardEdit}
                >
                  {t('actions.discard')}
                </Button>
                <Button
                  size="sm"
                  disabled={
                    editor.saving ||
                    !editor.dirty ||
                    (activeStage > 1 && !editor.productionDraft)
                  }
                  onClick={() => onSaveEdit(false)}
                >
                  {t(editor.saving ? 'editor.saving' : 'actions.save')}
                </Button>
              </>
            ) : (
              <>
                <Badge className={ready ? 'ss-ready-badge' : 'ss-pending-badge'}>
                  {t(ready ? 'workflow.stageReady' : 'workflow.stagePending')}
                </Badge>
                {activeStage <= 7 ? (
                  <Button size="sm" variant="outline" onClick={onEdit}>
                    {t('actions.edit')}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </header>

        {editor?.pendingRemote ? (
          <div className="ss-editor-conflict" role="alert">
            <div>
              <strong>{t('editor.agentPending')}</strong>
              <p>{t('editor.agentPendingHelp')}</p>
            </div>
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={editor.saving}
                onClick={onUseAgentVersion}
              >
                {t('editor.useAgent')}
              </Button>
              <Button
                size="sm"
                disabled={editor.saving || !editor.dirty}
                onClick={() => onSaveEdit(true)}
              >
                {t('editor.keepMine')}
              </Button>
            </div>
          </div>
        ) : null}

        <div className={`ss-stage-content is-stage-${activeStage}`}>
          {editor ? (
            <StageEditor
              stage={activeStage}
              project={editor.projectDraft}
              production={editor.productionDraft}
              onProjectChange={onProjectDraftChange}
              onProductionChange={onProductionDraftChange}
              t={t}
            />
          ) : !production ? (
            <EmptyStage t={t} />
          ) : (
            <StageContent
              production={production}
              handoff={handoff}
              activeStage={activeStage}
              busy={busy}
              generating={generating}
              handingOff={handingOff}
              onGenerate={onGenerate}
              onQueryGeneration={onQueryGeneration}
              onHandoff={onHandoff}
              t={t}
            />
          )}
        </div>
      </div>

      {inspectorCollapsed ? (
        <aside className="ss-inspector is-collapsed">
          <div className="ss-panel-rail">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('actions.expandInspector')}
              title={t('actions.expandInspector')}
              onClick={() => onInspectorCollapsedChange(false)}
            >
              <PanelRightOpen aria-hidden="true" />
            </Button>
          </div>
        </aside>
      ) : (
        <StageInspector
          activeStage={activeStage}
          production={production}
          handoff={handoff}
          ready={ready}
          onCollapse={() => onInspectorCollapsedChange(true)}
          t={t}
        />
      )}
    </section>
  )
}

function StageContent(props: {
  production: ProductionView
  handoff: HandoffView | null
  activeStage: number
  busy: boolean
  generating: boolean
  handingOff: boolean
  onGenerate: () => void
  onQueryGeneration: () => void
  onHandoff: () => void
  t: Translator
}) {
  switch (props.activeStage) {
    case 1:
      return <ProjectProductionOverview production={props.production} t={props.t} />
    case 2:
      return <SourcesStage production={props.production} t={props.t} />
    case 3:
      return <StoryPlanStage production={props.production} t={props.t} />
    case 4:
      return <EpisodesStage production={props.production} t={props.t} />
    case 5:
      return <AssetsStage production={props.production} t={props.t} />
    case 6:
      return <StoryboardStage production={props.production} t={props.t} />
    case 7:
      return (
        <GenerationStage
          production={props.production}
          busy={props.busy}
          generating={props.generating}
          onGenerate={props.onGenerate}
          onQueryGeneration={props.onQueryGeneration}
          t={props.t}
        />
      )
    case 8:
      return (
        <HandoffStage
          production={props.production}
          handoff={props.handoff}
          busy={props.busy}
          handingOff={props.handingOff}
          onHandoff={props.onHandoff}
          t={props.t}
        />
      )
    default:
      return null
  }
}

function StageInspector(props: {
  activeStage: number
  production: ProductionView | null
  handoff: HandoffView | null
  ready: boolean
  onCollapse: () => void
  t: Translator
}) {
  const { activeStage, production, handoff, ready, onCollapse, t } = props
  const selectedVideos = countSelectedShotVideos(production)
  return (
    <aside className="ss-inspector">
      <header>
        <div>
          <span>{t('workflow.inspector')}</span>
          <h3>{t(STAGE_KEYS[activeStage] ?? 'production.title')}</h3>
        </div>
        <div className="ss-inspector-controls">
          <i className={ready ? 'is-ready' : ''} />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('actions.collapseInspector')}
            title={t('actions.collapseInspector')}
            onClick={onCollapse}
          >
            <PanelRightClose aria-hidden="true" />
          </Button>
        </div>
      </header>
      <section>
        <span>{t('workflow.reviewGate')}</span>
        <strong>{t(ready ? 'workflow.stageReady' : 'workflow.stagePending')}</strong>
        <p>{t(STAGE_HELP_KEYS[activeStage] ?? 'production.emptyHelp')}</p>
      </section>
      <section>
        <span>{t('workflow.input')}</span>
        <p>{t(STAGE_INPUT_KEYS[activeStage] ?? 'production.emptyHelp')}</p>
      </section>
      <section>
        <span>{t('workflow.output')}</span>
        <p>{t(STAGE_OUTPUT_KEYS[activeStage] ?? 'production.emptyHelp')}</p>
      </section>
      {production ? (
        <section className="ss-inspector-stats">
          <Metric label={t('production.scenes')} value={production.counts.scenes} />
          <Metric label={t('production.shots')} value={production.counts.shots} />
          <Metric
            label={t('production.candidates')}
            value={`${selectedVideos}/${production.counts.shots}`}
          />
          <Metric
            label={t('production.duration')}
            value={`${production.totalDurationSeconds}s`}
          />
        </section>
      ) : null}
      {activeStage === 8 && handoff ? (
        <section className="ss-inspector-contract">
          <span>{t('handoff.contract')}</span>
          <code>{handoff.id.slice(0, 8)}</code>
          <p>{handoff.width}×{handoff.height} · {handoff.fps}fps</p>
        </section>
      ) : null}
    </aside>
  )
}

function ProjectProductionOverview(props: {
  production: ProductionView
  t: Translator
}) {
  const { production, t } = props
  return (
    <div className="ss-overview-stage">
      <article className="ss-creative-brief">
        <span>{t('production.title')}</span>
        <h3>{production.visualStyle}</h3>
        <p>{production.adaptationGoal}</p>
        <div>
          <Metric label={t('production.characters')} value={production.counts.characters} />
          <Metric label={t('production.scenes')} value={production.counts.scenes} />
          <Metric label={t('production.shots')} value={production.counts.shots} />
          <Metric label={t('production.duration')} value={`${production.totalDurationSeconds}s`} />
        </div>
      </article>
      <article className="ss-synopsis-card">
        <span>{t('workflow.sourceSynopsis')}</span>
        <p>{production.sourceSynopsis}</p>
      </article>
    </div>
  )
}

function SourcesStage(props: { production: ProductionView; t: Translator }) {
  const { production, t } = props
  if (!production.sourceMaterials.length) return <EmptyStage t={t} />
  return (
    <div className="ss-source-list">
      {production.sourceMaterials.map((source, index) => (
        <article className="ss-source-card" key={source.id}>
          <header>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <Badge variant="outline">{t(`source.type.${source.type}`)}</Badge>
              <Badge variant="outline">{t(`source.status.${source.status}`)}</Badge>
            </div>
          </header>
          <h4>{source.title}</h4>
          <p>{source.excerpt}</p>
        </article>
      ))}
    </div>
  )
}

function StoryPlanStage(props: { production: ProductionView; t: Translator }) {
  const { production, t } = props
  const plan = production.storyPlan
  if (!plan) return <EmptyStage t={t} />
  return (
    <div className="ss-story-plan-stage">
      <div className="ss-plan-summary">
        <div><span>{t('story.logline')}</span><p>{plan.logline}</p></div>
        <div><span>{t('story.theme')}</span><p>{plan.theme}</p></div>
        <div><span>{t('story.tone')}</span><p>{plan.tone}</p></div>
      </div>
      <div className="ss-beat-list">
        {plan.beats.map((beat, index) => (
          <article key={beat.id}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h4>{beat.title}</h4>
              <p>{beat.summary}</p>
              <small>{beat.purpose}</small>
            </div>
            {index < plan.beats.length - 1 ? <ChevronRight aria-hidden="true" /> : null}
          </article>
        ))}
      </div>
    </div>
  )
}

function EpisodesStage(props: { production: ProductionView; t: Translator }) {
  const { production, t } = props
  if (!production.episodes.length) return <EmptyStage t={t} />
  return (
    <div className="ss-episode-list">
      {production.episodes.map((episode) => (
        <article key={episode.id}>
          <header>
            <span>EP {String(episode.order).padStart(2, '0')}</span>
            <Badge variant="outline">
              {episode.targetDurationSeconds ? `${episode.targetDurationSeconds}s` : t('workflow.notSet')}
            </Badge>
          </header>
          <h4>{episode.title}</h4>
          <p>{episode.summary}</p>
          <pre>{episode.script}</pre>
        </article>
      ))}
    </div>
  )
}

function AssetsStage(props: { production: ProductionView; t: Translator }) {
  const { production, t } = props
  if (!production.assets.length) return <EmptyStage t={t} />
  return (
    <div className="ss-asset-grid">
      {production.assets.map((asset) => {
        const voiceReference = production.characters.find(
          (character) => character.name === asset.name
        )?.voiceReference
        return (
          <article key={asset.id}>
            <MediaPreview candidate={firstVisualCandidate(asset.candidates)} />
            <div className="ss-asset-copy">
              <Badge variant="outline">{t(ASSET_KIND_KEYS[asset.kind])}</Badge>
              <h4>{asset.name}</h4>
              <p>{asset.description}</p>
              {voiceReference ? (
                <a
                  href={voiceReference.sourceUrl ?? voiceReference.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('asset.voiceReference')}
                </a>
              ) : null}
              <small>{asset.prompt}</small>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function StoryboardStage(props: { production: ProductionView; t: Translator }) {
  const { production, t } = props
  const shots = flattenShots(production)
  return (
    <div className="ss-storyboard-stage">
      <div className="ss-shot-grid">
        {production.scenes.flatMap((scene, sceneIndex) =>
          scene.shots.map((shot, shotIndex) => (
            <article className="ss-shot-card" key={shot.id}>
              <div className="ss-shot-preview">
                <MediaPreview candidate={firstVisualCandidate(shot.candidates)} />
                <span>{String(shotIndex + 1).padStart(2, '0')}</span>
                <Badge>{shot.durationSeconds}s</Badge>
              </div>
              <div>
                <small>{String(sceneIndex + 1).padStart(2, '0')} · {scene.title}</small>
                <h4>{shot.title}</h4>
                <p>{shot.action}</p>
                <dl>
                  <div><dt>{t('storyboard.camera')}</dt><dd>{shot.camera}</dd></div>
                  {shot.dialogue ? (
                    <div><dt>{t('storyboard.dialogue')}</dt><dd>“{shot.dialogue}”</dd></div>
                  ) : null}
                </dl>
              </div>
            </article>
          ))
        )}
      </div>
      <Timeline shots={shots} t={t} />
    </div>
  )
}

function GenerationStage(props: {
  production: ProductionView
  busy: boolean
  generating: boolean
  onGenerate: () => void
  onQueryGeneration: () => void
  t: Translator
}) {
  const candidates = flattenShots(props.production).flatMap(({ shot }) =>
    shot.candidates.map((candidate) => ({ candidate, shot }))
  )
  const selected = candidates.filter(({ candidate }) => candidate.selected)
  const previewClips: SelectedVideoClip[] = flattenShots(props.production)
    .map(({ scene, shot }) => {
      const candidate = shot.candidates.find(
        (item) => item.selected && item.kind === 'video' && item.fileUrl
      )
      return candidate?.fileUrl
        ? {
            id: candidate.id,
            src: candidate.fileUrl,
            label: candidate.label,
            sceneTitle: scene.title,
            shotTitle: shot.title,
            durationSeconds: shot.durationSeconds
          }
        : null
    })
    .filter((clip): clip is SelectedVideoClip => clip !== null)
  return (
    <div className="ss-generation-stage">
      <div className="ss-generation-toolbar">
        <div>
          <strong>{props.t('generation.reviewTitle')}</strong>
          <p>{props.t('generation.reviewHelp', { selected: selected.length, total: candidates.length })}</p>
        </div>
        <div className="ss-generation-actions">
          <Button size="sm" disabled={props.busy || props.generating} onClick={props.onGenerate}>
            {props.generating ? props.t('generation.sending') : props.t('generation.generateSeedance')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={props.busy || props.generating}
            onClick={props.onQueryGeneration}
          >
            {props.t('generation.queryTasks')}
          </Button>
        </div>
      </div>
      <SelectedVideoPreview clips={previewClips} t={props.t} />
      <div className="ss-media-grid">
        {candidates.map(({ candidate, shot }) => (
          <article className={candidate.selected ? 'is-selected' : ''} key={candidate.id}>
            <div className="ss-media-frame">
              <MediaPreview candidate={candidate} />
              {candidate.kind === 'video' ? <Play aria-hidden="true" /> : null}
              <Badge>{candidate.selected ? props.t('generation.selected') : props.t('generation.candidate')}</Badge>
            </div>
            <div>
              <small>{shot.title}</small>
              <h4>{candidate.label}</h4>
              <p>
                {candidate.providerReceipt
                  ? `${candidate.providerReceipt.model ?? 'Seedance'} · ${candidate.providerReceipt.status}`
                  : props.t('generation.missing')}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function HandoffStage(props: {
  production: ProductionView
  handoff: HandoffView | null
  busy: boolean
  handingOff: boolean
  onHandoff: () => void
  t: Translator
}) {
  const shots = flattenShots(props.production)
  const frozen = shots.map(({ scene, shot }, index) => ({
    scene,
    shot,
    candidate: shot.candidates.find(
      (candidate) => candidate.selected && candidate.kind === 'video'
    ) ?? null,
    start: shots.slice(0, index).reduce((sum, item) => sum + item.shot.durationSeconds, 0)
  }))
  const ready = frozen.length > 0 && frozen.every((item) => item.candidate?.workspacePath)
  const mode = props.handoff?.mode ?? 'create'
  return (
    <div className="ss-handoff-stage">
      <header className="ss-handoff-hero">
        <div>
          <span>{props.t('handoff.title')}</span>
          <h3>{props.t(`handoff.mode.${mode}`)}</h3>
          <p>{props.t('handoff.subtitle')}</p>
        </div>
        <Button size="sm" disabled={props.busy || props.handingOff || !ready} onClick={props.onHandoff}>
          <Send aria-hidden="true" />
          {props.handingOff ? props.t('handoff.preparing') : props.t('handoff.prepare')}
        </Button>
      </header>
      <div className="ss-handoff-boundary">
        <BoundaryCard label={props.t('handoff.story')} body={props.t('handoff.storyOwner')} tone="story" />
        <ChevronRight aria-hidden="true" />
        <BoundaryCard label={props.t('handoff.contract')} body={props.t('handoff.contractOwner')} tone="contract" />
        <ChevronRight aria-hidden="true" />
        <BoundaryCard label={props.t('handoff.cut')} body={props.t('handoff.cutOwner')} tone="cut" />
      </div>
      {!ready ? <div className="ss-handoff-warning">{props.t('handoff.notReady')}</div> : null}
      <div className="ss-handoff-body">
        <section className="ss-frozen-clips">
          <header>
            <span>{props.t('handoff.shots')}</span>
            <Badge variant="outline">{frozen.length}</Badge>
          </header>
          {frozen.map(({ scene, shot, candidate, start }, index) => (
            <article key={shot.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <MediaPreview candidate={candidate} />
              <div>
                <strong>{shot.title}</strong>
                <small>{scene.title} · {formatTime(start)}–{formatTime(start + shot.durationSeconds)}</small>
                <p>{candidate?.workspacePath ? props.t('handoff.clipReady') : props.t('generation.missing')}</p>
              </div>
              <Badge className={candidate?.workspacePath ? 'ss-ready-badge' : 'ss-pending-badge'}>
                {shot.durationSeconds}s
              </Badge>
            </article>
          ))}
        </section>
        <HandoffReceipt handoff={props.handoff} t={props.t} />
      </div>
    </div>
  )
}

function BoundaryCard(props: { label: string; body: string; tone: string }) {
  return (
    <article className={`ss-boundary-card is-${props.tone}`}>
      <span>{props.label}</span>
      <p>{props.body}</p>
    </article>
  )
}

function HandoffReceipt(props: { handoff: HandoffView | null; t: Translator }) {
  const { handoff, t } = props
  return (
    <section className="ss-handoff-receipt">
      <header>
        <span>{t('handoff.contract')}</span>
        <Badge>{t(`handoff.status.${handoff?.status ?? 'none'}`)}</Badge>
      </header>
      {handoff ? (
        <>
          <dl>
            <div><dt>{t('handoff.sourceRevision')}</dt><dd>{handoff.sourceRevision}</dd></div>
            <div><dt>{t('handoff.handoffRevision')}</dt><dd>{handoff.handoffRevision}</dd></div>
            <div><dt>{t('handoff.shots')}</dt><dd>{handoff.shotCount}</dd></div>
            <div><dt>{t('handoff.duration')}</dt><dd>{handoff.durationSeconds}s</dd></div>
            <div><dt>{t('handoff.checksum')}</dt><dd><code>{handoff.checksum.slice(0, 12)}</code></dd></div>
            <div><dt>{t('handoff.cutProject')}</dt><dd><code>{handoff.cutProjectId?.slice(0, 8) ?? '—'}</code></dd></div>
            {handoff.cutProposalId ? (
              <div><dt>{t('handoff.cutProposal')}</dt><dd><code>{handoff.cutProposalId.slice(0, 8)}</code></dd></div>
            ) : null}
          </dl>
          <p>{handoff.mode === 'proposal' ? t('handoff.proposalHelp') : t('handoff.createHelp')}</p>
          {handoff.status === 'ready' ? <small>{t('handoff.awaitingAssistant')}</small> : null}
          {handoff.failureMessage ? <small className="is-error">{handoff.failureMessage}</small> : null}
        </>
      ) : (
        <p>{t('handoff.createHelp')}</p>
      )}
    </section>
  )
}

function Timeline(props: {
  shots: Array<{ scene: Scene; shot: Shot }>
  t: Translator
}) {
  const total = props.shots.reduce((sum, item) => sum + item.shot.durationSeconds, 0)
  return (
    <section className="ss-timeline">
      <header>
        <span>{props.t('storyboard.timeline')}</span>
        <code>{formatTime(total)}</code>
      </header>
      <div>
        {props.shots.map(({ shot }, index) => (
          <article
            key={shot.id}
            style={{ flexGrow: Math.max(1, shot.durationSeconds) }}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{shot.title}</strong>
            <small>{shot.durationSeconds}s</small>
          </article>
        ))}
      </div>
    </section>
  )
}

function MediaPreview(props: { candidate: Candidate | null }) {
  const candidate = props.candidate
  if (!candidate?.fileUrl) {
    return <div className="ss-media-placeholder" aria-hidden="true"><span>SS</span></div>
  }
  if (candidate.kind === 'video') {
    return (
      <video
        className="ss-media-preview"
        controls
        crossOrigin="use-credentials"
        preload="metadata"
        src={candidate.fileUrl}
      >
        <track kind="captions" />
      </video>
    )
  }
  return (
    <img
      className="ss-media-preview"
      crossOrigin="use-credentials"
      src={candidate.fileUrl}
      alt={candidate.label}
    />
  )
}

function Metric(props: { label: string; value: string | number }) {
  return <div><span>{props.label}</span><strong>{props.value}</strong></div>
}

function EmptyStage(props: { t: Translator }) {
  return (
    <div className="ss-stage-empty">
      <span>SS</span>
      <strong>{props.t('workflow.empty')}</strong>
      <p>{props.t('production.emptyHelp')}</p>
    </div>
  )
}

function firstVisualCandidate(candidates: Candidate[]) {
  return (
    candidates.find((candidate) => candidate.selected && (candidate.kind === 'image' || candidate.kind === 'video')) ??
    candidates.find((candidate) => candidate.kind === 'image' || candidate.kind === 'video') ??
    null
  )
}

function flattenShots(production: ProductionView) {
  return production.scenes.flatMap((scene) => scene.shots.map((shot) => ({ scene, shot })))
}

function countSelectedShotVideos(production: ProductionView | null) {
  if (!production) return 0
  return flattenShots(production).filter(({ shot }) =>
    shot.candidates.some((candidate) => candidate.selected && candidate.kind === 'video')
  ).length
}

function stageContentReady(stage: number, production: ProductionView | null, handoff: HandoffView | null) {
  if (stage === 1) return true
  if (!production) return false
  if (stage === 2) return production.counts.sources > 0
  if (stage === 3) return production.counts.beats > 0
  if (stage === 4) return production.counts.episodes > 0
  if (stage === 5) return production.counts.assets > 0
  if (stage === 6) return production.counts.shots > 0
  if (stage === 7) return countSelectedShotVideos(production) === production.counts.shots && production.counts.shots > 0
  return handoff?.status === 'delivered' || handoff?.status === 'proposal_ready'
}

function formatTime(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
