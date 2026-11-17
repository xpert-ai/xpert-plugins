require('reflect-metadata')
const { test } = require('node:test'), assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto'), { DataSource } = require('typeorm')
const { services, entities, header } = require('./library-v2-fixture.cjs')
const { executionFixture } = require('./library-execution-fixture.cjs')
const { LibraryDirectoryService } = require('../dist/lib/library/directory.service')
const { encodePackage, decodePackage } = require('../dist/lib/library/archive')
const { buildExplorePackage } = require('../scripts/explore-package.cjs')
const { buildHotelPackage } = require('../scripts/hotel-package.cjs')
const blueprints = require('../dist/lib/library/catalog-blueprints.json')
const url = process.env.LIVE_DASHBOARD_LIBRARY_TEST_DATABASE_URL
test('V2 directory and independent example ZIP with PostgreSQL', { skip: !url }, async t => {
  const schema = `directory_test_${randomUUID().replaceAll('-', '')}`
  const db = new DataSource({ type: 'postgres', url, schema, entities: entities.LIBRARY_V2_ENTITIES, synchronize: false, extra: { options: `-c search_path=${schema},public` } })
  await db.initialize(); await db.query(`CREATE SCHEMA "${schema}"`); await db.synchronize()
  t.after(async () => { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() })
  const bytes = encodePackage(buildExplorePackage())
  await t.test('browsing placeholders writes nothing and pages before matching owned releases', async () => {
    const f=services(db), directory=new LibraryDirectoryService(f.catalog), context={...f.context,readonly:true}
    const before=await f.catalog.versions.count(), checked=[]
    const match=f.catalog.matchOwned.bind(f.catalog);f.catalog.matchOwned=async(c,ids)=>{checked.push(ids.length);return match(c,ids)}
    for(const [kind,total] of [['analysis-template',6],['visual-theme',43],['component',37],['example-task',10]]) {
      const page=await directory.list(context,{kind,pageSize:12,locale:'zh-Hans'})
      assert.equal(page.total,total);assert.equal(page.items.length,Math.min(total,12));assert.ok(page.items.every(item=>!item.releaseId))
    }
    const a=await directory.list(context,{kind:'visual-theme',pageSize:12}),b=await directory.list(context,{kind:'visual-theme',page:2,pageSize:12})
    assert.ok(!a.items.some(item=>b.items.some(other=>other.id===item.id)))
    assert.ok(checked.every(n=>n<=12));assert.equal(await f.catalog.versions.count(),before)
    assert.equal((await directory.list(context,{kind:'component',search:'CSV',locale:'zh-Hans'})).total,2)
    await assert.rejects(directory.list({...context,denied:true},{kind:'example-task'}),/PROJECT_DENIED/)
  })
  await t.test('explicit import installs ten tasks and portable covers; matching is owner + logical identity', async () => {
    const f=await executionFixture(db,bytes), directory=new LibraryDirectoryService(f.catalog)
    const page=await directory.list(f.context,{kind:'example-task',locale:'zh-Hans'})
    assert.equal(page.total,10);assert.ok(page.items.every(item=>item.state==='released'&&item.coverAssetId))
    for(const item of page.items) {
      const draft=await f.tasks.prepare(f.context,item.releaseId,randomUUID())
      assert.deepEqual(draft.skillNames,['live-dashboard'])
      assert.equal(draft.workspaceFiles.length,item.id==='hotel-operations'?2:item.dataMode==='demo'?1:0)
      assert.match((await directory.thumbnail(f.context,item.releaseId,item.coverAssetId)).src,/^data:image\/webp;base64,/)
    }
    assert.equal(f.host.artifacts.size,0);assert.equal(f.jobs.size,0)
    const other={...f.context,userId:randomUUID()}
    assert.ok((await directory.list(other,{kind:'example-task'})).items.every(item=>!item.releaseId))
    await assert.rejects(directory.thumbnail(other,page.items[0].releaseId,'cover'),/RESOURCE_DENIED/)
    await assert.rejects(f.tasks.prepare({...f.context,readonly:true},page.items[0].releaseId,randomUUID()),/ACCESS_DENIED/)
    const hotel=page.items.find(item=>item.id==='hotel-operations')
    const archive=decodePackage(encodePackage(await f.catalog.exportPackage(f.context,[hotel.releaseId])))
    assert.equal(archive.roots.length,1);assert.equal(archive.resources.length,4);assert.equal(archive.blobs.size,3)
    const dest=services(db), prepared=await dest.transfers.prepare(dest.context,encodePackage(archive),'reuse',randomUUID())
    await dest.transfers.commit(dest.context,prepared.importId)
    assert.equal((await new LibraryDirectoryService(dest.catalog).list(dest.context,{kind:'example-task'})).items.filter(item=>item.releaseId).length,1)
  })
  await t.test('copy mode stays in Mine; catalogKey never grants catalog identity', async () => {
    const f=services(db), directory=new LibraryDirectoryService(f.catalog)
    const job=await f.transfers.prepare(f.context,bytes,'copy',randomUUID());await f.transfers.commit(f.context,job.importId)
    assert.equal((await directory.list(f.context,{audience:'mine',kind:'example-task'})).total,10)
    assert.ok((await directory.list(f.context,{kind:'example-task'})).items.every(item=>!item.releaseId))
    const template={...header('example-task'),catalogKey:'hotel-operations',title:'酒店经营分析',content:{prompt:'Different task',execution:{mode:'agent'},dataAliases:[],requirements:{skills:[],plugins:[],capabilities:[]}}}
    const draft=await f.catalog.saveDraft(f.context,template,0);await f.catalog.releaseDraft(f.context,draft.draftId,1)
    assert.ok(!(await directory.list(f.context,{kind:'example-task'})).items[0].releaseId)
  })
  await t.test('database queries page/filter localized metadata and follow latest releases', async () => {
    const f=services(db),directory=new LibraryDirectoryService(f.catalog)
    for(let i=0;i<14;i++) {
      const doc={...header('visual-theme'),presentation:{appearance:i%2?'dark':'light'},title:`Theme ${i}`,translations:{'zh-Hans':{title:`商务 ${i}`,description:'本地化目录'}},content:{renderer:'live-dashboard.standard',theme:'system'}}
      if(i===0)doc.logicalId=blueprints.find(item=>item.kind==='visual-theme').logicalId
      const draft=await f.catalog.saveDraft(f.context,doc,0);await f.catalog.releaseDraft(f.context,draft.draftId,1)
      if(i===0){const updated=await f.catalog.saveDraft(f.context,{...doc,version:'2.0.0'},1);await f.catalog.releaseDraft(f.context,updated.draftId,2)}
    }
    const a=await directory.list(f.context,{audience:'mine',kind:'visual-theme',pageSize:12,locale:'zh-Hans'}),b=await directory.list(f.context,{audience:'mine',kind:'visual-theme',pageSize:12,page:2})
    assert.equal(a.total,14);assert.equal(a.items.length,12);assert.equal(b.items.length,2)
    assert.ok(a.items.every(item=>item.title.startsWith('商务')))
    assert.equal((await directory.list(f.context,{audience:'mine',kind:'visual-theme',search:'商务',locale:'zh-Hans',appearance:'dark'})).total,7)
    assert.equal((await directory.list(f.context,{kind:'visual-theme'})).items[0].version,'2.0.0')
  })
  await t.test('generic template preparation freezes a recipe and detects stale dataset revisions', async () => {
    const f=await executionFixture(db,encodePackage(buildHotelPackage())), request=f.request(), resolved=await f.resolution.template(f.context,request)
    const template=(await f.catalog.list(f.context,{kind:'analysis-template'})).items[0]
    const input={...request,releaseId:template.releaseId,inputs:resolved.inputs}
    const draft=await f.tasks.prepareTemplate(f.context,input), recipe=JSON.parse(f.runtime.state.files.get(draft.workspaceFiles[0].path))
    assert.equal(recipe.action.tool,'dashboard_instantiate_template');assert.deepEqual(recipe.action.arguments.inputs,resolved.inputs)
    assert.equal((await f.tasks.prepareTemplate(f.context,input)).workspaceFiles[0].path,draft.workspaceFiles[0].path)
    assert.notEqual((await f.tasks.prepareTemplate(f.context,{...input,title:'Changed'})).workspaceFiles[0].path,draft.workspaceFiles[0].path)
    assert.equal(f.jobs.size,0);assert.equal(f.definitions.size,0)
    const bound=await f.bindings.bind(f.context,resolved.inputs[0],resolved.template.content.inputSlots[0],randomUUID()),id=randomUUID()
    f.custom.set(id,{artifactId:id,revision:2,definition:{binding:bound.binding,controls:{}}})
    await assert.rejects(f.tasks.prepareTemplate(f.context,{...input,inputs:[{...resolved.inputs[0],source:{type:'dataset',artifactId:id,revision:1}}]}),/DATASET_CONFLICT/)
  })
  await t.test('new package upgrades the old hotel task without changing existing fixed versions',async()=>{
    const f=await executionFixture(db,encodePackage(buildHotelPackage())),before=buildHotelPackage()
    const job=await f.transfers.prepare(f.context,bytes,'reuse',randomUUID())
    assert.ok(job.items.some(item=>item.outcome==='reuse'));assert.ok(!job.items.some(item=>item.outcome==='conflict'))
    await f.transfers.commit(f.context,job.importId)
    const page=await new LibraryDirectoryService(f.catalog).list(f.context,{kind:'example-task'})
    assert.equal(page.items.find(item=>item.id==='hotel-operations').version,'2.1.0')
    assert.deepEqual((await f.catalog.resolve(f.context,f.task.releaseId)).document,before.resources.find(item=>item.kind==='example-task'))
  })
})
