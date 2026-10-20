// Read immutable Git objects only: never run hooks, filters, external diff tools or modify the checkout.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
const exec = promisify(execFile)
const args = process.argv.slice(2), options = new Map()
for (let index = 0; index < args.length; index += 2) {
  const key = args[index], value = args[index + 1]
  if (!['--repository', '--base', '--head', '--output', '--name'].includes(key) || !value || options.has(key)) throw new Error('Expected --repository PATH --base REF --head REF --output FILE [--name NAME]')
  options.set(key, value)
}
for (const key of ['--repository', '--base', '--head', '--output']) if (!options.has(key)) throw new Error(`Missing ${key}`)
const repository = resolve(options.get('--repository'))
const git = async (...args) => (await exec('git', ['-c', 'core.hooksPath=/dev/null', '-C', repository, ...args], {
  maxBuffer: 6_000_000, timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' }
})).stdout
const sha = async ref => {
  const value = (await git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`)).trim()
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error('A SHA-1 commit is required')
  return value
}
const baseSha = await sha(options.get('--base')), headSha = await sha(options.get('--head'))
const tokens = (await git('diff', '--name-status', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', baseSha, headSha, '--')).split('\0').filter(Boolean)
const files = [], sources = []
for (let index = 0; index < tokens.length; index += 2) {
  const [status, filename] = tokens.slice(index, index + 2)
  if (!['A', 'M', 'D', 'T'].includes(status) || !filename || filename.startsWith('/') || filename.split('/').some(part => ['..', '.', '.git', ''].includes(part))) throw new Error('Unsupported change path or status')
  if (files.length >= 200) throw new Error('Review at most 200 changed files per bundle')
  const patch = await git('diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=3', baseSha, headSha, '--', filename)
  const source = async revision => {
    const tree = await git('ls-tree', revision, '--', filename)
    if (!tree) return null
    if (!tree.startsWith('100644 blob ') && !tree.startsWith('100755 blob ')) throw new Error('Only regular source files can be imported')
    const content = await git('show', `${revision}:${filename}`)
    if (content.includes('\0') || content.length > 500_000) throw new Error('Binary or oversized source file; narrow the review commits')
    return content
  }
  const base = await source(baseSha), head = await source(headSha)
  if (patch.length > 500_000) throw new Error('Oversized diff; narrow the review commits')
  const lines = patch.split('\n')
  files.push({ filename, status: { A: 'added', M: 'modified', D: 'removed', T: 'changed' }[status], patch,
    additions: lines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length,
    deletions: lines.filter(line => line.startsWith('-') && !line.startsWith('---')).length })
  sources.push({ path: filename, base, head })
}
if (!files.length) throw new Error('The commits have no reviewable changes')
const name = options.get('--name') || basename(repository)
const bundle = { requestId: randomUUID(), repository: name, title: `${name}: ${baseSha.slice(0, 12)} → ${headSha.slice(0, 12)}`,
  baseSha, headSha, files, sources, instructions: '' }
const json = JSON.stringify(bundle)
if (Buffer.byteLength(json) > 5_000_000) throw new Error('Review bundle exceeds 5 MB; narrow the review commits')
await writeFile(resolve(options.get('--output')), json, { mode: 0o600, flag: 'wx' })
console.log(`Exported ${files.length} changed files (${Buffer.byteLength(json)} bytes). No repository changes or remote requests.`)
