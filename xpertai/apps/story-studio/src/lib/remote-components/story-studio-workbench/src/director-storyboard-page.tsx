import * as React from 'react'
import {
  Button,
  Check,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Image as ImageIcon,
  MoreHorizontal,
  Play,
  Plus,
  Redo2,
  Save,
  Textarea,
  Trash2,
  Upload
} from '@xpert-ai/plugin-shadcn-ui'
import { DirectorSelect } from './director-form-controls'
import {
  AssetDialog,
  DeleteEntityDialog,
  ShotDialog
} from './director-entity-dialogs'
import {
  addShot,
  deleteShot,
  updateAsset,
  updateShot,
  type AssetDraft,
  type ShotDraft
} from './director-production-crud'
import type {
  Asset,
  Candidate,
  ProductionView,
  Scene,
  Shot
} from './production-data'
import type { DirectorTranslator } from './director-types'
import {
  playableVideoUrl,
  primeVideoPreview,
  selectVideoPreviewCandidate
} from './director-storyboard-media'
import {
  isActiveVideoTask,
  type VideoGenerationTask,
  type VideoGeneratorCatalog,
  type VideoTaskStatus
} from './video-generation-data'
import { StudioPanelLayout } from './studio-panel-layout'
import { resolveShotGenerationSettings } from './director-shot-settings'
import { compactVoiceReference } from '../../../voice-reference.js'

const h: typeof React.createElement = React.createElement

type DirectorStoryboardPageProps = {
  production: ProductionView
  busy: boolean
  generating: boolean
  videoGenerators: VideoGeneratorCatalog | null
  videoTasks: VideoGenerationTask[]
  t: DirectorTranslator
  onCommitProduction: (draft: ProductionView, changeSummary: string) => Promise<boolean>
  onGenerateTakes: (input: {
    sceneId: string
    shotId: string
    prompt: string
    toolsetId: string
    model: string
    resolution: string
    aspectRatio: string
    fps: number
    takeCount: number
    referenceAssetIds: string[]
    redoScope?: string
  }) => void
  onSetVideoGenerator: (toolsetId: string) => void
  onCancelVideoTask: (taskId: string) => void
  onRetryVideoTask: (taskId: string) => void
  onSelectTake: (sceneId: string, shotId: string, candidateId: string) => void
  onUploadAsset: (asset: Asset, file: File) => void
  onUploadShotReference: (
    sceneId: string,
    shotId: string,
    prompt: string,
    file: File
  ) => void
}

