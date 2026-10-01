import {lstat,readFile,symlink,unlink,mkdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
const sdk=resolve(process.argv[2]||'')
const manifest=JSON.parse(await readFile(join(sdk,'package.json'),'utf8'))
if(manifest.name!=='@xpert-ai/plugin-sdk'||!manifest.exports?.['./data-workbench'])throw new Error('Pass the built host SDK dist directory with data-workbench exports')
for(const root of ['.','../../databases/mysql','../../databases/postgres']){
 const dir=resolve(root,'node_modules/@xpert-ai');await mkdir(dir,{recursive:true});const path=join(dir,'plugin-sdk')
 try{const stat=await lstat(path);if(!stat.isSymbolicLink())throw new Error(`Refusing to replace a real directory: ${path}`);await unlink(path)}catch(error){if(error.code!=='ENOENT')throw error}
 await symlink(sdk,path,'dir')
}
process.stdout.write('Linked built host SDK for local development; package manifests remain portable.\n')
