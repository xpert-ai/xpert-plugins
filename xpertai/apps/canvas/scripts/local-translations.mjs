import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(new URL('../package.json', import.meta.url))
const moduleId = 'virtual:canvas-tldraw-translations'

/** Bundle the published catalog for every supported locale; never fetch it at runtime. */
export async function loadTranslationCatalogs() {
  const assetsRoot = dirname(require.resolve('@tldraw/assets/package.json'))
  const tldrawRoot = dirname(dirname(require.resolve('tldraw')))
  const [assets, editor, languages] = await Promise.all([
    readJson(join(assetsRoot, 'package.json')),
    readJson(join(tldrawRoot, 'package.json')),
    readJson(join(assetsRoot, 'translations/languages.json'))
  ])
  if (assets.version !== editor.version) throw new Error('Canvas translations and tldraw must use the same version.')
  if (!Array.isArray(languages) || !languages.length) throw new Error('Canvas translation language inventory is missing.')
  const catalogs = Object.create(null)
  for (const language of languages) {
    const locale = language?.locale
    if (typeof locale !== 'string' || !/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(locale) || Object.hasOwn(catalogs, locale)) {
      throw new Error('Canvas translation language inventory is invalid.')
    }
    const messages = await readJson(join(assetsRoot, 'translations', `${locale}.json`))
    if (!messages || Array.isArray(messages) || typeof messages !== 'object' ||
        Object.values(messages).some(value => typeof value !== 'string')) {
      throw new Error(`Canvas translation catalog is invalid: ${locale}`)
    }
    catalogs[locale] = messages
  }
  return catalogs
}

export function localTranslationsPlugin() {
  return {
    name: 'canvas-local-translations',
    setup(build) {
      build.onResolve({ filter: /^virtual:canvas-tldraw-translations$/ }, () => ({ path: moduleId, namespace: moduleId }))
      build.onLoad({ filter: /.*/, namespace: moduleId }, async () => ({
        contents: JSON.stringify(await loadTranslationCatalogs()), loader: 'json'
      }))
    }
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}