export function DirectorStoryboardPage(props: DirectorStoryboardPageProps) {
  const { production, busy, generating, t } = props
  const initialScene = production.scenes[0]
  const initialShot = initialScene?.shots[1] ?? initialScene?.shots[0]
  const [sceneId, setSceneId] = React.useState(initialScene?.id ?? '')
  const [shotId, setShotId] = React.useState(initialShot?.id ?? '')
  const [editing, setEditing] = React.useState<Shot | 'new' | null>(null)
  const [editingAsset, setEditingAsset] = React.useState<Asset | null>(null)
  const [deleting, setDeleting] = React.useState<Shot | null>(null)
  const [referencePickerOpen, setReferencePickerOpen] = React.useState(false)
  const [referenceDraftIds, setReferenceDraftIds] = React.useState<string[]>([])
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [previewCandidateId, setPreviewCandidateId] = React.useState<string | null>(null)
  const [generatorId, setGeneratorId] = React.useState(props.videoGenerators?.selectedToolsetId ?? '')
  const [model, setModel] = React.useState('')
  const [resolution, setResolution] = React.useState('')
  const [aspectRatio, setAspectRatio] = React.useState('')
  const [fps, setFps] = React.useState(24)
  const [takeCount, setTakeCount] = React.useState(1)
  const [redoScope, setRedoScope] = React.useState('performance')
  const [referenceAssetIds, setReferenceAssetIds] = React.useState<string[]>([])
  const assetUploadRef = React.useRef<HTMLInputElement | null>(null)
  const shotReferenceUploadRef = React.useRef<HTMLInputElement | null>(null)
  const pendingUploadAssetRef = React.useRef<Asset | null>(null)
  const settingsShotRef = React.useRef('')
  const settingsDirtyRef = React.useRef(false)
  const scene = production.scenes.find((item) => item.id === sceneId) ?? initialScene
  const shot = scene?.shots.find((item) => item.id === shotId) ?? scene?.shots[0]
  const [prompt, setPrompt] = React.useState(shot?.generationPrompt ?? '')
  const videoCandidates = shot?.candidates.filter((candidate) => candidate.kind === 'video') ?? []
  const previewCandidate = selectVideoPreviewCandidate(
    videoCandidates,
    previewCandidateId
  )
  const previewVideoUrl = playableVideoUrl(previewCandidate)
  const selectedGenerator = props.videoGenerators?.generators.find((item) => item.id === generatorId && item.available) ?? null
  const latestTasks = latestShotTasks(props.videoTasks, scene?.id, shot?.id)
  const activeTask = latestTasks.find(isActiveVideoTask)
  const continuityTask = latestTasks.find((task) => task.continuityStatus)
  const previousShot = previousProductionShot(production, scene, shot)
  const previousVideos = previousShot?.shot.candidates.filter((candidate) => candidate.kind === 'video') ?? []
  const transition = shot?.continuity?.transition ?? 'auto'
  const continuityNeedsAdoptedClip = Boolean(
    previousShot &&
    (transition === 'continuous_action' || transition === 'match_action') &&
    previousVideos.length > 1 &&
    !previousVideos.some((candidate) => candidate.selected)
  )
  const displayedTakeCount = Math.max(takeCount, ...latestTasks.map((task) => task.takeIndex), 1)
  const referenceAssets = referenceAssetIds.flatMap((assetId) => {
    const asset = production.assets.find((item) => item.id === assetId)
    return asset ? [asset] : []
  })
  const temporaryReference = shot?.candidates.find(
    (candidate) =>
      candidate.kind === 'image' &&
      candidate.providerReceipt?.provider === 'manual_upload' &&
      candidate.selected
  ) ?? shot?.candidates.find(
    (candidate) =>
      candidate.kind === 'image' &&
      candidate.providerReceipt?.provider === 'manual_upload'
  )

  React.useEffect(() => {
    const selectedId = props.videoGenerators?.selectedToolsetId
    const currentAvailable = props.videoGenerators?.generators.some((item) => item.id === generatorId && item.available)
    if (!currentAvailable && selectedId) setGeneratorId(selectedId)
  }, [generatorId, props.videoGenerators])

  React.useEffect(() => {
    if (!selectedGenerator) return
    if (!selectedGenerator.models.some((item) => item.id === model)) {
      setModel(selectedGenerator.defaultModel || selectedGenerator.models[0]?.id || '')
    }
    if (!selectedGenerator.resolutions.includes(resolution)) {
      setResolution(selectedGenerator.resolutions[0] ?? '')
    }
    if (!selectedGenerator.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(selectedGenerator.aspectRatios[0] ?? '')
    }
  }, [aspectRatio, model, resolution, selectedGenerator])

  React.useEffect(() => {
    if (!scene) return
    if (!scene.shots.some((item) => item.id === shotId)) setShotId(scene.shots[0]?.id ?? '')
  }, [scene, shotId])

  React.useLayoutEffect(() => {
    const settingsShotKey = `${scene?.id ?? ''}:${shot?.id ?? ''}`
    if (
      settingsShotKey === settingsShotRef.current &&
      settingsDirtyRef.current
    ) return
    applyShotSettings(scene, shot)
    settingsShotRef.current = settingsShotKey
    settingsDirtyRef.current = false
  }, [scene?.id, shot?.id, production, props.videoGenerators?.generators])

  function applyShotSettings(nextScene: Scene | undefined, nextShot: Shot | undefined) {
    const settings = resolveShotGenerationSettings(production, nextScene, nextShot, props.videoGenerators)
    setGeneratorId(settings.generatorId)
    setModel(settings.model)
    setResolution(settings.resolution)
    setAspectRatio(settings.aspectRatio)
    setFps(settings.fps)
    setTakeCount(settings.takeCount)
    setReferenceAssetIds(settings.referenceAssetIds)
    setPrompt(nextShot?.generationPrompt ?? '')
    setIsPlaying(false)
    setPreviewCandidateId(null)
  }

  function selectShot(nextSceneId: string, nextShotId: string) {
    setSceneId(nextSceneId)
    setShotId(nextShotId)
  }

  async function submitShot(draft: ShotDraft) {
    if (!scene) return
    const next = structuredClone(production)
    const id = editing !== 'new' && editing ? editing.id : `shot-${crypto.randomUUID()}`
    if (editing !== 'new' && editing) updateShot(next, scene.id, editing.id, draft)
    else addShot(next, scene.id, id, draft)
    if (await props.onCommitProduction(next, t('changes.shotSaved', { title: draft.title }))) {
      setShotId(id)
      setEditing(null)
    }
  }

  async function saveSettings() {
    if (!scene || !shot) return
    if (!settingsDirtyRef.current) return true
    const next = structuredClone(production)
    const nextShot = next.scenes.find((item) => item.id === scene.id)?.shots.find((item) => item.id === shot.id)
    if (!nextShot) return
    nextShot.generationPrompt = prompt.trim() || null
    nextShot.videoSettings = {
      generatorId: generatorId || null,
      model: model || null,
      resolution: resolution || null,
      aspectRatio: aspectRatio || null,
      fps,
      takeCount,
      referenceAssetIds
    }
    const saved = await props.onCommitProduction(
      next,
      t('changes.shotSettingsSaved', { shot: shot.title })
    )
    if (saved) settingsDirtyRef.current = false
    return saved
  }

  async function submitAsset(draft: AssetDraft) {
    if (!editingAsset) return
    const next = structuredClone(production)
    if (!updateAsset(next, editingAsset.id, draft)) return
    if (await props.onCommitProduction(
      next,
      t('changes.assetSaved', { title: draft.name })
    )) setEditingAsset(null)
  }

  async function confirmDelete() {
    if (!scene || !deleting) return
    const next = structuredClone(production)
    if (!deleteShot(next, scene.id, deleting.id)) return
    if (await props.onCommitProduction(next, t('changes.shotDeleted'))) {
      setDeleting(null)
      setShotId(next.scenes.find((item) => item.id === scene.id)?.shots[0]?.id ?? '')
    }
  }

  async function generate(scope?: string) {
    if (!scene || !shot || !selectedGenerator || activeTask) return
    const saved = await saveSettings()
    if (!saved) return
    props.onGenerateTakes({ sceneId: scene.id, shotId: shot.id, prompt, toolsetId: selectedGenerator.id, model, resolution, aspectRatio, fps, takeCount, referenceAssetIds, redoScope: scope })
  }

  function uploadAssetReference(asset: Asset) {
    pendingUploadAssetRef.current = asset
    assetUploadRef.current?.click()
  }

  function openReferencePicker() {
    setReferenceDraftIds(referenceAssetIds)
    setReferencePickerOpen(true)
  }

  function toggleReferenceAsset(assetId: string) {
    setReferenceDraftIds((current) => current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId])
  }

  function handleAssetUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const asset = pendingUploadAssetRef.current
    if (file && asset) props.onUploadAsset(asset, file)
    event.target.value = ''
    pendingUploadAssetRef.current = null
  }

  function handleShotReferenceUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file && scene && shot) {
      props.onUploadShotReference(scene.id, shot.id, prompt, file)
    }
    event.target.value = ''
  }

  function changeGenerator(nextId: string) {
    const generator = props.videoGenerators?.generators.find((item) => item.id === nextId)
    if (!generator?.available) return
    setGeneratorId(nextId)
    setModel(generator.defaultModel || generator.models[0]?.id || '')
    setResolution(generator.resolutions[0] ?? '')
    setAspectRatio(generator.aspectRatios[0] ?? '')
    settingsDirtyRef.current = true
    props.onSetVideoGenerator(nextId)
  }

  return (
    <StudioPanelLayout storageKey="storyboard" leftLabel={t('director.nav.storyboard')} rightLabel={t('director.storyboard.settings')} className="bg-studio-canvas text-studio-ink" testId="director-storyboard-page">
      <aside className="row-start-1 flex min-h-0 flex-col border-r border-studio-line bg-studio-paper/80">
        <header className="border-b border-studio-line p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-studio-muted">{t('director.nav.storyboard')}</p><strong className="font-display text-xl">{production.counts.shots}</strong></div><button type="button" className="grid size-9 place-items-center rounded-md bg-studio-brass text-white" aria-label={t('director.crud.newShot')} onClick={() => setEditing('new')}><Plus className="size-4" /></button></div><p className="mt-2 text-xs text-studio-muted">{production.totalDurationSeconds}s · {production.scenes.length} {t('production.scenes')}</p></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {production.scenes.map((item) => <SceneShots key={item.id} scene={item} selectedSceneId={scene?.id ?? ''} selectedShotId={shot?.id ?? ''} onSelect={selectShot} onEdit={(target) => setEditing(target)} onDelete={(target) => setDeleting(target)} t={t} />)}
        </div>
      </aside>

      <section className="row-start-1 min-w-0 overflow-y-auto">
        {scene && shot ? <>
          <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-studio-line bg-studio-canvas/95 px-5 backdrop-blur"><span className="rounded bg-studio-ink px-2 py-1 text-xs font-bold text-white">{displayShotCode(shot, scene, production)}</span><div className="min-w-0 flex-1"><h2 className="truncate font-display text-2xl font-bold">{shot.title}</h2><p className="text-xs text-studio-muted">{scene.title} · {t('director.storyboard.duration', { seconds: shot.durationSeconds })}</p></div><Button variant="outline" size="sm" onClick={() => setEditing(shot)}><MoreHorizontal aria-hidden="true" />{t('actions.edit')}</Button></header>
          <div className="grid gap-5 p-5">
            <section className="grid grid-cols-[1.3fr_0.7fr] gap-4">
              <figure className="relative overflow-hidden rounded-xl border border-studio-line bg-black shadow-lg">
                {previewVideoUrl ? <video key={previewCandidate?.id} data-testid="director-main-video-preview" className="aspect-video h-full w-full object-cover" src={previewVideoUrl} controls crossOrigin="use-credentials" playsInline preload="metadata" autoPlay={isPlaying} onLoadedMetadata={(event) => primeVideoPreview(event.currentTarget)} onLoadedData={(event) => primeVideoPreview(event.currentTarget)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} /> : null}
                {!previewVideoUrl ? <div data-testid="director-storyboard-empty-preview" className="grid aspect-video h-full min-h-72 w-full place-items-center bg-studio-ink text-center text-white"><div className="grid max-w-sm place-items-center gap-3 p-8"><span className="grid size-14 place-items-center rounded-full border border-white/20 bg-white/5"><Play className="size-6 opacity-60" aria-hidden="true" /></span><strong className="text-sm">{t('director.storyboard.previewPendingTitle')}</strong><p className="m-0 text-xs leading-5 text-white/60">{t('director.storyboard.previewPendingHelp')}</p></div></div> : null}
              </figure>
              <div className="grid content-start gap-3 rounded-xl border border-studio-line bg-studio-paper p-4 shadow-sm"><ShotCopy title={t('director.storyboard.intent')}>{shot.composition}</ShotCopy><ShotCopy title={t('director.storyboard.actionPerformance')}>{shot.action}</ShotCopy><ShotCopy title={t('director.storyboard.cameraLanguage')}>{shot.camera}</ShotCopy><ShotCopy title={t('director.storyboard.emotionRhythm')}>{shot.emotion || '—'}</ShotCopy></div>
            </section>
            <section className="rounded-xl border border-studio-line bg-studio-paper p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold">{t('director.storyboard.compare', { count: displayedTakeCount })}</h3>
                  <p className="text-xs text-studio-muted">{takeSummary(videoCandidates.length, latestTasks, t)}</p>
                </div>
                <Button size="sm" disabled={busy || generating || Boolean(activeTask) || !selectedGenerator || continuityNeedsAdoptedClip} onClick={() => generate()}>
                  {activeTask ? videoTaskStatusLabel(activeTask.status, t) : t('director.storyboard.generateTakes', { count: takeCount })}
                </Button>
              </div>
              <div className={`grid gap-3 ${takeGridClass(displayedTakeCount)}`}>
                {Array.from({ length: displayedTakeCount }, (_, index) => {
                  const task = latestTasks.find((item) => item.takeIndex === index + 1)
                  const candidate = candidateForTake(videoCandidates, task, index)
                  return <TakeCard key={task?.id ?? candidate?.id ?? index} index={index} task={task} candidate={candidate} selected={candidate?.selected ?? false} automatic={videoCandidates.length === 1 && Boolean(candidate)} previewed={previewCandidate?.id === candidate?.id} onPreview={() => { if (candidate) { setPreviewCandidateId(candidate.id); setIsPlaying(false) } }} onSelect={() => { if (candidate) props.onSelectTake(scene.id, shot.id, candidate.id) }} onCancel={() => task && props.onCancelVideoTask(task.id)} onRetry={() => task && props.onRetryVideoTask(task.id)} t={t} />
                })}
              </div>
            </section>
          </div>
        </> : null}
      </section>

      <aside className="row-start-1 min-h-0 overflow-y-auto border-l border-studio-line bg-studio-paper/90 p-4">
        {shot ? <div className="grid gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-studio-muted">{t('director.storyboard.settings')}</p><h3 className="mt-1 font-display text-xl font-bold">{shot.title}</h3></div>
          <section className="grid gap-3 rounded-lg border border-studio-line bg-studio-canvas p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-studio-muted">{t('director.storyboard.references')}</span><Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={openReferencePicker}><MoreHorizontal aria-hidden="true" />{t('director.storyboard.chooseReferences')}</Button></div>
            {referenceAssets.length ? <div className="grid grid-cols-2 gap-2">{referenceAssets.map((asset) => <ReferenceAssetCard key={asset.id} asset={asset} t={t} onEdit={() => setEditingAsset(asset)} onUpload={() => uploadAssetReference(asset)} />)}</div> : <button type="button" className="grid min-h-20 place-items-center gap-1 rounded-md border border-dashed border-studio-line px-3 py-4 text-center text-xs text-studio-muted hover:border-studio-brass hover:text-studio-ink" onClick={openReferencePicker}><ImageIcon className="size-5" aria-hidden="true" />{t('director.storyboard.noReferences')}</button>}
            <button type="button" className="flex min-h-12 items-center gap-3 rounded-md border border-dashed border-studio-line bg-studio-paper px-3 py-2 text-left hover:border-studio-brass" onClick={() => shotReferenceUploadRef.current?.click()}>
              {temporaryReference && candidateImage(temporaryReference) ? <img className="size-10 rounded object-cover" crossOrigin="use-credentials" src={candidateImage(temporaryReference) ?? ''} alt="" /> : <span className="grid size-10 place-items-center rounded bg-studio-panel text-studio-muted"><Upload className="size-4" aria-hidden="true" /></span>}
              <span className="min-w-0 flex-1"><strong className="block text-xs">{t('director.storyboard.temporaryReference')}</strong><small className="block truncate text-[10px] text-studio-muted">{temporaryReference ? t('director.storyboard.temporaryReferenceReady') : t('director.storyboard.temporaryReferenceHelp')}</small></span>
            </button>
          </section>
          <section className="grid gap-2 rounded-lg border border-studio-line bg-studio-canvas p-3" data-testid="director-shot-continuity">
            <div className="flex items-center justify-between gap-2"><strong className="text-xs">{t('director.continuity.title')}</strong><span className="text-[10px] font-semibold text-studio-brass">{t(`director.continuity.transition.${transition}`)}</span></div>
            <p className="m-0 text-xs text-studio-muted">{previousShot ? t('director.continuity.previousShot', { shot: previousShot.shot.title }) : t('director.continuity.noPreviousShot')}</p>
            {shot.continuity?.startState?.summary ? <p className="m-0 rounded border border-studio-line bg-studio-paper px-2 py-1.5 text-[11px]"><span className="font-semibold text-studio-muted">{t('director.continuity.startState')}：</span>{shot.continuity.startState.summary}</p> : null}
            {continuityNeedsAdoptedClip ? <p className="m-0 text-[11px] leading-4 text-amber-700">{t('director.continuity.waitingSource')}</p> : continuityTask?.continuityStrength === 'first_frame' ? <p className="m-0 text-[11px] leading-4 text-emerald-700">{t('director.continuity.frameReady')}</p> : previousShot && ['auto', 'continuous_action', 'match_action'].includes(transition) ? <p className="m-0 text-[11px] leading-4 text-studio-muted">{t('director.continuity.promptOnly')}</p> : null}
            {continuityTask?.continuityRisks?.[0] ? <p className="m-0 text-[11px] leading-4 text-amber-700">{t('director.continuity.risk', { risk: continuityTask.continuityRisks[0] })}</p> : null}
          </section>
          <StoryboardField label={t('director.storyboard.generator')}><DirectorSelect ariaLabel={t('director.storyboard.generator')} value={generatorId} onValueChange={changeGenerator} placeholder={t('director.storyboard.chooseGenerator')} options={generatorOptions(props.videoGenerators, t)} /></StoryboardField>
          <StoryboardField label={t('director.storyboard.model')}><DirectorSelect ariaLabel={t('director.storyboard.model')} value={model} onValueChange={(value) => { setModel(value); settingsDirtyRef.current = true }} disabled={!selectedGenerator} options={(selectedGenerator?.models ?? []).map((item) => ({ value: item.id, label: item.label }))} /></StoryboardField>
          <div className="grid grid-cols-2 gap-2"><StoryboardField label={t('director.storyboard.resolution')}><DirectorSelect ariaLabel={t('director.storyboard.resolution')} value={resolution} onValueChange={(value) => { setResolution(value); settingsDirtyRef.current = true }} disabled={!selectedGenerator} options={(selectedGenerator?.resolutions ?? []).map((value) => ({ value, label: value }))} /></StoryboardField><StoryboardField label={t('director.storyboard.aspectRatio')}><DirectorSelect ariaLabel={t('director.storyboard.aspectRatio')} value={aspectRatio} onValueChange={(value) => { setAspectRatio(value); settingsDirtyRef.current = true }} disabled={!selectedGenerator} options={(selectedGenerator?.aspectRatios ?? []).map((value) => ({ value, label: value }))} /></StoryboardField></div>
          <div className="grid grid-cols-2 gap-2"><StoryboardField label={t('director.storyboard.fps')}><DirectorSelect ariaLabel={t('director.storyboard.fps')} value={String(fps)} onValueChange={(value) => { setFps(Number(value)); settingsDirtyRef.current = true }} options={[24, 25, 30].map((value) => ({ value: String(value), label: String(value) }))} /></StoryboardField><StoryboardField label={t('director.storyboard.takeCount')}><DirectorSelect ariaLabel={t('director.storyboard.takeCount')} value={String(takeCount)} onValueChange={(value) => { setTakeCount(Number(value)); settingsDirtyRef.current = true }} options={[1, 2, 4].map((value) => ({ value: String(value), label: String(value) }))} /></StoryboardField></div>
          <StoryboardField label={t('director.storyboard.prompt')}><Textarea className="min-h-36 resize-y border-studio-line bg-studio-canvas p-3 font-mono text-xs leading-5 text-studio-ink focus-visible:border-studio-brass focus-visible:ring-studio-brass/25" maxLength={500} value={prompt} placeholder={t('director.storyboard.promptPlaceholder')} aria-label={t('director.storyboard.prompt')} onChange={(event) => { setPrompt(event.target.value); settingsDirtyRef.current = true }} /><span className="text-right text-[10px] font-normal">{prompt.length}/500</span></StoryboardField>
          <Button variant="outline" onClick={() => void saveSettings()} disabled={busy}><Save aria-hidden="true" />{t('actions.save')}</Button>
          <div className="grid gap-2 rounded-lg border border-studio-line bg-studio-canvas p-3"><StoryboardField label={t('director.storyboard.redo')}><DirectorSelect ariaLabel={t('director.storyboard.redo')} value={redoScope} onValueChange={setRedoScope} options={[{ value: 'performance', label: t('director.storyboard.actionPerformance') }, { value: 'camera', label: t('director.storyboard.cameraLanguage') }, { value: 'lighting', label: t('director.crud.lighting') }]} /></StoryboardField><Button variant="outline" disabled={busy || generating || Boolean(activeTask) || !selectedGenerator || continuityNeedsAdoptedClip} onClick={() => generate(redoScope)}><Redo2 aria-hidden="true" />{t('director.storyboard.redo')}</Button></div>
          <Button className="w-full" disabled={busy || generating || Boolean(activeTask) || !selectedGenerator || continuityNeedsAdoptedClip} onClick={() => generate()}>{activeTask ? videoTaskStatusLabel(activeTask.status, t) : t('director.storyboard.generateTakes', { count: takeCount })}</Button>
        </div> : null}
      </aside>

      <footer className="col-span-3 row-start-2 flex items-center justify-between border-t border-studio-line bg-studio-paper px-5 text-xs text-studio-muted"><span>{scene?.title ?? '—'} · {shot?.title ?? '—'}</span><span>{activeTask ? videoTaskStatusLabel(activeTask.status, t) : t('director.storyboard.waiting')}</span></footer>

      <ShotDialog open={editing !== null} busy={busy} t={t} shot={editing === 'new' ? null : editing} characters={production.characters} onOpenChange={(open) => !open && setEditing(null)} onSubmit={(draft) => void submitShot(draft)} />
      <ReferencePickerDialog open={referencePickerOpen} assets={production.assets.filter((asset) => asset.kind === 'character' || asset.kind === 'location')} selectedIds={referenceDraftIds} t={t} onToggle={toggleReferenceAsset} onOpenChange={setReferencePickerOpen} onConfirm={() => { setReferenceAssetIds(referenceDraftIds); settingsDirtyRef.current = true; setReferencePickerOpen(false) }} />
      <AssetDialog open={Boolean(editingAsset)} busy={busy} t={t} asset={editingAsset} initialKind={editingAsset?.kind ?? 'character'} voiceReference={editingAsset ? compactVoiceReference(production.characters.find((character) => character.name === editingAsset.name)?.voiceReference) : null} onOpenChange={(open) => !open && setEditingAsset(null)} onSubmit={(draft) => void submitAsset(draft)} />
      <DeleteEntityDialog open={Boolean(deleting)} busy={busy} t={t} title={t('director.crud.deleteShot')} description={t('director.crud.deleteShotHelp')} onOpenChange={(open) => !open && setDeleting(null)} onConfirm={() => void confirmDelete()} />
      <input ref={assetUploadRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleAssetUpload} />
      <input ref={shotReferenceUploadRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleShotReferenceUpload} />
    </StudioPanelLayout>
  )
}

