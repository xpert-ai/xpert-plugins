/** Inventory of this implementation, not an upstream parity score. */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as API from '../src/index.js';
const output={package:JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name,version:API.version,scope:'Implemented JavaScript exports only; not a completeness comparison with WPF AvalonDock.',exports:{}};
for(const name of Object.keys(API).sort()){
  const value=API[name];
  if(typeof value==='function' && /^class\s/.test(Function.prototype.toString.call(value))){
    const proto=Object.getOwnPropertyDescriptors(value.prototype);
    const properties=Object.entries(proto).filter(([key,d])=>!key.startsWith('_')&&(d.get||d.set)).map(([name,d])=>({name,read:!!d.get,write:!!d.set}));
    const methods=Object.entries(proto).filter(([key,d])=>key!=='constructor'&&!key.startsWith('_')&&typeof d.value==='function').map(([key])=>key);
    const schema=API.getSchema(value);
    output.exports[name]={kind:'class',extends:Object.getPrototypeOf(value)?.name||null,ownProperties:properties,ownMethods:methods,observableProperties:Object.keys(schema).sort(),ownPropertyTokens:Object.getOwnPropertyNames(value).filter(key=>key.endsWith('Property')).sort()};
  }else if(typeof value==='function')output.exports[name]={kind:'function'};
  else if(value&&typeof value==='object')output.exports[name]={kind:'namespace-or-enum',members:Object.keys(value).sort()};
  else output.exports[name]={kind:typeof value,value};
}
fs.mkdirSync(fileURLToPath(new URL('../docs/',import.meta.url)),{recursive:true});
fs.writeFileSync(fileURLToPath(new URL('../docs/API-SURFACE.json',import.meta.url)),JSON.stringify(output,null,2)+'\n');
console.log(`Inventoried ${Object.keys(output.exports).filter(x=>x!=='default').length} named exports plus the default export.`);
