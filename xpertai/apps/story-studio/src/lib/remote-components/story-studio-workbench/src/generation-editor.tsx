import * as React from 'react'
import {
  Button,
  Input,
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import {
  Field,
  type ProductionEditorProps
} from './stage-editor-shared'

const h: typeof React.createElement = React.createElement

export function GenerationEditor(props: ProductionEditorProps) {
  const { production, update, t } = props
  return (
    <div className="ss-editor-media">
      {production.scenes.flatMap((scene, sceneIndex) =>
        scene.shots.map((shot, shotIndex) => {
          const videos = shot.candidates.filter(
            (candidate) => candidate.kind === 'video'
          )
          return (
            <article key={shot.id}>
              <header>
                <div>
                  <small>{scene.title}</small>
                  <strong>{shot.title}</strong>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((draft) => {
                      draft.scenes[sceneIndex].shots[
                        shotIndex
                      ].candidates.forEach((candidate) => {
                        if (candidate.kind === 'video') {
                          candidate.selected = false
                        }
                      })
                    })
                  }
                >
                  {t('editor.clearSelection')}
                </Button>
              </header>
              {videos.length ? (
                <div className="ss-editor-media-options">
                  {videos.map((candidate) => {
                    const candidateIndex = shot.candidates.findIndex(
                      (item) => item.id === candidate.id
                    )
                    return (
                      <div
                        className={candidate.selected ? 'is-selected' : ''}
                        key={candidate.id}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            update((draft) => {
                              draft.scenes[sceneIndex].shots[
                                shotIndex
                              ].candidates.forEach((item) => {
                                if (item.kind === 'video') {
                                  item.selected = item.id === candidate.id
                                }
                              })
                            })
                          }
                        >
                          <span>{candidate.selected ? '●' : '○'}</span>
                          <strong>{candidate.label}</strong>
                          <small>
                            {candidate.workspacePath ??
                              t('generation.missing')}
                          </small>
                        </button>
                        <Field label={t('editor.label')}>
                          <Input
                            value={candidate.label}
                            onChange={(event) =>
                              update((draft) => {
                                draft.scenes[sceneIndex].shots[
                                  shotIndex
                                ].candidates[candidateIndex].label =
                                  event.target.value
                              })
                            }
                          />
                        </Field>
                        <Field label={t('editor.prompt')}>
                          <Textarea
                            value={candidate.prompt ?? ''}
                            onChange={(event) =>
                              update((draft) => {
                                draft.scenes[sceneIndex].shots[
                                  shotIndex
                                ].candidates[candidateIndex].prompt =
                                  event.target.value || null
                              })
                            }
                          />
                        </Field>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p>{t('editor.noVideoCandidates')}</p>
              )}
            </article>
          )
        })
      )}
    </div>
  )
}
