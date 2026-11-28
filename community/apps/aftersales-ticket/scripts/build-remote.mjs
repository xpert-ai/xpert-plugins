import {build} from 'esbuild'
import {copyFile, mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const ui = fileURLToPath(new URL('./dist/', import.meta.resolve('@xpert-ai/plugin-shadcn-ui/package.json')))
const out = join(root, 'dist/remote')
await mkdir(out, {recursive:true})
await build({entryPoints:[join(root,'remote/app.jsx')], outfile:join(out,'app.js'), bundle:true, minify:true, platform:'browser',format:'iife',
  alias:{'@xpert-ai/plugin-shadcn-ui/i18n':join(ui,'i18n.js'),'@xpert-ai/plugin-shadcn-ui':join(ui,'index.js'),'react/jsx-runtime':require.resolve('react/jsx-runtime')},
  define:{'process.env.NODE_ENV':'"production"'}, plugins:[{name:'host-react',setup(builder){
    builder.onResolve({filter:/^(react|react-dom)$/},args=>({path:args.path,namespace:'host'}))
    builder.onLoad({filter:/.*/,namespace:'host'},args=>({contents:'module.exports = window.'+(args.path==='react'?'React':'ReactDOM')}))
  }}]})
await copyFile(join(ui,'style.css'),join(out,'style.css'))