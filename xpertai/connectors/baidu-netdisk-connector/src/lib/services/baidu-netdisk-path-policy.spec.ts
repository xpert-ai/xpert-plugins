import { BaiduNetdiskConnectorError } from '../errors.js'
import { ensureAllowedPath, ensureFileName, normalizePath } from './baidu-netdisk-path-policy.js'

const appFolder = { mode: 'app_folder' as const, appFolder: '/apps/xpert', allowOutsideAppFolder: false }

describe('Baidu Netdisk path policy', () => {
  it('normalizes paths without permitting traversal', () => {
    expect(normalizePath('//apps//xpert/')).toBe('/apps/xpert')
    expect(() => normalizePath('/apps/xpert/../private')).toThrow(BaiduNetdiskConnectorError)
    expect(() => ensureAllowedPath('/private', appFolder)).toThrow(BaiduNetdiskConnectorError)
    expect(ensureAllowedPath('/apps/xpert/docs', appFolder)).toBe('/apps/xpert/docs')
  })

  it('allows the authorized root only when explicitly configured', () => {
    expect(ensureAllowedPath('/private', { ...appFolder, mode: 'authorized_root', allowOutsideAppFolder: true })).toBe(
      '/private'
    )
  })

  it('validates destination file names', () => {
    expect(ensureFileName(' report.txt ')).toBe('report.txt')
    expect(() => ensureFileName('../report.txt')).toThrow(BaiduNetdiskConnectorError)
  })
})
