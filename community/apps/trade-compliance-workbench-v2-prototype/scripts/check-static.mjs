import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const html = readFileSync(join(root, 'index.html'), 'utf8')
const css = readFileSync(join(root, 'styles.css'), 'utf8')
const js = readFileSync(join(root, 'app.js'), 'utf8')

const required = [
  ['pending page', html, 'id="pending"'],
  ['rules page', html, 'id="rules"'],
  ['supplier page', html, 'id="supplier"'],
  ['invoice page', html, 'id="invoice"'],
  ['tools page', html, 'id="tools"'],
  ['product modal', html, 'id="productModal"'],
  ['hs modal', html, 'id="hsModal"'],
  ['candidate panel', html, '候选 HS 编码'],
  ['assistant panel', html, '外贸合规助手'],
  ['responsive styles', css, '@media (max-width: 820px)'],
  ['page switch', js, 'activatePage']
]

const missing = required.filter(([, source, token]) => !source.includes(token))
if (missing.length) {
  console.error('Prototype check failed:')
  for (const [label, , token] of missing) console.error(`- ${label}: ${token}`)
  process.exit(1)
}
