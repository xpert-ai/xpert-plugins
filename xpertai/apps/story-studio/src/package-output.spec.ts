import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

describe('Story Studio release package verification', () => {
  const packageRoot = join(__dirname, '..')
  const packageJson = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8')
  )
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, '.xpertai-plugin/plugin.json'), 'utf8')
  )

  it.each([
    ['release-synchronized version', packageJson.version, true],
    ['legacy omitted version', undefined, true],
    ['stale version', '0.0.0-stale', false],
    ['invalid version type', 7, false],
    ['null version', null, false]
  ])('checks %s through the prepack verifier', (_label, version, succeeds) => {
    const root = mkdtempSync(join(tmpdir(), 'story-package-output-'))
    try {
      // Minimal build output: this regression targets the manifest boundary,
      // while prepack and the lifecycle harness validate actual built artifacts.
      for (const path of [
        'dist/index.js',
        'dist/index.d.ts',
        'dist/xpert-story-studio-assistant.yaml',
        'dist/lib/remote-components/story-studio-workbench/app.js',
        'dist/lib/remote-components/story-studio-workbench/app.css',
        'dist/sandbox-actions/video-frame/action.json',
        'assets/logo.svg',
        'assets/composerIcon.svg',
        'skills/story-studio-agent-skill/SKILL.md',
        'README.md'
      ]) {
        mkdirSync(dirname(join(root, path)), { recursive: true })
        writeFileSync(join(root, path), '')
      }
      mkdirSync(join(root, 'scripts'))
      mkdirSync(join(root, '.xpertai-plugin'))
      copyFileSync(
        join(packageRoot, 'scripts/verify-package-output.mjs'),
        join(root, 'scripts/verify-package-output.mjs')
      )
      writeFileSync(join(root, 'package.json'), JSON.stringify(packageJson))
      writeFileSync(
        join(root, '.xpertai-plugin/plugin.json'),
        JSON.stringify({ ...manifest, version })
      )
      const result = spawnSync(
        process.execPath,
        ['scripts/verify-package-output.mjs'],
        { cwd: root, encoding: 'utf8' }
      )
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(succeeds ? 0 : 1)
      if (!succeeds) {
        expect(result.stderr).toContain(
          'plugin manifest version must match package.json version'
        )
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
