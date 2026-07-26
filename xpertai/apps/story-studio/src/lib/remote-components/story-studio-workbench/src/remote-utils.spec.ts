import { createTranslator, normalizeLocale } from './i18n'
import { buildStoryStudioAssistantContext } from './assistant-context'
import type { RemoteObject } from './runtime'
import { normalizeStoryToolEvent } from './tool-event'

describe('Story Studio remote utility boundaries', () => {
  it('marks unsaved human drafts in Assistant context', () => {
    const context = buildStoryStudioAssistantContext(
      {
        id: 'project-1',
        title: 'Moon Harbor',
        productionFormat: 'vertical_short',
        aspectRatio: '9:16',
        targetDurationSeconds: 60,
        status: 'planning',
        revision: 4,
        tags: [],
        nextAction: 'Review'
      },
      true
    )
    expect(context).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({ storyProjectDirty: 'true' })
      })
    )
  })

  it('normalizes locale variants and interpolates the complete catalogs', () => {
    expect(normalizeLocale('zh_TW')).toBe('zh-Hant')
    expect(normalizeLocale('zh-CN')).toBe('zh-Hans')
    expect(normalizeLocale('fr-FR')).toBe('en-US')
    expect(
      createTranslator('zh-Hant')('pagination.page', {
        page: 2,
        pages: 4
      })
    ).toBe('第 2 / 4 頁')
    expect(
      createTranslator('en-US')('changes.created', {
        title: 'Moon Harbor'
      })
    ).toBe('Created story project Moon Harbor')
  })

  it('finds compact project ids in nested and JSON-encoded host events', () => {
    expect(
      normalizeStoryToolEvent({
        payload: {
          data: JSON.stringify({
            tool: 'story_update_project_status',
            output: {
              receipt: {
                projectId: '00000000-0000-4000-8000-000000000001'
              }
            }
          })
        }
      })
    ).toEqual({
      toolName: 'story_update_project_status',
      projectId: '00000000-0000-4000-8000-000000000001'
    })
  })

  it('bounds malformed and cyclic host-event traversal', () => {
    const event: RemoteObject = {
      tool: 'story_create_project'
    }
    event.payload = event
    expect(normalizeStoryToolEvent(event)).toEqual({
      toolName: 'story_create_project',
      projectId: null
    })
  })

  it('does not treat a host event id as a Story project id', () => {
    expect(
      normalizeStoryToolEvent({
        id: 'assistant.tool.completed:story_record_cut_handoff_delivery',
        payload: {
          toolName: 'story_record_cut_handoff_delivery',
          result: {
            handoffId: '21063d6e-35cf-4fea-b7fd-307cd4c178e7',
            status: 'failed'
          }
        }
      })
    ).toEqual({
      toolName: 'story_record_cut_handoff_delivery',
      projectId: null
    })
  })
})
