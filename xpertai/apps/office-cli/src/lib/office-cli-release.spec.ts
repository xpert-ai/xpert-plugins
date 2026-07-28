jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `${namespace}_${key}`
}))

import { resolveOfficeCliReleaseAsset } from './office-cli-release.js'

describe('resolveOfficeCliReleaseAsset', () => {
  it('resolves the pinned Linux x64 release with checksum', () => {
    expect(resolveOfficeCliReleaseAsset('linux', 'x64', false)).toEqual(expect.objectContaining({
      version: 'v1.0.142',
      name: 'officecli-linux-x64',
      sha256: 'f78563abc13cf70dcd420644019d2f11dc36ea2957ac738613a6911d652b5541'
    }))
  })

  it('resolves Alpine separately from glibc Linux', () => {
    expect(resolveOfficeCliReleaseAsset('linux', 'arm64', true).name).toBe('officecli-linux-alpine-arm64')
  })

  it('rejects unsupported architectures', () => {
    expect(() => resolveOfficeCliReleaseAsset('linux', 'ia32', false)).toThrow('architecture ia32')
  })
})
