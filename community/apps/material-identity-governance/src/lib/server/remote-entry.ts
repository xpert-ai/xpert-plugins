import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderRemoteReactIframeHtml } from '@xpert-ai/plugin-sdk'
const moduleDir = dirname(fileURLToPath(import.meta.url))
const requireHere = createRequire(import.meta.url)
export async function materialRemoteEntry(entry: 'governance-workbench' | 'assistant-profile', locale?: string) {
  const readPackage = (name: string, file: string) => readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
  const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
    readFile(join(moduleDir, '..', 'remote-components', entry, 'app.js'), 'utf8'),
    readFile(join(moduleDir, '..', 'remote-components', entry, 'app.css'), 'utf8'),
    readPackage('react', 'umd/react.production.min.js'), readPackage('react-dom', 'umd/react-dom.production.min.js'),
  ])
  return { contentType: 'text/html; charset=utf-8' as const,
    html: renderRemoteReactIframeHtml({ title: 'Material Identity Governance', lang: locale === 'zh-Hans' || locale === 'zh_CN' || locale === 'zh_Hans' ? 'zh-Hans' : 'en-US', appScript, appCss, reactUmd, reactDomUmd }) }
}
