import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const defaultPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function matchesFont(bytes, font) {
  return bytes.length === font.size && createHash('sha256').update(bytes).digest('hex') === font.sha256
}

// Readers must never observe a partially downloaded cache entry or runtime font.
async function writeAtomic(path, bytes) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, bytes, { flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function prepareFonts({
  packageRoot = defaultPackageRoot,
  cacheRoot = process.env.XPERT_EXCALIDRAW_FONT_CACHE || join(packageRoot, 'node_modules/.cache/excalidraw-fonts'),
  offline = process.env.XPERT_EXCALIDRAW_FONTS_OFFLINE === '1',
  fetchFont = fetch
} = {}) {
  const source = join(packageRoot, 'assets/fonts')
  const font = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
  const cached = join(cacheRoot, `${font.sha256}-${font.fileName}`)
  let bytes
  try {
    bytes = await readFile(cached)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  // Verify even existing cache entries; a filename alone is not proof of integrity.
  const cacheHit = bytes !== undefined && matchesFont(bytes, font)
  if (!cacheHit) {
    if (offline) {
      throw new Error(`No verified font in ${cached}. Run prepare:fonts online first or populate XPERT_EXCALIDRAW_FONT_CACHE.`)
    }
    const response = await fetchFont(font.url, { signal: AbortSignal.timeout(45_000) })
    if (!response.ok || !response.body) {
      throw new Error(`Font download failed: HTTP ${response.status} (${font.fileName}).`)
    }
    const chunks = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > font.size) throw new Error(`Font download exceeds the pinned size: ${font.fileName}.`)
      chunks.push(chunk)
    }
    bytes = Buffer.concat(chunks)
    if (!matchesFont(bytes, font)) {
      throw new Error(`Font integrity check failed: ${font.fileName}; expected SHA-256 ${font.sha256}.`)
    }
    await writeAtomic(cached, bytes)
  }

  const output = join(packageRoot, 'dist/assets/fonts')
  await writeAtomic(join(output, font.fileName), bytes)
  for (const file of ['manifest.json', 'OFL.txt', 'README.md']) {
    await cp(join(source, file), join(output, file))
  }
  return { fileName: font.fileName, cacheHit }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await prepareFonts()
  process.stdout.write(`Prepared ${result.fileName} from ${result.cacheHit ? 'verified cache' : 'verified download'}.\n`)
}
