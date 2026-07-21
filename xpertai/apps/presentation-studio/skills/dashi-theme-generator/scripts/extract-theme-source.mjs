#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const EVIDENCE_SCHEMA = 'xpert.presentation-theme-image-evidence/v1'
const ANALYSIS_BATCH_SIZE = 3
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = parse(process.argv.slice(2))

if (!args.input || !args.sourceType || !args.out) usage(2)
if (!['images', 'pdf'].includes(args.sourceType)) {
  throw new Error('--source-type must be images or pdf for evidence extraction')
}

const requestedInput = path.resolve(args.input)
const out = path.resolve(args.out)
if (!fs.existsSync(requestedInput)) throw new Error(`Input not found: ${requestedInput}`)
const input = args.sourceType === 'images' ? resolveImageSource(requestedInput) : requestedInput

const preparedInput = args.sourceType === 'images' ? readPreparedEvidence(input) : null
if (preparedInput) {
  emitResult('already-prepared', input, preparedInput)
  process.exit(0)
}

const sourceFingerprint = fingerprintSource(input, args.sourceType)
const outputState = inspectOutput(out, input, args.sourceType, sourceFingerprint)
if (outputState.manifest) {
  emitResult('reused', out, outputState.manifest)
  process.exit(0)
}

const staging = createStagingDirectory(out)
try {
  let sourceRecords
  if (args.sourceType === 'images') sourceRecords = await extractImages(input, staging, args.project)
  else sourceRecords = extractPdf(input, staging)

  const images = listImages(staging).sort(naturalCompare)
  if (images.length < 8 || images.length > 30) {
    throw new Error(`Image evidence must contain 8-30 pages; found ${images.length}`)
  }
  for (const file of images) detectImage(fs.readFileSync(file))

  const imageRecords = images.map((file, index) => ({ page: index + 1, file: path.relative(staging, file) }))
  const manifest = {
    schema: EVIDENCE_SCHEMA,
    sourceType: args.sourceType,
    sourceFingerprint,
    imageCount: images.length,
    images: imageRecords,
    sources: sourceRecords,
    analysis: buildAnalysisPlan(imageRecords)
  }
  fs.writeFileSync(path.join(staging, 'evidence-index.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  commitOutput(staging, out, outputState.replaceExisting)
  emitResult('prepared', out, manifest)
} catch (error) {
  fs.rmSync(staging, { recursive: true, force: true })
  throw error
}

function resolveImageSource(source) {
  if (!fs.statSync(source).isFile()) return source
  try {
    detectImage(fs.readFileSync(source))
  } catch {
    return source
  }

  const collection = path.dirname(source)
  const images = listImages(collection).sort(naturalCompare)
  if (images.length < 8 || images.length > 30) {
    throw new Error(
      `A single image member was provided, but its containing directory has ${images.length} images. ` +
      'Image evidence must contain 8-30 pages; pass the complete image directory or ZIP archive.'
    )
  }
  return collection
}

async function extractImages(source, target, project) {
  const stat = fs.statSync(source)
  if (stat.isDirectory()) {
    const files = listImages(source).sort(naturalCompare)
    return files.map((file, index) => copyValidatedImage(file, target, index))
  }

  const buffer = fs.readFileSync(source)
  if (buffer.subarray(0, 4).toString('hex') !== '504b0304') {
    throw new Error('images source must be a directory or ZIP archive')
  }
  const require = createRequire(path.join(path.resolve(project || path.join(skillRoot, 'project')), 'package.json'))
  const JSZip = require('jszip')
  const archive = await JSZip.loadAsync(buffer, { checkCRC32: true })
  const entries = Object.values(archive.files)
    .filter(entry => !entry.dir && /\.(?:png|jpe?g|webp)$/i.test(entry.name))
    .sort((left, right) => naturalCompare(left.name, right.name))
  const records = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    assertSafeArchivePath(entry.name)
    const image = Buffer.from(await entry.async('uint8array'))
    const kind = detectImage(image)
    const fileName = `page-${String(index + 1).padStart(2, '0')}.${kind.extension}`
    fs.writeFileSync(path.join(target, fileName), image)
    records.push({ page: index + 1, originalName: entry.name })
  }
  return records
}

function extractPdf(source, target) {
  if (!fs.statSync(source).isFile()) throw new Error('pdf source must be one PDF file')
  const parsedPages = findParsedPdfPages(source)
  if (parsedPages.length) {
    return parsedPages.map((file, index) => ({
      ...copyValidatedImage(file, target, index),
      evidenceSource: 'xpert-parsed-page',
      sourcePdf: path.basename(source)
    }))
  }
  const result = spawnSync('pdftoppm', ['-png', '-r', '144', source, path.join(target, 'page')], { encoding: 'utf8' })
  if (result.error?.code === 'ENOENT') throw new Error(pdfRendererMissingMessage())
  if (result.status !== 0) {
    throw new Error(`pdftoppm failed: ${(result.stderr || result.stdout || 'unknown error').trim()}`)
  }
  return [{ originalName: path.basename(source) }]
}

function pdfRendererMissingMessage() {
  const installHint = process.platform === 'darwin'
    ? 'On macOS, Poppler is installed with `brew install poppler`; `apt-get` is not available.'
    : 'Install Poppler with the package manager provided by this runtime; use `apt-get` only when that command exists.'
  return [
    'pdftoppm is required to render a bare PDF but is not installed.',
    installHint,
    'Do not retry extraction or run a guessed package-manager command.',
    'Preferred in Xpert: prepare the 8-30 parsed PDF page images with sourceType=images and sourceMode=image_files, then use the returned image ZIP once.'
  ].join(' ')
}

function copyValidatedImage(file, target, index) {
  const buffer = fs.readFileSync(file)
  const kind = detectImage(buffer)
  const fileName = `page-${String(index + 1).padStart(2, '0')}.${kind.extension}`
  fs.writeFileSync(path.join(target, fileName), buffer)
  return { page: index + 1, originalName: path.basename(file) }
}

function detectImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png' }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg' }
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp' }
  }
  throw new Error('Evidence contains a file that is not a valid PNG, JPEG, or WebP image')
}

