import { createHash } from 'node:crypto'
import { readFile, lstat, realpath, readdir } from 'node:fs/promises'
import path from 'node:path'
export const INPUT_LIMIT = 100 * 1024 * 1024
export const OUTPUT_LIMIT = 128 * 1024 * 1024
export const ASSET_LIMIT = 1000
export function fail(code, pages) {
  throw Object.assign(new Error(code), { code, pages })
}
export function asset(name, mimeType, data, page) {
  if (data.length > OUTPUT_LIMIT) fail('OUTPUT_TOO_LARGE')
  return {
    name,
    mimeType,
    size: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    data: data.toString('base64'),
    ...(page ? { page } : {})
  }
}
export async function readBounded(file, limit = OUTPUT_LIMIT) {
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) fail('INVALID_DOCUMENT')
  if (stat.size > limit) fail('OUTPUT_TOO_LARGE')
  const data = await readFile(file)
  if (data.length > limit) fail('OUTPUT_TOO_LARGE')
  return data
}
export async function safeOutput(root, relative) {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    /[\\\0]/.test(relative) ||
    relative.split('/').some((p) => !p || p === '..' || p === '.')
  )
    fail('INVALID_DOCUMENT')
  const target = path.join(root, relative)
  let current = root
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    if ((await lstat(current)).isSymbolicLink()) fail('INVALID_DOCUMENT')
  }
  const resolved = await realpath(target)
  if (!resolved.startsWith((await realpath(root)) + path.sep)) fail('INVALID_DOCUMENT')
  return target
}
export async function checkOutputTree(root) {
  let total = 0,
    count = 0
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (++count > 5000 || entry.isSymbolicLink()) fail('OUTPUT_TOO_LARGE')
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) await visit(file)
      else {
        const stat = await lstat(file)
        if (!stat.isFile()) fail('INVALID_DOCUMENT')
        total += stat.size
        if (total > OUTPUT_LIMIT) fail('OUTPUT_TOO_LARGE')
      }
    }
  }
  await visit(root)
}
export function finish(result) {
  if (!result.markdown.trim()) fail('EMPTY_TEXT')
  if (result.assets.length > ASSET_LIMIT) fail('OUTPUT_TOO_LARGE')
  const decoded = Buffer.byteLength(result.markdown) + result.assets.reduce((n, a) => n + a.size, 0)
  if (decoded > OUTPUT_LIMIT || Buffer.byteLength(JSON.stringify(result)) > OUTPUT_LIMIT) fail('OUTPUT_TOO_LARGE')
  return { ok: true, ...result }
}
