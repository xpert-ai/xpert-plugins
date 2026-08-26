import { KdocsConnectorError } from '../errors.js'
import { mapFilePage, unwrapProviderData } from './kdocs-mappers.js'

describe('WPS response mapping', () => {
  it('unwraps the nested SkillHub and OpenAPI response envelopes', () => {
    expect(unwrapProviderData({
      code: 0,
      message: 'success',
      data: {
        code: 0,
        msg: 'success',
        data: { items: [], total: 0 }
      }
    })).toEqual({ items: [], total: 0 })
  })

  it('maps files returned inside the nested SkillHub envelope', () => {
    expect(mapFilePage({
      code: 0,
      data: {
        code: 0,
        data: {
          items: [{ file: { id: 'folder-1', name: 'Xpert-KDocs-Test', type: 'folder', drive_id: 'drive-1' } }],
          total: 1
        }
      }
    })).toMatchObject({
      status: 'ok',
      items: [{ fileId: 'folder-1', name: 'Xpert-KDocs-Test', type: 'folder', driveId: 'drive-1' }],
      total: 1
    })
  })

  it('does not hide a provider failure inside a successful outer envelope', () => {
    expect(() => unwrapProviderData({
      code: 0,
      data: { code: 429001, msg: 'rate limited', data: {} }
    })).toThrow(expect.objectContaining<Partial<KdocsConnectorError>>({
      code: 'RATE_LIMITED',
      retryable: true
    }))
  })
})
