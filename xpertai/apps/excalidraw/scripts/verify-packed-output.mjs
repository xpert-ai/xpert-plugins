import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=dirname(dirname(fileURLToPath(import.meta.url)))
const temporary=mkdtempSync(join(tmpdir(),'excalidraw-package-'))
try {
 const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',temporary],{cwd:root,encoding:'utf8'}))[0]
 const extracted=join(temporary,'extracted');mkdirSync(extracted)
 execFileSync('tar',['-xzf',join(temporary,packed.filename),'-C',extracted])
 execFileSync(process.execPath,[join(root,'scripts/verify-package-output.mjs'),join(extracted,'package')],{stdio:'inherit'})
 if(packed.files.some(file=>/test-fixture|\.spec\.(js|ts)$/.test(file.path)))throw new Error('Test source is included in package')
 if(packed.files.some(file=>/^assets\/fonts\/.*\.(otf|ttf|woff2?)$/.test(file.path)))throw new Error('Source font binaries must not be duplicated in the package; use dist/assets/fonts')
 console.log(`Extracted npm tarball verified: ${packed.size} bytes.`)
} finally {rmSync(temporary,{recursive:true,force:true})}
