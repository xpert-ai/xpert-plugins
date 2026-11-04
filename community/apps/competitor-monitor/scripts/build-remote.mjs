// 资源打包：复制工作台 HTML 与助手 YAML；检查模式要求产物与源码一致。
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises'
const root=new URL('../',import.meta.url),out=new URL('dist/remote/index.html',root),src=new URL('src/remote/index.html',root),yaml=new URL('src/competitor-monitor-assistant.yaml',root),yamlOut=new URL('dist/competitor-monitor-assistant.yaml',root)
const expected=await readFile(src,'utf8'),check=process.argv.includes('--check')
if(check){if(await readFile(out,'utf8')!==expected)throw new Error('Remote output is stale');if(await readFile(yamlOut,'utf8')!==await readFile(yaml,'utf8'))throw new Error('Template output is stale')}else{await mkdir(new URL('dist/remote/',root),{recursive:true});await writeFile(out,expected);await copyFile(yaml,yamlOut)}
