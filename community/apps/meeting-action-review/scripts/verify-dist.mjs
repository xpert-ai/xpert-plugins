import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
export async function sourceDigest(){
  const files=[]
  async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p)}}
  for(const p of ['src','remote','blueprints','scripts'])await walk(resolve(root,p))
  files.push(resolve(root,'package.json'),resolve(root,'tsconfig.json'))
  await walk(resolve(root,'../../../packages/shadcn-ui/src'))
  const hash=createHash('sha256')
  for(const f of files.sort())hash.update(relative(root,f).replaceAll('\\','/')).update(await readFile(f))
  return hash.digest('hex')
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const manifest=JSON.parse(await readFile(resolve(root,'dist/build-manifest.json'),'utf8'))
  if(manifest.sourceDigest!==await sourceDigest())throw new Error('Build is stale; rebuild before packaging or UI verification.')
  for(const file of ['index.js','remote/app.js','remote/app.css'])if(!(await readFile(resolve(root,'dist',file))).length)throw new Error(`Missing ${file}`)
  const plugin=(await import('../dist/index.js')).default
  const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
  for(const [key,value] of Object.entries({name:pkg.name,version:pkg.version,level:pkg.xpert.plugin.level,artifactNamespace:pkg.xpert.plugin.artifactNamespace})){
    if(plugin.meta[key]!==value)throw new Error(`Metadata mismatch: ${key}`)
  }
  console.log('Built assets are current; runtime metadata matches package.json.')
}
