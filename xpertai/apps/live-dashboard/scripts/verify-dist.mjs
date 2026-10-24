import { fileURLToPath } from 'node:url'
import { verifyDist } from './dist-manifest.mjs'
await verifyDist(fileURLToPath(new URL('..', import.meta.url)))
console.log('Live Dashboard source, remote bundle and Data Analytics renderer match')
