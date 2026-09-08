import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, writeFile, readdir, mkdir, rm, cp } from 'node:fs/promises'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(join(root,'package.json'))
const action=join(root,'dist/sandbox-actions/excalidraw-render'),bundle=join(action,'bundle')
await rm(action,{recursive:true,force:true});await mkdir(bundle,{recursive:true})
await build({entryPoints:[join(root,'sandbox-actions/excalidraw-render/browser.mjs')],outfile:join(bundle,'browser.js'),bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'none',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff2':'dataurl','.woff':'dataurl'},conditions:['production','module']})
await cp(join(root,'sandbox-actions/excalidraw-render/runner.mjs'),join(bundle,'runner.mjs'))
await cp(join(dirname(require.resolve('@excalidraw/excalidraw')),'fonts'),join(bundle,'fonts'),{recursive:true,dereference:true})
const files=[]
async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await visit(path);else if(entry.isFile()){const data=await readFile(path);files.push({path:relative(bundle,path).split('\\').join('/'),size:data.length,sha256:createHash('sha256').update(data).digest('hex')})}else throw new Error('Non-regular bundle entry')}}
await visit(bundle);files.sort((a,b)=>a.path.localeCompare(b.path));const hash=createHash('sha256');for(const f of files)hash.update(`${f.path}\0${f.size}\0${f.sha256}\n`)
await writeFile(join(action,'action.json'),JSON.stringify({name:'excalidraw.render',version:'1.0.0',runtimeProfile:'browser/playwright-1.61/v1',runtimeContractVersion:'1',playwrightVersion:'1.61.0',bundle:'./bundle',entrypoint:'runner.mjs',bundleSha256:hash.digest('hex')},null,2)+'\n')
process.stdout.write(`Excalidraw Browser Action: ${files.length} files, ${files.reduce((s,f)=>s+f.size,0)} bytes\n`)
