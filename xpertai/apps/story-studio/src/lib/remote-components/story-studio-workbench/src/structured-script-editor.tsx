import * as React from 'react'
import { Plus, Textarea, Trash2 } from '@xpert-ai/plugin-shadcn-ui'
import { DirectorSelect } from './director-form-controls'
import type { ShotDraft } from './director-production-crud'
import type { ProductionView, Scene } from './production-data'
import {
  addShotDialogue,
  displayRequiredScriptText,
  insertScriptShot,
  removeScriptShot,
  removeShotDialogue,
  updateSceneScriptText,
  updateShotDialogueMetadata,
  updateShotScriptText,
  type ScriptDialogueType,
  type StructuredScriptDefaults
} from './structured-script-model'
import type { DirectorTranslator } from './director-types'

const h: typeof React.createElement = React.createElement

type StructuredScriptEditorProps = {
  production: ProductionView
  scene: Scene
  selectedShotId: string | null
  defaults: StructuredScriptDefaults
  t: DirectorTranslator
  onChange: (production: ProductionView) => void
  onSelectShot: (shotId: string) => void
}

type EditableBlockProps = {
  id: string
  line: number
  kind: string
  value: string
  placeholder: string
  seconds?: number
  emphasized?: boolean
  selected?: boolean
  multiline?: boolean
  canDelete?: boolean
  ariaLabel: string
  onChange: (value: string) => void
  onFocus?: () => void
  onEnter?: () => void
  onDeleteEmpty?: () => void
}

