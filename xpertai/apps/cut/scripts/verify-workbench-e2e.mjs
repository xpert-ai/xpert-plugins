import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const reactRoot = dirname(require.resolve('react/package.json'))
const reactDomRoot = dirname(require.resolve('react-dom/package.json'))
const files = {
  '/react.js': join(reactRoot, 'umd/react.production.min.js'),
  '/react-dom.js': join(reactDomRoot, 'umd/react-dom.production.min.js'),
  '/app.js': join(root, 'src/lib/remote-components/cut-workbench/app.js'),
  '/app.css': join(root, 'src/lib/remote-components/cut-workbench/app.css')
}
const realWhisper = process.env.CUT_E2E_REAL_WHISPER === '1'
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end(hostHtml(realWhisper))
    return
  }
  if (url.pathname === '/test.svg') {
    response.setHeader('content-type', 'image/svg+xml')
    response.setHeader('access-control-allow-origin', '*')
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g"><stop stop-color="#075985"/><stop offset="1" stop-color="#be123c"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><text x="960" y="580" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="150" fill="white">CUT E2E</text></svg>')
    return
  }
  if (url.pathname === '/test.wav') {
    response.setHeader('content-type', 'audio/wav')
    response.setHeader('access-control-allow-origin', '*')
    response.end(testWav())
    return
  }
  if (url.pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
  const path = files[url.pathname]
  if (!path) { response.statusCode = 404; response.end('not found'); return }
  response.setHeader('content-type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript')
  response.end(await readFile(path))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Cut E2E server did not bind a TCP port.')
const url = `http://127.0.0.1:${address.port}`
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ headless: true, executablePath, args: ['--enable-features=WebCodecs'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
try {
  await page.goto(url, { waitUntil: 'load' })
  const frame = page.frameLocator('#cut-frame')
  try {
    await frame.locator('.cut-app').waitFor({ timeout: 20_000 })
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${errors.join('\n')}`)
  }
  console.log('cut-e2e: workbench ready')

  await page.waitForFunction(() => window.__cutHost.assistantContext?.context?.currentProject?.id === window.__cutHost.item.id)
  const assistantContextSynchronization = await page.evaluate(() => {
    const payload = window.__cutHost.assistantContext
    return payload?.key === 'cut'
      && payload.env?.cutProjectId === window.__cutHost.item.id
      && payload.env?.cutRevision === String(window.__cutHost.item.revision)
      && payload.env?.cutDirty === 'false'
      && payload.context?.currentProject?.id === window.__cutHost.item.id
      && payload.context?.currentProject?.revision === window.__cutHost.item.revision
  })
  if (!assistantContextSynchronization) throw new Error('Cut Workbench did not synchronize the active project through assistant.context.set.')
  console.log('cut-e2e: Assistant currentProject context synchronized')

  await frame.locator('.media-state.loaded').waitFor({ timeout: 20_000 })
  await frame.locator('.audio-waveform[data-waveform-source="decoded"]').waitFor({ timeout: 20_000 })
  const mediaGate = await frame.locator('.stage-shell img').getAttribute('src')
  const decodedWaveform = await frame.locator('.audio-waveform[data-waveform-source="decoded"]').isVisible()
  console.log('cut-e2e: iframe media loaded')

  await frame.locator('input[type="file"][accept="video/*,audio/*,image/*"]').setInputFiles({
    name: 'duration-probe.wav',
    mimeType: 'audio/wav',
    buffer: testWav()
  })
  await page.waitForFunction(() => Number.isFinite(window.__cutHost.lastUploadDuration), null, { timeout: 20_000 })
  const uploadMetadataDuration = await page.evaluate(() => window.__cutHost.lastUploadDuration)
  console.log('cut-e2e: upload media duration metadata verified')

  await page.evaluate(() => {
    window.__cutHost.document.tracks[0].clips.push({
      id: 'embedded-audio-video', type: 'video', name: 'Embedded audio video', start: 0, duration: 3,
      trimIn: 0, trimOut: 3, previewUrl: '/test.wav', volume: .5, playbackRate: 1,
      transform: { x: 0, y: 0, width: 1920, height: 1080, rotation: 0, opacity: 1 }
    })
    window.__cutHost.item.revision++
  })
  await frame.getByRole('button', { name: 'Reload', exact: true }).click()
  await frame.locator('.stage-shell video').waitFor({ timeout: 10_000 })
  const embeddedVideoAudioPreview = await frame.locator('.stage-shell video').evaluate((video) => video.muted === false && video.volume === .5)
  await frame.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForTimeout(100)
  const embeddedVideoAudioPlaying = await frame.locator('.stage-shell video').evaluate((video) => video.paused === false && video.muted === false)
  await frame.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.evaluate(() => {
    window.__cutHost.document.tracks[0].clips = window.__cutHost.document.tracks[0].clips.filter((clip) => clip.id !== 'embedded-audio-video')
    window.__cutHost.item.revision++
  })
  await frame.getByRole('button', { name: 'Reload', exact: true }).click()
  await frame.locator('.stage-shell video').waitFor({ state: 'detached', timeout: 10_000 })
  console.log('cut-e2e: embedded video audio preview verified')

  await frame.getByRole('button', { name: 'Analyze locally', exact: true }).click()
  await frame.locator('.media-evidence-list > div').first().waitFor({ timeout: 20_000 })
  const localMediaIntelligence = await frame.locator('.media-evidence-list > div').count() > 0
  console.log('cut-e2e: local audio evidence analysis and persistence verified')

  const classicToolTabCount = await frame.locator('.cut-library-tablist [role="tab"]').count()
  await frame.locator('.media-card').first().dragTo(frame.locator('.track-lane').first(), { targetPosition: { x: 520, y: 24 } })
  await frame.locator('.timeline-clip.image').nth(1).waitFor()
  const mediaDragDrop = await frame.locator('.timeline-clip.image').count() === 2
  await frame.getByTitle('Undo').click()
  await frame.locator('.timeline-clip.image').nth(1).waitFor({ state: 'detached' })
  await frame.getByTitle('Text').click()
  await frame.getByRole('button', { name: 'Add heading', exact: true }).click()
  await frame.locator('.timeline-clip.text').waitFor()
  const textToolCreatedClip = await frame.locator('.timeline-clip.text').count() === 1
  await frame.getByTitle('Copy', { exact: true }).click()
  await frame.getByTitle('Paste', { exact: true }).click()
  await frame.locator('.timeline-clip.text').nth(1).waitFor()
  const clipboardWorkflow = await frame.locator('.timeline-clip.text').count() === 2
  await frame.getByTitle('Add marker', { exact: true }).click()
  await frame.locator('.timeline-bookmark').waitFor()
  await frame.getByTitle('Remove marker', { exact: true }).click()
  await frame.locator('.timeline-bookmark').waitFor({ state: 'detached' })
  const bookmarkWorkflow = await frame.locator('.timeline-bookmark').count() === 0
  await frame.getByTitle('Undo').click()
  await frame.locator('.timeline-bookmark').waitFor()
  await frame.getByTitle('Undo').click()
  await frame.locator('.timeline-bookmark').waitFor({ state: 'detached' })
  await frame.getByTitle('Undo').click()
  await frame.locator('.timeline-clip.text').nth(1).waitFor({ state: 'detached' })
  await frame.getByTitle('Undo').click()
  await frame.locator('.timeline-clip.text').waitFor({ state: 'detached' })
  await frame.getByRole('button', { name: 'Save', exact: true }).click()
  await frame.getByText('Unsaved', { exact: true }).waitFor({ state: 'detached' })
  if (process.env.CUT_E2E_SCREENSHOT) {
    await frame.locator('.timeline-clip.image').first().click()
    await frame.getByTitle('Transitions').click()
    await page.screenshot({ path: process.env.CUT_E2E_SCREENSHOT, fullPage: true })
  }
  console.log('cut-e2e: OpenCut tool rail, clipboard, markers, and undo workflow verified')

  await frame.locator('.timeline-clip.image').first().click()
  const resizeHandle = frame.locator('.canvas-transform-handle.south-east').first()
  const resizeBox = await resizeHandle.boundingBox()
  if (!resizeBox) throw new Error('Cut canvas resize handle has no browser bounding box.')
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(resizeBox.x - 42, resizeBox.y - 30, { steps: 5 })
  await page.mouse.up()
  await frame.getByText('Unsaved', { exact: true }).waitFor()
  console.log('cut-e2e: direct canvas transform verified')

  const clip = frame.locator('.timeline-clip').first()
  const box = await clip.boundingBox()
  if (!box) throw new Error('Cut timeline clip has no browser bounding box.')
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 116, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  await frame.getByText('Unsaved', { exact: true }).waitFor()
  await frame.getByRole('button', { name: 'Save', exact: true }).click()
  await frame.getByText('Unsaved', { exact: true }).waitFor({ state: 'detached' })
  await frame.getByRole('button', { name: 'Reload', exact: true }).click()
  await frame.locator('.timeline-clip small').filter({ hasText: '2.00' }).waitFor()
  const savedEditorState = await page.evaluate(() => ({
    start: window.__cutHost.document.tracks[0].clips[0].start,
    width: window.__cutHost.document.tracks[0].clips[0].transform.width
  }))
  console.log('cut-e2e: timeline drag saved and reloaded')

  await page.evaluate(() => window.__cutHost.agentSplit())
  await frame.locator('.timeline-clip.image').nth(1).waitFor({ timeout: 10_000 })
  const clipCountAfterAgent = await frame.locator('.timeline-clip.image').count()
  console.log('cut-e2e: agent host event refreshed')

  const secondBox = await frame.locator('.timeline-clip').first().boundingBox()
  if (!secondBox) throw new Error('Cut timeline clip disappeared before dirty protection test.')
  await page.mouse.move(secondBox.x + 20, secondBox.y + secondBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(secondBox.x + 68, secondBox.y + secondBox.height / 2, { steps: 4 })
  await page.mouse.up()
  await page.evaluate(() => window.__cutHost.agentTrim())
  await frame.locator('.cut-conflict').waitFor({ timeout: 10_000 })
  const dirtyProtection = await frame.locator('.cut-conflict').isVisible()
  await frame.getByRole('button', { name: 'Discard local & reload' }).click()
  console.log('cut-e2e: dirty edit protection verified')

  await page.evaluate(() => window.__cutHost.agentProposal())
  await frame.getByTitle('Captions').click()
  await frame.locator('.proposal-list button').first().waitFor({ timeout: 10_000 })
  await frame.locator('.proposal-list button').first().click()
  await frame.getByTestId('cut-proposal-review').waitFor({ timeout: 10_000 })
  await frame.locator('.proposal-item-list input[type="checkbox"]').first().click()
  await frame.locator('.proposal-item-list input[type="checkbox"]:not(:checked)').first().waitFor({ timeout: 10_000 })
  await frame.locator('.proposal-item-list input[type="checkbox"]').first().click()
  await frame.locator('.proposal-item-list input[type="checkbox"]:checked').first().waitFor({ timeout: 10_000 })
  await frame.getByTestId('cut-apply-proposal').click()
  await page.waitForFunction(() => window.__cutHost.editProposals[0]?.status === 'applied', null, { timeout: 10_000 })
  await frame.locator('.proposal-list button').first().click()
  await frame.getByTestId('cut-revert-proposal').click()
  await page.waitForFunction(() => window.__cutHost.editProposals[0]?.status === 'reverted', null, { timeout: 10_000 })
  const agenticProposalReview = await page.evaluate(() => window.__cutHost.proposalApplied && window.__cutHost.document.tracks.find((track) => track.id === 'audio-1').clips[0].volume === .25)
  console.log('cut-e2e: evidence-backed proposal diff, item review, preview, atomic apply, and safe revert verified')

  await frame.getByRole('button', { name: 'Transcribe locally', exact: true }).click()
  await Promise.race([
    frame.locator('.caption-cue textarea').first().waitFor({ timeout: realWhisper ? 300_000 : 20_000 }),
    page.waitForFunction(() => Boolean(window.__cutHost.lastError), null, { timeout: realWhisper ? 300_000 : 20_000 })
  ])
  const localWhisperError = await page.evaluate(() => window.__cutHost.lastError)
  if (localWhisperError) throw new Error(`Cut local Whisper failed: ${localWhisperError}`)
  const localWhisperText = (await frame.locator('.caption-cue textarea').first().inputValue()).trim()
  const localWhisperReviewDraft = Boolean(localWhisperText)
  console.log('cut-e2e: local Whisper worker bridge, audio decode, and review draft verified')

  await frame.locator('input[type="file"][accept*=".srt"]').setInputFiles({
    name: 'cut-e2e.srt',
    mimeType: 'application/x-subrip',
    buffer: Buffer.from('1\n00:00:01,000 --> 00:00:03,000\nCaption one\n\n2\n00:00:04,000 --> 00:00:06,000\nCaption two\n')
  })
  await frame.locator('.caption-cue').first().waitFor({ timeout: 10_000 })
  await frame.locator('.caption-cue textarea').first().fill('Reviewed caption one')
  await frame.locator('.caption-cue').first().getByTitle('Save').click()
  await frame.locator('.caption-cue textarea').first().waitFor({ timeout: 10_000 })
  await frame.getByRole('button', { name: 'Commit draft' }).click()
  await frame.locator('.timeline-clip.text').nth(1).waitFor({ timeout: 10_000 })
  const captionReviewCommit = await frame.locator('.timeline-clip.text').count() === 2
  console.log('cut-e2e: caption import, review, and commit verified')

  await frame.getByRole('button', { name: 'Headless MP4', exact: true }).click()
  await frame.getByText(/complete · 100% · saved/).waitFor({ timeout: 15_000 })
  const headlessRenderWorkflow = await page.evaluate(() => window.__cutHost.analysisJobs[0]?.status === 'succeeded' && window.__cutHost.exports[0]?.analysisJobId === window.__cutHost.analysisJobs[0]?.id)
  console.log('cut-e2e: headless render capability, queue progress, and saved export verified')

  const exportButton = frame.getByRole('button', { name: 'Export MP4' })
  await exportButton.click()
  console.log('cut-e2e: 900-frame export started')
  await page.waitForFunction(() => window.__cutHost.exportSize > 1000 || Boolean(window.__cutHost.lastError), null, { timeout: 240_000 })
  const exportError = await page.evaluate(() => window.__cutHost.lastError)
  if (exportError) throw new Error(`Cut browser export failed: ${exportError}`)
  const exportResult = await page.evaluate(() => ({ size: window.__cutHost.exportSize, hasAudio: window.__cutHost.exportHasAudio, frames: window.__cutHost.document.settings.durationSeconds * window.__cutHost.document.settings.fps }))
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(JSON.stringify({
    iframeMediaLoad: Boolean(mediaGate?.includes('/test.svg')),
    assistantCurrentProjectContext: assistantContextSynchronization,
    decodedAudioWaveform: decodedWaveform,
    uploadMetadataDuration: Math.abs(uploadMetadataDuration - 3) < .05,
    embeddedVideoAudioPreview,
    embeddedVideoAudioPlaying,
    localMediaIntelligence,
    classicToolRail: classicToolTabCount === 9,
    mediaDragDrop,
    textToolAndUndo: textToolCreatedClip,
    clipboardWorkflow,
    bookmarkWorkflow,
    directCanvasTransform: savedEditorState.width < 1920,
    timelineDrag1080p: savedEditorState.start === 2,
    platformSaveReload: savedEditorState.start === 2 && savedEditorState.width < 1920,
    agentHostEventIncrementalRefresh: clipCountAfterAgent === 2,
    dirtyEditProtection: dirtyProtection,
    agenticProposalReview,
    localWhisperReviewDraft,
    ...(realWhisper ? { localWhisperText: localWhisperText.slice(0, 160) } : {}),
    captionReviewCommit,
    headlessRenderWorkflow,
    export30SecondProject: exportResult.frames === 900 && exportResult.size > 1000,
    exportAudioTrack: exportResult.hasAudio,
    exportBytes: exportResult.size,
    encodedFrames: exportResult.frames
  }, null, 2))
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}

function hostHtml(useRealWhisper) {
  const whisperWorkerFactory = useRealWhisper
    ? ''
    : '<script>window.__XPERT_CUT_TRANSCRIPTION_WORKER_FACTORY__=function(){var worker={onmessage:null,onerror:null,postMessage:function(message){setTimeout(function(){if(worker.onmessage)worker.onmessage({data:{type:"progress",requestId:message.requestId,phase:"model",progress:70,message:"Mock model cached",device:"wasm"}})},5);setTimeout(function(){if(worker.onmessage)worker.onmessage({data:{type:"result",requestId:message.requestId,text:"Local Whisper E2E",segments:[{start:.25,end:2.5,text:"Local Whisper E2E"}],duration:3,model:message.model,language:message.language,device:"wasm"}})},15)},terminate:function(){}};return worker};<\\/script>'
  const whisperMediaUrl = useRealWhisper
    ? 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav'
    : '/test.wav'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cut E2E Host</title><style>html,body,#cut-frame{width:100%;height:100%;margin:0;border:0;background:#05070c}</style></head><body><iframe id="cut-frame"></iframe><script>
  const channel='xpertai.remote_component', instanceId='cut-e2e';
  const baseClip={id:'clip-1',type:'image',name:'E2E Still',start:0,duration:5,trimIn:0,trimOut:5,mediaAssetId:'media-1',previewUrl:'/test.svg',transform:{x:0,y:0,width:1920,height:1080,rotation:0,opacity:1}};
  const baseAudio={id:'audio-clip-1',type:'audio',name:'E2E Tone',start:0,duration:3,trimIn:0,trimOut:3,previewUrl:'/test.wav',volume:.25,playbackRate:1};
  const state={
    exportSize:0,exportHasAudio:false,lastError:'',proposalApplied:false,lastUploadDuration:null,assistantContext:null,
    document:{schemaVersion:1,settings:{width:1920,height:1080,fps:30,durationSeconds:30,background:'#080b12'},tracks:[{id:'video-1',name:'Video 1',kind:'visual',muted:false,hidden:false,clips:[baseClip]},{id:'audio-1',name:'Audio 1',kind:'audio',muted:false,hidden:false,clips:[baseAudio]}]},
    item:{id:'11111111-1111-4111-8111-111111111111',title:'Cut 30-second E2E',brief:'Gate verification',status:'draft',revision:1,currentVersionNumber:0},
    captionDrafts:[],captionPage:null,mediaSegments:[],editProposals:[],proposalPage:null,proposalSourceDocument:null,analysisJobs:[],exports:[],renderPolls:0,
    agentSplit(){const clip=this.document.tracks[0].clips[0],at=clip.start+2;const left={...clip,duration:2,trimOut:clip.trimIn+2};const right={...clip,id:'clip-2',name:clip.name+' B',start:at,duration:clip.duration-2,trimIn:clip.trimIn+2};this.document.tracks[0].clips=[left,right];this.item.revision++;sendHostEvent('cut_apply_edit')},
    agentTrim(){const clip=this.document.tracks[0].clips[1];if(clip){clip.duration=Math.max(.5,clip.duration-.5);clip.trimOut=clip.trimIn+clip.duration;this.item.revision++}sendHostEvent('cut_apply_edit')},
    agentProposal(){
      this.proposalSourceDocument=structuredClone(this.document);
      const evidence=this.mediaSegments[0]||{id:'analysis:66666666-6666-4666-8666-000000000001',mediaAssetId:'media-audio',mediaName:'cut-e2e.wav',evidenceType:'audio_activity',start:0,end:3,label:'Audio activity',text:null,confidence:.9,thumbnail:{url:'/test.wav',time:0}};
      const item={id:'88888888-8888-4888-8888-888888888888',enabled:true,operation:{kind:'update_audio',clipId:'audio-clip-1',volume:.4},summary:'Raise the retained interview audio.',evidence:[{segmentId:evidence.id,mediaAssetId:evidence.mediaAssetId,mediaName:evidence.mediaName,evidenceType:evidence.evidenceType,start:evidence.start,end:evidence.end,label:evidence.label,text:evidence.text,confidence:evidence.confidence,thumbnail:evidence.thumbnail}],confidence:.94,risk:'low'};
      const proposal={id:'99999999-9999-4999-8999-999999999999',projectId:this.item.id,sourceRevision:this.item.revision,status:'draft',revision:1,goal:'Create a concise evidence-backed interview cut.',itemCount:1,enabledItemCount:1,highRiskCount:0,estimatedDurationSeconds:Math.max(...this.document.tracks.flatMap((track)=>track.clips.map((clip)=>clip.start+clip.duration))),appliedRevision:null,items:[item],constraints:{removeSilence:true},reviewNote:null};
      this.editProposals=[proposal];this.refreshProposalPage();sendHostEvent('cut_create_edit_proposal')
    },
    refreshProposalPage(){
      const proposal=this.editProposals[0],preview=structuredClone(this.proposalSourceDocument);if(proposal.items[0].enabled)preview.tracks.find((track)=>track.id==='audio-1').clips[0].volume=.4;
      proposal.enabledItemCount=proposal.items.filter((item)=>item.enabled).length;
      this.proposalPage={item:structuredClone(proposal),preview:{changedClipIds:proposal.items[0].enabled?['audio-clip-1']:[],changedTrackIds:proposal.items[0].enabled?['audio-1']:[],estimatedDurationSeconds:proposal.estimatedDurationSeconds,enabledItemCount:proposal.enabledItemCount,document:preview}}
    }
  };
  window.__cutHost=state;
  const frame=document.getElementById('cut-frame');
  frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/react.js"><\\/script><script src="/react-dom.js"><\\/script>${whisperWorkerFactory}<script src="/app.js"><\\/script></body></html>';
  function detail(){return {item:{...state.item},document:structuredClone(state.document),media:[{id:'media-1',originalName:'cut-e2e.svg',mimeType:'image/svg+xml',size:512,previewUrl:'/test.svg'},{id:'media-audio',originalName:'cut-e2e.wav',mimeType:'audio/wav',size:264644,duration:3,previewUrl:'${whisperMediaUrl}'}],versions:[],exports:structuredClone(state.exports),logs:[]}}
  function viewData(){
    const render=state.analysisJobs[0];if(render&&render.status==='queued'){render.status='running';render.stage='rendering';render.progress=20}else if(render&&render.status==='running'&&state.renderPolls++>=0){render.status='succeeded';render.stage='complete';render.progress=100;render.resultExportId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';state.exports=[{id:render.resultExportId,kind:'mp4',mimeType:'video/mp4',size:11961,fileUrl:'https://files.example.test/headless.mp4',changeSummary:'Headless E2E export.',analysisJobId:render.id,sourceRevision:render.inputRevision,renderer:'sandbox-job:cut.render-mp4@1.0.0'}]}
    return {projects:{items:[{...state.item}],total:1,page:1,pageSize:20},detail:detail(),captionDrafts:structuredClone(state.captionDrafts),analysisJobs:structuredClone(state.analysisJobs),mediaSegments:structuredClone(state.mediaSegments),editProposals:structuredClone(state.editProposals),renderCapability:{available:true,backend:'sandbox-job',action:'cut.render-mp4',actionVersion:'1.0.0',runtimeProfile:'browser/playwright-1.61/v1',workerCount:1,limits:{maxVariants:5,maxDurationSeconds:600,maxFrames:18000,maxWidth:3840,maxHeight:2160,maxFps:60,maxMediaBytes:4294967296}}}
  }
  function reply(message,payload){frame.contentWindow.postMessage({channel,protocolVersion:1,instanceId,type:'response',requestId:message.requestId,payload},'*')}
  function sendHostEvent(toolName){frame.contentWindow.postMessage({channel,protocolVersion:1,instanceId,type:'hostEvent',event:{event:'assistant.tool.completed',data:{toolName}}},'*')}
  window.addEventListener('message',(event)=>{const message=event.data;if(!message||message.channel!==channel)return;
    if(message.type==='ready'){frame.contentWindow.postMessage({channel,protocolVersion:1,instanceId,type:'init',locale:'en_US',initialQuery:{selectionId:state.item.id}},'*');return}
    if(message.type==='requestData'){reply(message,viewData());return}
    if(message.type==='notify'){if(message.level==='error')state.lastError=message.message||'unknown Cut error';return}
    if(message.type==='invokeClientCommand'){
      if(message.commandKey!=='assistant.context.set'){reply(message,{success:false,code:'unsupported',message:'Unsupported command.'});return}
      if(!message.payload?.key){reply(message,{success:false,code:'bad_request',message:'Context key is required.'});return}
      state.assistantContext=structuredClone(message.payload);
      reply(message,{success:true,status:message.payload.clear?'cleared':'updated',key:message.payload.key});return
    }
    if(message.type==='executeAction'){
      if(message.actionKey==='cut_save_project'){state.document=structuredClone(message.input.document);state.item.revision++;reply(message,{success:true,project:{...state.item},document:structuredClone(state.document)});return}
      if(message.actionKey==='cut_finalize_version'){state.item.currentVersionNumber++;reply(message,{success:true,project:{...state.item}});return}
      if(message.actionKey==='cut_start_headless_export'){
        const job={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',projectId:state.item.id,type:'render',executionMode:'server',status:'queued',progress:0,inputRevision:state.item.revision,variantName:message.input.variants[0].name,stage:'queued',resultExportId:null,cancellationRequested:false};state.analysisJobs=[job];state.renderPolls=0;reply(message,{success:true,projectId:state.item.id,sourceRevision:state.item.revision,jobs:[{jobId:job.id,status:job.status,variantName:job.variantName}]});return
      }
      if(message.actionKey==='cut_get_caption_draft'){reply(message,structuredClone(state.captionPage));return}
      if(message.actionKey==='cut_get_edit_proposal'){reply(message,structuredClone(state.proposalPage));return}
      if(message.actionKey==='cut_update_edit_proposal'){
        const proposal=state.editProposals[0];message.input.itemUpdates.forEach((update)=>{const item=proposal.items.find((candidate)=>candidate.id===update.itemId);if(item)item.enabled=update.enabled});proposal.revision++;state.refreshProposalPage();reply(message,structuredClone(state.proposalPage));return
      }
      if(message.actionKey==='cut_apply_edit_proposal'){
        const proposal=state.editProposals[0];if(proposal.sourceRevision!==state.item.revision){reply(message,{success:false,message:'stale'});return}if(proposal.items[0].enabled)state.document.tracks.find((track)=>track.id==='audio-1').clips[0].volume=.4;state.proposalApplied=true;state.item.revision++;proposal.status='applied';proposal.appliedRevision=state.item.revision;state.refreshProposalPage();reply(message,{success:true,applied:true,revision:state.item.revision});return
      }
      if(message.actionKey==='cut_revert_edit_proposal'){
        const proposal=state.editProposals[0];if(proposal.status!=='applied'||proposal.appliedRevision!==state.item.revision){reply(message,{success:false,message:'cannot revert'});return}state.document=structuredClone(state.proposalSourceDocument);state.item.revision++;proposal.status='reverted';proposal.revertedRevision=state.item.revision;state.refreshProposalPage();reply(message,{success:true,reverted:true,revision:state.item.revision});return
      }
      if(message.actionKey==='cut_reject_edit_proposal'){state.editProposals[0].status='rejected';state.refreshProposalPage();reply(message,{success:true});return}
      if(message.actionKey==='cut_import_local_media_analysis'){
        state.mediaSegments=message.input.segments.map((segment,index)=>({id:'analysis:66666666-6666-4666-8666-'+String(index+1).padStart(12,'0'),projectId:state.item.id,mediaAssetId:message.input.mediaAssetId,mediaName:'cut-e2e.wav',evidenceType:segment.evidenceType,start:segment.start,end:segment.end,label:segment.label,text:segment.text||null,confidence:segment.confidence||null,relevance:1,inputRevision:state.item.revision,thumbnail:{url:'/test.wav',time:segment.thumbnailTime||segment.start}}));reply(message,{success:true,projectId:state.item.id,jobId:'77777777-7777-4777-8777-777777777777',segmentCount:state.mediaSegments.length});return
      }
      if(message.actionKey==='cut_import_local_transcription'){
        const item={id:'44444444-4444-4444-8444-444444444444',projectId:state.item.id,transcriptId:'55555555-5555-4555-8555-555555555555',sourceRevision:state.item.revision,status:'draft',revision:1,language:message.input.language,targetTrackId:null,captionCount:message.input.segments.length,committedRevision:null};
        state.captionDrafts=[item];state.captionPage={item:structuredClone(item),captions:message.input.segments.map((segment,index)=>({id:'local-cue-'+index,start:segment.start,end:segment.end,text:segment.text})),total:message.input.segments.length,page:1,pageSize:200};reply(message,{success:true,projectId:state.item.id,draftId:item.id,transcriptId:item.transcriptId,segmentCount:message.input.segments.length,timingSource:'model-segment'});return
      }
      if(message.actionKey==='cut_update_caption_draft'){
        const operation=message.input.operation,caption=state.captionPage.captions.find((item)=>item.id===operation.captionId);
        if(operation.action==='update'&&caption){if(typeof operation.start==='number')caption.start=operation.start;if(typeof operation.end==='number')caption.end=operation.end;if(typeof operation.text==='string')caption.text=operation.text}
        state.captionPage.item.revision++;state.captionDrafts[0].revision=state.captionPage.item.revision;reply(message,structuredClone(state.captionPage.item));return
      }
      if(message.actionKey==='cut_commit_caption_draft'){
        let track=state.document.tracks.find((item)=>item.id==='captions-1');if(!track){track={id:'captions-1',name:'Captions',kind:'visual',muted:false,hidden:false,clips:[]};state.document.tracks.push(track)}
        state.captionPage.captions.forEach((caption,index)=>track.clips.push({id:'caption-clip-'+index,type:'text',name:'Caption '+(index+1),start:caption.start,duration:caption.end-caption.start,trimIn:0,trimOut:caption.end-caption.start,text:caption.text,color:'#fff',fontSize:48,fontWeight:600,textAlign:'center',transform:{x:192,y:778,width:1536,height:194,rotation:0,opacity:1}}));
        state.item.revision++;state.captionPage.item.status='committed';state.captionPage.item.revision++;state.captionPage.item.committedRevision=state.item.revision;state.captionDrafts[0]=structuredClone(state.captionPage.item);reply(message,{success:true,revision:state.item.revision});return
      }
      reply(message,detail());return
    }
    if(message.type==='executeFileAction'){
      if(message.actionKey==='cut_upload_media_file'){state.lastUploadDuration=message.input.duration;reply(message,{success:true,size:message.file.buffer.byteLength});return}
      if(message.actionKey==='cut_save_export_file'){state.exportSize=message.file.buffer.byteLength;state.exportHasAudio=new TextDecoder().decode(new Uint8Array(message.file.buffer)).includes('soun')}
      if(message.actionKey==='cut_import_subtitle_file'){
        const item={id:'22222222-2222-4222-8222-222222222222',projectId:state.item.id,transcriptId:'33333333-3333-4333-8333-333333333333',sourceRevision:state.item.revision,status:'draft',revision:1,language:'en',targetTrackId:null,captionCount:2,committedRevision:null};
        state.captionDrafts=[item];state.captionPage={item:structuredClone(item),captions:[{id:'cue-1',start:1,end:3,text:'Caption one'},{id:'cue-2',start:4,end:6,text:'Caption two'}],total:2,page:1,pageSize:200};reply(message,{success:true,projectId:state.item.id,draftId:item.id,transcriptId:item.transcriptId,segmentCount:2});return
      }
      reply(message,{success:true,size:message.file.buffer.byteLength});return
    }
  });
  <\/script></body></html>`
}

function testWav() {
  const sampleRate = 44_100
  const seconds = 3
  const samples = sampleRate * seconds
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 4000, (samples - index) / 4000)
    buffer.writeInt16LE(Math.round(Math.sin(index / sampleRate * Math.PI * 2 * 440) * 8000 * envelope), 44 + index * 2)
  }
  return buffer
}
