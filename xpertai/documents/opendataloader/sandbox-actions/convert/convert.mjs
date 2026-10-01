import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFile, mkdir, readFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { INPUT_LIMIT, ASSET_LIMIT, asset, fail, finish, readBounded, safeOutput, checkOutputTree } from './result.mjs'
import { normalizeOcrConfidenceThreshold, withOcrBackend } from './ocr.mjs'

export async function convert(file, extension, output, ocrConfidenceThreshold) {
  const threshold = normalizeOcrConfidenceThreshold(ocrConfidenceThreshold)
  if (extension !== 'pdf') fail('UNSUPPORTED_FORMAT')
  let bytes
  try {
    bytes = await readBounded(file, INPUT_LIMIT)
  } catch (error) {
    if (error.code === 'OUTPUT_TOO_LARGE') fail('INPUT_TOO_LARGE')
    throw error
  }
  if (!bytes.length) fail('EMPTY_FILE')
  if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) fail('INVALID_DOCUMENT')
  const root = process.env.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT
  if (!root || !path.isAbsolute(root)) fail('RUNTIME_INVALID')
  let lock
  try {
    lock = JSON.parse(await readFile(path.join(root, 'dependencies.lock.json'), 'utf8'))
  } catch {
    fail('RUNTIME_INVALID')
  }
  if (lock.cli?.jar !== 'opendataloader-pdf-cli-2.5.8.jar') fail('RUNTIME_INVALID')
  return finish(
    await convertPages(async (pages) => {
      const work = path.join(output, `convert-${randomUUID()}`)
      await mkdir(work, { recursive: true })
      if (pages) return withOcrBackend(root, work, (url) => extractPdf(file, root, lock, work, pages, url), threshold)
      return extractPdf(file, root, lock, work)
    })
  )
}

