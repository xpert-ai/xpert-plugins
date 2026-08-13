import * as React from 'react'
import {
  Button,
  Input,
  Plus,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Trash2
} from '@xpert-ai/plugin-shadcn-ui'
import type { MessageKey } from './i18n'
import type {
  Asset,
  ProductionView,
  Shot
} from './production-data'
import type { ProjectEditDraft } from './editor-state'
import { GenerationEditor } from './generation-editor'
import {
  EditorCard,
  EditorSection,
  Field,
  newAsset,
  newIdentifier,
  newScene,
  newShot,
  numberValue,
  type ProductionEditorProps
} from './stage-editor-shared'

const h: typeof React.createElement = React.createElement

type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

export function StageEditor(props: {
  stage: number
  project: ProjectEditDraft
  production: ProductionView | null
  onProjectChange: (draft: ProjectEditDraft) => void
  onProductionChange: (draft: ProductionView) => void
  t: Translator
}) {
  if (props.stage === 1) {
    return (
      <ProjectEditor
        draft={props.project}
        onChange={props.onProjectChange}
        t={props.t}
      />
    )
  }
  if (!props.production) {
    return (
      <div className="ss-editor-empty">
        <strong>{props.t('editor.productionRequired')}</strong>
        <p>{props.t('editor.productionRequiredHelp')}</p>
      </div>
    )
  }
  const update = (mutate: (draft: ProductionView) => void) => {
    const next = structuredClone(props.production as ProductionView)
    mutate(next)
    props.onProductionChange(next)
  }
  switch (props.stage) {
    case 2:
      return (
        <SourcesEditor
          production={props.production}
          update={update}
          t={props.t}
        />
      )
    case 3:
      return (
        <StoryPlanEditor
          production={props.production}
          update={update}
          t={props.t}
        />
      )
    case 4:
      return (
        <EpisodesEditor
          production={props.production}
          update={update}
          t={props.t}
        />
      )
    case 5:
      return (
        <AssetsEditor
          production={props.production}
          update={update}
          t={props.t}
        />
      )
    case 6:
      return (
        <StoryboardEditor
          production={props.production}
          update={update}
          t={props.t}
        />
      )
    case 7:
      return (
        <GenerationEditor
          production={props.production}
          update={update}
          t={props.t}
        />
      )
    default:
      return null
  }
}