function inspectOutput(target, source, sourceType, sourceFingerprint) {
  if (!fs.existsSync(target)) return { manifest: null, replaceExisting: false }
  const entries = fs.readdirSync(target)
  if (!entries.length) return { manifest: null, replaceExisting: true }

  const manifest = readPreparedEvidence(target)
  if (manifest && manifest.sourceType === sourceType && manifest.sourceFingerprint === sourceFingerprint) {
    return { manifest, replaceExisting: false }
  }
  if (!manifest && isRecoverableIncompleteOutput(target, source, sourceType)) {
    return { manifest: null, replaceExisting: true }
  }
  throw new Error(
    `Output directory contains different or incomplete evidence: ${target}. ` +
    'Use one deterministic evidence directory per theme; do not create v2/v3 retry directories or feed an extraction output back into this command.'
  )
}

function isRecoverableIncompleteOutput(target, source, sourceType) {
  if (sourceType !== 'images' || path.resolve(target) === path.resolve(source)) return false
  if (!fs.statSync(source).isDirectory()) return false
  const targetEntries = fs.readdirSync(target, { withFileTypes: true })
  if (!targetEntries.length || targetEntries.some(entry => !entry.isFile() || !/\.(?:png|jpe?g|webp)$/i.test(entry.name))) {
    return false
  }

  const sourceImages = listImages(source).sort(naturalCompare)
  if (targetEntries.length > sourceImages.length) return false
  const availableHashes = new Map()
  for (const file of sourceImages) {
    const hash = hashBuffer(fs.readFileSync(file))
    availableHashes.set(hash, (availableHashes.get(hash) || 0) + 1)
  }
  for (const entry of targetEntries) {
    const file = path.join(target, entry.name)
    const buffer = fs.readFileSync(file)
    detectImage(buffer)
    const hash = hashBuffer(buffer)
    const remaining = availableHashes.get(hash) || 0
    if (!remaining) return false
    availableHashes.set(hash, remaining - 1)
  }
  return true
}

function createStagingDirectory(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  return fs.mkdtempSync(path.join(path.dirname(target), `.${path.basename(target)}-extract-`))
}

function commitOutput(staging, target, replaceExisting) {
  if (replaceExisting) fs.rmSync(target, { recursive: true })
  fs.renameSync(staging, target)
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function readPreparedEvidence(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return null
  const manifestPath = path.join(directory, 'evidence-index.json')
  if (!fs.existsSync(manifestPath)) return null
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
  if (manifest?.schema !== EVIDENCE_SCHEMA || !Array.isArray(manifest.images)) return null
  if (manifest.images.length < 8 || manifest.images.length > 30 || manifest.imageCount !== manifest.images.length) return null
  for (const image of manifest.images) {
    if (!Number.isInteger(image?.page) || typeof image?.file !== 'string') return null
    const file = path.resolve(directory, image.file)
    const relative = path.relative(directory, file)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file)) return null
    detectImage(fs.readFileSync(file))
  }
  if (!manifest.analysis?.batches?.length) manifest.analysis = buildAnalysisPlan(manifest.images)
  return manifest
}

