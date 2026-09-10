const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')
const { AgencyCatalogProvider } = require('../dist/catalog-provider')
const { literalRolePrompt } = require('../dist/role-template')
const hostRequire = process.env.XPERT_HOST_ROOT ? createRequire(join(process.env.XPERT_HOST_ROOT, 'package.json')) : require
const { SystemMessagePromptTemplate } = hostRequire('@langchain/core/prompts')
const provider = new AgencyCatalogProvider()
const hostPrompt = (prompt) => prompt.replace(/&lt;/g, '<').replace(/&gt;/g, '>')

test('default IDs are legal, distinct across roles, and stable across locales', () => {
  const names = new Set()
  for (const entry of provider.listTemplates()) {
    let roleName
    for (const locale of entry.availableLocales) {
      const draft = JSON.parse(provider.resolveTemplate(undefined, entry.key, locale).dslContent)
      const name = draft.team.name
      assert.doesNotMatch(name, /[^a-zA-Z0-9-\s]/, `${entry.key}/${locale}`)
      assert.ok(name.length >= 5, entry.key)
      assert.equal(draft.team.agent.name, name)
      assert.equal(draft.nodes[0].entity.name, name)
      if (roleName) assert.equal(name, roleName)
      roleName = name
    }
    assert.ok(!names.has(roleName), `Duplicate default ID: ${entry.key}`)
    names.add(roleName)
  }
})

test('defaults to Chinese prompt bodies and falls back to English only when Chinese is unavailable', () => {
  for (const entry of provider.listTemplates()) {
    const expected = entry.availableLocales.includes('zh-Hans') ? 'zh-Hans' : 'en-US'
    assert.equal(entry.defaultLocale, expected, entry.key)
    const detail = provider.resolveTemplate(undefined, entry.key)
    assert.equal(detail.locale, expected, entry.key)
    const body = JSON.parse(readFileSync(join(__dirname, '../dist/roles', entry.key, `${expected}.json`)))
    assert.equal(detail.contentHash, body.contentHash)
    assert.equal(JSON.parse(detail.dslContent).team.options.templateSource.locale, expected)
  }
})

test('local TypeScript loading resolves the same generated catalog and bodies as the packaged entry', () => {
  const result = execFileSync(process.execPath, ['-e', `
    const fs = require('node:fs'), ts = require('typescript');
    require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText, file);
    const source = new (require('./src/catalog-provider.ts').AgencyCatalogProvider)();
    const compiled = new (require('./dist/catalog-provider.js').AgencyCatalogProvider)();
    const assert = require('node:assert/strict');
    assert.deepEqual(source.listTemplates(), compiled.listTemplates());
    for (const entry of source.listTemplates()) for (const locale of entry.availableLocales) {
      assert.deepEqual(source.resolveTemplate(undefined, entry.key, locale), compiled.resolveTemplate(undefined, entry.key, locale));
    }
    process.stdout.write('ok');
  `], { cwd: join(__dirname, '..'), encoding: 'utf8' })
  assert.equal(result, 'ok')
})

