#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=parse(process.argv.slice(2));
if(!args.inventory) throw new Error('--inventory is required');
const inventory=JSON.parse(fs.readFileSync(args.inventory,'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'references/baseline-adapter-catalog.json'),'utf8'));
const s=inventory.signals||{};
const scores={
  registry:(s.registry?100:0)+(s.controls?10:0)+(s.defaults?10:0),
  'preview-array':s.previewArray?90+(s.controls?12:0)+(s.defaults?12:0):0,
  'module-list':(!s.previewArray&&!s.registry&&inventory.totals?.jsx>3&&s.controls&&s.defaults?75:0),
  'meta-array':(s.componentMeta?88:0)+(s.previewArray?12:0),
  'html-order':s.htmlOrder?70+(inventory.totals?.jsx?15:0):0,
  'page-files':s.pageFiles?95:0,
  'spec-slot':s.slideSpec?95:0,
  'mixed-static-react':(s.htmlOrder&&inventory.totals?.jsx&&inventory.totals?.html?65:0),
  'pptx-tree':inventory.type==='pptx'?100:0
};
const ranking=Object.entries(scores).filter(([,score])=>score>0).sort((a,b)=>b[1]-a[1]).map(([pattern,score])=>({pattern,score,...catalog.patterns[pattern]}));
const selected=ranking[0]?.pattern||(['pdf','image','images'].includes(inventory.type)?'image-evidence':'manual-inspection');
const adapterModes={registry:'registry','preview-array':'preview-array','module-list':'module-list','meta-array':'meta','html-order':'html-order','page-files':'page-files','spec-slot':'spec-slot','mixed-static-react':'static-react-mixed','pptx-tree':'pptx-slide-tree','image-evidence':'visual-archetype'};
const adapterMode=adapterModes[selected]||null;
const plan={schemaVersion:1,selected,adapterMode,ranking,risks:[...(inventory.risks||[]),...(adapterMode?[]:['manual inspection must select one supported adapterMode before generation'])],steps:[
  'Confirm the authoritative page order and registry source.',
  'Build rawPages without copying the preview shell.',
  'Normalize Component, defaultProps, controls, roles, and dependencies.',
  'Scope CSS and rewrite every asset path.',
  'Evaluate props, media, and browser lifecycle contracts before metadata generation.'
]};
const output=`${JSON.stringify(plan,null,2)}\n`;
if(args.out){fs.mkdirSync(path.dirname(args.out),{recursive:true});fs.writeFileSync(args.out,output);console.log(`Wrote ${args.out}`);}else process.stdout.write(output);
function parse(argv){const out={};for(let i=0;i<argv.length;i+=1){if(argv[i]==='--inventory')out.inventory=path.resolve(argv[++i]);else if(argv[i]==='--out')out.out=path.resolve(argv[++i]);else if(argv[i]==='--help'){console.log('Usage: recommend-adapter.mjs --inventory inventory.json [--out adapter-plan.json]');process.exit(0);}else throw new Error(`Unknown argument: ${argv[i]}`);}return out;}
