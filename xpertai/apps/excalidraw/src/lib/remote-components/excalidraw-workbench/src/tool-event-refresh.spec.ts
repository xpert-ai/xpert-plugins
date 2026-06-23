import {
  decideToolEventRefresh,
  isAnimatedPatchTool,
  normalizeToolCompletedEvent
} from './tool-event-refresh.js'

describe('Excalidraw tool event refresh helpers', () => {
  it('normalizes top-level tool and drawing ids', () => {
    const event = normalizeToolCompletedEvent({
      toolName: 'excalidraw_patch_scene',
      drawingId: 'drawing-1',
      versionId: 'version-1',
      versionNumber: 1
    })

    expect(event).toEqual({
      toolName: 'excalidraw_patch_scene',
      drawingId: 'drawing-1',
      versionId: 'version-1',
      versionNumber: 1,
      isMutation: true,
      isCreateDrawing: false,
      isMermaidDraft: false
    })
  })

  it('normalizes compact result payloads', () => {
    const event = normalizeToolCompletedEvent({
      payload: {
        toolName: 'excalidraw_add_elements',
        result: {
          drawingId: 'drawing-2',
          versionId: 'version-2',
          versionNumber: 2
        }
      }
    })

    expect(event?.toolName).toBe('excalidraw_add_elements')
    expect(event?.drawingId).toBe('drawing-2')
    expect(event?.versionId).toBe('version-2')
    expect(event?.versionNumber).toBe(2)
    expect(event?.isMutation).toBe(true)
  })

  it('normalizes JSON string tool result content', () => {
    const event = normalizeToolCompletedEvent({
      toolCall: {
        function: {
          name: 'excalidraw_save_scene_version'
        },
        arguments: '{"drawingId":"drawing-3"}'
      },
      content: '{"currentVersion":{"id":"version-3","drawingId":"drawing-3","versionNumber":3}}'
    })

    expect(event?.toolName).toBe('excalidraw_save_scene_version')
    expect(event?.drawingId).toBe('drawing-3')
    expect(event?.versionId).toBe('version-3')
    expect(event?.versionNumber).toBe(3)
  })

  it('normalizes currentVersion drawing and version metadata', () => {
    const event = normalizeToolCompletedEvent({
      data: {
        name: 'excalidraw_save_mermaid_draft',
        currentVersion: {
          id: 'version-4',
          drawingId: 'drawing-4',
          versionNumber: '4'
        }
      }
    })

    expect(event?.drawingId).toBe('drawing-4')
    expect(event?.versionId).toBe('version-4')
    expect(event?.versionNumber).toBe(4)
    expect(event?.isMermaidDraft).toBe(true)
  })

  it('normalizes drawing ids from generic ChatKit argsPreview payloads', () => {
    const event = normalizeToolCompletedEvent({
      name: 'assistant.tool.completed',
      source: 'chatkit',
      toolName: 'excalidraw_patch_scene',
      payload: {
        data: {
          toolName: 'excalidraw_patch_scene',
          argsPreview: '{"drawingId":"drawing-args","updates":[{"id":"element-1","patch":{"text":"Updated"}}]}'
        }
      }
    })

    expect(event?.toolName).toBe('excalidraw_patch_scene')
    expect(event?.drawingId).toBe('drawing-args')
  })

  it('normalizes drawing ids from truncated ChatKit argsPreview payloads', () => {
    const event = normalizeToolCompletedEvent({
      name: 'assistant.tool.completed',
      source: 'chatkit',
      toolName: 'excalidraw_patch_scene',
      payload: {
        data: {
          toolName: 'excalidraw_patch_scene',
          argsPreview: '{"drawingId":"drawing-truncated","updates":[{"id":"element-1","patch":{"text":"long...'
        }
      }
    })

    expect(event?.drawingId).toBe('drawing-truncated')
  })

  it('normalizes drawing ids from generic ChatKit component output payloads', () => {
    const event = normalizeToolCompletedEvent({
      name: 'assistant.tool.completed',
      source: 'chatkit',
      toolName: 'excalidraw_patch_scene',
      payload: {
        data: {
          tool: 'excalidraw_patch_scene',
          output: {
            drawingId: 'drawing-output',
            versionNumber: 13
          }
        }
      }
    })

    expect(event?.toolName).toBe('excalidraw_patch_scene')
    expect(event?.drawingId).toBe('drawing-output')
    expect(event?.versionNumber).toBe(13)
  })

  it('normalizes created drawing ids from JSON string tool output content', () => {
    const event = normalizeToolCompletedEvent({
      name: 'assistant.tool.completed',
      source: 'chatkit',
      toolName: 'excalidraw_create_drawing',
      payload: {
        data: {
          toolName: 'excalidraw_create_drawing',
          content: '{"success":true,"message":"Excalidraw drawing was created.","drawingId":"drawing-created"}'
        }
      }
    })

    expect(event?.toolName).toBe('excalidraw_create_drawing')
    expect(event?.drawingId).toBe('drawing-created')
    expect(event?.isCreateDrawing).toBe(true)
  })

  it('does not refresh for read-only tools', () => {
    const event = normalizeToolCompletedEvent({
      toolName: 'excalidraw_get_drawing',
      drawingId: 'drawing-5'
    })

    expect(decideToolEventRefresh(event, { selectedDrawingId: 'drawing-5' })).toEqual({
      shouldReloadList: false,
      shouldSelectDrawing: false,
      shouldNotify: false,
      shouldQueueMermaidPreview: false,
      shouldProtectDirtyScene: false,
      shouldLoadProtectedDetail: false
    })
  })

  it('does not select a drawing when a mutation event has no drawing id', () => {
    const event = normalizeToolCompletedEvent({
      toolName: 'excalidraw_create_drawing'
    })

    expect(decideToolEventRefresh(event, { selectedDrawingId: 'drawing-current' })).toEqual({
      shouldReloadList: true,
      shouldSelectDrawing: false,
      shouldNotify: true,
      shouldQueueMermaidPreview: false,
      shouldProtectDirtyScene: false,
      shouldLoadProtectedDetail: false
    })
  })

  it('selects a target drawing when the dirty scene is safe to replace', () => {
    const event = normalizeToolCompletedEvent({
      toolName: 'excalidraw_create_drawing',
      drawingId: 'drawing-created'
    })

    expect(decideToolEventRefresh(event, {
      selectedDrawingId: 'drawing-empty',
      isDirty: true,
      canReplaceDirtyScene: true
    })).toEqual({
      shouldReloadList: true,
      shouldSelectDrawing: true,
      shouldNotify: true,
      shouldQueueMermaidPreview: false,
      shouldProtectDirtyScene: false,
      shouldLoadProtectedDetail: false,
      targetDrawingId: 'drawing-created'
    })
  })

  it('selects a created drawing without dirty protection', () => {
    const event = normalizeToolCompletedEvent({
      toolName: 'excalidraw_create_drawing',
      drawingId: 'drawing-created'
    })

    expect(decideToolEventRefresh(event, {
      selectedDrawingId: 'drawing-created',
      isDirty: true
    })).toEqual({
      shouldReloadList: true,
      shouldSelectDrawing: true,
      shouldNotify: true,
      shouldQueueMermaidPreview: false,
      shouldProtectDirtyScene: false,
      shouldLoadProtectedDetail: false,
      targetDrawingId: 'drawing-created'
    })
  })

  it('queues Mermaid preview only when the dirty canvas is not protected', () => {
    const event = normalizeToolCompletedEvent({
      toolName: 'excalidraw_save_mermaid_draft',
      drawingId: 'drawing-6'
    })

    expect(decideToolEventRefresh(event, { selectedDrawingId: 'drawing-6' }).shouldQueueMermaidPreview).toBe(true)
    expect(decideToolEventRefresh(event, {
      selectedDrawingId: 'drawing-6',
      isDirty: true
    })).toEqual({
      shouldReloadList: true,
      shouldSelectDrawing: false,
      shouldNotify: true,
      shouldQueueMermaidPreview: false,
      shouldProtectDirtyScene: true,
      shouldLoadProtectedDetail: true,
      targetDrawingId: 'drawing-6'
    })
  })

  it('selects Mermaid draft target drawing when a different canvas is dirty', () => {
    const event = normalizeToolCompletedEvent({
      toolName: 'excalidraw_save_mermaid_draft',
      drawingId: 'drawing-target'
    })

    expect(decideToolEventRefresh(event, {
      selectedDrawingId: 'drawing-current',
      isDirty: true
    })).toEqual({
      shouldReloadList: true,
      shouldSelectDrawing: true,
      shouldNotify: true,
      shouldQueueMermaidPreview: true,
      shouldProtectDirtyScene: false,
      shouldLoadProtectedDetail: false,
      targetDrawingId: 'drawing-target'
    })
  })

  it('protects unsaved canvas edits from automatic scene application', () => {
    const event = normalizeToolCompletedEvent({
      toolName: 'excalidraw_add_elements',
      drawingId: 'drawing-7'
    })

    expect(decideToolEventRefresh(event, {
      selectedDrawingId: 'drawing-7',
      isDirty: true
    })).toEqual({
      shouldReloadList: true,
      shouldSelectDrawing: false,
      shouldNotify: true,
      shouldQueueMermaidPreview: false,
      shouldProtectDirtyScene: true,
      shouldLoadProtectedDetail: true,
      targetDrawingId: 'drawing-7'
    })
  })

  it('marks only patch-style tools as animated scene updates', () => {
    expect(isAnimatedPatchTool('excalidraw_add_elements')).toBe(true)
    expect(isAnimatedPatchTool('excalidraw_patch_scene')).toBe(true)
    expect(isAnimatedPatchTool('excalidraw_save_scene_version')).toBe(false)
    expect(isAnimatedPatchTool('excalidraw_save_mermaid_draft')).toBe(false)
    expect(isAnimatedPatchTool('excalidraw_create_drawing')).toBe(false)
  })
})