export function StructuredScriptEditor(props: StructuredScriptEditorProps) {
  const { production, scene, defaults, t } = props
  const rootRef = React.useRef<HTMLElement | null>(null)
  const titleId = blockId(scene.id, 'title')
  const summaryId = blockId(scene.id, 'summary')
  let line = 1

  function change(mutator: (draft: ProductionView) => boolean) {
    const draft = structuredClone(production)
    if (!mutator(draft)) return false
    props.onChange(draft)
    return true
  }

  function focusBlock(id: string) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        rootRef.current
          ?.querySelector<HTMLElement>(`[data-script-block-id="${id}"]`)
          ?.focus()
      })
    })
  }

  function insertAfter(shotId: string) {
    const nextShotId = `shot-${crypto.randomUUID()}`
    if (!change((draft) =>
      insertScriptShot(
        draft,
        scene.id,
        shotId,
        nextShotId,
        newInlineShotDraft(t),
        defaults
      )
    )) return
    props.onSelectShot(nextShotId)
    focusBlock(blockId(nextShotId, 'action'))
  }

  function removeShot(shotId: string) {
    const index = scene.shots.findIndex((shot) => shot.id === shotId)
    const fallback = scene.shots[index - 1] ?? scene.shots[index + 1]
    if (!change((draft) => removeScriptShot(draft, scene.id, shotId, defaults))) return
    if (fallback) {
      props.onSelectShot(fallback.id)
      focusBlock(blockId(fallback.id, 'action'))
    }
  }

  function addDialogue(shotId: string, type: ScriptDialogueType) {
    if (!change((draft) => addShotDialogue(draft, scene.id, shotId, type, defaults))) return
    props.onSelectShot(shotId)
    focusBlock(blockId(shotId, 'dialogue'))
  }

  function addBlock(kind: 'action' | ScriptDialogueType) {
    const selected = scene.shots.find(
      (shot) => shot.id === props.selectedShotId
    ) ?? scene.shots.at(-1)
    if (!selected) return
    if (kind === 'action') {
      insertAfter(selected.id)
      return
    }
    addDialogue(selected.id, kind)
  }

  return (
    <article
      ref={rootRef}
      className="structured-script-editor min-h-[620px] overflow-hidden rounded-sm border border-studio-line bg-studio-paper shadow-studio"
      aria-label={t('editor.script')}
      data-testid="structured-script-editor"
    >
      <EditableBlock
        id={titleId}
        line={line++}
        kind={t('director.script.block.sceneHeading')}
        value={displayRequiredScriptText(scene.title, defaults.sceneTitle)}
        placeholder={defaults.sceneTitle}
        emphasized
        ariaLabel={t('director.script.editSceneTitle')}
        onChange={(value) => change((draft) => updateSceneScriptText(draft, scene.id, 'title', value, defaults))}
        onEnter={() => focusBlock(summaryId)}
      />
      <EditableBlock
        id={summaryId}
        line={line++}
        kind={t('director.script.block.sceneSummary')}
        value={displayRequiredScriptText(scene.summary, defaults.sceneSummary)}
        placeholder={defaults.sceneSummary}
        multiline
        ariaLabel={t('director.script.editSceneSummary')}
        onChange={(value) => change((draft) => updateSceneScriptText(draft, scene.id, 'summary', value, defaults))}
        onEnter={() => scene.shots[0] && focusBlock(blockId(scene.shots[0].id, 'action'))}
      />

      {scene.shots.map((shot, index) => {
        const actionLine = line++
        const hasDialogue = shot.dialogue !== null
        const speakerLine = hasDialogue ? line++ : null
        const dialogueLine = hasDialogue ? line++ : null
        const selected = shot.id === props.selectedShotId
        return (
          <React.Fragment key={shot.id}>
            <EditableBlock
              id={blockId(shot.id, 'action')}
              line={actionLine}
              kind={t('director.script.block.action')}
              value={displayRequiredScriptText(shot.action, defaults.shotAction)}
              placeholder={defaults.shotAction}
              seconds={shot.durationSeconds}
              selected={selected}
              multiline
              canDelete={scene.shots.length > 1}
              ariaLabel={t('director.script.editShotAction', { number: index + 1 })}
              onFocus={() => props.onSelectShot(shot.id)}
              onChange={(value) => change((draft) => updateShotScriptText(draft, scene.id, shot.id, 'action', value, defaults))}
              onEnter={() => insertAfter(shot.id)}
              onDeleteEmpty={() => removeShot(shot.id)}
            />
            {hasDialogue && speakerLine !== null && dialogueLine !== null ? (
              <>
                <div className={`grid min-h-12 min-w-0 grid-cols-[48px_88px_minmax(0,1fr)_48px] items-center overflow-hidden whitespace-nowrap border-b border-studio-line/60 ${selected ? 'bg-blue-50/70' : ''}`}>
                  <i className="self-stretch border-r border-studio-line/60 px-2 py-3 text-right text-[10px] not-italic text-studio-muted">{speakerLine}</i>
                  <DirectorSelect
                    className="mx-2 w-[72px] bg-studio-canvas px-1.5 text-[10px] font-bold text-studio-muted"
                    contentClassName="text-xs"
                    ariaLabel={t('director.script.blockType')}
                    value={shot.dialogueType ?? 'dialogue'}
                    onFocus={() => props.onSelectShot(shot.id)}
                    onValueChange={(value) => change((draft) => updateShotDialogueMetadata(draft, scene.id, shot.id, { dialogueType: readDialogueType(value) }, defaults))}
                    options={[
                      { value: 'dialogue', label: t('director.script.block.dialogue') },
                      { value: 'voice_over', label: t('director.script.block.voiceOver') },
                      { value: 'off_screen', label: t('director.script.block.offScreen') }
                    ]}
                  />
                  <DirectorSelect
                    className="mx-3 min-w-0 truncate border-0 bg-transparent px-2 text-center font-mono text-xs font-bold shadow-none"
                    ariaLabel={t('director.crud.speaker')}
                    value={shot.dialogueSpeakerId ?? ''}
                    onFocus={() => props.onSelectShot(shot.id)}
                    onValueChange={(value) => change((draft) => updateShotDialogueMetadata(draft, scene.id, shot.id, { dialogueSpeakerId: value || null }, defaults))}
                    options={[
                      { value: '', label: t('director.crud.noSpeaker') },
                      ...production.characters.map((character) => ({ value: character.id, label: character.name }))
                    ]}
                  />
                  <button type="button" className="mx-auto grid size-7 place-items-center rounded text-studio-muted hover:bg-red-50 hover:text-studio-danger" aria-label={t('director.script.removeDialogue')} onClick={() => change((draft) => removeShotDialogue(draft, scene.id, shot.id, defaults))}><Trash2 className="size-3.5" aria-hidden="true" /></button>
                </div>
                <EditableBlock
                  id={blockId(shot.id, 'dialogue')}
                  line={dialogueLine}
                  kind={t(`director.script.block.${dialogueKey(shot.dialogueType)}`)}
                  value={shot.dialogue ?? ''}
                  placeholder={t('director.script.dialoguePlaceholder')}
                  selected={selected}
                  multiline
                  canDelete
                  ariaLabel={t('director.script.editDialogue', { number: index + 1 })}
                  onFocus={() => props.onSelectShot(shot.id)}
                  onChange={(value) => change((draft) => updateShotScriptText(draft, scene.id, shot.id, 'dialogue', value, defaults))}
                  onEnter={() => insertAfter(shot.id)}
                  onDeleteEmpty={() => {
                    change((draft) => removeShotDialogue(draft, scene.id, shot.id, defaults))
                    focusBlock(blockId(shot.id, 'action'))
                  }}
                />
              </>
            ) : null}
          </React.Fragment>
        )
      })}

      <div className="flex min-h-36 min-w-0 items-start gap-3 overflow-hidden whitespace-nowrap px-12 py-5">
        <div className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-dashed border-studio-line bg-studio-canvas px-3 py-2 text-xs font-semibold text-studio-muted hover:border-studio-brass hover:text-studio-brass">
          <Plus className="size-3.5" aria-hidden="true" />
          <span>{t('director.script.addBlock')}</span>
          <DirectorSelect
            className="max-w-32 border-0 bg-transparent px-1 shadow-none"
            ariaLabel={t('director.script.addBlock')}
            value=""
            onValueChange={(value) => {
              const kind = readBlockType(value)
              if (kind) addBlock(kind)
            }}
            options={[
              { value: '', label: t('director.script.chooseBlock') },
              { value: 'action', label: t('director.script.block.action') },
              { value: 'dialogue', label: t('director.script.block.dialogue') },
              { value: 'voice_over', label: t('director.script.block.voiceOver') },
              { value: 'off_screen', label: t('director.script.block.offScreen') }
            ]}
          />
        </div>
        <span className="min-w-0 flex-1 truncate pt-2 text-[11px] text-studio-muted" title={t('director.script.keyboardHelp')}>{t('director.script.keyboardHelp')}</span>
      </div>
    </article>
  )
}

