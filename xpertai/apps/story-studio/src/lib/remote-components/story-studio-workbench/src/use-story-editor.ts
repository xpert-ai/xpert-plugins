import * as React from 'react'
import type { MessageKey } from './i18n'
import {
  createEditorSession,
  rebaseProductionStage,
  type ProjectEditDraft,
  type StoryEditorSession
} from './editor-state'
import {
  productionActionDocument,
  type ProductionView
} from './production-panel'
import type { ProjectSummary } from './project-data'
import {
  executeAction,
  getErrorMessage,
  notify,
  RemoteActionError,
  requireSuccessfulAction
} from './runtime'

type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

type ProjectSnapshot = {
  project: ProjectSummary | null
  production: ProductionView | null
}

export function useStoryEditor(options: {
  activeStage: number
  production: ProductionView | null
  getProject: () => ProjectSummary | null
  getSnapshot: (projectId: string) => Promise<ProjectSnapshot>
  reload: (projectId: string) => Promise<unknown>
  t: Translator
}) {
  const [editor, setEditor] =
    React.useState<StoryEditorSession | null>(null)
  const editorRef = React.useRef<StoryEditorSession | null>(null)

  React.useEffect(() => {
    editorRef.current = editor
  }, [editor])

  function closeEditor() {
    editorRef.current = null
    setEditor(null)
  }

  function beginEdit() {
    const project = options.getProject()
    if (!project || options.activeStage > 6) return
    const next = createEditorSession(
      project,
      options.production,
      options.activeStage
    )
    editorRef.current = next
    setEditor(next)
  }

  function updateProjectDraft(projectDraft: ProjectEditDraft) {
    setEditor((current) => {
      if (!current) return current
      const next = { ...current, projectDraft, dirty: true }
      editorRef.current = next
      return next
    })
  }

  function updateProductionDraft(productionDraft: ProductionView) {
    setEditor((current) => {
      if (!current) return current
      const next = { ...current, productionDraft, dirty: true }
      editorRef.current = next
      return next
    })
  }

  function markRemotePending() {
    setEditor((current) => {
      if (!current) return current
      const next = { ...current, pendingRemote: true }
      editorRef.current = next
      return next
    })
  }

  async function saveEditor(rebase = false) {
    const current = editorRef.current
    const project = options.getProject()
    if (
      !current ||
      !project ||
      current.projectId !== project.id ||
      !current.dirty
    ) {
      return
    }
    const saving = { ...current, saving: true }
    editorRef.current = saving
    setEditor(saving)
    try {
      let baseRevision = current.baseRevision
      const projectDraft = current.projectDraft
      let productionDraft = current.productionDraft
      let operationId = current.operationId
      if (rebase) {
        const snapshot = await options.getSnapshot(project.id)
        if (!snapshot.project) {
          throw new Error(options.t('errors.remoteRequestFailed'))
        }
        baseRevision = snapshot.project.revision
        operationId = crypto.randomUUID()
        if (
          current.stage > 1 &&
          productionDraft &&
          snapshot.production
        ) {
          productionDraft = rebaseProductionStage(
            current.stage,
            snapshot.production,
            productionDraft
          )
        }
      }

      if (current.stage === 1) {
        requireSuccessfulAction(
          await executeAction('update_project', project.id, {
            projectId: project.id,
            operationId,
            baseRevision,
            title: projectDraft.title.trim(),
            description: projectDraft.description.trim() || null,
            premise: projectDraft.premise.trim() || null,
            productionFormat: projectDraft.productionFormat,
            aspectRatio: projectDraft.aspectRatio,
            targetDurationSeconds:
              projectDraft.targetDurationSeconds.trim()
                ? Number(projectDraft.targetDurationSeconds)
                : null,
            tags: projectDraft.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
            changeSummary: options.t('changes.projectSaved', {
              title: projectDraft.title.trim()
            })
          })
        )
      } else {
        if (!productionDraft) {
          throw new Error(options.t('editor.productionRequired'))
        }
        requireSuccessfulAction(
          await executeAction('save_production', project.id, {
            projectId: project.id,
            operationId,
            baseRevision,
            production: productionActionDocument(productionDraft),
            changeSummary: options.t('changes.productionSaved', {
              title: project.title,
              stage: current.stage
            })
          })
        )
      }
      closeEditor()
      notify('success', options.t('editor.saved'))
      await options.reload(project.id)
    } catch (error) {
      const conflict =
        error instanceof RemoteActionError &&
        error.data?.errorCode === 'story_revision_conflict'
      setEditor((latest) => {
        if (!latest) return latest
        const next = {
          ...latest,
          saving: false,
          pendingRemote: latest.pendingRemote || conflict
        }
        editorRef.current = next
        return next
      })
      notify(
        conflict ? 'warning' : 'error',
        conflict
          ? options.t('editor.conflict')
          : getErrorMessage(
              error instanceof Error ? error : String(error)
            )
      )
    }
  }

  async function useAgentVersion() {
    const projectId = editorRef.current?.projectId
    closeEditor()
    if (projectId) await options.reload(projectId)
  }

  return {
    editor,
    editorRef,
    beginEdit,
    closeEditor,
    updateProjectDraft,
    updateProductionDraft,
    markRemotePending,
    saveEditor,
    useAgentVersion
  }
}
