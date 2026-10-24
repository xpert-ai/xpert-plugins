import {readFile,writeFile,mkdir,stat} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import {materialIdentityApp} from '../dist/app-config.js'
import {MATERIAL_IDENTITY_LOGO_SVG,MATERIAL_IDENTITY_LOGO_PATH} from '../dist/lib/branding.js'
const root=resolve(import.meta.dirname,'..'),check=process.argv.includes('--check')
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
const manifest=JSON.parse(await readFile(resolve(root,'.xpertai-plugin/plugin.json'),'utf8'))
if(manifest.name!==pkg.name||manifest.version!==pkg.version)throw Error('manifest_package_identity_mismatch')
if(!pkg.files.includes('.xpertai-plugin')||!pkg.files.includes('assets'))throw Error('marketplace_assets_missing_from_package')
if(!manifest.assets?.screenshots?.length)throw Error('marketplace_screenshots_not_declared')
if(manifest.assets.logo!==MATERIAL_IDENTITY_LOGO_PATH||manifest.assets.composerIcon!==MATERIAL_IDENTITY_LOGO_PATH)throw Error('marketplace_logo_not_declared')
const logoPath=resolve(root,MATERIAL_IDENTITY_LOGO_PATH),logo=Buffer.from(MATERIAL_IDENTITY_LOGO_SVG+'\n')
if(check){if(!logo.equals(await readFile(logoPath)))throw Error('stale_brand_logo')}
else{await mkdir(dirname(logoPath),{recursive:true});await writeFile(logoPath,logo)}
if(!isDeepStrictEqual(manifest.assets.screenshots,materialIdentityApp.appConfig.presentation.screenshots))throw Error('marketplace_screenshots_differ_from_runtime')
for(const target of ['xpert','data-xpert']){
 const app=manifest.targetAppMeta?.[target]?.marketplace?.contents?.find(item=>item.type==='app'&&item.name===materialIdentityApp.name)
 if(!isDeepStrictEqual(app,materialIdentityApp))throw Error(`marketplace_app_differ_from_runtime:${target}`)
}
for(const file of manifest.assets.screenshots){
 const path=resolve(root,file)
 if(!path.startsWith(root+'/assets/'))throw Error(`invalid_screenshot_path:${file}`)
 const data=await readFile(path)
 const valid=file.endsWith('.png')?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
   /\.jpe?g$/.test(file)&&data.subarray(0,3).equals(Buffer.from([255,216,255]))
 if(!valid||data.length>5*1024*1024)throw Error(`screenshot_format_or_size_invalid:${file}`)
}
for(const entry of ['governance-workbench','assistant-profile']) for(const file of ['app.js','app.css']){
 const source=resolve(root,'src/lib/remote-components',entry,file),dest=resolve(root,'dist/lib/remote-components',entry,file),expected=await readFile(source)
 if(check){if(!expected.equals(await readFile(dest)))throw Error(`stale_asset:${file}`)}else{await mkdir(dirname(dest),{recursive:true});await writeFile(dest,expected)}
}
for(const file of ['dist/index.js','dist/index.d.ts'])await stat(resolve(root,file))
console.log(check?'Distribution assets verified.':'Production assets copied. Preview fixtures excluded.')