function previousProductionShot(production: ProductionView, scene: Scene | undefined, shot: Shot | undefined) {
  if (!scene || !shot) return null
  const explicitId = shot.continuity?.fromShotId
  if (explicitId) {
    for (const item of production.scenes) {
      const found = item.shots.find((candidate) => candidate.id === explicitId)
      if (found && found.id !== shot.id) return { scene: item, shot: found }
    }
  }
  const shotIndex = scene.shots.findIndex((candidate) => candidate.id === shot.id)
  if (shotIndex > 0) return { scene, shot: scene.shots[shotIndex - 1] }
  const sceneIndex = production.scenes.findIndex((candidate) => candidate.id === scene.id)
  const previousScene = production.scenes[sceneIndex - 1]
  const previousShot = previousScene?.shots.at(-1)
  return previousScene && previousShot ? { scene: previousScene, shot: previousShot } : null
}

function SceneShots(props: { scene: Scene; selectedSceneId: string; selectedShotId: string; onSelect: (sceneId: string, shotId: string) => void; onEdit: (shot: Shot) => void; onDelete: (shot: Shot) => void; t: DirectorTranslator }) {
  return <section className="mb-3 overflow-hidden rounded-lg border border-studio-line bg-studio-paper"><header className="flex items-center justify-between bg-studio-canvas px-3 py-2"><span><b className="mr-2 text-xs text-studio-brass">{props.t('director.storyboard.scene', { number: props.scene.order })}</b><strong className="text-xs">{props.scene.title}</strong></span><em className="text-[10px] not-italic text-studio-muted">{props.scene.shots.length}</em></header><div className="p-1.5">{props.scene.shots.map((shot, index) => <div key={shot.id} className={`group flex items-center gap-1 rounded-md ${props.selectedSceneId === props.scene.id && props.selectedShotId === shot.id ? 'bg-studio-brass text-white' : 'hover:bg-studio-canvas'}`}><button type="button" className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => props.onSelect(props.scene.id, shot.id)}><span className="mr-2 text-[10px] opacity-70">S{props.scene.order}{index + 1}</span><strong className="text-xs">{shot.title}</strong></button><button type="button" className="p-1 opacity-60 hover:opacity-100" aria-label={props.t('actions.edit')} onClick={() => props.onEdit(shot)}><MoreHorizontal className="size-3" /></button><button type="button" className="p-1 opacity-60 hover:opacity-100 disabled:opacity-20" disabled={props.scene.shots.length <= 1} aria-label={props.t('actions.delete')} onClick={() => props.onDelete(shot)}><Trash2 className="size-3" /></button></div>)}</div></section>
}

