import {
  needsMediaAccessRefresh,
  readMediaAccessUrl
} from './production-media-access.js'

describe('production media access', () => {
  it('reads direct and bridge-wrapped file access grants', () => {
    expect(readMediaAccessUrl({ url: '/api/workspace-files/direct.mp4' })).toBe(
      '/api/workspace-files/direct.mp4'
    )
    expect(
      readMediaAccessUrl({
        result: {
          data: {
            url: '/api/workspace-files/wrapped.mp4'
          }
        }
      })
    ).toBe('/api/workspace-files/wrapped.mp4')
  })

  it('ignores malformed grants', () => {
    expect(readMediaAccessUrl({ result: { url: '   ' } })).toBeNull()
    expect(readMediaAccessUrl(null)).toBeNull()
  })

  it('refreshes legacy workspace grants even when workspacePath is missing', () => {
    expect(
      needsMediaAccessRefresh({
        workspacePath: null,
        fileUrl:
          'http://localhost:3000/api/workspace-files/content/old-session/old-grant/reference.jpg'
      })
    ).toBe(true)
    expect(
      needsMediaAccessRefresh({
        workspacePath: 'story-studio/project/assets/reference.jpg',
        fileUrl: null
      })
    ).toBe(true)
    expect(
      needsMediaAccessRefresh({
        workspacePath: null,
        fileUrl: 'https://cdn.example.com/reference.jpg'
      })
    ).toBe(false)
  })
})
