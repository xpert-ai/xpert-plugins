const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, statSync } = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { Script } = require('node:vm')
const root = path.join(__dirname,'../skills/live-dashboard/examples/superstore')
const read = name => JSON.parse(readFileSync(path.join(root,name),'utf8'))

test('Agent theme assets are installed, self-contained and used by every enterprise recipe', () => {
  const theme=path.join(root,'../../themes/trend-workspace')
  const guide=readFileSync(path.join(theme,'README.md'),'utf8')
  for(const file of ['theme.css','icons.js','select.js','charts.js','layout.html']){
    const asset=readFileSync(path.join(theme,file),'utf8')
    assert.ok(asset.length>0)
    assert.ok(guide.includes(file),'the installed authoring guide links each required asset')
  }
  assert.match(readFileSync(path.join(theme,'ICON_LICENSE.txt'),'utf8'),/ISC License/)
  for(const [key,id,global] of [['overview','trend-workspace','TrendWorkspace'],['profitability','profit-atlas','ProfitAtlas'],['customers','customer-brief','CustomerBrief']]){
    const html=readFileSync(path.join(root,key+'.html'),'utf8')
    assert.ok(html.includes(`data-dashboard-theme="${id}@1"`))
    assert.ok(html.includes(`window.${global}`));assert.ok(html.length<20000,'shared theme avoids long model tool calls')
    assert.match(html,/charts:(?:TrendWorkspaceCharts|DashboardCharts)/)
    const styleGuide=readFileSync(path.join(root,`../../themes/${id}/README.md`),'utf8')
    for(const asset of ['theme.css','charts.js','layout.html']) assert.ok(styleGuide.includes(asset))
    for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(match[1])
    assert.doesNotMatch(html,/<(?:script[^>]*src|link[^>]*href)=/)
  }
})

test('enterprise recipe includes reproducible teaching data and attribution', () => {
  const provenance=read('provenance.json')
  assert.equal(createHash('sha256').update(readFileSync(path.join(root,'orders.csv'))).digest('hex'),provenance.csvSha256)
  assert.match(readFileSync(path.join(root,'THIRD_PARTY_LICENSE.txt'),'utf8'),/Apache License/)
  for(const file of ['build_data.py','build_pages.py','test_data.py','README.md','semantic-model.json','import.json','checks.json'])assert.ok(statSync(path.join(root,file)).isFile())
  assert.equal(read('expected.json').cases.all.totals.Orders,5111)
  assert.equal(read('expected.json').cases.all.totals.ReturnedOrders,296)
  const guide=readFileSync(path.join(root,'README.md'),'utf8')
  for(const check of read('checks.json'))assert.ok(guide.includes(check.summary.Orders),'Agent guide contains the exact cohort counts')
})

test('enterprise queries preserve distinct totals and the provider five-measure bound', () => {
  for(const key of ['overview','profitability','customers']){
    const plan=read(key+'.queries.json')
    assert.deepEqual(plan.bindings.find(b=>b.id==='summary').payload.params.dimensions,[])
    assert.ok(plan.bindings.every(b=>b.payload.params.measures.length<=5))
    assert.ok(plan.bindings.every(b=>b.providerId==='data-xpert.ontology'))
    assert.ok(plan.bindings.every(b=>!b.source),'source must come from authorized discovery')
    assert.ok(plan.bindings.every(b=>b.parameters.map(p=>p.controlId).join(',')==='year,region,category'))
    const html=readFileSync(path.join(root,key+'.html'),'utf8')
    assert.match(html,/Superstore 演示数据/)
    assert.ok(html.split('\n').every(line=>Buffer.byteLength(line,'utf8')<=500),'full recipe must survive bounded sandbox line reads')
    assert.ok(!html.includes('2326534'),'query results are not embedded in page source')
    assert.ok(statSync(path.join(root,key+'.png')).isFile())
  }
  const measures=read('semantic-model.json').cubes[0].measures
  for(const name of ['Orders','Customers','ReturnedOrders'])assert.equal(measures.find(m=>m.name===name).aggregator,'distinct-count')
})
