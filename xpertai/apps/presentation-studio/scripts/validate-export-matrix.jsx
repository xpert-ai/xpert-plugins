#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { inlinePresentationHtml } from '../src/lib/presentation-html-inliner.ts'

const execFileAsync = promisify(execFile)
const APP_ROOT = path.resolve(import.meta.dirname, '..')
const UPSTREAM_PROJECT = path.join(APP_ROOT, 'assets/upstream/dashiai-ppt/project')
const EXPORT_SCRIPT = path.join(UPSTREAM_PROJECT, 'scripts/export-pptx.mjs')
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'presentation-export-matrix-'))

process.env.DASHI_PPT_THEME_RUNTIME = 'prebuilt'

const { composeDeck } = await import(pathToFileURL(path.join(UPSTREAM_PROJECT, 'src/deckComposer.jsx')).href)
const { THEME_PAGES } = await import(pathToFileURL(path.join(UPSTREAM_PROJECT, 'src/components/themes/index.jsx')).href)
const { renderDeck } = await import(pathToFileURL(path.join(UPSTREAM_PROJECT, 'src/renderDeck.jsx')).href)

const themes = THEME_PAGES.reduce((groups, page) => {
  const pages = groups.get(page.themeKey) ?? []
  pages.push(page)
  groups.set(page.themeKey, pages)
  return groups
}, new Map())

try {
  let layoutCount = 0
  for (const [themePack, pages] of themes) {
    const selected = selectMatrixPages(pages)
    assert.equal(selected.length, 5, `${themePack} representative layout count`)
    layoutCount += selected.length
    const themeRoot = path.join(outputRoot, themePack)
    const pptDir = path.join(themeRoot, 'ppt')
    const indexHtml = path.join(pptDir, 'index.html')
    const deck = composeDeck({
      title: `Presentation Studio export matrix · ${themePack}`,
      themePack,
      slides: selected.map((page, index) => ({ id: `${themePack}-${index + 1}`, layout: page.key, props: {} })),
    })
    renderDeck(deck, { outFile: indexHtml })

    const selfContained = await inlinePresentationHtml(pptDir)
    assert.doesNotMatch(selfContained, /<script\b[^>]*\bsrc=["'](?!data:)/i, `${themePack} external script`)
    assert.doesNotMatch(selfContained, /<link\b[^>]*\bhref=["'](?!data:)/i, `${themePack} external stylesheet`)

    const pdfReport = path.join(themeRoot, 'pdf-report.json')
    const pptxReport = path.join(themeRoot, 'pptx-report.json')
    await runExport(pptDir, path.join(themeRoot, 'deck.pdf'), ['--pdf'], pdfReport, themePack)
    await runExport(pptDir, path.join(themeRoot, 'deck.pptx'), [], pptxReport, themePack)
    const pdf = JSON.parse(fs.readFileSync(pdfReport, 'utf8'))
    const pptx = JSON.parse(fs.readFileSync(pptxReport, 'utf8'))
    assert.equal(pdf.pages, 5, `${themePack} PDF page count`)
    assert.equal(pptx.slideCount, 5, `${themePack} PPTX slide count`)
    assert.ok(pptx.textObjects > 0, `${themePack} PPTX must contain editable text`)
    assert.ok(Array.isArray(pptx.warnings), `${themePack} PPTX warning report`)
    console.log(`${themePack}: 5 layouts, HTML/PDF/PPTX verified, ${pptx.textObjects} editable text objects.`)
  }
  assert.equal(layoutCount, themes.size * 5, 'export matrix layout count')
  console.log(`Export matrix verified: ${themes.size} themes, ${layoutCount} layouts, 3 formats.`)
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true })
}

async function runExport(pptDir, output, extraArgs, report, title) {
  await execFileAsync(process.execPath, [
    EXPORT_SCRIPT,
    pptDir,
    output,
    ...extraArgs,
    '--title',
    `Presentation Studio ${title}`,
    '--report',
    report,
  ], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      INIT_CWD: APP_ROOT,
      DASHI_PPT_THEME_RUNTIME: 'prebuilt',
      DASHI_PPT_CERT_DIR: path.join(path.dirname(output), '.https-preview'),
    },
    maxBuffer: 20 * 1024 * 1024,
  })
}

function selectMatrixPages(pages) {
  const candidates = [
    pages[0],
    pages.find((page) => /metric|chart|data|trend|指标|图表|数据|趋势/i.test(`${page.slot} ${page.label}`)),
    pages.find((page) => hasMedia(page)),
    pages[Math.floor(pages.length / 2)],
    pages.at(-1),
  ].filter(Boolean)
  const selected = []
  for (const page of [...candidates, ...pages]) {
    if (!selected.some((item) => item.key === page.key)) selected.push(page)
    if (selected.length === 5) break
  }
  return selected
}

function hasMedia(page) {
  const defaultProps = page.defaultProps ?? {}
  return ['images', 'media', 'photos', 'pictures', 'logos', 'thumbs', 'imageSlots', 'imgs']
    .some((key) => Object.prototype.hasOwnProperty.call(defaultProps, key))
}
