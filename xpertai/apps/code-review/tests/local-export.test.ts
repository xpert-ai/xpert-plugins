import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localGitImportSchema } from '../src/local-git.js'
const exporter = fileURLToPath(new URL('../scripts/export-local-review.mjs', import.meta.url))
test('local exporter reads exact Git commits without changing the worktree or running external diff', t => {
  const dir = mkdtempSync(join(tmpdir(), 'xpert-local-review-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', dir, ...args], { encoding: 'utf8' }).trim()
  git('init', '-q'); git('config', 'user.name', 'Review acceptance'); git('config', 'user.email', 'acceptance@example.invalid')
  writeFileSync(join(dir, 'example.ts'), 'export const value = 1\n'); git('add', '.'); git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD')
  writeFileSync(join(dir, 'example.ts'), 'export const value = 2\n'); git('add', '.'); git('commit', '-qm', 'head')
  const head = git('rev-parse', 'HEAD')
  writeFileSync(join(dir, 'example.ts'), 'uncommitted text must not be exported\n')
  git('config', 'diff.external', '/this-must-not-run')
  const before = git('status', '--porcelain')
  const file = join(dir, 'review.json')
  execFileSync(process.execPath, [exporter, '--repository', dir, '--base', base, '--head', head, '--output', file])
  const bundle = localGitImportSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
  assert.equal(bundle.sources[0].head, 'export const value = 2\n')
  assert.equal(bundle.sources[0].base, 'export const value = 1\n')
  assert.equal(bundle.headSha, head); assert.equal(bundle.files[0].additions, 1)
  rmSync(file); assert.equal(git('status', '--porcelain'), before)
  symlinkSync('/etc/passwd', join(dir, 'symlink')); git('add', 'symlink'); git('commit', '-qm', 'symlink')
  assert.throws(() => execFileSync(process.execPath, [exporter, '--repository', dir, '--base', head, '--head', 'HEAD', '--output', file], { stdio: 'pipe' }), /Command failed/)
})
