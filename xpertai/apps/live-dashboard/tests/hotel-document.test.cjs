const {test}=require('node:test'),assert=require('node:assert/strict'),{createRequire}=require('node:module')
const {JSDOM,VirtualConsole}=createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const {hotelDocument}=require('../dist/lib/hotel-document'),{hotelSeed}=require('../dist/lib/hotel-template')
test('hotel document updates every aggregate, clears stale values, and restores full data after filters',async t=>{
 const resource=hotelSeed().find(r=>r.kind==='public-dataset'),rows=resource.content.rows
 const mapping=Object.fromEntries(resource.content.columns.map(c=>[c.key,c.key]))
 let receive;const errors=[],console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message))
 const dataset={rows,completeness:{truncated:false,scope:'full_query_result',totalAccuracy:'exact'},freshness:{sourceFetchedAt:'2026-11-06T00:00:00Z'}}
 const dom=new JSDOM(hotelDocument('Hotel operations',mapping,'EUR',true),{runScripts:'dangerously',virtualConsole:console,beforeParse(w){w.xpertLiveArtifact={ready:async()=>({theme:'light',bindingIds:['bookings'],defaults:{}}),subscribe:(id,fn)=>{assert.equal(id,'bookings');receive=fn},query:async()=>receive(dataset)}}})
 t.after(()=>dom.window.close());await new Promise(resolve=>setTimeout(resolve,0))
 const d=dom.window.document,value=id=>d.getElementById(id).textContent
 function set(id,value){d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new dom.window.Event('change'))}
 assert.equal(value('total'),'720');assert.equal(value('value'),'336,199');assert.equal(d.querySelectorAll('#rows tr').length,100)
 set('channel','Direct');assert.equal(value('total'),'240');assert.equal(value('retained'),'187')
 set('hotel','City Hotel');assert.equal(value('total'),'120')
 set('from','2025-01-01');assert.equal(value('total'),'0');assert.equal(value('cancel'),'—');assert.equal(d.querySelectorAll('#rows tr').length,0)
 set('to','2024-01-01');assert.equal(value('total'),'—');assert.match(value('error'),/开始日期/)
 set('from','');set('to','');set('hotel','');set('channel','');assert.equal(value('total'),'720');assert.equal(value('value'),'336,199')
 receive({...dataset,completeness:{...dataset.completeness,truncated:true}});assert.equal(value('total'),'—');assert.equal(d.querySelectorAll('#plot-month .row').length,0)
 receive(dataset);assert.equal(value('total'),'720');assert.equal(d.querySelectorAll('#plot-month .row').length,12)
 assert.deepEqual(errors,[])
})

test('V2 hotel HTML consumes mapped runtime fields and an inert title without embedding sample rows', async t => {
 const {randomUUID}=require('node:crypto'),{buildHotelPackage}=require('../scripts/hotel-package.cjs')
 const {compileTemplate}=require('../dist/lib/library/template-compiler'),{reference}=require('../dist/lib/library/archive')
 const pack=buildHotelPackage(),template=pack.resources.find(r=>r.kind==='analysis-template'),data=pack.resources.find(r=>r.kind==='public-dataset')
 const mapping=Object.fromEntries(data.content.columns.map(c=>[c.key,`field_${c.key}`]))
 const rows=JSON.parse(pack.blobs.get(data.assets[0].sha256)).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[mapping[key],value])))
 const source={type:'dataset',artifactId:randomUUID(),revision:1},input={slot:'bookings',mapping,source}
 const binding={id:'bookings',source:require('../examples/postgres-sales.json').bindings[0].source,providerId:'file.table',operation:'query',contractVersion:1,parameters:[],payload:{key:'test'},
   output:{datasetId:'bookings',grain:[mapping.booking_id],fields:data.content.columns.map(c=>({id:mapping[c.key],sourceField:mapping[c.key],label:c.label,logicalType:c.logicalType,nullable:c.nullable,role:c.role}))}}
 const title='客户预订分析 </script><script>bad()</script>'
 const manifest=compileTemplate(template,[{input,binding,origin:source,synthetic:false}],{id:randomUUID(),title,theme:'system',parameters:{},
   html:pack.blobs.get(template.assets[0].sha256).toString(),origin:{schema:'xpert.library.instance',version:1,template:reference(template),inputs:[{slot:'bookings',mapping,source}],parameters:{}}})
 const errors=[],console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));let receive
 const dom=new JSDOM(manifest.presentation.html,{runScripts:'dangerously',virtualConsole:console,beforeParse(w){w.xpertLiveArtifact={ready:async()=>({theme:'light',bindingIds:['bookings'],defaults:{}}),
   subscribe:(id,fn)=>{assert.equal(id,'bookings');receive=fn},query:async()=>receive({rows,completeness:{truncated:false,scope:'full_query_result',totalAccuracy:'exact'},freshness:{sourceFetchedAt:'2026-11-07T00:00:00Z'}})}}})
 t.after(()=>dom.window.close());await new Promise(resolve=>setTimeout(resolve,0))
 const d=dom.window.document
 assert.equal(d.querySelector('h1').textContent,title);assert.equal(d.querySelector('h1+p').textContent,'数据来自当前授权的数据集')
 assert.equal(d.getElementById('total').textContent,'720');assert.equal(d.getElementById('value').textContent,'336,199')
 const channel=d.getElementById('channel');channel.value='Direct';channel.dispatchEvent(new dom.window.Event('change'))
 assert.equal(d.getElementById('total').textContent,'240');assert.equal(d.getElementById('retained').textContent,'187')
 assert.ok(!manifest.presentation.html.includes('DEMO-720'));assert.deepEqual(errors,[])
})
