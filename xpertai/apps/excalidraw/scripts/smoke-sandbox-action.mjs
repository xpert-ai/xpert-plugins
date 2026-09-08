import { mkdtemp,cp,mkdir,writeFile,readFile,symlink,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve,join,dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),runtime=process.argv[2]
if(!runtime)throw new Error('Pass the installed playwright-core 1.61.0 package directory')
assert.equal(JSON.parse(await readFile(join(runtime,'package.json'),'utf8')).version,'1.61.0')
const work=await mkdtemp(join(tmpdir(),'excalidraw-action-'))
try {
 await cp(join(root,'dist/sandbox-actions/excalidraw-render/bundle'),join(work,'bundle'),{recursive:true})
 await mkdir(join(work,'node_modules'));await symlink(resolve(runtime),join(work,'node_modules/playwright-core'))
 await writeFile(join(work,'scene.json'),JSON.stringify({type:'excalidraw',version:2,elements:[{id:'hello',type:'text',x:0,y:0,width:320,height:80,text:'MCP · 中文绘图',fontSize:32,fontFamily:5}],appState:{viewBackgroundColor:'#ffffff'},files:{},mermaidSource:'flowchart LR\n A[Input] --> B[Native preview]'}))
 for(const [kind,format] of [['preview','png'],['export','svg'],['mermaid','json']]){
  await writeFile(join(work,'request.json'),JSON.stringify({contractVersion:'1',action:'excalidraw.render',actionVersion:'1.0.0',payload:{kind,format}}))
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[join(work,'bundle/runner.mjs'),'--request',join(work,'request.json'),'--output',join(work,'output')],{stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',data=>output+=data);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(output)))})
  const file=join(work,'output',kind==='mermaid'?'converted.json':`drawing.${format}`),bytes=await readFile(file)
  if(format==='png')assert.equal(bytes.subarray(1,4).toString(),'PNG')
  if(format==='svg')assert.match(bytes.toString(),/<svg/)
  if(kind==='mermaid')assert.ok(JSON.parse(bytes.toString()).elements.length>=3)
  process.stdout.write(`${kind}/${format}: ${bytes.length} bytes\n`)
 }
 const evidence=join(root,'test-output/mcp');await mkdir(evidence,{recursive:true});await cp(join(work,'output/drawing.png'),join(evidence,'native-preview.png'));await cp(join(work,'output/drawing.svg'),join(evidence,'native-preview.svg'))
}finally{await rm(work,{recursive:true,force:true})}
