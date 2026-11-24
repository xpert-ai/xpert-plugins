import {startPreview} from './preview-fixture.mjs'
const preview=await startPreview({port:Number(process.env.SHADOW_PREVIEW_PORT??4318)})
console.log(`Simulated Xpert View Host: ${preview.url}`)
console.log('UI and persistence are real plugin code; this preview does not execute an AI model.')
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await preview.close();process.exit(0)})
