import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../vendor/dockyard/',import.meta.url));
const manifest=JSON.parse(await readFile(new URL('../vendor/provenance.json',import.meta.url),'utf8'));
async function list(dir){ const result=[]; for(const item of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,item.name); if(item.isDirectory())result.push(...await list(path));else result.push(path);}return result;}
const files=await list(root);
if(files.length!==Object.keys(manifest.files).length)throw new Error('Upstream file inventory changed');
for(const [path,expected] of Object.entries(manifest.files)){
 const actual=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
 if(actual!==expected)throw new Error('Upstream file changed: '+path);
}
console.log(`Verified ${files.length} unchanged upstream files at ${manifest.commit}`);
