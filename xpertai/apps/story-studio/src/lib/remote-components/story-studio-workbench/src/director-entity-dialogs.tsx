import * as React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileAudio2,
  Input,
  Textarea,
  Trash2,
  Upload
} from '@xpert-ai/plugin-shadcn-ui'
import { DirectorSelect } from './director-form-controls'
import {
  compactVoiceReference,
  hasPartialVoiceReference,
  updateVoiceReferenceDraft,
  type VoiceReferenceLike
} from '../../../voice-reference.js'
import type {
  Asset,
  Character,
  Episode,
  Scene,
  Shot
} from './production-data'
import {
  createEmptyAssetDetails,
  type AssetDraft,
  type EpisodeDraft,
  type SceneDraft,
  type ShotDraft
} from './director-production-crud'
import type { DirectorTranslator } from './director-types'
import { VOICE_REFERENCE_ACCEPT } from './asset-bible-actions'

const h: typeof React.createElement = React.createElement
const fieldClass =
  'border-studio-line bg-studio-paper text-studio-ink focus-visible:ring-studio-brass'
const labelClass = 'grid gap-1.5 text-xs font-semibold text-studio-muted'

type CommonDialogProps = {
  open: boolean
  busy: boolean
  t: DirectorTranslator
  onOpenChange: (open: boolean) => void
}

export function EpisodeDialog(
  props: CommonDialogProps & {
    episode?: Episode | null
    onSubmit: (draft: EpisodeDraft) => void
  }
) {
  const [draft, setDraft] = React.useState<EpisodeDraft>(() =>
    episodeDraft(props.episode, props.t)
  )
  React.useEffect(() => {
    if (props.open) setDraft(episodeDraft(props.episode, props.t))
  }, [props.open, props.episode, props.t])
  const valid =
    draft.title.trim() && draft.summary.trim() && draft.script.trim()

  return (
    <EntityDialogFrame
      {...props}
      title={props.episode ? props.t('director.crud.editEpisode') : props.t('director.crud.newEpisode')}
      description={props.t('director.crud.episodeHelp')}
      valid={Boolean(valid)}
      onSubmit={() => props.onSubmit(draft)}
    >
      <FormField label={props.t('fields.title')}>
        <Input className={fieldClass} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </FormField>
      <FormField label={props.t('editor.summary')}>
        <Textarea className={`${fieldClass} min-h-20`} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
      </FormField>
      <FormField label={props.t('editor.script')}>
        <Textarea className={`${fieldClass} min-h-52 font-mono leading-7`} value={draft.script} onChange={(event) => setDraft({ ...draft, script: event.target.value })} />
      </FormField>
      <FormField label={props.t('fields.duration')}>
        <Input className={fieldClass} type="number" min={5} max={1800} value={draft.targetDurationSeconds ?? 60} onChange={(event) => setDraft({ ...draft, targetDurationSeconds: Number(event.target.value) })} />
      </FormField>
    </EntityDialogFrame>
  )
}

export function SceneDialog(
  props: CommonDialogProps & {
    scene?: Scene | null
    episodes: Episode[]
    onSubmit: (draft: SceneDraft) => void
  }
) {
  const [draft, setDraft] = React.useState<SceneDraft>(() =>
    sceneDraft(props.scene, props.episodes, props.t)
  )
  React.useEffect(() => {
    if (props.open) setDraft(sceneDraft(props.scene, props.episodes, props.t))
  }, [props.open, props.scene, props.episodes, props.t])
  const valid = draft.title.trim() && draft.summary.trim()

  return (
    <EntityDialogFrame
      {...props}
      title={props.scene ? props.t('director.crud.editScene') : props.t('director.crud.newScene')}
      description={props.t('director.crud.sceneHelp')}
      valid={Boolean(valid)}
      onSubmit={() => props.onSubmit(draft)}
    >
      <FormField label={props.t('director.crud.episode')}>
        <DirectorSelect ariaLabel={props.t('director.crud.episode')} value={draft.episodeId ?? ''} onValueChange={(value) => setDraft({ ...draft, episodeId: value || null })} options={[{ value: '', label: props.t('director.crud.unassigned') }, ...props.episodes.map((episode) => ({ value: episode.id, label: `${episode.order}. ${episode.title}` }))]} />
      </FormField>
      <FormField label={props.t('fields.title')}>
        <Input className={fieldClass} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </FormField>
      <FormField label={props.t('editor.summary')}>
        <Textarea className={`${fieldClass} min-h-24`} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label={props.t('editor.location')}>
          <Input className={fieldClass} value={draft.location ?? ''} onChange={(event) => setDraft({ ...draft, location: event.target.value || null })} />
        </FormField>
        <FormField label={props.t('editor.timeOfDay')}>
          <Input className={fieldClass} value={draft.timeOfDay ?? ''} onChange={(event) => setDraft({ ...draft, timeOfDay: event.target.value || null })} />
        </FormField>
      </div>
    </EntityDialogFrame>
  )
}

