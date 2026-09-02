import {
  hydrateThemePreviewAccess,
  readThemePreviewAccessUrl,
  themePreviewAccessNeedsRefresh,
  themePreviewAccessRefreshDelay
} from './theme-preview-access.js'

describe('Presentation Studio theme preview access', () => {
  it('hydrates path-only Project theme previews through host preview grants', async () => {
    const requestAccess = jest.fn().mockResolvedValue({
      payload: {
        url: 'http://localhost:3000/api/workspace-files/content/session-1/grant-1/theme01.png',
        expiresAt: '2026-08-31T10:00:00.000Z'
      }
    })

    await expect(hydrateThemePreviewAccess([{
      themePack: 'theme01',
      displayName: '轻拟态风',
      scenario: '产品介绍',
      fileKey: 'theme01'
    }], requestAccess)).resolves.toEqual([{
      themePack: 'theme01',
      displayName: '轻拟态风',
      scenario: '产品介绍',
      fileKey: 'theme01',
      fileUrl: 'http://localhost:3000/api/workspace-files/content/session-1/grant-1/theme01.png',
      accessExpiresAt: '2026-08-31T10:00:00.000Z'
    }])
    expect(requestAccess).toHaveBeenCalledWith('theme01', 'preview')
  })

  it('keeps existing direct URLs without requesting another grant', async () => {
    const requestAccess = jest.fn()

    await expect(hydrateThemePreviewAccess([{
      themePack: 'theme01',
      displayName: '轻拟态风',
      scenario: '产品介绍',
      fileKey: 'theme01',
      fileUrl: 'https://xpert.test/theme01.png'
    }], requestAccess)).resolves.toEqual([expect.objectContaining({
      fileUrl: 'https://xpert.test/theme01.png'
    })])
    expect(requestAccess).not.toHaveBeenCalled()
  })

  it('reads direct and bridge-wrapped preview grant URLs', () => {
    expect(readThemePreviewAccessUrl({ url: 'http://localhost:3000/api/workspace-files/direct.png' })).toBe(
      'http://localhost:3000/api/workspace-files/direct.png'
    )
    expect(readThemePreviewAccessUrl({
      result: { data: { url: 'http://localhost:3000/api/workspace-files/wrapped.png' } }
    })).toBe('http://localhost:3000/api/workspace-files/wrapped.png')
  })

  it('refreshes grants shortly before they become invalid', () => {
    const now = Date.parse('2026-08-31T09:00:00.000Z')
    const items = [{
      themePack: 'theme01',
      displayName: '轻拟态风',
      scenario: '产品介绍',
      fileKey: 'theme01',
      fileUrl: 'http://localhost:3000/api/workspace-files/content/session-1/grant-1/theme01.png',
      accessExpiresAt: '2026-08-31T10:00:00.000Z'
    }]

    expect(themePreviewAccessNeedsRefresh(items, now)).toBe(false)
    expect(themePreviewAccessRefreshDelay(items, now)).toBe(59 * 60 * 1_000 + 15_000)
    expect(themePreviewAccessNeedsRefresh(items, now + 59 * 60 * 1_000 + 16_000)).toBe(true)
  })
})
