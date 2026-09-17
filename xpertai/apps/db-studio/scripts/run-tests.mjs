import {readdir,mkdir,rm} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {build} from 'esbuild'
const out='.test-build'
execFileSync('node_modules/.bin/tsc',['-p','tsconfig.spec.json','--noEmit'],{stdio:'inherit'})
await mkdir(out,{recursive:true})
try{
 const files=(await readdir('tests')).filter((file)=>file.endsWith('.test.ts'))
 for(const file of files)await build({entryPoints:[`tests/${file}`],outfile:`${out}/${file.replace(/\.ts$/,'.mjs')}`,bundle:true,platform:'node',packages:'external',format:'esm',target:'node22'})
 execFileSync(process.execPath,['--test',...files.map((file)=>`${out}/${file.replace(/\.ts$/,'.mjs')}`)],{stdio:'inherit'})
}finally{await rm(out,{recursive:true,force:true})}
