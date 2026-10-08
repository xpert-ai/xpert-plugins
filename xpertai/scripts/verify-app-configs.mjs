import 'reflect-metadata'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appsRoot = join(workspace, 'apps')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const apps = readdirSync(appsRoot).filter((name) => existsSync(join(appsRoot, name, 'package.json'))).sort()
const selected = process.argv[2]

// Load each packaged entry independently so different SDK versions cannot share registries.
if (!selected) {
  for (const app of apps) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), app], { stdio: 'inherit', timeout: 60000 })
    assert.equal(result.status, 0, `${app}: application contract verification failed`)
  }
  console.log(`Verified ${apps.length} application descriptors and template links.`)
} else {
  assert.ok(apps.includes(selected), 'Unknown application directory')
  const root = join(appsRoot, selected)
  const pkg = readJson(join(root, 'package.json'))
  const { default: plugin } = await import(pathToFileURL(join(root, pkg.main)).href)
  assert.ok(plugin.meta.targetApps.includes('xpert'), `${selected}: missing Xpert target`)
  const entries = plugin.meta.targetAppMeta.xpert.marketplace.contents.filter((item) => item.type === 'app')
  assert.equal(entries.length, 1, `${selected}: expected one application entry`)
  const [entry] = entries
  const config = entry.appConfig
  assert.ok(config, `${selected}: missing appConfig`)
  assert.equal(config.scope, 'organization')
  assert.equal(config.workspace.mode, 'dedicated')
  assert.equal(config.modelRequirements.primary, true)
  assert.ok(config.presentation.tagline)
  assert.ok(config.presentation.features.length)
  assert.equal(config.entry?.type ?? 'assistant-chat', 'assistant-chat')
  // The host deduplicates App identities across targets; every eligible declaration must agree.
  for (const target of Object.values(plugin.meta.targetAppMeta)) {
    for (const contribution of target.marketplace?.contents ?? []) {
      if (contribution.type !== 'app' || contribution.name !== entry.name || !contribution.appConfig) continue
      assert.deepEqual(contribution.appConfig, config, `${selected}: target appConfig declarations differ`)
      assert.equal(target.marketplace.category, plugin.meta.targetAppMeta.xpert.marketplace.category,
        `${selected}: target marketplace categories differ`)
    }
  }
  const templates = plugin.templates.filter((template) => template.key === config.assistantTemplateKey)
  assert.equal(templates.length, 1, `${selected}: appConfig must link exactly one raw template key`)
  assert.ok(templates[0].dslContent, `${selected}: linked template DSL is not packaged`)
  assert.ok(templates[0].targetApps.includes('xpert'), `${selected}: template is not available to Xpert`)

  const manifestPath = join(root, '.xpertai-plugin/plugin.json')
  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath)
    const portable = manifest.targetAppMeta.xpert.marketplace.contents.find((item) => item.type === 'app' && item.name === entry.name)
    assert.deepEqual(portable?.appConfig, config, `${selected}: portable metadata differs from runtime appConfig`)
    for (const screenshot of config.presentation.screenshots ?? []) {
      if (!screenshot.startsWith('./')) continue
      assert.ok(manifest.assets.screenshots.includes(screenshot), `${selected}: undeclared screenshot`)
      assert.ok(existsSync(join(root, screenshot)), `${selected}: missing screenshot asset`)
    }
  }
  console.log(`${selected}: App -> ${config.assistantTemplateKey} verified`)
  process.exit(0)
}
