import { rm, realpath } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const packageRoot = await realpath(join(dirname(fileURLToPath(import.meta.url)), '..'))
const target = join(packageRoot, 'dist')
try {
  const resolved = await realpath(target)
  if (relative(packageRoot, resolved) !== 'dist') throw new Error('Refusing to clean a dist directory outside this package.')
  await rm(target, { recursive: true, force: true })
} catch (error) { if (error.code !== 'ENOENT') throw error }
