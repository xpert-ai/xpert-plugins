#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=parse(process.argv.slice(2));
const catalog=JSON.parse(fs.readFileSync(args.catalog||path.join(root,'references/baseline-module-catalog.json'),'utf8'));
let pages=catalog.themes.flatMap(theme=>theme.pages.map(page=>({...page,theme:theme.key,themeName:theme.name,bestFor:theme.bestFor})));
if(args.theme) pages=pages.filter(page=>page.theme===args.theme);
if(args.family) pages=pages.filter(page=>page.family===args.family);
if(args.control) pages=pages.filter(page=>page.controls.includes(args.control));
if(args.needsMedia) pages=pages.filter(page=>page.writableMediaSlots>0);
if(args.minMedia) pages=pages.filter(page=>page.mediaCapacity>=args.minMedia);
if(args.minFields) pages=pages.filter(page=>page.leafFields>=args.minFields);
if(args.minArrays) pages=pages.filter(page=>page.arrays>=args.minArrays);
if(!args.includeLocked) pages=pages.filter(page=>!page.contentLocked);
pages.sort((a,b)=>score(b,args)-score(a,args)||a.key.localeCompare(b.key));
const result={count:pages.length,filters:args,items:pages.slice(0,args.limit)};
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);

function score(page,filters) {
  return page.leafFields+page.arrays*4+page.mediaCapacity*8+(filters.family&&page.family===filters.family?100:0);
}
function parse(argv) {
  const out={limit:20,includeLocked:false,needsMedia:false};
  for(let i=0;i<argv.length;i+=1) {
    const key=argv[i];
    if(key==='--theme') out.theme=argv[++i];
    else if(key==='--family') out.family=argv[++i];
    else if(key==='--control') out.control=argv[++i];
    else if(key==='--needs-media') out.needsMedia=true;
    else if(key==='--include-locked') out.includeLocked=true;
    else if(key==='--min-media') out.minMedia=Number(argv[++i]);
    else if(key==='--min-fields') out.minFields=Number(argv[++i]);
    else if(key==='--min-arrays') out.minArrays=Number(argv[++i]);
    else if(key==='--limit') out.limit=Math.max(1,Number(argv[++i])||20);
    else if(key==='--catalog') out.catalog=path.resolve(argv[++i]);
    else if(key==='--help') usage(0);
    else throw new Error(`Unknown argument: ${key}`);
  }
  return out;
}
function usage(code) {
  console.log('Usage: query-baseline-modules.mjs [--theme theme01] [--family media] [--control range] [--needs-media] [--min-media 3] [--min-fields 30] [--min-arrays 2] [--limit 20]');
  process.exit(code);
}
