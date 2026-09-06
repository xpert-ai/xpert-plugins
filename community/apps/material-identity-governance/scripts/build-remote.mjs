import { build } from 'esbuild'
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname,resolve,join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const component=join(root,'src/lib/remote-components/governance-workbench')
const shared=resolve(root,'../../..','packages/shadcn-ui')
const shims=join(component,'src/shims')
const aliases={'react':join(shims,'react-shim.ts'),'react-dom':join(shims,'react-dom-shim.ts'),'react-dom/client':join(shims,'react-dom-client-shim.ts'),'react/jsx-runtime':join(shims,'react-jsx-runtime-shim.ts'),'react/jsx-dev-runtime':join(shims,'react-jsx-runtime-shim.ts'),'@xpert-ai/plugin-shadcn-ui':join(shared,'dist/index.js'),'@xpert-ai/plugin-shadcn-ui/theme':join(shared,'dist/theme.js'),'@xpert-ai/plugin-shadcn-ui/style.css':join(shared,'dist/style.css')}
const temporary=await mkdtemp(join(tmpdir(),'material-identity-css-'))
const input=join(root,'scripts/tailwind.css'),output=join(temporary,'utilities.css')
const result=spawnSync('corepack',['pnpm','exec','tailwindcss','-i',input,'-o',output,'--minify'],{cwd:root,encoding:'utf8'})
if(result.status!==0)throw new Error(result.stderr||'tailwind_failed')
for (const entry of ['governance-workbench', 'assistant-profile']) {
const entryDir=join(root,'src/lib/remote-components',entry)
const generated=await build({entryPoints:[join(entryDir,'src/main.tsx')],outdir:entryDir,entryNames:'app',bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,write:false,legalComments:'none',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'host-runtime',setup(b){b.onResolve({filter:/^(react($|\/)|react-dom($|\/)|@xpert-ai\/plugin-shadcn-ui($|\/))/},args=>aliases[args.path]?{path:aliases[args.path]}:undefined)}}]})
const js=generated.outputFiles.find(f=>f.path.endsWith('.js')).text
const css=generated.outputFiles.find(f=>f.path.endsWith('.css'))?.text??''
const utilities=await readFile(output,'utf8')
for(const [name,content]of [['app.js',js],['app.css',css+'\n'+utilities+'\n@layer base { *,::before,::after,::backdrop,::file-selector-button { border-color:var(--border,var(--xui-color-border,#e4e4e7)); } }']]){const path=join(entryDir,name);if(process.argv.includes('--check')){if(await readFile(path,'utf8').catch(()=>'')!==content)throw new Error('Stale generated asset: '+name)}else await writeFile(path,content)}
}
await rm(temporary,{recursive:true,force:true})
console.log(process.argv.includes('--check')?'Remote assets are current':'Remote assets generated')
