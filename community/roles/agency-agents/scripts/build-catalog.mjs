import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { parse, stringify } from 'yaml'
import { roleAvatar } from './role-avatar.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const roles = readJson('catalog/roles.json')
const categories = readJson('catalog/categories.json')
const sources = readJson('sources.lock.json')
const ids = new Set()
const seen = new Set()
const summaries = []
const outputs = []
const skillOutputs = []
const skillContributions = []
for (const role of roles) {
  if (!/^[a-z0-9-]+$/.test(role.id) || ids.has(role.id)) throw new Error(`Invalid or duplicate role ID: ${role.id}`)
  ids.add(role.id)
  if (!categories[role.category]) throw new Error(`Unmapped category: ${role.category}`)
  const labels = {}
  const descriptions = {}
  const locales = new Set()
  const roleOutputs = []
  let avatarMetadata
  for (const variant of role.variants) {
    if (!['en-US', 'zh-Hans'].includes(variant.locale)) throw new Error(`Unsupported locale: ${variant.locale}`)
    const source = sources[variant.source]
    const identity = `${variant.source}:${variant.path}`
    if (!source?.files[variant.path] || seen.has(identity)) throw new Error(`Unregistered or duplicated source: ${identity}`)
    seen.add(identity)
    const base = resolve(root, 'upstream', variant.source)
    const path = resolve(base, variant.path)
    if (relative(base, path).startsWith('..')) throw new Error(`Source escapes snapshot: ${identity}`)
    const raw = readFileSync(path)
    const fileHash = createHash('sha256').update(raw).digest('hex')
    if (fileHash !== source.files[variant.path]) throw new Error(`Source changed without lock update: ${identity}`)
    const match = raw.toString('utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    if (!match) throw new Error(`Missing role frontmatter: ${identity}`)
    const metadata = parse(match[1])
    if (typeof metadata?.name !== 'string' || typeof metadata.description !== 'string' || !match[2].trim()) {
      throw new Error(`Incomplete role: ${identity}`)
    }
    const languageKey = variant.locale === 'zh-Hans' ? 'zh_Hans' : 'en_US'
    labels[languageKey] = metadata.name
    descriptions[languageKey] = metadata.description
    if (variant.metadataOnly) continue
    // Keep the role's existing visual identity independent of the default prompt language.
    if (!avatarMetadata || variant.locale === 'en-US') avatarMetadata = metadata
    if (locales.has(variant.locale)) throw new Error(`Duplicate prompt language: ${role.id}`)
    locales.add(variant.locale)
    const body = match[2].trim()
    const skillKey = `agency-${createHash('sha256').update(`${role.id}:${variant.locale}`).digest('hex').slice(0, 20)}`
    skillOutputs.push({
      key: skillKey,
      markdown: `---\n${stringify({ name: skillKey, description: metadata.description, license: 'MIT' })}---\n\n${body}\n`,
      source: { repository: source.repository, commit: source.commit, path: variant.path, fileHash }
    })
    skillContributions.push({
      type: 'skill', name: skillKey, displayName: metadata.name,
      description: metadata.description, tags: ['agency-role', role.category, variant.locale]
    })
    roleOutputs.push({
      path: `roles/${role.id}/${variant.locale}.json`,
      data: {
        title: metadata.name, description: metadata.description, body, skillKey,
        contentHash: createHash('sha256').update(body).digest('hex'),
        provenance: { repository: source.repository, commit: source.commit, path: variant.path, fileHash },
        sourceMetadata: metadata
      }
    })
  }
  if (!locales.has(role.defaultLocale)) throw new Error(`Default prompt language unavailable: ${role.id}`)
  const avatar = roleAvatar(avatarMetadata, role.category)
  outputs.push(...roleOutputs.map((output) => ({ ...output, data: { ...output.data, avatar } })))
  summaries.push({
    key: role.id, category: categories[role.category], avatar,
    title: { en_US: labels.en_US ?? labels.zh_Hans, ...(labels.zh_Hans ? { zh_Hans: labels.zh_Hans } : {}) },
    description: { en_US: descriptions.en_US ?? descriptions.zh_Hans, ...(descriptions.zh_Hans ? { zh_Hans: descriptions.zh_Hans } : {}) },
    availableLocales: [...locales], defaultLocale: role.defaultLocale,
    skillKeys: Object.fromEntries(roleOutputs.map((output) => [output.path.split('/').pop().replace('.json', ''), output.data.skillKey]))
  })
}
for (const [name, source] of Object.entries(sources)) {
  for (const path of Object.keys(source.files)) {
    if (!seen.has(`${name}:${path}`)) throw new Error(`Source role has no explicit mapping: ${name}:${path}`)
  }
}
// Validate everything before replacing generated data, so a failed sync cannot publish a partial catalog.
rmSync(resolve(root, 'dist/roles'), { recursive: true, force: true })
// Rebuild bundled role skills from the same verified sources as the templates.
rmSync(resolve(root, 'dist/skills'), { recursive: true, force: true })
rmSync(resolve(root, 'dist/marketplace.json'), { force: true })
for (const output of outputs) {
  const path = resolve(root, 'dist', output.path)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(output.data) + '\n')
}
for (const skill of skillOutputs) {
  const directory = resolve(root, 'dist/skills', skill.key)
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, 'SKILL.md'), skill.markdown)
  writeFileSync(resolve(directory, 'SOURCE.json'), JSON.stringify(skill.source, null, 2) + '\n')
  for (const license of ['agency-agents.txt', 'agency-agents-zh.txt']) {
    writeFileSync(resolve(directory, license), readFileSync(resolve(root, 'licenses', license)))
  }
}
writeFileSync(resolve(root, 'dist/skill-catalog.json'), JSON.stringify(skillContributions) + '\n')
writeFileSync(resolve(root, 'dist/catalog.json'), JSON.stringify(summaries) + '\n')
const manifestPath = resolve(root, '.xpertai-plugin/plugin.json')
const manifest = readJson('.xpertai-plugin/plugin.json')
manifest.description = 'Agency Agents expert templates with ClawXpert middleware. Chinese first, with English fallback.'
manifest.interface.shortDescription = 'Professional expert templates with skills and tools'
manifest.skills = './dist/skills'
manifest.targetAppMeta.xpert.types = ['assistant-template', 'skill']
manifest.targetAppMeta.xpert.marketplace = {
  contents: [...summaries.map((entry) => ({ type: 'assistant-template', name: entry.key, displayName: entry.title,
    description: entry.description, tags: [entry.category] })), ...skillContributions]
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
// Export the plugin itself for both require() and native import(), avoiding nested CJS defaults.
writeFileSync(resolve(root, 'dist/plugin.cjs'), "module.exports = require('./index.js').default\n")
writeFileSync(resolve(root, 'dist/coverage.json'), JSON.stringify({ roles: ids.size, sourceFiles: seen.size, promptVariants: outputs.length }, null, 2) + '\n')
console.log(`Built ${ids.size} roles, ${outputs.length} prompt variants, covering ${seen.size} source files`)