function EditableBlock(props: EditableBlockProps) {
  return (
    <div className={`group grid min-h-12 min-w-0 grid-cols-[48px_88px_minmax(0,1fr)_48px] overflow-hidden whitespace-nowrap border-b border-studio-line/60 transition ${props.emphasized ? 'bg-studio-canvas font-bold' : ''} ${props.selected ? 'bg-blue-50/70' : 'focus-within:bg-amber-50/40 hover:bg-studio-canvas/50'}`}>
      <i className="border-r border-studio-line/60 px-2 py-3 text-right text-[10px] not-italic text-studio-muted">{props.line}</i>
      <span className="mx-2 my-3 h-fit truncate whitespace-nowrap rounded bg-studio-canvas px-1.5 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-studio-muted group-focus-within:bg-studio-brass group-focus-within:text-white" title={props.kind}>{props.kind}</span>
      <Textarea
        data-script-block-id={props.id}
        className={`script-inline-textarea min-h-12 min-w-0 w-full resize-none truncate whitespace-nowrap rounded-none border-0 bg-transparent px-3 py-3 font-mono text-[13px] leading-6 text-studio-ink shadow-none outline-none placeholder:text-studio-muted/65 focus-visible:ring-0 ${props.emphasized ? 'font-bold' : ''}`}
        rows={props.multiline ? 2 : 1}
        wrap="off"
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.ariaLabel}
        onFocus={props.onFocus}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && props.onEnter) {
            event.preventDefault()
            props.onEnter()
          }
          if (
            event.key === 'Backspace' &&
            !props.value &&
            event.currentTarget.selectionStart === 0 &&
            props.canDelete &&
            props.onDeleteEmpty
          ) {
            event.preventDefault()
            props.onDeleteEmpty()
          }
        }}
      />
      <div className="flex flex-col items-center justify-center gap-1 px-1 text-[10px] text-studio-muted">
        {props.seconds ? <span>{props.seconds}s</span> : null}
      </div>
    </div>
  )
}

function blockId(ownerId: string, field: string) {
  return `${ownerId}:${field}`
}

function dialogueKey(value: ScriptDialogueType | null) {
  if (value === 'voice_over') return 'voiceOver' as const
  if (value === 'off_screen') return 'offScreen' as const
  return 'dialogue' as const
}

function readDialogueType(value: string): ScriptDialogueType {
  if (value === 'voice_over') return 'voice_over'
  if (value === 'off_screen') return 'off_screen'
  return 'dialogue'
}

function readBlockType(
  value: string
): 'action' | ScriptDialogueType | null {
  if (value === 'action') return 'action'
  if (value === 'dialogue') return 'dialogue'
  if (value === 'voice_over') return 'voice_over'
  if (value === 'off_screen') return 'off_screen'
  return null
}

function newInlineShotDraft(t: DirectorTranslator): ShotDraft {
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
