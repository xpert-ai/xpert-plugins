import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const packageRoot = process.argv[2] ? resolve(process.argv[2]) : dirname(dirname(fileURLToPath(import.meta.url)))
const packageJsonPath = join(packageRoot, 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const fontSource = join(dirname(dirname(fileURLToPath(import.meta.url))), 'assets/fonts')
const font = JSON.parse(readFileSync(join(fontSource, 'manifest.json'), 'utf8'))

const requiredFiles = new Set([
  packageJson.main,
  packageJson.module,
  packageJson.types,
  packageJson.exports?.['.']?.import,
  packageJson.exports?.['.']?.default,
  packageJson.exports?.['.']?.types,
  '.xpertai-plugin/plugin.json',
  'README.md',
  'README_zh-hans.md',
  'assets/logo.svg',
  `dist/assets/fonts/${font.fileName}`,
  'dist/assets/fonts/manifest.json',
  'dist/assets/fonts/OFL.txt',
  'dist/assets/fonts/README.md',
  'dist/lib/excalidraw.plugin.js',
  'dist/lib/excalidraw.app-config.js',
  'dist/lib/tools/excalidraw-tools.provider.js',
  'dist/mcp-apps/preview/index.html',
  'dist/sandbox-actions/excalidraw-render/action.json',
  'dist/sandbox-actions/excalidraw-render/bundle/runner.mjs',
  'migrations/20260906-native-mcp.sql',
  'dist/lib/excalidraw.service.js',
  'dist/lib/excalidraw-artifact-viewer.service.js',
  'dist/lib/excalidraw.middleware.js',
  'dist/lib/excalidraw-view.provider.js',
  'dist/lib/excalidraw-core.module.js',
  'dist/lib/excalidraw-collaboration.provider.js',
  'dist/lib/excalidraw-yjs.js',
  'dist/lib/entities/excalidraw-artifact-publication.entity.js',
  'dist/lib/diagram-engine/diagram-engine.module.js',
  'dist/lib/diagram-engine/diagram.middleware.js',
  'dist/lib/remote-components/excalidraw-workbench/app.js',
  'dist/vendor/design-fonts/index.js',
  'dist/vendor/design-fonts/index.d.ts',
  'dist/lib/artifact-viewer/app.js',
  'dist/lib/artifact-viewer/app.css',
  'dist/xpert-excalidraw-assistant.yaml',
  'dist/xpert-excalidraw-technical-diagram-assistant.yaml',
  'skills/excalidraw-agent-skill/SKILL.md',
  'skills/technical-diagram/SKILL.md',
  'skills/NOTICE.fireworks-tech-graph.txt',
  'assets/diagram-templates/rag-pipeline.svg'
])

const missingFiles = [...requiredFiles]
  .filter((file) => typeof file === 'string' && file.trim().length > 0)
  .map((file) => file.replace(/^\.\//, ''))
  .filter((file) => !existsSync(join(packageRoot, file)))

if (missingFiles.length) {
  console.error(`Missing files required for publishing ${packageJson.name}@${packageJson.version}:`)
  for (const file of missingFiles) {
    console.error(`- ${normalize(file)}`)
  }
  process.exit(1)
}

// Check bytes in both local dist and the extracted tarball, not just file presence.
const fontOutput = join(packageRoot, 'dist/assets/fonts')
const fontBytes = readFileSync(join(fontOutput, font.fileName))
assert.equal(fontBytes.length, font.size, 'Quality preview font size differs from the pinned manifest')
assert.equal(createHash('sha256').update(fontBytes).digest('hex'), font.sha256, 'Quality preview font checksum mismatch')
assert.deepEqual(JSON.parse(readFileSync(join(fontOutput, 'manifest.json'), 'utf8')), font)
assert.deepEqual(readFileSync(join(fontOutput, 'OFL.txt')), readFileSync(join(fontSource, 'OFL.txt')))

if (packageJson.dependencies?.['@xpert-ai/design-fonts']) {
  throw new Error('Excalidraw must vendor @xpert-ai/design-fonts instead of publishing it as a runtime dependency.')
}
const unresolvedDesignFontImports = listRuntimeFiles(join(packageRoot, 'dist'))
  .filter((file) => readFileSync(file, 'utf8').includes('@xpert-ai/design-fonts'))
if (unresolvedDesignFontImports.length) {
  throw new Error(`Excalidraw package output still imports @xpert-ai/design-fonts: ${unresolvedDesignFontImports.join(', ')}`)
}

function listRuntimeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listRuntimeFiles(path)
    return /\.(?:js|mjs|d\.ts)$/.test(entry.name) ? [path] : []
  })
}

