import {build} from 'esbuild'
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'
const root=dirname(dirname(fileURLToPath(import.meta.url))),require=createRequire(import.meta.url),check=process.argv.includes('--check'),temp=await mkdtemp(join(tmpdir(),'db-studio-ui-'))
try{
 const worker=await build({entryPoints:[require.resolve('monaco-editor/esm/vs/editor/editor.worker.js')],bundle:true,write:false,minify:true,format:'iife',target:'es2022'})
 const tailwind=join(temp,'tailwind.css')
 execFileSync(join(root,'node_modules/.bin/tailwindcss'),['-i',join(root,'src/ui/styles.css'),'-o',tailwind,'--minify'],{cwd:root,stdio:'pipe'})
 const shims={'react':'react-shim.ts','react-dom':'react-dom-shim.ts','react-dom/client':'react-dom-client-shim.ts','react/jsx-runtime':'react-jsx-runtime-shim.ts','react/jsx-dev-runtime':'react-jsx-runtime-shim.ts'}
 // Escape multiline template strings without changing their contents, keeping generated lines free of trailing whitespace.
 const result=await build({absWorkingDir:root,entryPoints:['src/ui/main.tsx'],outfile:'app.js',write:false,bundle:true,minify:true,format:'iife',target:'es2022',supported:{'template-literal':false},jsx:'automatic',define:{__EDITOR_WORKER__:JSON.stringify(worker.outputFiles[0].text),'process.env.NODE_ENV':'"production"'},loader:{'.ttf':'dataurl'},plugins:[{name:'host-react',setup(api){api.onResolve({filter:/^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/},({path})=>({path:join(root,'src/ui',shims[path])}));api.onLoad({filter:/src\/ui\/styles\.css$/},async()=>({contents:await readFile(tailwind,'utf8'),loader:'css'}))}}]})
 const output=join(root,'src/lib/remote');await mkdir(output,{recursive:true})
 for(const file of result.outputFiles){const name=file.path.endsWith('.css')?'app.css':'app.js',path=join(output,name);if(check){if(await readFile(path,'utf8')!==file.text)throw new Error(`Stale UI resource: ${name}`)}else await writeFile(path,file.text)}
 process.stdout.write(check?'UI resources are current\n':'Built DB Studio remote resources\n')
}finally{await rm(temp,{recursive:true,force:true})}