function ProjectEditor(props: {
  draft: ProjectEditDraft
  onChange: (draft: ProjectEditDraft) => void
  t: Translator
}) {
  const { draft, onChange, t } = props
  const set = <K extends keyof ProjectEditDraft>(
    key: K,
    value: ProjectEditDraft[K]
  ) => onChange({ ...draft, [key]: value })
  return (
    <div className="ss-editor-grid ss-editor-project">
      <Field label={t('fields.title')} wide>
        <Input
          value={draft.title}
          maxLength={160}
          onChange={(event) => set('title', event.target.value)}
        />
      </Field>
      <Field label={t('fields.description')} wide>
        <Textarea
          value={draft.description}
          maxLength={2_000}
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>
      <Field label={t('fields.premise')} wide>
        <Textarea
          value={draft.premise}
          maxLength={8_000}
          onChange={(event) => set('premise', event.target.value)}
        />
      </Field>
      <Field label={t('fields.format')}>
        <Select
          value={draft.productionFormat}
          onValueChange={(value) =>
            set('productionFormat', value as ProjectEditDraft['productionFormat'])
          }
        >
          <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[
              'vertical_short',
              'horizontal_short',
              'episodic_series',
              'feature',
              'custom'
            ].map((value) => (
              <SelectItem key={value} value={value}>
                {t(`format.${value}` as MessageKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t('fields.aspectRatio')}>
        <Select
          value={draft.aspectRatio}
          onValueChange={(value) => set('aspectRatio', value)}
        >
          <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['9:16', '16:9', '1:1', '4:3', '3:4', 'custom'].map((value) => (
              <SelectItem key={value} value={value}>{value}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t('fields.duration')}>
        <Input
          type="number"
          min={5}
          max={28_800}
          value={draft.targetDurationSeconds}
          onChange={(event) =>
            set('targetDurationSeconds', event.target.value)
          }
        />
      </Field>
      <Field label={t('fields.tags')}>
        <Input
          value={draft.tags}
          maxLength={800}
          onChange={(event) => set('tags', event.target.value)}
        />
      </Field>
    </div>
  )
}

function SourcesEditor(props: ProductionEditorProps) {
  const { production, update, t } = props
  return (
    <div className="ss-editor-stack">
      <Field label={t('editor.sourceSynopsis')}>
        <Textarea
          value={production.sourceSynopsis}
          maxLength={12_000}
          onChange={(event) =>
            update((draft) => {
              draft.sourceSynopsis = event.target.value
            })
          }
        />
      </Field>
      <EditorSection
        title={t('editor.sourceMaterials')}
        onAdd={() =>
          update((draft) => {
            draft.sourceMaterials.push({
              id: newIdentifier('source'),
              title: t('editor.newSource'),
              type: 'text',
              excerpt: t('editor.newSourceExcerpt'),
              status: 'imported'
            })
          })
        }
        t={t}
      >
        {production.sourceMaterials.map((source, index) => (
          <EditorCard
            key={source.id}
            title={`${String(index + 1).padStart(2, '0')} · ${source.title}`}
            onRemove={() =>
              update((draft) => {
                draft.sourceMaterials.splice(index, 1)
              })
            }
            t={t}
          >
            <Field label={t('fields.title')}>
              <Input
                value={source.title}
                onChange={(event) =>
                  update((draft) => {
                    draft.sourceMaterials[index].title = event.target.value
                  })
                }
              />
            </Field>
            <div className="ss-editor-row">
              <Field label={t('editor.type')}>
                <Select
                  value={source.type}
                  onValueChange={(value) =>
                    update((draft) => {
                      draft.sourceMaterials[index].type =
                        value as typeof source.type
                    })
                  }
                >
                  <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['text', 'file', 'url'].map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`source.type.${value}` as MessageKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('editor.status')}>
                <Select
                  value={source.status}
                  onValueChange={(value) =>
                    update((draft) => {
                      draft.sourceMaterials[index].status =
                        value as typeof source.status
                    })
                  }
                >
                  <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['imported', 'reviewed'].map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`source.status.${value}` as MessageKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label={t('editor.excerpt')}>
              <Textarea
                value={source.excerpt}
                onChange={(event) =>
                  update((draft) => {
                    draft.sourceMaterials[index].excerpt = event.target.value
                  })
                }
              />
            </Field>
          </EditorCard>
        ))}
      </EditorSection>
    </div>
  )
}

function StoryPlanEditor(props: ProductionEditorProps) {
  const { production, update, t } = props
  const plan = production.storyPlan
  if (!plan) {
    return (
      <div className="ss-editor-empty">
        <strong>{t('editor.noStoryPlan')}</strong>
        <Button
          size="sm"
          onClick={() =>
            update((draft) => {
              draft.storyPlan = {
                logline: t('editor.newLogline'),
                theme: t('editor.newTheme'),
                tone: t('editor.newTone'),
                adaptationSuggestions: [],
                beats: [
                  {
                    id: newIdentifier('beat'),
                    title: t('editor.newBeat'),
                    summary: t('editor.newBeatSummary'),
                    purpose: t('editor.newBeatPurpose')
                  }
                ]
              }
            })
          }
        >
          <Plus aria-hidden="true" />{t('editor.createStoryPlan')}
        </Button>
      </div>
    )
  }
  return (
    <div className="ss-editor-stack">
      <div className="ss-editor-grid">
        <Field label={t('editor.adaptationGoal')} wide>
          <Textarea
            value={production.adaptationGoal}
            onChange={(event) =>
              update((draft) => {
                draft.adaptationGoal = event.target.value
              })
            }
          />
        </Field>
        <Field label={t('editor.audience')} wide>
          <Input
            value={production.audience ?? ''}
            onChange={(event) =>
              update((draft) => {
                draft.audience = event.target.value || null
              })
            }
          />
        </Field>
        <Field label={t('story.logline')} wide>
          <Textarea
            value={plan.logline}
            onChange={(event) =>
              update((draft) => {
                if (draft.storyPlan) draft.storyPlan.logline = event.target.value
              })
            }
          />
        </Field>
        <Field label={t('story.theme')}>
          <Input
            value={plan.theme}
            onChange={(event) =>
              update((draft) => {
                if (draft.storyPlan) draft.storyPlan.theme = event.target.value
              })
            }
          />
        </Field>
        <Field label={t('story.tone')}>
          <Input
            value={plan.tone}
            onChange={(event) =>
              update((draft) => {
                if (draft.storyPlan) draft.storyPlan.tone = event.target.value
              })
            }
          />
        </Field>
      </div>
      <EditorSection
        title={t('editor.beats')}
        onAdd={() =>
          update((draft) => {
            draft.storyPlan?.beats.push({
              id: newIdentifier('beat'),
              title: t('editor.newBeat'),
              summary: t('editor.newBeatSummary'),
              purpose: t('editor.newBeatPurpose')
            })
          })
        }
        t={t}
      >
        {plan.beats.map((beat, index) => (
          <EditorCard
            key={beat.id}
            title={`${String(index + 1).padStart(2, '0')} · ${beat.title}`}
            onRemove={() =>
              update((draft) => {
                draft.storyPlan?.beats.splice(index, 1)
              })
            }
            t={t}
          >
            <Field label={t('fields.title')}>
              <Input
                value={beat.title}
                onChange={(event) =>
                  update((draft) => {
                    if (draft.storyPlan) {
                      draft.storyPlan.beats[index].title = event.target.value
                    }
                  })
                }
              />
            </Field>
            <Field label={t('editor.summary')}>
              <Textarea
                value={beat.summary}
                onChange={(event) =>
                  update((draft) => {
                    if (draft.storyPlan) {
                      draft.storyPlan.beats[index].summary = event.target.value
                    }
                  })
                }
              />
            </Field>
            <Field label={t('editor.purpose')}>
              <Input
                value={beat.purpose}
                onChange={(event) =>
                  update((draft) => {
                    if (draft.storyPlan) {
                      draft.storyPlan.beats[index].purpose = event.target.value
                    }
                  })
                }
              />
            </Field>
          </EditorCard>
        ))}
      </EditorSection>
    </div>
  )
}

function EpisodesEditor(props: ProductionEditorProps) {
  const { production, update, t } = props
  return (
    <EditorSection
      title={t('editor.episodes')}
      onAdd={() =>
        update((draft) => {
          draft.episodes.push({
            id: newIdentifier('episode'),
            order: draft.episodes.length + 1,
            title: t('editor.newEpisode'),
            summary: t('editor.newEpisodeSummary'),
            script: t('editor.newEpisodeScript'),
            targetDurationSeconds: 60
          })
        })
      }
      t={t}
    >
      {production.episodes.map((episode, index) => (
        <EditorCard
          key={episode.id}
          title={`EP ${String(episode.order).padStart(2, '0')} · ${episode.title}`}
          onRemove={() =>
            update((draft) => {
              draft.episodes.splice(index, 1)
            })
          }
          t={t}
        >
          <div className="ss-editor-row">
            <Field label={t('editor.order')}>
              <Input
                type="number"
                min={1}
                max={100}
                value={episode.order}
                onChange={(event) =>
                  update((draft) => {
                    draft.episodes[index].order = numberValue(event.target.value, 1)
                  })
                }
              />
            </Field>
            <Field label={t('fields.duration')}>
              <Input
                type="number"
                min={5}
                max={1_800}
                value={episode.targetDurationSeconds ?? ''}
                onChange={(event) =>
                  update((draft) => {
                    draft.episodes[index].targetDurationSeconds =
                      event.target.value ? numberValue(event.target.value, 5) : null
                  })
                }
              />
            </Field>
          </div>
          <Field label={t('fields.title')}>
            <Input
              value={episode.title}
              onChange={(event) =>
                update((draft) => {
                  draft.episodes[index].title = event.target.value
                })
              }
            />
          </Field>
          <Field label={t('editor.summary')}>
            <Textarea
              value={episode.summary}
              onChange={(event) =>
                update((draft) => {
                  draft.episodes[index].summary = event.target.value
                })
              }
            />
          </Field>
          <Field label={t('editor.script')}>
            <Textarea
              value={episode.script}
              className="ss-editor-script"
              onChange={(event) =>
                update((draft) => {
                  draft.episodes[index].script = event.target.value
                })
              }
            />
          </Field>
        </EditorCard>
      ))}
    </EditorSection>
  )
}

function AssetsEditor(props: ProductionEditorProps) {
  const { production, update, t } = props
  return (
    <div className="ss-editor-stack">
      <Field label={t('editor.visualStyle')}>
        <Textarea
          value={production.visualStyle}
          onChange={(event) =>
            update((draft) => {
              draft.visualStyle = event.target.value
            })
          }
        />
      </Field>
      <EditorSection
        title={t('editor.assets')}
        onAdd={() =>
          update((draft) => {
            draft.assets.push(newAsset(t))
          })
        }
        t={t}
      >
        {production.assets.map((asset, index) => (
          <EditorCard
            key={asset.id}
            title={asset.name}
            onRemove={() =>
              update((draft) => {
                draft.assets.splice(index, 1)
              })
            }
            t={t}
          >
            <div className="ss-editor-row">
              <Field label={t('editor.name')}>
                <Input
                  value={asset.name}
                  onChange={(event) =>
                    update((draft) => {
                      draft.assets[index].name = event.target.value
                    })
                  }
                />
              </Field>
              <Field label={t('editor.kind')}>
                <Select
                  value={asset.kind}
                  onValueChange={(value) =>
                    update((draft) => {
                      draft.assets[index].kind = value as Asset['kind']
                    })
                  }
                >
                  <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['character', 'location', 'prop', 'style'].map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`asset.kind.${value}` as MessageKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label={t('fields.description')}>
              <Textarea
                value={asset.description}
                onChange={(event) =>
                  update((draft) => {
                    draft.assets[index].description = event.target.value
                  })
                }
              />
            </Field>
            <Field label={t('editor.prompt')}>
              <Textarea
                value={asset.prompt}
                onChange={(event) =>
                  update((draft) => {
                    draft.assets[index].prompt = event.target.value
                  })
                }
              />
            </Field>
          </EditorCard>
        ))}
      </EditorSection>
    </div>
  )
}

function StoryboardEditor(props: ProductionEditorProps) {
  const { production, update, t } = props
  return (
    <EditorSection
      title={t('editor.scenes')}
      onAdd={() =>
        update((draft) => {
          draft.scenes.push(newScene(draft.scenes.length + 1, t))
        })
      }
      t={t}
    >
      {production.scenes.map((scene, sceneIndex) => (
        <EditorCard
          key={scene.id}
          title={`${String(scene.order).padStart(2, '0')} · ${scene.title}`}
          onRemove={() =>
            update((draft) => {
              draft.scenes.splice(sceneIndex, 1)
            })
          }
          t={t}
        >
          <div className="ss-editor-row is-three">
            <Field label={t('editor.order')}>
              <Input
                type="number"
                min={1}
                max={100}
                value={scene.order}
                onChange={(event) =>
                  update((draft) => {
                    draft.scenes[sceneIndex].order = numberValue(
                      event.target.value,
                      1
                    )
                  })
                }
              />
            </Field>
            <Field label={t('editor.location')}>
              <Input
                value={scene.location ?? ''}
                onChange={(event) =>
                  update((draft) => {
                    draft.scenes[sceneIndex].location =
                      event.target.value || null
                  })
                }
              />
            </Field>
            <Field label={t('editor.timeOfDay')}>
              <Input
                value={scene.timeOfDay ?? ''}
                onChange={(event) =>
                  update((draft) => {
                    draft.scenes[sceneIndex].timeOfDay =
                      event.target.value || null
                  })
                }
              />
            </Field>
          </div>
          <Field label={t('fields.title')}>
            <Input
              value={scene.title}
              onChange={(event) =>
                update((draft) => {
                  draft.scenes[sceneIndex].title = event.target.value
                })
              }
            />
          </Field>
          <Field label={t('editor.summary')}>
            <Textarea
              value={scene.summary}
              onChange={(event) =>
                update((draft) => {
                  draft.scenes[sceneIndex].summary = event.target.value
                })
              }
            />
          </Field>
          <div className="ss-editor-subsection">
            <header>
              <strong>{t('editor.shots')}</strong>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update((draft) => {
                    draft.scenes[sceneIndex].shots.push(newShot(t))
                  })
                }
              >
                <Plus aria-hidden="true" />{t('editor.add')}
              </Button>
            </header>
            {scene.shots.map((shot, shotIndex) => (
              <ShotEditor
                key={shot.id}
                shot={shot}
                onChange={(next) =>
                  update((draft) => {
                    draft.scenes[sceneIndex].shots[shotIndex] = next
                  })
                }
                onRemove={() =>
                  update((draft) => {
                    draft.scenes[sceneIndex].shots.splice(shotIndex, 1)
                  })
                }
                t={t}
              />
            ))}
          </div>
        </EditorCard>
      ))}
    </EditorSection>
  )
}

function ShotEditor(props: {
  shot: Shot
  onChange: (shot: Shot) => void
  onRemove: () => void
  t: Translator
}) {
  const { shot, onChange, onRemove, t } = props
  const set = <K extends keyof Shot>(key: K, value: Shot[K]) =>
    onChange({ ...shot, [key]: value })
  return (
    <article className="ss-editor-shot">
      <header>
        <strong>{shot.title}</strong>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('editor.remove')}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </header>
      <div className="ss-editor-row">
        <Field label={t('fields.title')}>
          <Input
            value={shot.title}
            onChange={(event) => set('title', event.target.value)}
          />
        </Field>
        <Field label={t('fields.duration')}>
          <Input
            type="number"
            min={1}
            max={20}
            value={shot.durationSeconds}
            onChange={(event) =>
              set('durationSeconds', numberValue(event.target.value, 1))
            }
          />
        </Field>
      </div>
      <Field label={t('editor.composition')}>
        <Textarea
          value={shot.composition}
          onChange={(event) => set('composition', event.target.value)}
        />
      </Field>
      <Field label={t('editor.action')}>
        <Textarea
          value={shot.action}
          onChange={(event) => set('action', event.target.value)}
        />
      </Field>
      <Field label={t('storyboard.camera')}>
        <Input
          value={shot.camera}
          onChange={(event) => set('camera', event.target.value)}
        />
      </Field>
      <Field label={t('storyboard.dialogue')}>
        <Textarea
          value={shot.dialogue ?? ''}
          onChange={(event) => set('dialogue', event.target.value || null)}
        />
      </Field>
      <Field label={t('editor.soundEffects')}>
        <Input
          value={shot.soundEffects.join(', ')}
          onChange={(event) =>
            set(
              'soundEffects',
              event.target.value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            )
          }
        />
      </Field>
    </article>
  )
}
