import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export async function computePackState(packageRoot) {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: withoutNodeDebugger(process.env),
    maxBuffer: 16 * 1024 * 1024
  })
  if (result.status !== 0) {
    throw new Error(`Unable to inspect current package files: ${result.stderr?.trim() || 'npm pack failed'}`)
  }

  const metadata = parsePackMetadata(result.stdout)
  const files = metadata.files
    .map((file) => file?.path)
    .filter((path) => typeof path === 'string')
    .sort((left, right) => left.localeCompare(right))

  if (files.length === 0 || files.length !== metadata.files.length) {
    throw new Error('npm pack returned an invalid package file list.')
  }

  const root = resolve(packageRoot)
  const hash = createHash('sha256')
  for (const path of files) {
    const absolutePath = resolve(root, path)
    if (!absolutePath.startsWith(`${root}${sep}`)) {
      throw new Error(`npm pack returned a path outside the package: ${path}`)
    }
    const details = await lstat(absolutePath)
    if (!details.isFile()) {
      throw new Error(`npm pack input is not a regular file: ${path}`)
    }
    const content = await readFile(absolutePath)
    hash.update(path)
    hash.update('\0')
    hash.update(String(content.length))
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }

  return {
    fileCount: files.length,
    treeSha256: hash.digest('hex')
  }
}

export function withoutNodeDebugger(source) {
  const env = { ...source }
  delete env.NODE_OPTIONS
  delete env.VSCODE_INSPECTOR_OPTIONS
  delete env.NPM_CONFIG_OTP
  delete env.npm_config_otp
  return env
}

function parsePackMetadata(output) {
  const start = output.indexOf('[')
  const end = output.lastIndexOf(']')
  if (start < 0 || end <= start) {
    throw new Error('Unable to parse npm pack metadata.')
  }
  const metadata = JSON.parse(output.slice(start, end + 1))?.[0]
  if (!metadata || !Array.isArray(metadata.files)) {
    throw new Error('npm pack returned incomplete package metadata.')
  }
  return metadata
}
