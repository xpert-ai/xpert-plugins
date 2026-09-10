const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, readdirSync } = require('node:fs')
const { join } = require('node:path')
const { parse } = require('yaml')
const { AgencyCatalogProvider, PLUGIN_NAME } = require('../dist/catalog-provider')
const provider = new AgencyCatalogProvider()

test('each role variant installs only its matching skill and delegates its role instructions to it', () => {
  const keys = new Set()
  const manifest = JSON.parse(readFileSync(join(__dirname, '../.xpertai-plugin/plugin.json')))
  for (const entry of provider.listTemplates()) for (const locale of entry.availableLocales) {
    const detail = provider.resolveTemplate(undefined, entry.key, locale)
    const draft = JSON.parse(detail.dslContent)
    assert.equal(detail.dependencies.skills.length, 1)
    const dependency = detail.dependencies.skills[0]
    assert.equal(dependency.pluginName, PLUGIN_NAME)
    assert.equal(dependency.targetAgentKey, draft.team.agent.key)
    const role = JSON.parse(readFileSync(join(__dirname, '../dist/roles', entry.key, `${locale}.json`)))
    assert.equal(dependency.componentKey, role.skillKey)
    assert.equal(keys.has(role.skillKey), false)
    keys.add(role.skillKey)
    const directory = join(__dirname, '../dist/skills', role.skillKey)
    const markdown = readFileSync(join(directory, 'SKILL.md'), 'utf8')
    const [, frontmatter, body] = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    assert.deepEqual(parse(frontmatter), { name: role.skillKey, description: role.description, license: 'MIT' })
    assert.equal(body.trim(), role.body)
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'SOURCE.json'))), role.provenance)
    for (const license of ['agency-agents.txt', 'agency-agents-zh.txt']) {
      assert.equal(readFileSync(join(directory, license), 'utf8'), readFileSync(join(__dirname, '../licenses', license), 'utf8'))
    }
    const metadata = manifest.targetAppMeta.xpert.marketplace.contents.find((item) => item.type === 'skill' && item.name === role.skillKey)
    assert.equal(metadata.displayName, role.title)
    assert.equal(metadata.description, role.description)
    assert.ok(draft.team.agent.prompt.includes(role.skillKey))
    assert.equal(draft.team.agent.prompt.includes(role.body), false)
    const middleware = draft.nodes.find((node) => node.entity.provider === 'skillsMiddleware')
    assert.ok(middleware)
    assert.equal(middleware.entity.options?.repositoryDefault, undefined)
  }
  assert.equal(keys.size, 553)
  assert.deepEqual(new Set(readdirSync(join(__dirname, '../dist/skills'))), keys)
})

test('the default role skill follows Chinese-first selection and English-only fallback', () => {
  for (const entry of provider.listTemplates()) {
    const detail = provider.resolveTemplate(undefined, entry.key)
    assert.equal(detail.locale, entry.availableLocales.includes('zh-Hans') ? 'zh-Hans' : 'en-US')
    assert.deepEqual(detail.dependencies.skills, entry.dependencies.skills)
    const fallback = provider.resolveTemplate(undefined, entry.key, 'zh-Hans')
    assert.deepEqual(fallback.dependencies.skills, detail.dependencies.skills)
  }
})
