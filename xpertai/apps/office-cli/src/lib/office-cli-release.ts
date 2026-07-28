import { existsSync } from 'node:fs'
import {
  OFFICE_CLI_RELEASE_ASSETS,
  OFFICE_CLI_RELEASE_VERSION
} from './constants.js'

export type OfficeCliReleaseAssetKey = keyof typeof OFFICE_CLI_RELEASE_ASSETS

export function resolveOfficeCliReleaseAsset(
  platform = process.platform,
  arch = process.arch,
  alpine = detectAlpine()
) {
  const normalizedArch = arch === 'x64' || arch === 'arm64' ? arch : null
  if (!normalizedArch) {
    throw new Error(`OfficeCLI does not provide a pinned binary for architecture ${arch}.`)
  }

  const key = platform === 'linux' && alpine
    ? `linux-alpine-${normalizedArch}`
    : `${platform}-${normalizedArch}`
  if (!isOfficeCliReleaseAssetKey(key)) {
    throw new Error(`OfficeCLI does not provide a pinned binary for ${platform}/${arch}.`)
  }
  const asset = OFFICE_CLI_RELEASE_ASSETS[key]
  return {
    ...asset,
    key,
    version: OFFICE_CLI_RELEASE_VERSION,
    url: `https://github.com/iOfficeAI/OfficeCLI/releases/download/${OFFICE_CLI_RELEASE_VERSION}/${asset.name}`
  }
}

function detectAlpine() {
  return process.env.OFFICECLI_ALPINE === '1'
    || (process.platform === 'linux' && existsSync('/etc/alpine-release'))
}

function isOfficeCliReleaseAssetKey(value: string): value is OfficeCliReleaseAssetKey {
  return Object.prototype.hasOwnProperty.call(OFFICE_CLI_RELEASE_ASSETS, value)
}
