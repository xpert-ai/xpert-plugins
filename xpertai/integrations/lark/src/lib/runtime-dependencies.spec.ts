import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const pluginRoot = existsSync(join(process.cwd(), 'src'))
  ? process.cwd()
  : join(process.cwd(), 'integrations/lark')
const legacyContractsPackage = '@metad' + '/contracts'

function collectFiles(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (['dist', 'node_modules', 'out-tsc'].includes(entry)) {
      continue
    }

    const path = join(dir, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      collectFiles(path, files)
    } else if (path.endsWith('.ts') || path.endsWith('package.json')) {
      files.push(path)
    }
  }

  return files
}

describe('runtime dependencies', () => {
  it('does not reference legacy contracts package', () => {
    expect(existsSync(pluginRoot)).toBe(true)

    const offenders = collectFiles(pluginRoot)
      .filter((path) => readFileSync(path, 'utf8').includes(legacyContractsPackage))
      .map((path) => relative(pluginRoot, path))

    expect(offenders).toEqual([])
  })
})
