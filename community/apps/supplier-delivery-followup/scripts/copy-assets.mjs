// Copies runtime assets into dist/: the assistant template YAML, the generated remote view
// app.js / app.css and the server message catalogs. TSX sources, fixtures and the preview config stay out of dist.
import { copyFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(packageRoot, 'dist')

const template = 'xpert-supplier-delivery-followup-assistant.yaml'
await mkdir(dist, { recursive: true })
await copyFile(join(packageRoot, 'src', template), join(dist, template))

const component = 'supplier-delivery-workbench'
const source = join(packageRoot, 'src', 'lib', 'remote-components', component)
const target = join(dist, 'lib', 'remote-components', component)
await mkdir(target, { recursive: true })
for (const file of ['app.js', 'app.css']) {
  if (!existsSync(join(source, file))) throw new Error(`Missing ${file}; run pnpm generate:remote first.`)
  await copyFile(join(source, file), join(target, file))
}

// Catalogs for the text the server sends into the chat (read at runtime by domain-utils).
await mkdir(join(dist, 'lib', 'locales'), { recursive: true })
for (const locale of ['en', 'zh-Hans']) {
  await copyFile(
    join(packageRoot, 'src', 'lib', 'locales', `${locale}.json`),
    join(dist, 'lib', 'locales', `${locale}.json`)
  )
}
console.log(`Copied ${template}, ${component} assets and message catalogs to dist`)
