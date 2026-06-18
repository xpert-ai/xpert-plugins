import {
  summarizeFailureResult,
  summarizeStatusResult
} from './excalidraw-agent-response.js'

describe('Excalidraw agent response summaries', () => {
  it('returns top-level drawing id for status updates', () => {
    expect(summarizeStatusResult({
      success: true,
      message: 'Status updated.',
      item: {
        id: 'drawing-1',
        title: 'Architecture',
        status: 'reviewed'
      }
    })).toEqual({
      success: true,
      message: 'Status updated.',
      drawingId: 'drawing-1',
      item: {
        id: 'drawing-1',
        title: 'Architecture',
        status: 'reviewed'
      }
    })
  })

  it('returns top-level drawing and version ids for failure logs', () => {
    expect(summarizeFailureResult({
      success: true,
      message: 'Failure recorded.',
      log: {
        id: 'log-1',
        drawingId: 'drawing-2',
        versionId: 'version-2',
        action: 'convert',
        actorType: 'agent',
        errorMessage: 'Bad Mermaid',
        createdAt: '2026-06-18T01:02:03.000Z'
      }
    })).toEqual({
      success: true,
      message: 'Failure recorded.',
      drawingId: 'drawing-2',
      versionId: 'version-2',
      log: {
        id: 'log-1',
        drawingId: 'drawing-2',
        versionId: 'version-2',
        action: 'convert',
        actorType: 'agent',
        errorMessage: 'Bad Mermaid',
        createdAt: '2026-06-18T01:02:03.000Z'
      }
    })
  })
})
