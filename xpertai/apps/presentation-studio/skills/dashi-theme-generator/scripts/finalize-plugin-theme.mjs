#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))
const project = path.resolve(args.project || '')
const themeKey = String(args.theme || '')
const sourceType = String(args['source-type'] || '')
const adapterMode = String(args['adapter-mode'] || '')
if (!args.project || !/^theme\d{2,}$/.test(themeKey)) throw new Error('--project and --theme themeNN are required.')
if (!existsSync(path.join(project, 'package.json'))) throw new Error(`Dashi project not found: ${project}`)
const generatorRoot = path.resolve(import.meta.dirname, '..')
const reportPath = path.resolve(args.report || path.join('/tmp', `${themeKey}-plugin-verification.json`))
const outputPath = path.resolve(args.out || path.join('/tmp', `${themeKey}.xpert-theme.zip`))
const verification = {}

assertOwnedModulesImplemented(project, themeKey)

runNpm('themes:generate')
runNpm('manifest:update')
runNpm('themes:build-generated')
runNpm('themes:validate-generated'); verification.generatedCapabilities = 'passed'
runNpm('themes:validate-palette', ['--theme', themeKey]); verification.palette = 'passed'
runNpm('themes:render-owned', ['--theme', themeKey]); verification.ownedRender = 'passed'
runNpm('themes:render-audit')
runNode(path.join(generatorRoot, 'scripts', 'validate-theme-render-contract.mjs'), ['--project', project, '--theme', themeKey, '--out', path.join('/tmp', `${themeKey}-render-contract.json`)]); verification.renderContract = 'passed'
runNode(path.join(generatorRoot, 'scripts', 'validate-generated-layout-quality.mjs'), ['--project', project, '--theme', themeKey, '--out', path.join('/tmp', `${themeKey}-layout-quality.json`)]); verification.layoutQuality = 'passed'
runNpm('themes:style-grid')
writeFileSync(reportPath, `${JSON.stringify(verification, null, 2)}\n`)
runNpm('themes:package-plugin', ['--project', project, '--theme', themeKey, '--source-type', sourceType, '--adapter-mode', adapterMode, '--verification', reportPath, '--out', outputPath])
console.log(`Plugin theme package: ${outputPath}`)

function runNpm(script, forward = []) { run('npm', ['--prefix', project, 'run', script, ...(forward.length ? ['--', ...forward] : [])], script) }
function runNode(script, forward = []) { run(process.execPath, [script, ...forward], path.basename(script)) }
function assertOwnedModulesImplemented(root, key) {
  const manifestPath = path.join(root, 'src', 'components', 'themes', key, 'signature-modules.json')
  if (!existsSync(manifestPath)) throw new Error(`${key}: signature-modules.json is missing; the owned-module authoring stage has not completed.`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const modules = Array.isArray(manifest.modules) ? manifest.modules : []
  const unfinished = modules.filter(module => module?.implementationStatus !== 'implemented')
  if (unfinished.length) {
    throw new Error(`${key}: ${unfinished.length} owned modules are still scaffold/proposed. This is a non-terminal agent-authoring state, not a user manual-coding blocker. Continue implementing signature-pages.jsx and signature-modules.json before finalizing. Unfinished: ${unfinished.map(module => module.id).join(', ')}`)
  }
}
function run(command, commandArgs, name) {
  console.log(`\n[plugin-theme-finalize] ${name}`)
  const result = spawnSync(command, commandArgs, { cwd: project, stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${name} failed with exit code ${result.status}`)
}
function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue
    const key = argv[index].slice(2)
    const next = argv[index + 1]
    result[key] = next && !next.startsWith('--') ? (index += 1, next) : true
  }
  return result
}
