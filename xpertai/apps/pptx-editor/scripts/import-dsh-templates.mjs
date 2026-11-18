/** Reproduce the 16 x 12 catalog from reviewed, pinned DSH source; no DSH host/runtime is installed. */
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import JSZip from 'jszip'

const pin = 'bbc7494aa9ed1cda0b89888264d7ee74a26ec50e'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = resolve(process.argv[2] ?? '')
if (!process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== pin)
  throw new Error(`Provide a clean DSH checkout at ${pin}`)
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: source, encoding: 'utf8' }).trim())
  throw new Error('DSH tracked sources must be clean')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const temp = await mkdtemp(join(root, '.dsh-import-'))
const out = join(root, 'assets/templates')
const generated = join(temp, 'generated')
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[ch])
function coverSvg(project) {
  const page = project.pages[0]
  const elements = page.elements.map(element => {
    const [x,y,w,h] = element.bounds, fill = escape(element.fill?.color ?? 'none'), stroke = escape(element.border?.color ?? 'none')
    if (element.elementType === 'shape') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${element.shapeName === 'roundRect' ? 12 : 0}" fill="${fill}" stroke="${stroke}" stroke-width="${element.border?.width ?? 0}"/>`
    if (element.elementType === 'line') return `<line x1="${x}" y1="${y}" x2="${x+w}" y2="${y+h}" stroke="${stroke}" stroke-width="${element.border?.width ?? 1}"/>`
    if (element.elementType !== 'text') throw new Error('Cover preview requires a native text/shape/line')
    const content = element.content, size = content.fontSize ?? 20
    const font = typeof content.fontFamily === 'string' ? content.fontFamily : content.fontFamily?.latin ?? 'Arial'
    const lines = content.text.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').split('\n')
    return `<text fill="${escape(content.color ?? '#000')}" font-family="${escape(font)}" font-size="${size}" font-weight="${content.bold ? 'bold' : 'normal'}">${lines.map((line,i) => `<tspan x="${x}" y="${y+size+i*size*(content.lineHeight ?? 1.15)}">${escape(line)}</tspan>`).join('')}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${project.width} ${project.height}"><rect width="100%" height="100%" fill="${escape(page.background?.color ?? '#fff')}"/>${elements}</svg>`
}
try {
  for (const script of ['generate-zara-ppt-templates.mjs', 'localize-ppt-templates.mjs', 'enrich-ppt-templates.mjs']) {
    const target = join(temp, script)
    await build({ entryPoints: [join(source, 'scripts/ppt', script)], outfile: target, bundle: true,
      platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' })
    execFileSync(process.execPath, [target], { cwd: source, env: { ...process.env, DSH_PPT_TEMPLATE_OUTPUT: generated }, stdio: 'inherit' })
  }
  const compilerPath = join(temp, 'compiler.mjs')
  await build({ entryPoints: [join(source, 'packages/ppt-runtime/core/lib/pptd.js')], outfile: compilerPath,
    bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } })
  const { loadPptdProject, renderPptdProject } = await import(pathToFileURL(compilerPath).href)
  await mkdir(out, { recursive: true })
  const catalog = []
  for (const category of (await readdir(generated)).sort()) for (const id of (await readdir(join(generated, category))).sort()) {
    const dir = join(generated, category, id)
    const meta = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf8'))
    const target = join(out, id)
    await mkdir(target, { recursive: true })
    const variants = {}
    for (const language of ['en', 'zh']) {
      const src = join(dir, language === 'en' ? 'source' : 'source-zh')
      const project = await loadPptdProject(join(src, 'deck.pptd'))
      if (project.pages.length !== 12) throw new Error(`${id}: expected 12 layouts`)
      const rendered = await renderPptdProject(project)
      if (rendered.check.errorCount || rendered.check.compatibility.rasterFallback || rendered.check.compatibility.unsupported)
        throw new Error(`${id}: unsupported or rasterized template`)
      // Deterministic zip metadata makes re-imports reviewable. OOXML document dates are fixed too.
      const zip = await JSZip.loadAsync(rendered.bytes)
      const repairedObjectIds = []
      // The upstream compiler gives two native-table reference pages duplicate cNvPr IDs.
      // These authored templates have no animation/connector references; repair only duplicate IDs.
      for (const name of Object.keys(zip.files).filter(name => /^ppt\/slides\/[^/]+\.xml$/.test(name))) {
        const text = await zip.file(name).async('string'), seen = new Set()
        let nextId = Math.max(...Array.from(text.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g), match => Number(match[1]))) + 1
        const fixed = text.replace(/(<p:cNvPr\b[^>]*\bid=")(\d+)(")/g, (whole, before, id, after) => {
          if (!seen.has(id)) { seen.add(id); return whole }
          if (/<p:timing|<a:(?:stCxn|endCxn)/.test(text)) throw new Error('Cannot safely repair referenced duplicate IDs')
          const replacement = String(nextId++); repairedObjectIds.push({ part: name, from: id, to: replacement })
          return before + replacement + after
        })
        if (fixed !== text) zip.file(name, fixed)
      }
      const epoch = new Date('2026-11-16T00:00:00Z')
      for (const entry of Object.values(zip.files)) entry.date = epoch
      const core = zip.file('docProps/core.xml')
      if (core) zip.file(core.name, (await core.async('string')).replace(/(<dcterms:(?:created|modified)[^>]*>)[^<]+/g, '$12026-11-16T00:00:00Z'), { date: epoch })
      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      await writeFile(join(target, `${language}.pptx`), buffer)
      await writeFile(join(target, `${language}.cover.svg`), coverSvg(project))
      // Keep the editable, bilingual upstream source plane alongside the generated artifact.
      const sources = { manifest: project.source.manifest, pages: Object.fromEntries(project.source.pages) }
      await writeFile(join(target, `${language}.source.json`), JSON.stringify(sources, null, 2) + '\n')
      variants[language] = { sha256: hash(buffer), bytes: buffer.length, nativeObjects: rendered.nativeObjectCount, repairedObjectIds }
    }
    await cp(join(dir, 'design.md'), join(target, 'design.md'))
    catalog.push({ id, category, names: meta.definition.localizedNames, description: meta.definition.description,
      palette: meta.definition.palette, fonts: meta.definition.fonts, variants,
      layouts: meta.semantics.source.pageReferences.map(page => ({ number: page.slideNumber, name: page.sourceTitle,
        family: page.family, description: page.structureSummary ?? '', density: page.density ?? 'medium' })) })
  }
  if (catalog.length !== 16 || catalog.reduce((n, item) => n + item.layouts.length, 0) !== 192) throw new Error('Incomplete DSH catalog')
  await writeFile(join(out, 'catalog.json'), JSON.stringify({ schemaVersion: 1, source: { repository: 'https://github.com/dataelement/dsh-desktop', commit: pin }, templates: catalog }, null, 2) + '\n')
  const licenses = join(out, 'licenses')
  await mkdir(licenses, { recursive: true })
  for (const [from, to] of [
    ['LICENSE', 'DSH-Desktop-MIT.txt'],
    ['packages/ppt-runtime/core/LICENSE', 'DSH-PPT-MIT.txt'],
    ['packages/ppt-runtime/core/THIRD_PARTY_NOTICES.md', 'DSH-THIRD-PARTY-NOTICES.md'],
    ['packages/ppt-runtime/upstream/zara/LICENSE', 'Zara-MIT.txt'],
    ['packages/ppt-runtime/upstream/html-anything/LICENSE', 'HTML-Anything-Apache-2.0.txt']
  ]) await cp(join(source, from), join(licenses, to))
  const files = []
  async function inventory(dir, prefix = '') {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name
      if (entry.isDirectory()) await inventory(join(dir, entry.name), path + '/')
      else if (path !== 'provenance.json') files.push({ path, sha256: hash(await readFile(join(dir, entry.name))) })
    }
  }
  await inventory(out)
  await writeFile(join(out, 'provenance.json'), JSON.stringify({ sourceCommit: pin, templateCount: 16, layoutCount: 192,
    languages: ['en', 'zh'], compiler: 'DSH original PPTD native compiler', files }, null, 2) + '\n')
  console.log(`Migrated ${catalog.length} templates / 192 layouts / 32 native decks`)
} finally { await rm(temp, { recursive: true, force: true }) }