const manifest=JSON.parse(readFileSync(join(packageRoot,'.xpertai-plugin/plugin.json'),'utf8'))
if(manifest.version!==packageJson.version||manifest.level!=='system'||manifest.artifactNamespace!==packageJson.xpert.plugin.artifactNamespace)throw new Error('Plugin metadata is inconsistent')
const { excalidrawApp } = await import(pathToFileURL(join(packageRoot, 'dist/lib/excalidraw.app-config.js')).href)
const apps = manifest.targetAppMeta.xpert.marketplace.contents.filter((item) => item.type === 'app')
assert.deepEqual(apps, [excalidrawApp], 'Runtime and portable App metadata must match exactly')
assert.equal(excalidrawApp.appConfig.assistantTemplateKey, 'excalidraw-assistant')
assert.equal(excalidrawApp.appConfig.scope, 'organization')
assert.equal(excalidrawApp.appConfig.workspace.sharing, 'organization')
assert.equal(excalidrawApp.appConfig.entry.type, 'assistant-chat')
const entry = readFileSync(join(packageRoot, 'dist/index.js'), 'utf8')
assert.ok(entry.includes('excalidrawApp'), 'The loaded plugin must register the App contribution')
for (const screenshot of excalidrawApp.appConfig.presentation.screenshots ?? []) {
  assert.ok(manifest.assets.screenshots.includes(screenshot), 'App screenshots must be manifest-declared')
  assert.ok(readFileSync(join(packageRoot, screenshot)).length <= 5 * 1024 * 1024, 'App screenshot exceeds host limit')
}
const app=readFileSync(join(packageRoot,'dist/mcp-apps/preview/index.html'))
if(app.length>2*1024*1024)throw new Error('MCP App exceeds host limit')
if(/localStorage|sessionStorage/.test(app.toString()))throw new Error('MCP App must not access Web Storage')

const actionRoot=join(packageRoot,'dist/sandbox-actions/excalidraw-render')
const action=JSON.parse(readFileSync(join(actionRoot,'action.json'),'utf8'))
const files=[]
function inspectBundle(directory,prefix=''){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const relative=prefix+entry.name
    if(entry.isDirectory())inspectBundle(join(directory,entry.name),relative+'/')
    else if(entry.isFile())files.push(relative)
    else throw new Error('Sandbox Action contains a non-regular file')
  }
}
const bundleRoot=join(actionRoot,action.bundle)
inspectBundle(bundleRoot)
const hash=createHash('sha256');let total=0
for(const relative of files.sort((a,b)=>a.localeCompare(b))){
  const bytes=readFileSync(join(bundleRoot,relative));total+=bytes.length
  hash.update(relative+'\0'+bytes.length+'\0'+createHash('sha256').update(bytes).digest('hex')+'\n')
}
if(files.length>20000||total>256*1024*1024)throw new Error('Sandbox Action exceeds host limits')
if(hash.digest('hex')!==action.bundleSha256)throw new Error('Sandbox Action tree hash differs from manifest')
console.log(`Verified ${packageJson.name}@${packageJson.version}: App ${app.length} bytes, Action ${files.length} files / ${total} bytes.`)