export function ShotDialog(
  props: CommonDialogProps & {
    shot?: Shot | null
    characters: Character[]
    onSubmit: (draft: ShotDraft) => void
  }
) {
  const [draft, setDraft] = React.useState<ShotDraft>(() =>
    shotDraft(props.shot, props.t)
  )
  React.useEffect(() => {
    if (props.open) setDraft(shotDraft(props.shot, props.t))
  }, [props.open, props.shot, props.t])
  const valid =
    draft.title.trim() &&
    draft.composition.trim() &&
    draft.action.trim() &&
    draft.camera.trim() &&
    draft.durationSeconds >= 1 &&
    draft.durationSeconds <= 20

  return (
    <EntityDialogFrame
      {...props}
      title={props.shot ? props.t('director.crud.editShot') : props.t('director.crud.newShot')}
      description={props.t('director.crud.shotHelp')}
      valid={Boolean(valid)}
      onSubmit={() => props.onSubmit(draft)}
      wide
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label={props.t('fields.title')}><Input className={fieldClass} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></FormField>
        <FormField label={props.t('fields.duration')}><Input className={fieldClass} type="number" min={1} max={20} value={draft.durationSeconds} onChange={(event) => setDraft({ ...draft, durationSeconds: Number(event.target.value) })} /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label={props.t('editor.composition')}><Textarea className={`${fieldClass} min-h-24`} value={draft.composition} onChange={(event) => setDraft({ ...draft, composition: event.target.value })} /></FormField>
        <FormField label={props.t('editor.action')}><Textarea className={`${fieldClass} min-h-24`} value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })} /></FormField>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <FormField label={props.t('storyboard.camera')}><Input className={fieldClass} value={draft.camera} onChange={(event) => setDraft({ ...draft, camera: event.target.value })} /></FormField>
        <FormField label={props.t('director.crud.lens')}><Input className={fieldClass} value={draft.lens ?? ''} onChange={(event) => setDraft({ ...draft, lens: event.target.value || null })} /></FormField>
        <FormField label={props.t('director.crud.emotion')}><Input className={fieldClass} value={draft.emotion ?? ''} onChange={(event) => setDraft({ ...draft, emotion: event.target.value || null })} /></FormField>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <FormField label={props.t('director.crud.lighting')}><Input className={fieldClass} value={draft.lighting ?? ''} onChange={(event) => setDraft({ ...draft, lighting: event.target.value || null })} /></FormField>
        <FormField label={props.t('director.crud.colorTone')}><Input className={fieldClass} value={draft.colorTone ?? ''} onChange={(event) => setDraft({ ...draft, colorTone: event.target.value || null })} /></FormField>
        <FormField label={props.t('director.crud.weather')}><Input className={fieldClass} value={draft.weather ?? ''} onChange={(event) => setDraft({ ...draft, weather: event.target.value || null })} /></FormField>
      </div>
      <FormField label={props.t('storyboard.dialogue')}>
        <Textarea className={`${fieldClass} min-h-20`} value={draft.dialogue ?? ''} onChange={(event) => setDraft({ ...draft, dialogue: event.target.value || null })} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label={props.t('director.crud.speaker')}>
          <DirectorSelect ariaLabel={props.t('director.crud.speaker')} value={draft.dialogueSpeakerId ?? ''} onValueChange={(value) => setDraft({ ...draft, dialogueSpeakerId: value || null })} options={[{ value: '', label: props.t('director.crud.noSpeaker') }, ...props.characters.map((character) => ({ value: character.id, label: character.name }))]} />
        </FormField>
        <FormField label={props.t('editor.soundEffects')}>
          <Input className={fieldClass} value={draft.soundEffects.join(', ')} onChange={(event) => setDraft({ ...draft, soundEffects: splitList(event.target.value) })} />
        </FormField>
      </div>
      <FormField label={props.t('director.storyboard.prompt')}>
        <Textarea className={`${fieldClass} min-h-24`} value={draft.generationPrompt ?? ''} onChange={(event) => setDraft({ ...draft, generationPrompt: event.target.value || null })} />
      </FormField>
      <div className="grid grid-cols-3 gap-4 rounded-md border border-studio-line bg-studio-panel/40 p-4">
        <FormField label={props.t('director.continuity.transition')}>
          <DirectorSelect ariaLabel={props.t('director.continuity.transition')} value={draft.continuity?.transition ?? 'auto'} onValueChange={(value) => setDraft({ ...draft, continuity: { transition: value as NonNullable<Shot['continuity']>['transition'], fromShotId: draft.continuity?.fromShotId ?? null, startState: draft.continuity?.startState ?? null, endState: draft.continuity?.endState ?? null } })} options={(['auto', 'continuous_action', 'match_action', 'hard_cut', 'time_jump', 'location_jump', 'none'] as const).map((value) => ({ value, label: props.t(`director.continuity.transition.${value}`) }))} />
        </FormField>
        <FormField label={props.t('director.continuity.startState')}><Textarea className={`${fieldClass} min-h-20`} value={draft.continuity?.startState?.summary ?? ''} onChange={(event) => setDraft(updateContinuitySummary(draft, 'startState', event.target.value))} /></FormField>
        <FormField label={props.t('director.continuity.endState')}><Textarea className={`${fieldClass} min-h-20`} value={draft.continuity?.endState?.summary ?? ''} onChange={(event) => setDraft(updateContinuitySummary(draft, 'endState', event.target.value))} /></FormField>
      </div>
    </EntityDialogFrame>
  )
}