test('every source file is accounted for; every advertised variant produces an independent single-agent draft', () => {
  const catalog = provider.listTemplates()
  const coverage = JSON.parse(readFileSync(join(__dirname, '../dist/coverage.json')))
  const manifest = JSON.parse(readFileSync(join(__dirname, '../.xpertai-plugin/plugin.json')))
  assert.equal(manifest.targetAppMeta.xpert.marketplace.contents.filter((item) => item.type === 'assistant-template').length, catalog.length)
  const sources = JSON.parse(readFileSync(join(__dirname, '../sources.lock.json')))
  assert.equal(coverage.roles, catalog.length)
  assert.equal(coverage.sourceFiles, Object.values(sources).reduce((sum, source) => sum + Object.keys(source.files).length, 0))
  assert.equal(new Set(catalog.map((item) => item.key)).size, catalog.length)
  let variants = 0
  for (const summary of catalog) {
    assert.equal(summary.dslContent, undefined)
    assert.equal(summary.export_data, undefined)
    for (const locale of summary.availableLocales) {
      const detail = provider.resolveTemplate(undefined, summary.key, locale)
      const draft = JSON.parse(detail.dslContent)
      assert.equal(detail.locale, locale)
      assert.equal(draft.nodes.filter((node) => node.type === 'agent').length, 1)
      assert.equal(draft.nodes[0].key, draft.team.agent.key)
      assert.ok(summary.avatar?.emoji?.id, `Missing avatar: ${summary.key}`)
      assert.match(summary.avatar.background, /^#[\da-f]{6}$/i)
      assert.deepEqual(detail.avatar, summary.avatar)
      assert.deepEqual(draft.team.avatar, summary.avatar)
      assert.deepEqual(draft.team.agent.avatar, summary.avatar)
      assert.deepEqual(draft.nodes[0].entity, draft.team.agent)
      assert.ok(draft.connections.every((edge) => edge.from === draft.team.agent.key))
      assert.deepEqual(draft.team.agent.toolsetIds, [])
      assert.equal(draft.team.features?.sandbox?.enabled, true)
      assert.equal(draft.team.options.templateSource.contentHash, detail.contentHash)
      assert.equal(draft.team.options.templateSource.locale, locale)
      variants++
    }
  }
  assert.equal(variants, coverage.promptVariants)
})

test('upstream emoji and colors are preserved with explicit category fallbacks', async () => {
  const { roleAvatar } = await import('../scripts/role-avatar.mjs')
  assert.deepEqual(roleAvatar({ emoji: '\uD83C\uDFA8', color: 'purple' }, 'design'), {
    emoji: { id: '1F3A8', unified: '1F3A8', set: '' }, background: '#800080'
  })
  assert.equal(roleAvatar({ emoji: '\uD83D\uDEE1\uFE0F', color: '#0D9488' }, 'security').emoji.id, '1F6E1-FE0F')
  assert.equal(roleAvatar({ color: 'neon-cyan' }, 'engineering').background, '#00FFFF')
  assert.equal(roleAvatar({}, 'design').emoji.id, '1F3A8')
  assert.equal(roleAvatar({ color: 'invalid' }, 'unknown').background, '#64748B')
  assert.ok(roleAvatar({ emoji: '\uD83D\uDDA7', color: '#123456' }, 'engineering').url.startsWith('data:image/svg+xml;base64,'))
  const ui = provider.listTemplates().find((entry) => entry.key === 'design--design-ui-designer')
  assert.equal(ui.avatar.emoji.id, '1F3A8')
  assert.equal(ui.avatar.background, '#800080')
})

test('the actual host formatter preserves every prompt body and following host variables', async () => {
  for (const summary of provider.listTemplates()) {
    for (const locale of summary.availableLocales) {
      const role = JSON.parse(readFileSync(join(__dirname, '../dist/roles', summary.key, `${locale}.json`)))
      const rendered = await SystemMessagePromptTemplate.fromTemplate(
        hostPrompt(`${literalRolePrompt(role.body)}\nPROJECT={{ project_name }}`), { templateFormat: 'mustache' }
      ).format({ project_name: 'ACME' })
      assert.equal(rendered.content.trim(), `${role.body}\nPROJECT=ACME`, `${summary.key}/${locale}`)
    }
  }
})

test('delimiter collisions and English-only bodies have explicit behavior', async () => {
  const body = '[[ROLE0 literal ROLE0]] ${{ github.sha }} {{ user.displayName }} &lt;span&gt;'
  const result = await SystemMessagePromptTemplate.fromTemplate(hostPrompt(literalRolePrompt(body)), { templateFormat: 'mustache' }).format({})
  assert.equal(result.content.trim(), body)
  const role = provider.listTemplates().find((item) => item.key === 'specialized--recruitment-specialist')
  assert.deepEqual(role.availableLocales, ['en-US'])
  assert.equal(provider.resolveTemplate(undefined, role.key, 'zh-Hans').locale, 'en-US')
  assert.throws(() => provider.resolveTemplate(undefined, '../../etc/passwd', 'en-US'), /Unknown Agency role/)
  const english = provider.resolveTemplate(undefined, 'engineering--engineering-frontend-developer', 'en-US')
  const chinese = provider.resolveTemplate(undefined, 'engineering--engineering-frontend-developer', 'zh-Hans')
  assert.notEqual(english.contentHash, chinese.contentHash)
  assert.equal(JSON.parse(chinese.dslContent).team.options.templateSource.locale, 'zh-Hans')
})
