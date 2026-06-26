import { shouldRefreshForCanvasToolEvent } from './tool-event-refresh.js'

describe('canvas tool event refresh', () => {
  it('refreshes only for Canvas mutation tools', () => {
    expect(shouldRefreshForCanvasToolEvent({ toolName: 'canvas_insert_image' })).toBe(true)
    expect(shouldRefreshForCanvasToolEvent({ payload: { toolName: 'canvas_patch_records' } })).toBe(true)
    expect(shouldRefreshForCanvasToolEvent({ toolName: 'other_tool' })).toBe(false)
  })
})
