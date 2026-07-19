import { parseCutHostEvent } from './cut-host-event.js'

describe('Cut host events', () => {
  it('matches an Agent split/trim completion nested in host data', () => {
    expect(parseCutHostEvent({ event: 'assistant.tool.completed', data: { toolName: 'cut_apply_edit' } })).toEqual({
      matches: true,
      toolName: 'cut_apply_edit'
    })
  })

  it('ignores unrelated tools', () => {
    expect(parseCutHostEvent({ data: { toolName: 'motion_save_web_artifact' } })).toEqual({ matches: false })
  })

  it('extracts stable target coordinates from a compact tool result', () => {
    expect(parseCutHostEvent({
      event: 'assistant.tool.completed',
      data: {
        toolName: 'cut_apply_batch',
        result: JSON.stringify({
          projectId: '11111111-1111-4111-8111-111111111111',
          revision: 8,
          changedClipIds: ['clip-a', 'clip-b'],
          changedTrackIds: ['track-a']
        })
      }
    })).toEqual({
      matches: true,
      toolName: 'cut_apply_batch',
      projectId: '11111111-1111-4111-8111-111111111111',
      revision: 8,
      changedClipIds: ['clip-a', 'clip-b'],
      changedTrackIds: ['track-a'],
      jobId: undefined,
      proposalId: undefined
    })
  })
})
