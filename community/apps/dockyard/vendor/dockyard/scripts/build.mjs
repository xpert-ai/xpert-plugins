// A small deterministic module packer for this dependency-free source tree.
// It only accepts the static import/export forms used here; unsupported forms fail the build.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modules=new Map();
function visit(name){
  if(modules.has(name))return;
  let text=fs.readFileSync(path.join(root,'src',name),'utf8');modules.set(name,'');
  const dependencies=[];
  text=text.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]\.\/(.+?)['"];?/g,(_,binding,file)=>{dependencies.push(file);return`const ${binding}=__require(${JSON.stringify(file)});`;});
  text=text.replace(/import\s+\{([^}]+)\}\s+from\s+['"]\.\/(.+?)['"];?/g,(_,bindings,file)=>{dependencies.push(file);return`const {${bindings.replace(/\bas\b/g,':')}}=__require(${JSON.stringify(file)});`;});
  text=text.replace(/export\s+\*\s+from\s+['"]\.\/(.+?)['"];?/g,(_,file)=>{dependencies.push(file);return`Object.assign(__exports,__require(${JSON.stringify(file)}));`;});
  text=text.replace(/export\s+\{([^}]+)\}\s+from\s+['"]\.\/(.+?)['"];?/g,(_,bindings,file)=>{dependencies.push(file);return bindings.split(',').map(b=>{const[a,c]=b.trim().split(/\s+as\s+/);return`__exports.${c||a}=__require(${JSON.stringify(file)}).${a};`;}).join('\n');});
  const exports=[];
  text=text.replace(/export\s+(class|function|const|let)\s+(\w+)/g,(_,kind,name)=>{exports.push([name,name]);return`${kind} ${name}`;});
  text=text.replace(/export\s+\{([^}]+)\};?/g,(_,bindings)=>{for(const binding of bindings.split(',')){const[a,b]=binding.trim().split(/\s+as\s+/);exports.push([b||a,a]);}return'';});
  text=text.replace(/export\s+default\s+(\w+);?/g,(_,name)=>`__exports.default=${name};`);
  text=text.replace(/import\.meta\.url/g,'__base');
  if(/^\s*(import|export)\s/m.test(text))throw new Error(`Unsupported module syntax in ${name}`);
  modules.set(name,`${text}\n${exports.map(([key,value])=>`__exports.${key}=${value};`).join('\n')}`);
  dependencies.forEach(visit);
}
visit('index.js');
const bundle=`/* AvalonDock Web ${JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version} — original JavaScript implementation, MIT. */\n(function(global){'use strict';\nconst __base=typeof document!=='undefined'?(document.currentScript?.src||location.href):'file:///avalondock.js';\nconst __modules={${[...modules].map(([name,code])=>`${JSON.stringify(name)}:function(__exports,__require){\n${code}\n}`).join(',\n')}};\nconst __cache={};function __require(name){if(__cache[name])return __cache[name];const exports=__cache[name]={};__modules[name](exports,__require);return exports;}\nconst api=__require('index.js');global.AvalonDock=api.AvalonDock;global.Xceed||={};global.Xceed.Wpf||={};global.Xceed.Wpf.AvalonDock=api.AvalonDock;\n})(globalThis);\n`;
fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist','avalondock.js'),bundle);fs.copyFileSync(path.join(root,'src','avalondock.css'),path.join(root,'dist','avalondock.css'));
const htmlFile=path.join(root,'index.html');
if(fs.existsSync(htmlFile)){
  let html=fs.readFileSync(htmlFile,'utf8');const css=fs.readFileSync(path.join(root,'src','avalondock.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'sample','sample.css'),'utf8');
  const sampleSource=fs.readFileSync(path.join(root,'sample','sample.js'),'utf8').replace(/import\s+\*\s+as\s+AD\s+from\s+['"][^'"]+['"];?/,'const AD=globalThis.AvalonDock;');
  const sample = `(function(){'use strict';\n${sampleSource}\n})();`;
  html=html.replace(/<link[^>]+rel="stylesheet"[^>]*>/g,'').replace(/<script type="module" src="sample\/sample.js"><\/script>/,`<script>${bundle.replace(/<\/script/gi,'<\\/script')}</script>\n<script>${sample.replace(/<\/script/gi,'<\\/script')}</script>`).replace('</head>',`<style>${css}</style></head>`);
  fs.writeFileSync(path.join(root,'standalone.html'),html);
}
console.log(`Built ${modules.size} modules; ${(bundle.length/1024).toFixed(1)} KiB classic bundle.`);
