#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args=parse(process.argv.slice(2));
if(!args.input) usage(2);
const input=path.resolve(args.input);
if(!fs.existsSync(input)) throw new Error(`Input not found: ${input}`);
const stat=fs.statSync(input);
const files=stat.isDirectory()?walk(input):[input];
const relative=file=>stat.isDirectory()?path.relative(input,file):path.basename(file);
const sourceFiles=files.filter(file=>/\.(?:jsx?|tsx?|html|css|json)$/i.test(file));
const texts=sourceFiles.map(file=>({file:relative(file),text:read(file)}));
const joined=texts.map(item=>item.text).join('\n');
const registrations=[];
for(const item of texts) {
  for(const name of ['SLIDES','PAGES','PAGE_FILES','slideSpec','slides','swSlides']) if(new RegExp(`(?:const|let|var|export\\s+const)\\s+${name}\\b`).test(item.text)) registrations.push({file:item.file,name});
}
const inventory={
  schemaVersion:1,input,type:detectType(input,stat,files),
  totals:{files:files.length,sourceFiles:sourceFiles.length,jsx:files.filter(f=>/\.jsx$/i.test(f)).length,html:files.filter(f=>/\.html$/i.test(f)).length,css:files.filter(f=>/\.css$/i.test(f)).length,assets:files.filter(f=>/\.(?:png|jpe?g|webp|gif|svg|mp4|webm|mov|woff2?|ttf|otf)$/i.test(f)).length},
  entryCandidates:texts.filter(item=>/(?:createRoot|ReactDOM|<html|<!doctype|SLIDES|PAGES|PAGE_FILES|slideSpec)/i.test(item.text)).map(item=>item.file).slice(0,30),
  registrations,
  signals:{
    registry:/export\s+const\s+(?:slides|pages|swSlides)\b/.test(joined),
    previewArray:/(?:const|let|var)\s+(?:SLIDES|PAGES)\b/.test(joined),
    pageFiles:/\bPAGE_FILES\b/.test(joined),
    slideSpec:/\bslideSpec\b/.test(joined),
    componentMeta:/\.META\s*=|META\s*=|META\s*:/.test(joined),
    htmlOrder:/data-(?:page|slide)|<section\b/i.test(joined),
    controls:/\bcontrols\b|Tweaks|tweaks|type\s*:\s*['"](?:range|slider|toggle|select|enum|radio)/i.test(joined),
    defaults:/\bdefaults\b|defaultProps|META[^\n]+defaults/i.test(joined),
    mediaSlots:/imageSlots|videoSlots|mediaSlots|imageCount|mediaCount|upload|ImageSlot|MediaSlot/i.test(joined),
    globalCss:/(?:^|\})\s*(?:html|body|:root)\s*\{/m.test(joined),
    absolutePaths:/\/Users\/|\/Volumes\/|\/Downloads\/|file:\/\//.test(joined),
    remoteAssets:/https?:\/\//.test(joined),
    lifecycle:/MutationObserver|requestAnimationFrame|addEventListener|setInterval|setTimeout|\.play\(/.test(joined)
  },
  assets:files.filter(file=>/\.(?:png|jpe?g|webp|gif|svg|mp4|webm|mov|woff2?|ttf|otf)$/i.test(file)).map(relative).slice(0,500),
  risks:[]
};
if(inventory.signals.globalCss) inventory.risks.push('global CSS requires scoping');
if(inventory.signals.absolutePaths) inventory.risks.push('absolute paths require rewriting');
if(inventory.signals.remoteAssets) inventory.risks.push('remote assets require licensing and offline staging review');
if(inventory.signals.lifecycle) inventory.risks.push('browser listeners/animation/media lifecycle requires cleanup audit');
const output=`${JSON.stringify(inventory,null,2)}\n`;
if(args.out) {fs.mkdirSync(path.dirname(args.out),{recursive:true});fs.writeFileSync(args.out,output);console.log(`Wrote ${args.out}`);} else process.stdout.write(output);

function detectType(file,st,allFiles) {if(st.isDirectory()) {const images=allFiles.filter(item=>/\.(?:png|jpe?g|webp)$/i.test(item));const source=allFiles.filter(item=>/\.(?:jsx?|tsx?|html|css)$/i.test(item));return images.length>=8&&!source.length?'images':'source-directory';} const ext=path.extname(file).toLowerCase(); return ext==='.pptx'?'pptx':ext==='.pdf'?'pdf':/\.(png|jpe?g|webp)$/i.test(ext)?'image':'file';}
function walk(dir,out=[]) {for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {if(entry.name.startsWith('.')||['node_modules','dist','build'].includes(entry.name)) continue; const file=path.join(dir,entry.name); if(entry.isDirectory()) walk(file,out); else out.push(file);} return out;}
function read(file) {try{return fs.readFileSync(file,'utf8');}catch{return '';}}
function parse(argv) {const out={};for(let i=0;i<argv.length;i+=1){if(argv[i]==='--input')out.input=argv[++i];else if(argv[i]==='--out')out.out=path.resolve(argv[++i]);else if(argv[i]==='--help')usage(0);else throw new Error(`Unknown argument: ${argv[i]}`);}return out;}
function usage(code){console.log('Usage: inspect-external-template.mjs --input <file-or-directory> [--out inventory.json]');process.exit(code);}
