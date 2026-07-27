export const STORY_STUDIO_ASSISTANT_CONTEXT_KEY = 'storyStudio'

export interface StoryStudioAssistantProject {
  id: string
  title: string
  productionFormat: string
  aspectRatio: string
  targetDurationSeconds: number | null
  status: string
  revision: number
  tags: string[]
  nextAction: string
}

export function buildStoryStudioAssistantContext(
  project: StoryStudioAssistantProject | null,
  dirty = false
) {
  if (!project) {
    return {
      key: STORY_STUDIO_ASSISTANT_CONTEXT_KEY,
      clear: true as const
    }
  }

  return {
    key: STORY_STUDIO_ASSISTANT_CONTEXT_KEY,
    env: {
      storyProjectId: project.id,
      storyProjectRevision: String(project.revision),
      storyProjectDirty: String(dirty)
    },
    context: {
      currentProject: {
        id: project.id,
        title: project.title,
        productionFormat: project.productionFormat,
        aspectRatio: project.aspectRatio,
        targetDurationSeconds: project.targetDurationSeconds,
        status: project.status,
        revision: project.revision,
        tags: project.tags,
        nextAction: project.nextAction
      }
    }
  }
}
