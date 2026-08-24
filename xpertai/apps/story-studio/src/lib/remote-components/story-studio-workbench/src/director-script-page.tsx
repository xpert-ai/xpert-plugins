import * as React from 'react'
import {
  Button,
  Check,
  ChevronDown,
  EyeOff,
  MoreHorizontal,
  Plus,
  Redo2,
  Save,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Trash2,
  Undo2
} from '@xpert-ai/plugin-shadcn-ui'
import { DirectorSelect } from './director-form-controls'
import {
  DeleteEntityDialog,
  EpisodeDialog,
  SceneDialog,
  ShotDialog
} from './director-entity-dialogs'
import {
  acceptAdaptationSuggestion,
  addEpisode,
  addScene,
  addShot,
  deleteEpisode,
  deleteScene,
  deleteShot,
  updateEpisode,
  updateScene,
  updateShot,
  type EpisodeDraft,
  type SceneDraft,
  type ShotDraft
} from './director-production-crud'
import type {
  AdaptationSuggestion,
  Episode,
  ProductionView,
  Scene,
  Shot
} from './production-data'
import { characterAssets } from './production-data'
import { StructuredScriptEditor } from './structured-script-editor'
import type { StructuredScriptDefaults } from './structured-script-model'
import type { DirectorTranslator, WorkbenchSaveState } from './director-types'
import { useScriptAutosave } from './use-script-autosave'
import { StudioPanelLayout } from './studio-panel-layout'

const h: typeof React.createElement = React.createElement

type DirectorScriptPageProps = {
  production: ProductionView
  busy: boolean
  rightPanelOpen: boolean
  t: DirectorTranslator
  onCommitProduction: (
    draft: ProductionView,
    changeSummary: string,
    options?: { silent?: boolean }
  ) => Promise<boolean>
  onRequestSuggestion: (input: {
    episodeId: string
    sceneId?: string
    shotId?: string
    focusText: string
  }) => void
  onOpenStoryboard: () => void
  onRegisterBeforeLeave: (
    handler: (() => Promise<boolean>) | null
  ) => void
  onSaveStateChange: (state: WorkbenchSaveState) => void
}

type EditorTarget =
  | { kind: 'episode'; value: Episode | null }
  | { kind: 'scene'; value: Scene | null }
  | { kind: 'shot'; value: Shot | null }
  | null

type DeleteTarget =
  | { kind: 'episode'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'shot'; id: string }
  | null