function buildAnalysisPlan(images) {
  const batches = []
  for (let index = 0; index < images.length; index += ANALYSIS_BATCH_SIZE) {
    batches.push({
      id: `batch-${String(batches.length + 1).padStart(2, '0')}`,
      images: images.slice(index, index + ANALYSIS_BATCH_SIZE).map(image => image.file)
    })
  }
  return {
    policy: 'single-primary-pass',
    batchSize: ANALYSIS_BATCH_SIZE,
    batches,
    maxPrimaryBatchCalls: batches.length,
    maxPrimarySingleImageCalls: images.length,
    completionArtifact: 'external-spec.json',
    revisitPolicy: 'Only revisit one named page once when a concrete validation mismatch requires it.'
  }
}

function emitResult(status, evidenceDirectory, manifest) {
  console.log(JSON.stringify({
    status,
    evidenceDirectory,
    manifestPath: path.join(evidenceDirectory, 'evidence-index.json'),
    imageCount: manifest.imageCount,
    analysis: manifest.analysis,
    nextAction: status === 'already-prepared' || status === 'reused'
      ? 'Use this evidence directory directly. Do not run extract-theme-source again.'
      : 'Analyze every listed image exactly once using the fixed batches, write external-spec.json, then continue without re-extracting or restarting image analysis.'
  }))
}

function fingerprintSource(source, sourceType) {
  const hash = createHash('sha256').update(`${sourceType}\0`)
  const stat = fs.statSync(source)
  if (stat.isFile()) {
    hash.update(fs.readFileSync(source))
    if (sourceType === 'pdf') {
      for (const file of findParsedPdfPages(source)) {
        hash.update(path.basename(file)).update('\0').update(fs.readFileSync(file)).update('\0')
      }
    }
    return hash.digest('hex')
  }
  if (!stat.isDirectory()) throw new Error('Evidence input must be a file or directory')
  const files = listImages(source).sort(naturalCompare)
  for (const file of files) {
    hash.update(path.relative(source, file).replace(/\\/g, '/')).update('\0').update(fs.readFileSync(file)).update('\0')
  }
  return hash.digest('hex')
}

function findParsedPdfPages(source) {
  const pagesDirectory = path.join(path.dirname(source), 'pages')
  if (!fs.existsSync(pagesDirectory) || !fs.statSync(pagesDirectory).isDirectory()) return []
  const pages = listImages(pagesDirectory)
    .filter(file => /^page-\d+\.(?:png|jpe?g|webp)$/i.test(path.basename(file)))
    .sort(naturalCompare)
  if (pages.length < 8 || pages.length > 30) return []
  for (const file of pages) detectImage(fs.readFileSync(file))
  return pages
}

function listImages(directory) {
  return walk(directory).filter(file => /\.(?:png|jpe?g|webp)$/i.test(file))
}

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(file, output)
    else output.push(file)
  }
  return output
}

function naturalCompare(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

function assertSafeArchivePath(name) {
  const normalized = path.posix.normalize(name)
  if (!name || name.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || name.includes('\\')) {
    throw new Error(`Archive contains an unsafe path: ${name}`)
  }
}

function parse(argv) {
  const keyByOption = new Map([
    ['--input', 'input'],
    ['--source-type', 'sourceType'],
    ['--out', 'out'],
    ['--project', 'project']
  ])
  const output = {}
  for (let index = 0; index < argv.length;) {
    const token = argv[index]
    if (token === '--help') usage(0)
    const separator = token.indexOf('=')
    const option = separator >= 0 ? token.slice(0, separator) : token
    const key = keyByOption.get(option)
    if (!key) throw new Error(`Unknown argument: ${token}`)

    if (separator >= 0) {
      output[key] = token.slice(separator + 1)
      index += 1
      continue
    }

    const values = []
    index += 1
    while (index < argv.length && !argv[index].startsWith('--')) {
      values.push(argv[index])
      index += 1
    }
    if (!values.length) throw new Error(`Missing value for ${option}`)
    output[key] = values.join(' ')
  }
  return output
}

function usage(code) {
  console.log('Usage: extract-theme-source.mjs --input <file-or-directory> --source-type <images|pdf> --out <evidence-directory> [--project <project>]')
  console.log('Quote every path in shell commands. The command is idempotent for a matching output directory.')
  process.exit(code)
}
