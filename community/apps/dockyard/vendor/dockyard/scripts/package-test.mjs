import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const project=resolve('.'), pkg=JSON.parse(await readFile(join(project,'package.json'),'utf8'));
const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--tarball'),'Usage: node scripts/package-test.mjs [--tarball path]');
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(command,args,cwd,label){const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:90_000,env:{...process.env,npm_config_update_notifier:'false'}});assert.equal(result.status,0,`${label} failed:\n${result.stdout??''}${result.stderr??''}${result.error??''}`);return result.stdout;}
await mkdir(join(project,'test-results'),{recursive:true});const temporary=await mkdtemp(join(project,'test-results/package-'));
try{
 const packed=JSON.parse(run(npm,['pack',...(args.length?[resolve(args[1])]:[]),'--ignore-scripts','--json','--pack-destination',temporary],project,'npm pack'))[0];assert.equal(packed.name,pkg.name);assert.equal(packed.version,pkg.version);
 const tarball=join(temporary,packed.filename),files=new Set(packed.files.map(file=>file.path));
 for(const file of ['src/index.js','src/model.js','src/index.d.ts','src/model.d.ts','src/avalondock.css','dist/avalondock.js','dist/avalondock.css','sample/minimal.html','LICENSE','NOTICE.md'])assert(files.has(file),`Missing package file: ${file}`);
 for(const file of files)assert(!file.startsWith('node_modules/')&&!file.startsWith('test-results/'),`Unexpected package file: ${file}`);
 const consumer=join(temporary,'consumer');await mkdir(consumer);await writeFile(join(consumer,'package.json'),JSON.stringify({name:'dockyard-installed-consumer',version:'1.0.0',private:true,type:'module'}));
 run(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',tarball],consumer,'isolated actual-tarball installation');
 const name=JSON.stringify(pkg.name);
 const smoke=`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as api from ${name};import * as model from ${JSON.stringify(pkg.name+'/model')};assert.equal(globalThis.document,undefined);assert.equal(globalThis.customElements,undefined);assert.equal(api.LayoutDocument,model.LayoutDocument);assert.equal(api.LayoutRoot,model.LayoutRoot);const metadata=JSON.parse(await readFile(new URL(import.meta.resolve(${JSON.stringify(pkg.name+'/package.json')})),'utf8'));assert.equal(api.version,metadata.version);const css=await readFile(new URL(import.meta.resolve(${JSON.stringify(pkg.name+'/styles.css')})),'utf8');assert(css.includes('.ad-'));const manager=new api.DockingManager();const document=manager.AddDocument({ContentId:'installed',Title:'Installed document'});assert(document instanceof model.LayoutDocument);document.Float();assert(document.IsFloating);document.Dock();assert(!document.IsFloating);const xml=new api.XmlLayoutSerializer(manager).Serialize();new api.XmlLayoutSerializer(manager).Deserialize(xml);assert.equal(manager.Find('installed').Title,'Installed document');const json=manager.SaveLayout();manager.LoadLayout(json);assert.equal(manager.Find('installed').ContentId,'installed');manager.Dispose();console.log('Installed ESM/model identity, no-DOM import, metadata/CSS and document serialization lifecycle passed.');`;
 await writeFile(join(consumer,'consumer.mjs'),smoke);run(process.execPath,['consumer.mjs'],consumer,'ESM installed package');
 // Use the complete maintained fixture against public package resolution, including
 // its negative type assertions, rather than compiling the checkout by relative path.
 const fixture=(await readFile(join(project,'tests/types.ts'),'utf8')).replace("'../src/index.js'",name);
 await writeFile(join(consumer,'consumer.ts'),fixture+`\nimport {LayoutDocument as ModelDocument} from ${JSON.stringify(pkg.name+'/model')};\nconst typedModel: ModelDocument=new ModelDocument({ContentId:'typed'});void typedModel;\n`);
 const require=createRequire(join(project,'package.json'));const config=require.resolve('typescript/package.json');const compiler=join(dirname(config),JSON.parse(await readFile(config,'utf8')).bin.tsc);
 run(process.execPath,[compiler,'--noEmit','--strict','--lib','es2022,dom','--module','nodenext','--moduleResolution','nodenext','consumer.ts'],consumer,'strict TypeScript installed consumer');
 console.log(`Verified actual ${pkg.name}@${pkg.version} package: ${files.size} files, installed ESM/model/CSS exports, headless lifecycle, serialization and strict TypeScript.`);
}finally{await rm(temporary,{recursive:true,force:true});}
