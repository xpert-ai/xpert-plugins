import {cp,mkdir} from 'node:fs/promises'
await mkdir('dist/lib/remote',{recursive:true})
await cp('src/lib/remote','dist/lib/remote',{recursive:true})
await cp('src/db-studio-assistant.yaml','dist/db-studio-assistant.yaml')
