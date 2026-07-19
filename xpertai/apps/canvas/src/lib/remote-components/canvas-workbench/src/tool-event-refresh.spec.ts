import { getCanvasToolRefreshEvent, normalizeCanvasToolEvent, shouldRefreshForCanvasToolEvent } from './tool-event-refresh.js'

describe('canvas tool event refresh', () => {
  it('refreshes only for Canvas mutation tools', () => {
    expect(shouldRefreshForCanvasToolEvent({ toolName: 'canvas_insert_image' })).toBe(true)
    expect(shouldRefreshForCanvasToolEvent({ payload: { toolName: 'canvas_patch_records' } })).toBe(true)
    expect(shouldRefreshForCanvasToolEvent({ toolName: 'canvas_create_version' })).toBe(false)
    expect(shouldRefreshForCanvasToolEvent({ toolName: 'other_tool' })).toBe(false)
  })

  it('normalizes ChatKit wrapped tool completion events', () => {
    const event = normalizeCanvasToolEvent({
      name: 'assistant.tool.completed',
      source: 'chatkit',
      payload: {
        data: {
          toolName: 'canvas_insert_image',
          output: {
            documentId: 'canvas-doc-1'
          }
        }
      }
    })

    expect(event).toMatchObject({
      matched: true,
      toolName: 'canvas_insert_image',
      documentId: 'canvas-doc-1',
      source: 'chatkit',
      matchedPath: '$.payload.data.toolName'
    })
    expect(event.candidateCount).toBeGreaterThan(1)
  })

  it('normalizes remote component forwarded host events without result payloads', () => {
    const event = normalizeCanvasToolEvent({
      type: 'assistant.tool.completed',
      source: 'chatkit',
      toolName: 'canvas_insert_image',
      subscriptionKey: 'canvas-tool-completed',
      viewKey: 'canvas__canvas_workbench'
    })

    expect(event).toEqual({
      matched: true,
      toolName: 'canvas_insert_image',
      documentId: undefined,
      source: 'chatkit',
      candidateCount: 1,
      matchedPath: '$.toolName'
    })
  })

  it('normalizes toolCall payloads and input target document ids', () => {
    const event = normalizeCanvasToolEvent({
      name: 'assistant.tool.completed',
      toolCall: {
        function: {
          name: 'canvas_insert_image'
        },
        args: {
          target: {
            documentId: 'canvas-doc-2'
          }
        }
      }
    })

    expect(event).toMatchObject({
      matched: true,
      toolName: 'canvas_insert_image',
      documentId: 'canvas-doc-2',
      matchedPath: '$.toolCall.function.name'
    })
  })

  it('normalizes JSON string args previews from forwarded events', () => {
    const event = normalizeCanvasToolEvent({
      name: 'assistant.tool.completed',
      payload: {
        data: {
          tool: 'canvas_patch_records',
          argsPreview: '{"documentId":"canvas-doc-3","updates":[{"id":"shape:1"'
        }
      }
    })

    expect(event).toMatchObject({
      matched: true,
      toolName: 'canvas_patch_records',
      documentId: 'canvas-doc-3',
      matchedPath: '$.payload.data.tool'
    })
  })

  it('normalizes component output payload document ids', () => {
    const event = normalizeCanvasToolEvent({
      type: 'assistant.tool.completed',
      source: 'chatkit',
      data: {
        tool: 'canvas_insert_image',
        output: {
          documentId: 'canvas-doc-output'
        }
      }
    })

    expect(event).toMatchObject({
      matched: true,
      toolName: 'canvas_insert_image',
      documentId: 'canvas-doc-output',
      source: 'chatkit',
      matchedPath: '$.data.tool'
    })
  })

  it('ignores read-only Canvas tools for live scene refresh', () => {
    expect(getCanvasToolRefreshEvent({ toolName: 'canvas_get_document', documentId: 'canvas-doc-4' })).toBeNull()
    expect(getCanvasToolRefreshEvent({ toolName: 'canvas_list_records', documentId: 'canvas-doc-4' })).toBeNull()
    expect(normalizeCanvasToolEvent({ toolName: 'canvas_get_document', documentId: 'canvas-doc-4' })).toEqual({
      matched: false,
      toolName: 'canvas_get_document',
      documentId: 'canvas-doc-4',
      candidateCount: 1,
      matchedPath: '$.toolName',
      ignoredReason: 'read_only_canvas_tool'
    })
  })

  it('ignores non Canvas tools with a reason', () => {
    expect(normalizeCanvasToolEvent({ toolName: 'seedream_text_to_image' })).toEqual({
      matched: false,
      toolName: 'seedream_text_to_image',
      documentId: undefined,
      candidateCount: 1,
      matchedPath: '$.toolName',
      ignoredReason: 'non_canvas_tool'
    })
  })
})