export function AssetDialog(
  props: CommonDialogProps & {
    asset?: Asset | null
    initialKind: Asset['kind']
    voiceReference?: VoiceReferenceLike | null
    onUploadVoiceReference?: (file: File) => Promise<VoiceReferenceLike | null>
    onSubmit: (draft: AssetDraft) => void
  }
) {
  const voiceUploadRef = React.useRef<HTMLInputElement | null>(null)
  const [voiceUploading, setVoiceUploading] = React.useState(false)
  const [draft, setDraft] = React.useState<AssetDraft>(() =>
    assetDraft(props.asset, props.initialKind, props.t, props.voiceReference)
  )
  React.useEffect(() => {
    if (props.open) {
      setDraft(
        assetDraft(props.asset, props.initialKind, props.t, props.voiceReference)
      )
    }
  }, [props.open, props.asset, props.initialKind, props.t, props.voiceReference])
  const valid =
    draft.name.trim() && draft.description.trim() && draft.prompt.trim()
    && !hasPartialVoiceReference(draft.voiceReference)
  const details = draft.categoryDetails
  const updateDetail = (
    key: keyof typeof details,
    value: string
  ) => setDraft({
    ...draft,
    categoryDetails: { ...details, [key]: value || null }
  })
  async function uploadVoiceReference(file: File | undefined) {
    if (!file || !props.onUploadVoiceReference) return
    setVoiceUploading(true)
    try {
      const voiceReference = await props.onUploadVoiceReference(file)
      if (voiceReference) setDraft((current) => ({ ...current, voiceReference }))
    } finally {
      setVoiceUploading(false)
      if (voiceUploadRef.current) voiceUploadRef.current.value = ''
    }
  }

  return (
    <EntityDialogFrame
      {...props}
      title={props.asset ? props.t('director.crud.editAsset') : props.t('director.crud.newAsset')}
      description={props.t('director.crud.assetHelp')}
      valid={Boolean(valid)}
      onSubmit={() => props.onSubmit(draft)}
      wide
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label={props.t('editor.kind')}>
          <DirectorSelect ariaLabel={props.t('editor.kind')} value={draft.kind} disabled={Boolean(props.asset)} onValueChange={(value) => setDraft({ ...draft, kind: value as Asset['kind'], categoryDetails: createEmptyAssetDetails(), voiceReference: null })} options={(['character', 'location', 'prop', 'style'] as const).map((value) => ({ value, label: props.t(`asset.kind.${value}`) }))} />
        </FormField>
        <FormField label={props.t('editor.name')}><Input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></FormField>
      </div>
      <FormField label={props.t('fields.description')}><Textarea className={`${fieldClass} min-h-24`} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></FormField>
      {draft.kind === 'character' ? (
        <section className="grid gap-4 rounded-lg border border-studio-line bg-studio-canvas p-4" aria-labelledby="asset-identity-heading">
          <div>
            <h3 id="asset-identity-heading" className="font-display text-lg font-bold text-studio-ink">{props.t('director.assets.identity')}</h3>
            <p className="mt-1 text-xs text-studio-muted">{props.t('director.assets.identityEditHelp')}</p>
          </div>
          <FormField label={props.t('director.assets.identityDescription')}><Textarea className={`${fieldClass} min-h-20`} value={details.identity ?? ''} onChange={(event) => updateDetail('identity', event.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={props.t('editor.role')}><Input className={fieldClass} value={draft.role ?? ''} onChange={(event) => setDraft({ ...draft, role: event.target.value })} /></FormField>
            <FormField label={props.t('director.assets.appearanceAnchors')}><Input className={fieldClass} value={details.appearance ?? ''} onChange={(event) => updateDetail('appearance', event.target.value)} /></FormField>
            <FormField label={props.t('director.assets.wardrobeField')}><Input className={fieldClass} value={details.wardrobe ?? ''} onChange={(event) => updateDetail('wardrobe', event.target.value)} /></FormField>
            <FormField label={props.t('director.assets.voice')}><Input className={fieldClass} value={details.voice ?? ''} onChange={(event) => updateDetail('voice', event.target.value)} /></FormField>
          </div>
          <div className="grid gap-4 rounded-md border border-studio-line bg-studio-paper p-4">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs font-semibold uppercase tracking-[0.2em] text-studio-muted">{props.t('editor.voiceReference')}</strong>
              <span className="text-[10px] text-studio-muted">{props.t('editor.voiceReferenceHelp')}</span>
            </div>
            <input ref={voiceUploadRef} type="file" accept={VOICE_REFERENCE_ACCEPT} hidden onChange={(event) => void uploadVoiceReference(event.target.files?.[0])} />
            <div className="grid gap-3 rounded-md border border-dashed border-studio-line bg-studio-canvas/60 p-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-studio-paper text-studio-brass"><FileAudio2 className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-studio-ink">{draft.voiceReference?.originalName ?? draft.voiceReference?.label ?? props.t('editor.voiceReferenceEmpty')}</strong>
                  <small className="mt-0.5 block text-[11px] text-studio-muted">{draft.voiceReference ? props.t('editor.voiceReferenceReady') : props.onUploadVoiceReference ? props.t('editor.voiceReferenceFormats') : props.t('editor.voiceReferenceSaveFirst')}</small>
                </span>
                <Button type="button" variant="outline" size="sm" disabled={voiceUploading || !props.onUploadVoiceReference} onClick={() => voiceUploadRef.current?.click()}><Upload aria-hidden="true" />{voiceUploading ? props.t('editor.voiceReferenceUploading') : props.t(draft.voiceReference ? 'editor.voiceReferenceReplace' : 'editor.voiceReferenceUpload')}</Button>
                {draft.voiceReference ? <Button type="button" variant="outline" size="sm" className="text-studio-danger" disabled={voiceUploading} onClick={() => setDraft({ ...draft, voiceReference: null })}><Trash2 aria-hidden="true" />{props.t('editor.voiceReferenceRemove')}</Button> : null}
              </div>
              {draft.voiceReference ? <audio className="h-9 w-full" data-testid="voice-reference-player" controls preload="none" src={draft.voiceReference.url}>{props.t('editor.voiceReferencePlaybackUnsupported')}</audio> : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label={props.t('editor.voiceReferenceLabel')}>
                <Input
                  className={fieldClass}
                  disabled={!draft.voiceReference}
                  value={draft.voiceReference?.label ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      voiceReference: updateVoiceReferenceDraft(
                        draft.voiceReference,
                        'label',
                        event.target.value
                      )
                    })
                  }
                />
              </FormField>
              <FormField label={props.t('editor.voiceReferenceLicense')}>
                <Input
                  className={fieldClass}
                  disabled={!draft.voiceReference}
                  value={draft.voiceReference?.license ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      voiceReference: updateVoiceReferenceDraft(
                        draft.voiceReference,
                        'license',
                        event.target.value
                      )
                    })
                  }
                />
              </FormField>
            </div>
            <FormField label={props.t('editor.voiceReferenceSourceUrl')}>
              <Input
                className={fieldClass}
                disabled={!draft.voiceReference}
                value={draft.voiceReference?.sourceUrl ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    voiceReference: updateVoiceReferenceDraft(
                      draft.voiceReference,
                      'sourceUrl',
                      event.target.value
                    )
                  })
                }
              />
            </FormField>
          </div>
        </section>
      ) : null}
      {draft.kind === 'location' ? (
        <div className="grid grid-cols-2 gap-4">
          <FormField label={props.t('director.crud.environment')}><Textarea className={`${fieldClass} min-h-20`} value={details.environment ?? ''} onChange={(event) => updateDetail('environment', event.target.value)} /></FormField>
          <FormField label={props.t('director.crud.lighting')}><Textarea className={`${fieldClass} min-h-20`} value={details.lighting ?? ''} onChange={(event) => updateDetail('lighting', event.target.value)} /></FormField>
        </div>
      ) : null}
      {draft.kind === 'prop' ? (
        <div className="grid grid-cols-3 gap-4">
          <FormField label={props.t('director.crud.material')}><Input className={fieldClass} value={details.material ?? ''} onChange={(event) => updateDetail('material', event.target.value)} /></FormField>
          <FormField label={props.t('director.crud.condition')}><Input className={fieldClass} value={details.condition ?? ''} onChange={(event) => updateDetail('condition', event.target.value)} /></FormField>
          <FormField label={props.t('director.crud.storyFunction')}><Input className={fieldClass} value={details.storyFunction ?? ''} onChange={(event) => updateDetail('storyFunction', event.target.value)} /></FormField>
        </div>
      ) : null}
      {draft.kind === 'style' ? (
        <div className="grid grid-cols-3 gap-4">
          <FormField label={props.t('director.crud.palette')}><Input className={fieldClass} value={details.palette ?? ''} onChange={(event) => updateDetail('palette', event.target.value)} /></FormField>
          <FormField label={props.t('director.crud.lighting')}><Input className={fieldClass} value={details.lighting ?? ''} onChange={(event) => updateDetail('lighting', event.target.value)} /></FormField>
          <FormField label={props.t('director.crud.lens')}><Input className={fieldClass} value={details.lens ?? ''} onChange={(event) => updateDetail('lens', event.target.value)} /></FormField>
        </div>
      ) : null}
      <FormField label={props.t('director.crud.continuity')}><Textarea className={`${fieldClass} min-h-20`} value={draft.continuityNotes ?? details.continuity ?? ''} onChange={(event) => setDraft({ ...draft, continuityNotes: event.target.value || null, categoryDetails: { ...details, continuity: event.target.value || null } })} /></FormField>
      <FormField label={props.t('editor.prompt')}><Textarea className={`${fieldClass} min-h-24`} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></FormField>
      <FormField label={props.t('director.crud.negativePrompt')}><Textarea className={`${fieldClass} min-h-20`} value={draft.negativePrompt ?? ''} onChange={(event) => setDraft({ ...draft, negativePrompt: event.target.value || null })} /></FormField>
    </EntityDialogFrame>
  )
}

