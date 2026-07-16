import {
  assertCutAssistantContextSetSucceeded,
  createCutAssistantContextClearPayload,
  createCutAssistantContextSetPayload
} from './cut-assistant-context.js'

describe('Cut Assistant context', () => {
  it('builds the host command payload with environment variables and structured currentProject context', () => {
    expect(createCutAssistantContextSetPayload({
      projectId: '11111111-1111-4111-8111-111111111111',
      title: 'Launch edit',
      status: 'draft',
      revision: 7,
      currentVersionNumber: 2,
      selectedClipId: 'clip-a',
      dirty: true
    })).toEqual({
      key: 'cut',
      env: {
        cutProjectId: '11111111-1111-4111-8111-111111111111',
        cutRevision: '7',
        cutSelectedClipId: 'clip-a',
        cutDirty: 'true'
      },
      context: {
        currentProject: {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Launch edit',
          status: 'draft',
          revision: 7,
          currentVersionNumber: 2,
          selectedClipId: 'clip-a',
          dirty: true
        }
      }
    })
  })

  it('builds the supported clear payload when there is no active project', () => {
    expect(createCutAssistantContextClearPayload()).toEqual({ key: 'cut', clear: true })
  })

  it('rejects resolved business failures instead of treating them as successful transport responses', () => {
    expect(() => assertCutAssistantContextSetSucceeded({ success: true, status: 'updated' })).not.toThrow()
    expect(() => assertCutAssistantContextSetSucceeded({ success: false, message: 'Context key is required.' }))
      .toThrow('Context key is required.')
    expect(() => assertCutAssistantContextSetSucceeded({ status: 'updated' }))
      .toThrow('The host rejected the Cut Assistant context update.')
  })
})
