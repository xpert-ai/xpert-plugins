import { BaiduNetdiskConnectorError } from '../errors.js'
import type { BaiduNetdiskPathPolicy } from '../plugin-config.js'

export function normalizePath(value: string): string {
  const input = value.trim()
  if (!input.startsWith('/') || input.includes('\0')) {
    throw new BaiduNetdiskConnectorError('INVALID_ARGUMENT', 'Baidu Netdisk paths must be absolute and valid.')
  }
  const segments = input.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new BaiduNetdiskConnectorError('PATH_OUTSIDE_ALLOWED_ROOT', 'Path traversal is not allowed.')
  }
  return `/${segments.join('/')}` || '/'
}

export function ensureAllowedPath(value: string, policy: BaiduNetdiskPathPolicy): string {
  const normalized = normalizePath(value)
  if (policy.mode === 'authorized_root' && policy.allowOutsideAppFolder) return normalized
  const root = normalizePath(policy.appFolder)
  if (normalized !== root && !normalized.startsWith(`${root}/`)) {
    throw new BaiduNetdiskConnectorError(
      'PATH_OUTSIDE_ALLOWED_ROOT',
      `Path must be inside the allowed application folder '${root}'.`
    )
  }
  return normalized
}

export function ensureFileName(value: string): string {
  const name = value.trim()
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new BaiduNetdiskConnectorError('INVALID_ARGUMENT', 'File name contains unsupported path characters.')
  }
  if (name.length > 160) throw new BaiduNetdiskConnectorError('INVALID_ARGUMENT', 'File name is too long.')
  return name
}
