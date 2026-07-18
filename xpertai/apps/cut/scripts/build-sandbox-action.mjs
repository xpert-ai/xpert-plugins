import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { ProxyAgent, fetch as undiciFetch } from 'undici'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireFromHere = createRequire(import.meta.url)
const downloadDispatcher = process.env.https_proxy?.trim() || process.env.HTTPS_PROXY?.trim()
  ? new ProxyAgent(process.env.https_proxy?.trim() || process.env.HTTPS_PROXY.trim())
  : undefined
const transformersEntry = requireFromHere.resolve('@huggingface/transformers')
const requireFromTransformers = createRequire(transformersEntry)
const whisperModel = {
  id: 'Xenova/whisper-tiny',
  revision: '5332fcc35e32a33b86612b9a57a89be7906102b1',
  files: [
    { path: 'config.json', size: 2_248, sha256: '2b2e4e519084e0ea028b19b153f95202735a971870d6844aa26e559edd292e94' },
    { path: 'generation_config.json', size: 3_716, sha256: '68ac791fcb4999461a313472125042934656240ba1cba7d1c2627fcbb19ac24c' },
    { path: 'preprocessor_config.json', size: 339, sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d' },
    { path: 'tokenizer.json', size: 2_480_466, sha256: '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566' },
    { path: 'tokenizer_config.json', size: 282_683, sha256: '2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce' },
    { path: 'onnx/encoder_model_q4.onnx', size: 9_006_044, sha256: 'f895af36f57fec9cbeac8d29a982ae47b2e81e461d98320fbd30c47d01a6a13f' },
    { path: 'onnx/decoder_model_merged_q4.onnx', size: 86_739_474, sha256: '462a65ea8459402cded5e6f22a378ac410ec7e0aad9367ebb08431906c237660' }
  ]
}
const actions = [
  {
    directory: 'cut-render',
    name: 'cut.render-mp4',
    version: '1.1.5'
  },
  {
    directory: 'cut-transcription-audio',
    name: 'cut.prepare-transcription-audio',
    version: '1.0.0'
  },
  {
    directory: 'cut-transcription-whisper',
    name: 'cut.transcribe-whisper',
    version: '1.0.0',
    model: whisperModel
  }
]

for (const action of actions) await buildAction(action)

async function buildAction(action) {
  const sourceRoot = path.join(packageRoot, 'sandbox-actions', action.directory)
  const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', action.directory)
  const bundleRoot = path.join(actionRoot, 'bundle')

  await rm(actionRoot, { recursive: true, force: true })
  await mkdir(bundleRoot, { recursive: true })
  await build({
    entryPoints: [path.join(sourceRoot, 'runner.mjs')],
    outfile: path.join(bundleRoot, 'runner.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['playwright-core'],
    legalComments: 'none'
  })
  const browserBuild = {
    entryPoints: [path.join(sourceRoot, 'browser-entry.ts')],
    outfile: path.join(bundleRoot, 'browser-entry.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['chrome120'],
    legalComments: 'none'
  }
  if (action.model) {
    const [ortWasmBinary, ortWasmFactory] = await Promise.all([
      readFile(requireFromTransformers.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm')),
      readFile(requireFromTransformers.resolve('onnxruntime-web/ort-wasm-simd-threaded.mjs'))
    ])
    browserBuild.conditions = ['onnxruntime-web-use-extern-wasm']
    browserBuild.define = {
      'process.env.NODE_ENV': '"production"',
      __CUT_ORT_WASM_BINARY_DATA_URL__: JSON.stringify(`data:application/wasm;base64,${ortWasmBinary.toString('base64')}`),
      __CUT_ORT_WASM_FACTORY_DATA_URL__: JSON.stringify(`data:text/javascript;base64,${ortWasmFactory.toString('base64')}`)
    }
  }
  await build(browserBuild)
  if (action.model) await materializeModel(action.model, bundleRoot)

  const files = await collectFiles(bundleRoot)
  const bundleSha256 = treeSha256(files)
  const manifest = {
    name: action.name,
    version: action.version,
    runtimeProfile: 'browser/playwright-1.61/v1',
    runtimeContractVersion: '1',
    playwrightVersion: '1.61.0',
    bundle: './bundle',
    entrypoint: 'runner.mjs',
    bundleSha256
  }
  await writeFile(path.join(actionRoot, 'action.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ action: manifest.name, version: manifest.version, bundleSha256, files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) })}\n`)
}

async function materializeModel(model, bundleRoot) {
  const cacheRoot = path.join(packageRoot, 'node_modules', '.cache', 'xpert-cut', 'sandbox-models', model.revision, model.id)
  const outputRoot = path.join(bundleRoot, 'models', model.id)
  for (const file of model.files) {
    const cached = path.join(cacheRoot, file.path)
    if (!await validFile(cached, file)) {
      await mkdir(path.dirname(cached), { recursive: true })
      const response = await undiciFetch(`https://huggingface.co/${model.id}/resolve/${model.revision}/${file.path}`, {
        dispatcher: downloadDispatcher,
        headersTimeout: 300_000,
        bodyTimeout: 300_000
      })
      if (!response.ok) throw new Error(`Unable to download pinned Sandbox Whisper model file ${file.path}: HTTP ${response.status}.`)
      const content = Buffer.from(await response.arrayBuffer())
      assertModelFile(content, file)
      const temporary = `${cached}.${process.pid}.${Date.now()}.tmp`
      await writeFile(temporary, content)
      await rename(temporary, cached)
    }
    const destination = path.join(outputRoot, file.path)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(cached, destination)
  }
}

async function validFile(filePath, expected) {
  const details = await stat(filePath).catch(() => null)
  if (!details?.isFile() || details.size !== expected.size) return false
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex') === expected.sha256
}

function assertModelFile(content, expected) {
  const sha256 = createHash('sha256').update(content).digest('hex')
  if (content.length !== expected.size || sha256 !== expected.sha256) {
    throw new Error(`Pinned Sandbox Whisper model file ${expected.path} failed size/SHA-256 verification.`)
  }
}

async function collectFiles(root) {
  const result = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolutePath)
      else if (entry.isFile()) {
        const content = await readFile(absolutePath)
        result.push({ relativePath: path.relative(root, absolutePath).split(path.sep).join('/'), size: content.length, sha256: createHash('sha256').update(content).digest('hex') })
      } else throw new Error(`Sandbox Action bundle contains a non-regular entry: ${absolutePath}`)
    }
  }
  await visit(await realpath(root))
  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function treeSha256(files) {
  const hash = createHash('sha256')
  for (const file of files) hash.update(`${file.relativePath}\0${file.size}\0${file.sha256}\n`)
  return hash.digest('hex')
}
