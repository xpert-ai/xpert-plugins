import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from '../dist/index.js'
import { suiteRoles } from '../dist/catalog.js'
import { agentKey, roles, templateKey } from '../dist/process.js'
import { configuration } from '../dist/configuration.js'
const root = fileURLToPath(new URL('../', import.meta.url))
const save = (path, data) => writeFile(join(root, path), JSON.stringify(data, null, 2) + '\n')
await mkdir(join(root, 'dist/remote'), { recursive: true })
// Use the iframe's React instance for both the app and the workspace design system.
const alias = Object.fromEntries(
  ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'].map((p, i) => [
    p,
    join(
      root,
      'scripts/shims',
      [
        'react-shim',
        'react-dom-shim',
        'react-dom-client-shim',
        'react-jsx-runtime-shim',
        'react-jsx-runtime-shim',
      ][i] + '.ts',
    ),
  ]),
)
await build({
  entryPoints: [join(root, 'remote/main.tsx')],
  outfile: join(root, 'dist/remote/app.js'),
  bundle: true,
  format: 'iife',
  minify: true,
  jsx: 'automatic',
  target: 'es2022',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'host-react',
      setup(b) {
        b.onResolve({ filter: /^react($|\/)|^react-dom($|\/)/ }, (a) =>
          alias[a.path] ? { path: alias[a.path] } : undefined,
        )
      },
    },
  ],
})
const { meta } = plugin
await save('.xpertai-plugin/plugin.json', { ...meta, license: 'AGPL-3.0' })
await save('blueprints/assistant-suite-v1.json', {
  schemaVersion: 'xpert-assistant-suite@1',
  key: 'ev-motor-suite-v1',
  plugin: { name: meta.name, version: meta.version },
  roles: suiteRoles,
  orchestrator: {
    key: 'coordinator',
    name: templateKey('coordinator'),
    templateKey: templateKey('coordinator'),
    title: roles.coordinator,
    primaryAgentKey: agentKey('coordinator'),
    externalRoleKeys: suiteRoles.map((r) => r.key),
  },
})
await save('blueprints/project-pipeline-v1.json', configuration({}, '1.0.0'))
await save('blueprints/project-pipeline-v1.1.json', configuration())