export function DirectorScriptPage(props: DirectorScriptPageProps) {
  const { busy, t } = props
  const autosave = useScriptAutosave({
    production: props.production,
    autosaveSummary: t('changes.scriptAutosaved'),
    versionSummary: t('changes.scriptVersionSaved'),
    onCommit: props.onCommitProduction
  })
  const production = autosave.draft
  const scriptDefaults: StructuredScriptDefaults = {
    episodeScript: t('director.crud.defaultEpisodeScript'),
    sceneTitle: t('director.crud.defaultSceneTitle'),
    sceneSummary: t('director.crud.defaultSceneSummary'),
    shotAction: t('director.crud.defaultAction')
  }
  const [episodeId, setEpisodeId] = React.useState(
    production.episodes[0]?.id ?? ''
  )
  const [sceneId, setSceneId] = React.useState(
    production.scenes[0]?.id ?? ''
  )
  const [shotId, setShotId] = React.useState(
    production.scenes[0]?.shots[0]?.id ?? ''
  )
  const [editorTarget, setEditorTarget] = React.useState<EditorTarget>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget>(null)
  const episode =
    production.episodes.find((item) => item.id === episodeId) ??
    production.episodes[0]
  const episodeScenes = episode
    ? production.scenes.filter(
        (scene) =>
          scene.episodeId === episode.id ||
          (production.episodes.length === 1 && !scene.episodeId)
      )
    : production.scenes
  const scene =
    episodeScenes.find((item) => item.id === sceneId) ??
    episodeScenes[0] ??
    production.scenes[0]
  const shot =
    scene?.shots.find((item) => item.id === shotId) ?? scene?.shots[0]
  const suggestions = (production.storyPlan?.adaptationSuggestions ?? []).filter(
    (item) =>
      item.episodeId === episode?.id &&
      (!item.sceneId || item.sceneId === scene?.id)
  )
  const activeSuggestion =
    suggestions.find((item) => item.status === 'pending') ?? suggestions[0]
  const duration = production.scenes.reduce(
    (total, item) =>
      total + item.shots.reduce((sum, current) => sum + current.durationSeconds, 0),
    0
  )

  React.useEffect(() => {
    if (!production.episodes.some((item) => item.id === episodeId)) {
      setEpisodeId(production.episodes[0]?.id ?? '')
    }
  }, [production.episodes, episodeId])

  React.useEffect(() => {
    if (!scene) return
    setSceneId(scene.id)
    if (!scene.shots.some((item) => item.id === shotId)) {
      setShotId(scene.shots[0]?.id ?? '')
    }
  }, [scene, shotId])

  React.useEffect(() => {
    props.onRegisterBeforeLeave(() => autosave.flush())
    return () => props.onRegisterBeforeLeave(null)
  }, [props.onRegisterBeforeLeave, autosave.flush])

  React.useEffect(() => {
    props.onSaveStateChange(autosave.saveState)
  }, [autosave.saveState, props.onSaveStateChange])

  async function submitEpisode(draft: EpisodeDraft) {
    const next = structuredClone(production)
    if (editorTarget?.kind === 'episode' && editorTarget.value) {
      updateEpisode(next, editorTarget.value.id, draft)
    } else {
      const id = `episode-${crypto.randomUUID()}`
      addEpisode(next, id, draft)
      setEpisodeId(id)
    }
    if (
      await props.onCommitProduction(
        next,
        t('changes.episodeSaved', { title: draft.title })
      )
    ) {
      setEditorTarget(null)
    }
  }

  async function submitScene(draft: SceneDraft) {
    const next = structuredClone(production)
    let nextSceneId = editorTarget?.kind === 'scene'
      ? editorTarget.value?.id
      : undefined
    if (nextSceneId) {
      updateScene(next, nextSceneId, draft)
    } else {
      nextSceneId = `scene-${crypto.randomUUID()}`
      addScene(
        next,
        nextSceneId,
        `shot-${crypto.randomUUID()}`,
        draft,
        newShotDraft(t)
      )
    }
    if (
      await props.onCommitProduction(
        next,
        t('changes.sceneSaved', { title: draft.title })
      )
    ) {
      setSceneId(nextSceneId)
      setEditorTarget(null)
    }
  }

  async function submitShot(draft: ShotDraft) {
    if (!scene) return
    const next = structuredClone(production)
    let nextShotId = editorTarget?.kind === 'shot'
      ? editorTarget.value?.id
      : undefined
    if (nextShotId) {
      updateShot(next, scene.id, nextShotId, draft)
    } else {
      nextShotId = `shot-${crypto.randomUUID()}`
      addShot(next, scene.id, nextShotId, draft)
    }
    if (
      await props.onCommitProduction(
        next,
        t('changes.shotSaved', { title: draft.title })
      )
    ) {
      setShotId(nextShotId)
      setEditorTarget(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const next = structuredClone(production)
    let changed = false
    let summary = ''
    if (deleteTarget.kind === 'episode') {
      changed = deleteEpisode(next, deleteTarget.id)
      summary = t('changes.episodeDeleted')
    }
    if (deleteTarget.kind === 'scene') {
      changed = deleteScene(next, deleteTarget.id)
      summary = t('changes.sceneDeleted')
    }
    if (deleteTarget.kind === 'shot' && scene) {
      changed = deleteShot(next, scene.id, deleteTarget.id)
      summary = t('changes.shotDeleted')
    }
    if (!changed) return
    if (await props.onCommitProduction(next, summary)) {
      setDeleteTarget(null)
    }
  }

  async function acceptSuggestion(suggestion: AdaptationSuggestion) {
    if (!(await autosave.flush())) return
    const next = structuredClone(production)
    if (!acceptAdaptationSuggestion(next, suggestion.id)) return
    await props.onCommitProduction(
      next,
      t('changes.suggestionAccepted', { id: suggestion.id })
    )
  }

  async function dismissSuggestion(suggestion: AdaptationSuggestion) {
    if (!(await autosave.flush())) return
    const next = structuredClone(production)
    const target = next.storyPlan?.adaptationSuggestions.find(
      (item) => item.id === suggestion.id
    )
    if (!target) return
    target.status = 'dismissed'
    await props.onCommitProduction(
      next,
      t('changes.suggestionDismissed', { id: suggestion.id })
    )
  }

  async function openStoryboard() {
    if (await autosave.flush()) props.onOpenStoryboard()
  }

  return (
    <StudioPanelLayout storageKey="script" leftLabel={t('director.script.outline')} rightLabel={t('director.script.continuity')} rightPanelOpen={props.rightPanelOpen} leftDefault={250} rightDefault={310} className="bg-studio-canvas text-studio-ink" testId="director-script-page">
      <aside className="row-start-1 flex min-h-0 flex-col border-r border-studio-line bg-studio-paper/70">
        <div className="border-b border-studio-line p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-studio-muted">{t('director.script.outline')}</p>
              <DirectorSelect ariaLabel={t('director.crud.episode')} className="mt-2 border-0 bg-transparent px-0 font-display text-lg font-bold shadow-none" value={episode?.id ?? ''} onValueChange={setEpisodeId} options={production.episodes.map((item) => ({ value: item.id, label: `${t('director.episodeLabel', { number: item.order })} · ${item.title}` }))} />
              <p className="mt-1 text-xs text-studio-muted">{t('director.sceneCount', { scenes: episodeScenes.length, shots: episodeScenes.reduce((count, item) => count + item.shots.length, 0), seconds: duration })}</p>
            </div>
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="grid size-8 place-items-center rounded-md border border-studio-line bg-studio-paper transition hover:border-studio-brass hover:text-studio-brass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-brass/40" aria-label={t('director.crud.newEpisode')} data-testid="new-episode-button" onClick={() => setEditorTarget({ kind: 'episode', value: null })}><Plus className="size-4" aria-hidden="true" /></button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>{t('director.crud.newEpisode')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {episode ? (
            <div className="mt-3 flex gap-2">
              <button type="button" className="text-xs font-semibold text-studio-brass hover:underline" onClick={() => setEditorTarget({ kind: 'episode', value: episode })}>{t('actions.edit')}</button>
              <button type="button" className="text-xs font-semibold text-studio-danger hover:underline" onClick={() => setDeleteTarget({ kind: 'episode', id: episode.id })}>{t('actions.delete')}</button>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-studio-muted">{t('editor.scenes')}</span>
            <button type="button" className="flex items-center gap-1 text-xs font-semibold text-studio-brass" onClick={() => setEditorTarget({ kind: 'scene', value: null })}><Plus className="size-3.5" aria-hidden="true" />{t('editor.add')}</button>
          </div>
          <div className="grid gap-2">
            {episodeScenes.map((item, index) => (
              <article key={item.id} className={`rounded-lg border p-2.5 transition ${scene?.id === item.id ? 'border-studio-brass bg-amber-50 shadow-sm' : 'border-studio-line bg-studio-paper hover:border-studio-brass/60'}`}>
                <button type="button" className="w-full text-left" onClick={() => { setSceneId(item.id); setShotId(item.shots[0]?.id ?? '') }}>
                  <span className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-studio-muted"><b>{t('director.storyboard.scene', { number: index + 1 })}</b><em className="not-italic">{item.shots.length} {t('production.shots')}</em></span>
                  <strong className="mt-1 block font-display text-[15px]">{item.title}</strong>
                </button>
                <div className="mt-2 flex gap-2 border-t border-studio-line/70 pt-2">
                  <button type="button" className="text-[11px] font-semibold text-studio-brass" onClick={() => setEditorTarget({ kind: 'scene', value: item })}>{t('actions.edit')}</button>
                  <button type="button" className="text-[11px] font-semibold text-studio-danger disabled:opacity-40" disabled={production.scenes.length <= 1} onClick={() => setDeleteTarget({ kind: 'scene', id: item.id })}>{t('actions.delete')}</button>
                </div>
              </article>
            ))}
          </div>

          {scene ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-studio-muted">{t('editor.shots')}</span>
                <button type="button" className="flex items-center gap-1 text-xs font-semibold text-studio-brass" onClick={() => setEditorTarget({ kind: 'shot', value: null })}><Plus className="size-3.5" aria-hidden="true" />{t('editor.add')}</button>
              </div>
              <div className="grid gap-1.5">
                {scene.shots.map((item, index) => (
                  <div key={item.id} className={`group flex items-center gap-2 rounded-md border px-2 py-2 ${shot?.id === item.id ? 'border-studio-brass bg-studio-brass text-white' : 'border-transparent hover:border-studio-line hover:bg-studio-paper'}`}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setShotId(item.id)}><span className="text-[10px] opacity-70">S{scene.order}{index + 1}</span><strong className="ml-2 truncate text-xs">{item.title}</strong></button>
                    <span className="text-[10px] opacity-70">{item.durationSeconds}s</span>
                    <button type="button" className="text-[10px] font-semibold opacity-80 hover:opacity-100" onClick={() => setEditorTarget({ kind: 'shot', value: item })}>{t('actions.edit')}</button>
                    <button type="button" className="opacity-60 hover:opacity-100 disabled:opacity-20" disabled={scene.shots.length <= 1} aria-label={t('actions.delete')} onClick={() => setDeleteTarget({ kind: 'shot', id: item.id })}><Trash2 className="size-3.5" aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="director-script-center-surface row-start-1 min-w-0 overflow-y-auto bg-studio-canvas">
        <header className="sticky top-0 z-10 flex h-14 min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-studio-line bg-studio-canvas/95 px-5 backdrop-blur">
          <span className="shrink-0 rounded border border-studio-line bg-studio-paper px-2 py-1 text-xs font-semibold">{scene ? t('director.storyboard.scene', { number: scene.order }) : '—'}</span>
          <span className="shrink-0 text-xs text-studio-muted">/</span><span className="min-w-0 truncate text-xs" title={scene?.location ?? undefined}>{scene?.location ?? '—'}</span><span className="shrink-0 text-xs text-studio-muted">/</span><span className="min-w-0 truncate text-xs" title={scene?.timeOfDay ?? undefined}>{scene?.timeOfDay ?? '—'}</span>
          <button type="button" className="ml-2 inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-studio-blue">{t('director.script.aiRevision')}<ChevronDown className="size-3.5" aria-hidden="true" /></button>
          <div className="flex-1" />
          <button type="button" className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${saveStateClass(autosave.saveState)}`} aria-live="polite" onClick={() => autosave.saveState === 'error' ? void autosave.retry() : undefined}>{t(`director.script.saveState.${autosave.saveState}`)}</button>
          <button type="button" className="grid size-8 place-items-center rounded-md border border-studio-line bg-studio-paper text-studio-muted hover:border-studio-brass hover:text-studio-brass disabled:opacity-35" aria-label={t('director.script.undo')} disabled={!autosave.canUndo} onClick={autosave.undo}><Undo2 className="size-4" aria-hidden="true" /></button>
          <button type="button" className="grid size-8 place-items-center rounded-md border border-studio-line bg-studio-paper text-studio-muted hover:border-studio-brass hover:text-studio-brass disabled:opacity-35" aria-label={t('director.script.redo')} disabled={!autosave.canRedo} onClick={autosave.redo}><Redo2 className="size-4" aria-hidden="true" /></button>
          <Button className="shrink-0 whitespace-nowrap" variant="outline" size="sm" onClick={() => episode && setEditorTarget({ kind: 'episode', value: episode })}><EyeOff aria-hidden="true" />{t('director.script.viewOriginal')}</Button>
          <Button className="shrink-0 whitespace-nowrap" variant="outline" size="sm" disabled={autosave.saveState === 'saving'} onClick={() => void autosave.flush(true)}><Save aria-hidden="true" />{t('director.script.saveVersion')}</Button>
        </header>
        <div className="mx-auto max-w-4xl px-8 py-6" onBlur={(event) => {
          const nextTarget = event.relatedTarget
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) void autosave.flush()
        }}>
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3 whitespace-nowrap text-xs text-studio-muted">
            <span className="min-w-0 flex-1 truncate">{episode?.script.length ?? 0}{t('director.script.charactersUnit')} · {episodeScenes.length}{t('director.script.scenesUnit')} · {episodeScenes.reduce((count, item) => count + item.shots.length, 0)}{t('director.script.shotsUnit')} · {t('director.script.estimatedSeconds', { seconds: duration })}</span>
            {shot ? <button type="button" className="shrink-0 whitespace-nowrap font-semibold text-studio-brass hover:underline" onClick={() => setEditorTarget({ kind: 'shot', value: shot })}>{t('director.crud.editShot')}</button> : null}
          </div>
          {scene ? (
            <StructuredScriptEditor
              production={production}
              scene={scene}
              selectedShotId={shot?.id ?? null}
              defaults={scriptDefaults}
              t={t}
              onChange={autosave.change}
              onSelectShot={setShotId}
            />
          ) : null}
        </div>
      </section>

      <aside id="director-right-panel" data-studio-panel="right" className="row-start-1 min-h-0 overflow-y-auto border-l border-studio-line bg-studio-paper">
        <div className="flex items-center justify-between border-b border-studio-line px-4 py-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-studio-muted">Assistant</p><strong className="font-display text-lg">{t('director.script.aiSuggestions')}</strong></div>
          <span className="rounded-full bg-studio-blue px-2 py-0.5 text-xs font-bold text-white">{suggestions.filter((item) => item.status === 'pending').length}</span>
        </div>
        {activeSuggestion ? (
          <section className="border-b border-studio-line p-4" data-testid="adaptation-suggestion-card">
            <header className="mb-3 flex items-center justify-between"><strong className="text-sm">{t('director.script.changePoint')}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${activeSuggestion.status === 'pending' ? 'bg-blue-50 text-studio-blue' : activeSuggestion.status === 'accepted' ? 'bg-emerald-50 text-studio-success' : 'bg-stone-100 text-studio-muted'}`}>{t(`director.suggestion.status.${activeSuggestion.status}`)}</span></header>
            <SuggestionBlock label={t('director.script.original')} tone="muted">{activeSuggestion.originalText}</SuggestionBlock>
            <SuggestionBlock label={t('director.script.suggestion')} tone="blue">{activeSuggestion.suggestedText}</SuggestionBlock>
            <SuggestionBlock label={t('director.script.reason')} tone="muted">{activeSuggestion.reason}</SuggestionBlock>
            <p className="mt-3 flex items-center gap-1 text-[11px] text-studio-muted"><Check className="size-3.5 text-studio-success" aria-hidden="true" />{t('director.suggestion.fromAssistant')}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" disabled={busy || activeSuggestion.status !== 'pending'} onClick={() => void dismissSuggestion(activeSuggestion)}>{t('director.suggestion.dismiss')}</Button>
              <Button size="sm" disabled={busy || activeSuggestion.status !== 'pending'} onClick={() => void acceptSuggestion(activeSuggestion)}>{activeSuggestion.status === 'accepted' ? <Check aria-hidden="true" /> : null}{t('director.script.accept')}</Button>
            </div>
          </section>
        ) : (
          <div className="m-4 rounded-lg border border-dashed border-studio-line bg-studio-canvas p-5 text-center"><MoreHorizontal className="mx-auto size-5 text-studio-muted" aria-hidden="true" /><p className="mt-2 text-sm font-semibold">{t('director.suggestion.empty')}</p><p className="mt-1 text-xs leading-5 text-studio-muted">{t('director.suggestion.emptyHelp')}</p></div>
        )}
        <section className="border-b border-studio-line p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-studio-muted">{t('director.script.continuity')}</h3>
          {[t('director.script.characterIntent'), t('director.script.cameraProp'), t('director.script.wetWardrobe')].map((value, index) => <p key={value} className="mt-3 flex items-start gap-2 text-xs leading-5"><i className={`mt-0.5 grid size-4 place-items-center rounded-full ${index === 2 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-studio-success'}`}>{index === 2 ? <MoreHorizontal className="size-3" aria-hidden="true" /> : <Check className="size-3" aria-hidden="true" />}</i><span>{value}</span></p>)}
        </section>
        <section className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-studio-muted">{t('director.script.intent')}</h3>
          <div className="mt-3 flex flex-wrap gap-2">{(shot?.emotion ?? production.storyPlan?.tone ?? '').split(/[、，,|｜]/).filter(Boolean).map((value) => <span key={value} className="rounded-full border border-studio-line bg-studio-canvas px-2.5 py-1 text-xs">{value.trim()}</span>)}</div>
          <Button className="mt-5 w-full" variant="outline" disabled={!episode || busy} onClick={() => episode && props.onRequestSuggestion({ episodeId: episode.id, ...(scene ? { sceneId: scene.id } : {}), ...(shot ? { shotId: shot.id } : {}), focusText: shot?.action ?? scene?.summary ?? episode.script })}><Redo2 aria-hidden="true" />{t('director.suggestion.request')}</Button>
        </section>
      </aside>

      <footer className="col-span-3 row-start-2 flex items-center justify-between border-t border-studio-line bg-studio-paper px-5 text-xs text-studio-muted">
        <span aria-live="polite">{t(`director.script.saveState.${autosave.saveState}`)} · {t('director.script.autosaveHint')}</span>
        <div className="flex items-center gap-3"><Button variant="outline" size="sm">{t('director.script.lock')}</Button><Button size="sm" onClick={() => void openStoryboard()}>{t('director.script.generateStoryboard')}</Button><span>{t('director.script.estimate', { shots: production.counts.shots, cost: '26.00' })}</span></div>
      </footer>

      <EpisodeDialog open={editorTarget?.kind === 'episode'} episode={editorTarget?.kind === 'episode' ? editorTarget.value : null} busy={busy} t={t} onOpenChange={(open) => !open && setEditorTarget(null)} onSubmit={(draft) => void submitEpisode(draft)} />
      <SceneDialog open={editorTarget?.kind === 'scene'} scene={editorTarget?.kind === 'scene' ? editorTarget.value : null} episodes={production.episodes} busy={busy} t={t} onOpenChange={(open) => !open && setEditorTarget(null)} onSubmit={(draft) => void submitScene(draft)} />
      <ShotDialog open={editorTarget?.kind === 'shot'} shot={editorTarget?.kind === 'shot' ? editorTarget.value : null} characters={characterAssets(production)} busy={busy} t={t} onOpenChange={(open) => !open && setEditorTarget(null)} onSubmit={(draft) => void submitShot(draft)} />
      <DeleteEntityDialog open={Boolean(deleteTarget)} title={deleteDialogCopy(deleteTarget, t).title} description={deleteDialogCopy(deleteTarget, t).description} busy={busy} t={t} onOpenChange={(open) => !open && setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
    </StudioPanelLayout>
  )
}

function SuggestionBlock(props: { label: string; tone: 'muted' | 'blue'; children: React.ReactNode }) {
  return <div className="mb-3"><label className={`text-[10px] font-bold uppercase tracking-wider ${props.tone === 'blue' ? 'text-studio-blue' : 'text-studio-muted'}`}>{props.label}</label><p className={`mt-1 rounded-md border-l-2 px-3 py-2 text-xs leading-5 ${props.tone === 'blue' ? 'border-studio-blue bg-blue-50' : 'border-studio-line bg-studio-canvas'}`}>{props.children}</p></div>
}

function newShotDraft(t: DirectorTranslator): ShotDraft {
  return {
    title: t('director.crud.defaultShotTitle'),
    composition: t('director.crud.defaultComposition'),
    action: t('director.crud.defaultAction'),
    camera: t('director.crud.defaultCamera'),
    dialogue: null,
    dialogueSpeakerId: null,
    dialogueType: null,
    soundEffects: [],
    generationPrompt: t('director.crud.defaultPrompt'),
    emotion: null,
    lens: '35mm',
    lighting: null,
    colorTone: null,
    weather: null,
    durationSeconds: 5
  }
}

function saveStateClass(state: 'saved' | 'dirty' | 'saving' | 'error') {
  if (state === 'saved') return 'bg-emerald-50 text-studio-success'
  if (state === 'error') return 'bg-red-50 text-studio-danger'
  if (state === 'saving') return 'bg-blue-50 text-studio-blue'
  return 'bg-amber-50 text-amber-700'
}

function deleteDialogCopy(target: DeleteTarget, t: DirectorTranslator) {
  if (target?.kind === 'episode') return { title: t('director.crud.deleteEpisode'), description: t('director.crud.deleteEpisodeHelp') }
  if (target?.kind === 'scene') return { title: t('director.crud.deleteScene'), description: t('director.crud.deleteSceneHelp') }
  return { title: t('director.crud.deleteShot'), description: t('director.crud.deleteShotHelp') }
}
