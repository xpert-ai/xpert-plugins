import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const requiredFiles = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/xpert-story-studio-assistant.yaml',
  'dist/lib/remote-components/story-studio-workbench/app.js',
  'dist/lib/remote-components/story-studio-workbench/app.css',
  'dist/sandbox-actions/storyboard-render/action.json',
  '.xpertai-plugin/plugin.json',
  'assets/logo.svg',
  'assets/composerIcon.svg',
  'skills/story-studio-agent-skill/SKILL.md',
  'README.md'
]

const missing = requiredFiles.filter(
  (file) => !existsSync(join(packageRoot, file))
)
if (missing.length) {
  console.error(
    `Story Studio plugin package output is missing: ${missing.join(', ')}`
  )
  process.exit(1)
}

const packageJson = JSON.parse(
  readFileSync(join(packageRoot, 'package.json'), 'utf8')
)
const pluginManifest = JSON.parse(
  readFileSync(
    join(packageRoot, '.xpertai-plugin', 'plugin.json'),
    'utf8'
  )
)
if (pluginManifest.name !== packageJson.name) {
  throw new Error('Story Studio package and plugin manifest names must match.')
}
if (Object.hasOwn(pluginManifest, 'version')) {
  throw new Error(
    'Story Studio plugin manifest must not duplicate package.json version.'
  )
}
if (
  typeof packageJson.version !== 'string' ||
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    packageJson.version
  )
) {
  throw new Error('Story Studio package.json version must be valid semver.')
}
if (
  packageJson.xpert?.plugin?.artifactNamespace !== 'story_studio' ||
  pluginManifest.artifactNamespace !== 'story_studio'
) {
  throw new Error(
    'Story Studio system Artifact namespace must be declared consistently.'
  )
}
if (packageJson.xpert?.plugin?.level !== 'system') {
  throw new Error('Story Studio must remain a system-level plugin.')
}
if (
  pluginManifest.sandboxActions !==
  './dist/sandbox-actions/storyboard-render/action.json'
) {
  throw new Error('Story Studio Sandbox Action manifest is missing.')
}
