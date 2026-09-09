import { build } from 'esbuild'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { dirname,resolve,join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const result=await build({entryPoints:[join(root,'mcp-apps/preview/main.ts')],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'none'})
const source=await readFile(join(root,'mcp-apps/preview/index.html'),'utf8'),html=source.replace('/* APP_SCRIPT */',()=>result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'))
if(Buffer.byteLength(html)>2*1024*1024)throw new Error('MCP App exceeds host size limit')
const output=join(root,'dist/mcp-apps/preview/index.html')
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==html)throw new Error('MCP App asset is stale')}else{await mkdir(dirname(output),{recursive:true});await writeFile(output,html)}
process.stdout.write(`MCP App: ${Buffer.byteLength(html)} bytes\n`)
