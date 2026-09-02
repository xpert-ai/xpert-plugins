import { getSuccessfulActionData, requireSuccessfulActionResult } from './action-response.js'

describe('Office Editor action responses', () => {
  it('rejects a localized business failure returned inside the remote bridge envelope', () => {
    expect(() => requireSuccessfulActionResult({
      payload: {
        success: false,
        message: {
          en_US: 'Collaboration document access was denied.',
          zh_Hans: '协作文档访问被拒绝。'
        }
      }
    }, 'zh-Hans')).toThrow('协作文档访问被拒绝。')
  })

  it('returns action data only after the action succeeds', () => {
    const data = { item: { id: 'document-1' } }

    expect(getSuccessfulActionData({ payload: { success: true, data } }, 'en-US')).toBe(data)
  })
})
