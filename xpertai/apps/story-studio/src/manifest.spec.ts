import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STORY_STUDIO_PACKAGE_METADATA } from './package-metadata.js'

describe('Story Studio package manifest', () => {
  const packageRoot = join(__dirname, '..')
  const packageJson = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8')
  ) as Record<string, unknown>
  const pluginManifest = JSON.parse(
    readFileSync(
      join(packageRoot, '.xpertai-plugin', 'plugin.json'),
      'utf8'
    )
  ) as Record<string, unknown>

  it('uses package.json as the only plugin version source', () => {
    expect(pluginManifest.name).toBe(packageJson.name)
    expect(pluginManifest).not.toHaveProperty('version')
    expect(STORY_STUDIO_PACKAGE_METADATA.version).toBe(
      packageJson.version
    )
  })

  it('keeps package, plugin, and system namespace identity aligned', () => {
    expect(pluginManifest.artifactNamespace).toBe('story_studio')
    expect(
      readNestedString(packageJson, [
        'xpert',
        'plugin',
        'artifactNamespace'
      ])
    ).toBe('story_studio')
    expect(
      readNestedString(packageJson, ['xpert', 'plugin', 'level'])
    ).toBe('system')
  })

  it('declares both target apps and the grouped app components', () => {
    expect(pluginManifest.targetApps).toEqual(['data-xpert', 'xpert'])
    const contents = readManifestContents(pluginManifest)
    expect(
      contents.some(
        (item) => item.type === 'app' && item.name === 'story-studio'
      )
    ).toBe(true)
    expect(
      contents.some(
        (item) =>
          item.type === 'assistant-template' &&
          item.name === 'story-studio-assistant'
      )
    ).toBe(true)
    expect(
      contents.some(
        (item) =>
          item.type === 'middleware' &&
          item.name === 'StoryStudioMiddleware'
      )
    ).toBe(true)
  })

  it('declares the system-owned storyboard render Action', () => {
    expect(pluginManifest.sandboxActions).toBe(
      './dist/sandbox-actions/storyboard-render/action.json'
    )
  })

  it('publishes the data-xpert runtime providers and catalog entries', () => {
    const dataXpert = readTargetAppMeta(pluginManifest, 'data-xpert')
    expect(readNestedStringArray(dataXpert, [
      'runtime',
      'middlewareProviders'
    ])).toEqual(['StoryStudioMiddleware'])
    expect(
      readNestedStringArray(dataXpert, ['runtime', 'viewProviders'])
    ).toEqual(['story_studio'])
    expect(
      readNestedStringArray(dataXpert, ['runtime', 'templateProviders'])
    ).toEqual(['storyStudioTemplates'])
    expect(readTargetContents(dataXpert).map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'app',
        'view',
        'middleware',
        'assistant-template'
      ])
    )
  })
})

function readNestedString(
  value: Record<string, unknown>,
  path: string[]
) {
  let current: unknown = value
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[key]
  }
  return typeof current === 'string' ? current : undefined
}

function readManifestContents(manifest: Record<string, unknown>) {
  const targetAppMeta = isRecord(manifest.targetAppMeta)
    ? manifest.targetAppMeta
    : {}
  return Object.values(targetAppMeta).flatMap((metadata) => {
    if (
      !isRecord(metadata) ||
      !isRecord(metadata.marketplace) ||
      !Array.isArray(metadata.marketplace.contents)
    ) {
      return []
    }
    return metadata.marketplace.contents.filter(isRecord)
  })
}

function readTargetAppMeta(
  manifest: Record<string, unknown>,
  target: string
) {
  const targetAppMeta = isRecord(manifest.targetAppMeta)
    ? manifest.targetAppMeta
    : {}
  const metadata = targetAppMeta[target]
  return isRecord(metadata) ? metadata : {}
}

function readTargetContents(metadata: Record<string, unknown>) {
  if (
    !isRecord(metadata.marketplace) ||
    !Array.isArray(metadata.marketplace.contents)
  ) {
    return []
  }
  return metadata.marketplace.contents.filter(isRecord)
}

function readNestedStringArray(
  value: Record<string, unknown>,
  path: string[]
) {
  let current: unknown = value
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[key]
  }
  return Array.isArray(current)
    ? current.filter((item): item is string => typeof item === 'string')
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value)
  )
}