export function DeleteEntityDialog(props: {
  open: boolean
  title: string
  description: string
  busy: boolean
  t: DirectorTranslator
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent className="border-studio-line bg-studio-paper text-studio-ink">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl">{props.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-studio-muted">{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{props.t('actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction className="bg-studio-danger text-white hover:bg-studio-danger/90" disabled={props.busy} onClick={props.onConfirm}>{props.t('actions.delete')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function EntityDialogFrame(props: CommonDialogProps & {
  title: string
  description: string
  valid: boolean
  wide?: boolean
  onSubmit: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={`${props.wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl'} max-h-[88vh] overflow-y-auto border-studio-line bg-studio-paper text-studio-ink`}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{props.title}</DialogTitle>
          <DialogDescription className="text-studio-muted">{props.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">{props.children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>{props.t('actions.cancel')}</Button>
          <Button disabled={props.busy || !props.valid} onClick={props.onSubmit}>{props.t('actions.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormField(props: { label: string; children: React.ReactNode }) {
  return <label className={labelClass}><span>{props.label}</span>{props.children}</label>
}

function episodeDraft(
  episode: Episode | null | undefined,
  t: DirectorTranslator
): EpisodeDraft {
  return episode
    ? {
        title: episode.title,
        summary: episode.summary,
        script: episode.script,
        targetDurationSeconds: episode.targetDurationSeconds
      }
    : {
        title: t('director.crud.defaultEpisodeTitle'),
        summary: t('director.crud.defaultEpisodeSummary'),
        script: t('director.crud.defaultEpisodeScript'),
        targetDurationSeconds: 60
      }
}

function sceneDraft(
  scene: Scene | null | undefined,
  episodes: Episode[],
  t: DirectorTranslator
): SceneDraft {
  return scene
    ? {
        episodeId: scene.episodeId,
        title: scene.title,
        summary: scene.summary,
        location: scene.location,
        timeOfDay: scene.timeOfDay
      }
    : {
        episodeId: episodes[0]?.id ?? null,
        title: t('director.crud.defaultSceneTitle'),
        summary: t('director.crud.defaultSceneSummary'),
        location: t('director.crud.defaultLocation'),
        timeOfDay: null
      }
}

function shotDraft(
  shot: Shot | null | undefined,
  t: DirectorTranslator
): ShotDraft {
  if (shot) {
    const { id: _id, candidates: _candidates, ...draft } = shot
    return draft
  }
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
    continuity: { transition: 'auto', fromShotId: null, startState: null, endState: null },
    durationSeconds: 5
  }
}

function updateContinuitySummary(draft: ShotDraft, key: 'startState' | 'endState', value: string): ShotDraft {
  const continuity = draft.continuity ?? { transition: 'auto' as const, fromShotId: null, startState: null, endState: null }
  const previous = continuity[key]
  return {
    ...draft,
    continuity: {
      ...continuity,
      [key]: Boolean(value.trim() || previous?.environment || previous?.subjects.length)
        ? { summary: value || null, environment: previous?.environment ?? null, subjects: previous?.subjects ?? [] }
        : null
    }
  }
}

function assetDraft(
  asset: Asset | null | undefined,
  kind: Asset['kind'],
  t: DirectorTranslator,
  voiceReference?: VoiceReferenceLike | null
): AssetDraft {
  if (asset) {
    const { id: _id, candidates: _candidates, ...draft } = asset
    return {
      ...draft,
      voiceReference: compactVoiceReference(voiceReference)
    }
  }
  return {
    kind,
    name: t('director.crud.defaultAssetName'),
    description: t('director.crud.defaultAssetDescription'),
    prompt: t('director.crud.defaultAssetPrompt'),
    negativePrompt: null,
    continuityNotes: null,
    categoryDetails: createEmptyAssetDetails(),
    voiceReference: compactVoiceReference(voiceReference)
  }
}

function splitList(value: string) {
  return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
}