async function extractPdf(file, root, lock, work, pages, hybridUrl) {
  await mkdir(work, { recursive: true })
  const input = path.join(work, 'document.pdf')
  await copyFile(file, input)
  const separator = `XPERT-${randomUUID()}-PAGE-`
  try {
    await promisify(execFile)(
      path.join(root, 'jre/bin/java'),
      [
        '-Djava.awt.headless=true',
        `-Djava.io.tmpdir=${work}`,
        '-Xmx2g',
        '-jar',
        path.join(root, 'cli', lock.cli.jar),
        '--format',
        'markdown,json',
        '--output-dir',
        work,
        '--image-output',
        'external',
        '--image-format',
        'png',
        '--image-dir',
        path.join(work, 'images'),
        '--markdown-page-separator',
        `${separator}%page-number%-END`,
        '--reading-order',
        'xycut',
        '--threads',
        '1',
        ...(hybridUrl
          ? [
              '--pages',
              pages.join(','),
              '--hybrid',
              'docling-fast',
              '--hybrid-mode',
              'full',
              '--hybrid-url',
              hybridUrl,
              '--hybrid-timeout',
              '240000'
            ]
          : ['--hybrid', 'off']),
        '--quiet',
        input
      ],
      { timeout: 290000, maxBuffer: 256 * 1024, killSignal: 'SIGKILL' }
    )
  } catch (error) {
    if (error.killed || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') fail('RESOURCE_LIMIT')
    if (/password|encrypt/i.test(String(error.stderr ?? ''))) fail('ENCRYPTED')
    if (hybridUrl && error.stderr)
      process.stderr.write(`OpenDataLoader OCR conversion: ${String(error.stderr).slice(-8192)}\n`)
    fail(hybridUrl ? 'OCR_FAILED' : 'INVALID_DOCUMENT', pages)
  }
  await unlink(input)
  await checkOutputTree(work)
  const raw = await readBounded(path.join(work, 'document.json'))
  const markdown = (await readBounded(path.join(work, 'document.md'))).toString('utf8')
  return { json: JSON.parse(raw), markdown, separator, root: work }
}

/** Preserve Java text verbatim; OCR receives only pages whose text coverage is missing. */
export async function convertPages(extract) {
  const native = await extract()
  const result = await mapResult(native.json, native.markdown, native.separator, native.root, { allowUncovered: true })
  const assets = [
    ...result.assets,
    asset('result-raw.json', 'application/json', Buffer.from(JSON.stringify(native.json)))
  ]
  let pages = result.pages
  if (result.uncovered.length) {
    const ocr = await extract(result.uncovered)
    if (ocr.json['number of pages'] !== native.json['number of pages']) fail('INCOMPLETE_PAGES', result.uncovered)
    const recognized = await mapResult(ocr.json, ocr.markdown, ocr.separator, ocr.root, {
      selectedPages: result.uncovered,
      assetPrefix: 'ocr-'
    })
    const replacements = new Map(recognized.pages.map((p) => [p.page, p]))
    pages = pages.map((p) => replacements.get(p.page) ?? p)
    assets.push(
      ...recognized.assets,
      asset('result-ocr.json', 'application/json', Buffer.from(JSON.stringify(ocr.json)))
    )
  }
  return { markdown: pages.map((p) => p.markdown).join('\n\n'), pages, assets }
}

/** Coverage is established from page markers plus JSON text, never from filenames or missing text alone. */
export async function mapResult(json, markdown, separator, root, options = {}) {
  const count = json?.['number of pages']
  if (!Number.isSafeInteger(count) || count <= 0 || count > 10000 || !Array.isArray(json.kids)) fail('INCOMPLETE_PAGES')
  const pages = splitPages(markdown, separator, count, options.selectedPages)
  const textPages = new Set(),
    imagePages = new Set(),
    images = []
  let nodes = 0
  function walk(value, inheritedPage, depth = 0) {
    if (++nodes > 200000 || depth > 100) fail('RESOURCE_LIMIT')
    if (!value || typeof value !== 'object') return
    const page = value['page number'] ?? inheritedPage
    if (value['page number'] != null && (!Number.isSafeInteger(page) || page < 1 || page > count))
      fail('INCOMPLETE_PAGES')
    if (page && typeof value.content === 'string' && value.content.trim()) textPages.add(page)
    if (value.type === 'image') {
      if (!page || typeof value.source !== 'string') fail('INCOMPLETE_PAGES')
      imagePages.add(page)
      images.push({ source: value.source, page })
      if (images.length > ASSET_LIMIT) fail('OUTPUT_TOO_LARGE')
    }
    for (const child of Object.values(value))
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) child.forEach((item) => walk(item, page, depth + 1))
        else walk(child, page, depth + 1)
      }
  }
  walk(json.kids)
  const uncovered = pages.filter((p) => !textPages.has(p.page)).map((p) => p.page)
  if (uncovered.length && !options.allowUncovered)
    fail(
      options.selectedPages
        ? 'OCR_FAILED'
        : uncovered.some((p) => imagePages.has(p))
        ? 'NEEDS_OCR'
        : 'INCOMPLETE_PAGES',
      uncovered
    )
  const assets = []
  const seenImages = new Set()
  for (const image of images) {
    // Full scan images on uncovered pages are replaced by OCR text, not sent to VLM again.
    if (uncovered.includes(image.page)) continue
    const source = image.source
    const key = `${image.page}\0${source}`
    if (seenImages.has(key)) continue
    seenImages.add(key)
    const file = await safeOutput(root, source)
    const data = await readBounded(file)
    if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail('INVALID_DOCUMENT')
    const name = `${options.assetPrefix ?? ''}image-${assets.length + 1}.png`
    assets.push(asset(name, 'image/png', data, image.page))
    const page = pages.find((page) => page.page === image.page)
    if (!page) fail('INCOMPLETE_PAGES')
    // Only generated image destinations are rewritten. Text, links and repeated basenames remain intact.
    const escapedSource = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const reference = new RegExp(`(!\\[(?:\\\\.|[^\\]\\\\])*\\]\\()<${escapedSource}>(\\))`, 'g')
    let matched = false
    page.markdown = page.markdown.replace(reference, (_match, before, after) => {
      matched = true
      return `${before}xpert-asset://${name}${after}`
    })
    if (!matched) fail('INCOMPLETE_PAGES')
  }
  return { markdown: pages.map((p) => p.markdown).join('\n\n'), pages, assets, uncovered }
}

export function splitPages(markdown, separator, count, selectedPages) {
  const expected = selectedPages ?? Array.from({ length: count }, (_, i) => i + 1)
  const escaped = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...markdown.matchAll(new RegExp(`^${escaped}(\\d+)-END\\s*$`, 'gm'))]
  if (matches.length !== expected.length || markdown.slice(0, matches[0]?.index).trim()) fail('INCOMPLETE_PAGES')
  return matches.map((match, index) => {
    if (Number(match[1]) !== expected[index]) fail('INCOMPLETE_PAGES')
    return {
      page: expected[index],
      markdown: markdown.slice(match.index + match[0].length, matches[index + 1]?.index ?? markdown.length).trim()
    }
  })
}
