import {
  summarizeFailureResult,
  summarizeDrawingMutationResult,
  summarizeStatusResult
} from './excalidraw-agent-response.js'

describe('Excalidraw agent response summaries', () => {
  it('uses the service message for mutation summaries', () => {
    expect(summarizeDrawingMutationResult({
      success: true,
      message: 'Service fallback.',
      patch: {
        addCount: 1
      }
    }, 'Default fallback.')).toEqual({
      success: true,
      message: 'Service fallback.',
      patch: {
        addCount: 1
      }
    })
  })

  it('returns minimal status update results', () => {
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
      status: 'reviewed'
    })
  })

  it('returns minimal failure log results', () => {
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
      message: 'Failure recorded.'
    })
  })
})
