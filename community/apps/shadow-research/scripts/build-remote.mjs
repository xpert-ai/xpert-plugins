import {build} from 'esbuild'
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
const root=fileURLToPath(new URL('..',import.meta.url))
await mkdir(path.join(root,'dist/remote'),{recursive:true})
const css=spawnSync(process.execPath,[path.join(root,'node_modules/@tailwindcss/cli/dist/index.mjs'),'-i','src/remote/style.css','-o','dist/remote/app.css','--minify'],{cwd:root,encoding:'utf8'})
if(css.status!==0)throw new Error(css.stderr||css.stdout)
const bundle=await build({absWorkingDir:root,entryPoints:['src/remote/app.tsx'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify:true,
  tsconfig:'tsconfig.remote.json',nodePaths:[path.join(root,'node_modules')],legalComments:'inline'})
const styles=await readFile(path.join(root,'dist/remote/app.css'),'utf8')
const js=bundle.outputFiles[0].text
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles.replace(/<\/style/gi,'<\\/style')}</style></head><body><div id="root"></div><script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`
await writeFile(path.join(root,'dist/remote/shadow-research.html'),html)
await writeFile(path.join(root,'dist/remote/app.js'),js)
await copyFile(path.join(root,'src/assistant.yaml'),path.join(root,'dist/assistant.yaml'))
console.log(`Built self-contained Workbench view (${Buffer.byteLength(html)} bytes)`)