function ShotCopy(props: { title: string; children: React.ReactNode }) { return <section className="border-b border-studio-line pb-3 last:border-0"><h3 className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">{props.title}</h3><p className="mt-1 text-sm leading-6">{props.children}</p></section> }

function TakeCard(props: { index: number; task?: VideoGenerationTask; candidate?: Candidate; selected: boolean; automatic: boolean; previewed: boolean; onPreview: () => void; onSelect: () => void; onCancel: () => void; onRetry: () => void; t: DirectorTranslator }) {
  const videoUrl = playableVideoUrl(props.candidate)
  const active = props.task ? isActiveVideoTask(props.task) : false
  const retryable = Boolean(props.task?.recoverable && ['failed', 'cancelled', 'submission_unknown'].includes(props.task.status))
  const adopted = props.selected || props.automatic
  return <article className={`overflow-hidden rounded-lg border bg-studio-canvas ${adopted ? 'border-2 border-studio-brass' : props.previewed ? 'border-studio-ink ring-2 ring-studio-ink/15' : 'border-studio-line'}`}>
    <button type="button" className="relative block w-full overflow-hidden bg-black text-white disabled:cursor-default" disabled={!props.candidate} aria-label={props.t('director.storyboard.candidateLabel', { number: props.index + 1 })} onClick={props.onPreview}>
      {videoUrl ? <video key={props.candidate?.id} data-testid={`director-take-video-${props.index + 1}`} className="aspect-video w-full object-cover" src={videoUrl} crossOrigin="use-credentials" muted playsInline preload="metadata" onLoadedMetadata={(event) => primeVideoPreview(event.currentTarget)} onLoadedData={(event) => primeVideoPreview(event.currentTarget)} /> : <span className="grid aspect-video w-full place-items-center bg-studio-ink/90 px-4 text-center"><span><Play className="mx-auto size-6 opacity-45" aria-hidden="true" /><span className="mt-2 block text-[11px] text-white/70">{props.task ? videoTaskStatusLabel(props.task.status, props.t) : props.t('director.storyboard.notGenerated')}</span></span></span>}
      {adopted ? <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-studio-brass text-white"><Check className="size-3.5" /></span> : null}
    </button>
    <div className="grid gap-2 p-2">
      <div className="flex items-center justify-between gap-2"><strong className="text-xs">{props.t('director.storyboard.candidateLabel', { number: props.index + 1 })}</strong>{props.task ? <span className="truncate text-[9px] font-semibold text-studio-muted">{videoTaskStatusLabel(props.task.status, props.t)}</span> : props.index === 0 ? <span className="text-[9px] font-bold text-studio-brass">{props.t('director.storyboard.recommended')}</span> : null}</div>
      {active && props.task ? <div className="h-1 overflow-hidden rounded bg-studio-line"><div className="h-full bg-studio-brass transition-[width]" style={{ width: `${Math.max(6, Math.min(100, props.task.progress))}%` }} /></div> : null}
      {props.task?.failureMessage ? <p className="m-0 line-clamp-2 text-[10px] leading-4 text-red-700">{businessFailureMessage(props.task, props.t)}</p> : null}
      {props.task?.upstreamMayContinue ? <p className="m-0 text-[10px] leading-4 text-studio-muted">{props.t('director.storyboard.upstreamMayContinue')}</p> : null}
      {active ? <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={props.onCancel}>{props.t('director.storyboard.stopTracking')}</Button> : retryable ? <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={props.onRetry}><Redo2 aria-hidden="true" />{props.t('director.storyboard.retry')}</Button> : props.automatic ? <div className="grid h-7 place-items-center rounded-md border border-studio-line bg-studio-paper text-[10px] font-semibold text-studio-brass">{props.t('director.storyboard.automaticUse')}</div> : <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" disabled={!props.candidate} onClick={props.onSelect}>{props.selected ? props.t('director.assets.locked') : props.t('director.storyboard.lockTake')}</Button>}
    </div>
  </article>
}

function ReferenceAssetCard(props: { asset: Asset; t: DirectorTranslator; onEdit: () => void; onUpload: () => void }) {
  const image = assetImage(props.asset)
  return <article className="group relative grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-2 rounded-md border border-studio-line bg-studio-paper p-2">
    {image ? <img className="size-10 rounded object-cover" crossOrigin="use-credentials" src={image} alt={props.asset.name} /> : <span className="grid size-10 place-items-center rounded bg-studio-panel text-studio-muted"><ImageIcon className="size-4" aria-hidden="true" /></span>}
    <span className="min-w-0 pr-9"><strong className="block truncate text-xs">{props.asset.name}</strong><small className="text-[9px] text-studio-muted">{props.t(props.asset.kind === 'location' ? 'director.assets.locations' : 'director.assets.characters')}</small></span>
    <span className="absolute right-1 top-1 grid gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"><button type="button" className="grid size-5 place-items-center rounded bg-studio-paper shadow" aria-label={props.t('actions.edit')} onClick={props.onEdit}><MoreHorizontal className="size-3" /></button><button type="button" className="grid size-5 place-items-center rounded bg-studio-paper shadow" aria-label={props.t('director.assets.upload')} onClick={props.onUpload}><Upload className="size-3" /></button></span>
  </article>
}

function ReferencePickerDialog(props: { open: boolean; assets: Asset[]; selectedIds: string[]; t: DirectorTranslator; onToggle: (assetId: string) => void; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  const characters = props.assets.filter((asset) => asset.kind === 'character')
  const locations = props.assets.filter((asset) => asset.kind === 'location')
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent className="max-w-2xl border-studio-line bg-studio-paper text-studio-ink"><DialogHeader><DialogTitle>{props.t('director.storyboard.referencePickerTitle')}</DialogTitle><DialogDescription>{props.t('director.storyboard.referencePickerHelp')}</DialogDescription></DialogHeader><div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1"><ReferenceAssetGroup title={props.t('director.assets.characters')} assets={characters} selectedIds={props.selectedIds} t={props.t} onToggle={props.onToggle} /><ReferenceAssetGroup title={props.t('director.assets.locations')} assets={locations} selectedIds={props.selectedIds} t={props.t} onToggle={props.onToggle} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>{props.t('actions.cancel')}</Button><Button type="button" onClick={props.onConfirm}>{props.t('actions.confirm')}</Button></DialogFooter></DialogContent></Dialog>
}

function ReferenceAssetGroup(props: { title: string; assets: Asset[]; selectedIds: string[]; t: DirectorTranslator; onToggle: (assetId: string) => void }) {
  return <section><h3 className="mb-2 text-xs font-bold text-studio-muted">{props.title}</h3>{props.assets.length ? <div className="grid grid-cols-2 gap-2">{props.assets.map((asset) => { const selected = props.selectedIds.includes(asset.id); const image = assetImage(asset); return <button key={asset.id} type="button" className={`grid grid-cols-[48px_minmax(0,1fr)_20px] items-center gap-3 rounded-md border p-2 text-left ${selected ? 'border-studio-brass bg-amber-50' : 'border-studio-line bg-studio-canvas hover:border-studio-brass/60'}`} aria-pressed={selected} onClick={() => props.onToggle(asset.id)}>{image ? <img className="size-12 rounded object-cover" crossOrigin="use-credentials" src={image} alt="" /> : <span className="grid size-12 place-items-center rounded bg-studio-panel text-studio-muted"><ImageIcon className="size-4" /></span>}<span className="min-w-0"><strong className="block truncate text-sm">{asset.name}</strong><small className="line-clamp-2 text-[10px] leading-4 text-studio-muted">{asset.description}</small></span><span className={`grid size-5 place-items-center rounded border ${selected ? 'border-studio-brass bg-studio-brass text-white' : 'border-studio-line'}`}>{selected ? <Check className="size-3" /> : null}</span></button>})}</div> : <p className="rounded-md border border-dashed border-studio-line p-4 text-center text-xs text-studio-muted">{props.t('director.storyboard.noReferenceAssets')}</p>}</section>
}

function StoryboardField(props: { label: string; children: React.ReactNode }) { return <div className="grid gap-1.5 text-xs font-semibold text-studio-muted"><span>{props.label}</span>{props.children}</div> }

function takeGridClass(takeCount: number) {
  if (takeCount === 1) return 'max-w-xs grid-cols-1'
  if (takeCount === 2) return 'grid-cols-2'
  return 'grid-cols-4'
}

function generatorOptions(catalog: VideoGeneratorCatalog | null, t: DirectorTranslator) {
  return (catalog?.generators ?? []).map((generator) => ({
    value: generator.id,
    label: generator.available
      ? generator.displayName
      : `${generator.displayName} · ${t('director.storyboard.workspaceNotConfigured')}`,
    disabled: !generator.available
  }))
}

function latestShotTasks(tasks: VideoGenerationTask[], sceneId?: string, shotId?: string) {
  const latest = new Map<number, VideoGenerationTask>()
  for (const task of tasks) {
    if (task.sceneId !== sceneId || task.shotId !== shotId || latest.has(task.takeIndex)) continue
    latest.set(task.takeIndex, task)
  }
  return [...latest.values()].sort((left, right) => left.takeIndex - right.takeIndex)
}

function candidateForTake(candidates: Candidate[], task: VideoGenerationTask | undefined, index: number) {
  if (task) {
    return task.resultCandidateId
      ? candidates.find((candidate) => candidate.id === task.resultCandidateId)
      : undefined
  }
  return candidates[index]
}

function takeSummary(candidateCount: number, tasks: VideoGenerationTask[], t: DirectorTranslator) {
  const active = tasks.filter(isActiveVideoTask).length
  if (active) return t('director.storyboard.activeCount', { count: active })
  if (candidateCount) return t('director.storyboard.readyCount', { count: candidateCount })
  return t('director.storyboard.waiting')
}

function videoTaskStatusLabel(status: VideoTaskStatus, t: DirectorTranslator) {
  const keys: Record<VideoTaskStatus, Parameters<DirectorTranslator>[0]> = {
    queued: 'director.storyboard.status.queued',
    submitting: 'director.storyboard.status.submitting',
    generating: 'director.storyboard.status.generating',
    finalizing: 'director.storyboard.status.finalizing',
    completed: 'director.storyboard.status.completed',
    failed: 'director.storyboard.status.failed',
    cancelled: 'director.storyboard.status.cancelled',
    stale: 'director.storyboard.status.stale',
    submission_unknown: 'director.storyboard.status.submissionUnknown'
  }
  return t(keys[status])
}

function businessFailureMessage(task: VideoGenerationTask, t: DirectorTranslator) {
  if (task.status === 'stale' || task.failureCode === 'source_changed') return t('director.storyboard.sourceChanged')
  if (task.failureCode === 'submission_rejected' && task.failureMessage) {
    return t('director.storyboard.submissionRejectedHelp', { message: task.failureMessage })
  }
  if (task.status === 'submission_unknown') return t('director.storyboard.submissionUnknownHelp')
  return t('director.storyboard.generationFailedHelp')
}

function assetImage(asset: Asset) {
  const candidate = asset.candidates.find((item) => item.kind === 'image' && item.selected)
    ?? asset.candidates.find((item) => item.kind === 'image')
  return candidateImage(candidate)
}

function candidateImage(candidate?: Pick<Candidate, 'fileUrl'>) {
  const url = candidate?.fileUrl?.trim()
  return url && !(url.startsWith('data:image') && url.length < 500) ? url : null
}

function displayShotCode(shot: Shot, scene: Scene, production: ProductionView) { const sceneIndex = production.scenes.findIndex((item) => item.id === scene.id); const shotIndex = scene.shots.findIndex((item) => item.id === shot.id); return `S${sceneIndex + 1}${shotIndex + 1}` }
