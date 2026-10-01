import assert from 'node:assert/strict'
import {test, type TestContext} from 'node:test'
import {EventEmitter, once} from 'node:events'
import {createServer, type IncomingMessage, type IncomingHttpHeaders} from 'node:http'
import {createMysqlWorkbench,type QueryConfig,type MysqlWireDriver} from '../../../databases/mysql/dist/lib/mysql-workbench.js'
import {createDorisStreamLoad,parseStreamLoadReceipt} from '../../../databases/mysql/dist/lib/doris-stream-load.js'
const mockOptions={host:'mock.invalid',port:3306,username:'mock',password:'mock',catalog:'analytics'}
function wire(mode='STRICT_TRANS_TABLES', okFields=false){
 const calls:QueryConfig[]=[],state={closed:0}
 const driver:MysqlWireDriver={destroy:()=>{state.closed++},query:(config)=>{calls.push(config);const events=new EventEmitter();queueMicrotask(()=>{
 const rows=config.sql.includes('@@session.sql_mode')?[[mode]]:config.sql.includes('@@version_comment')?[['doris-3.0.8']]:config.sql.includes('version()')?[['8.0.36']]:config.sql.includes('SELECT ? AS duplicate, ? AS duplicate')?[['9007199254740993','0.12345678901234567890']]:[]
 try {
 if(rows.length){events.emit('fields',rows[0].map(()=>({name:'duplicate',type:246})));for(const row of rows){row.forEach((value)=>config.typeCast({type:'NEWDECIMAL',string:()=>value,buffer:()=>null}));events.emit('result',{})}}else {if(okFields)events.emit('fields',undefined);events.emit('result',{affectedRows:1})}events.emit('end')
 } catch {events.emit('error',{code:'TEST_FIELDS_EVENT_FAILED'})}
 });return events}}
 return{driver,calls,state}
}
test('mysql2 OK packets without fields support read transactions, writes and commit', async () => {
 const mock=wire('STRICT_TRANS_TABLES',true),adapter=createMysqlWorkbench(mockOptions,'mysql',mock.driver)
 try {
  const read=await adapter.query({database:'analytics',mode:'read',sql:'SELECT 1'})
  assert.equal(read.outcome,'succeeded')
  assert.ok(mock.calls.some((call)=>call.sql==='START TRANSACTION READ ONLY'))
  assert.ok(mock.calls.some((call)=>call.sql==='ROLLBACK'))
  await adapter.transaction('begin')
  const write=await adapter.query({database:'analytics',mode:'write',sql:'UPDATE orders SET amount=1'})
  assert.equal(write.affectedRows,1)
  assert.deepEqual(write.columns,[])
  await adapter.transaction('commit')
 } finally {await adapter.close()}
})
for(const engine of ['mysql','doris'] as const)test(`${engine} wire preserves duplicate aliases and precision before object mapping`,async()=>{const mock=wire(),adapter=createMysqlWorkbench(mockOptions,engine,mock.driver);const result=await adapter.query({database:'analytics',mode:'read',sql:'SELECT ? AS duplicate, ? AS duplicate',parameters:["x'\\attack",'0.12345678901234567890']});assert.deepEqual(result.rows,[['9007199254740993','0.12345678901234567890']]);assert.deepEqual(result.columns.map((c)=>c.id),['c0','c1']);const call=mock.calls.find((c)=>c.sql.includes('SELECT ? AS duplicate, ? AS duplicate'));assert.deepEqual(call?.values,["x'\\attack",'0.12345678901234567890']);await adapter.close();assert.equal(mock.state.closed,1)})
test('text-protocol parameters fail closed in NO_BACKSLASH_ESCAPES mode',async()=>{const mock=wire('NO_BACKSLASH_ESCAPES'),adapter=createMysqlWorkbench(mockOptions,'mysql',mock.driver);await assert.rejects(()=>adapter.query({mode:'read',sql:'SELECT ?',parameters:["quoted'value"]}),/sql_mode_unsupported/);assert.equal(mock.calls.filter((c)=>c.sql.includes('SELECT ?')).length,0);await adapter.close()})
test('driver timeout destroys only its own physical connection',async()=>{const emitter=new EventEmitter(),state={closed:0};const driver:MysqlWireDriver={query:()=>emitter,destroy:()=>{state.closed++}};const adapter=createMysqlWorkbench(mockOptions,'doris',driver);await assert.rejects(()=>adapter.query({mode:'read',sql:'SELECT 1',timeoutMs:5}),/timeout/);assert.equal(state.closed,1)})
const loadInput={database:'analytics',table:'orders',columns:['id'],rows:[['9007199254740993']],operationId:'stable-operation-123'}
interface StreamResponse { status?: number; location?: string; body?: { Status: string; NumberLoadedRows?: number; NumberFilteredRows?: number } }
async function streamEndpoint(context: TestContext, respond: (request: IncomingMessage) => StreamResponse) {
 const requests: IncomingHttpHeaders[] = []
 const server = createServer(async (request, response) => {
  for await (const _chunk of request) { /* Consume the request body before replying. */ }
  requests.push(request.headers)
  const result = respond(request)
  response.writeHead(result.status ?? 200, {'content-type': 'application/json', ...(result.location ? {location: result.location} : {})})
  response.end(JSON.stringify(result.body ?? {}))
 })
 server.listen(0, '127.0.0.1')
 await once(server, 'listening')
 context.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() }))
 const address = server.address()
 assert.ok(address && typeof address !== 'string')
 return {requests, port: address.port}
}
test('Stream Load keeps stable labels and does not replay publish timeout', async (context) => {
 const server = await streamEndpoint(context, () => ({body: {Status: 'Publish Timeout'}}))
 const load = createDorisStreamLoad({...mockOptions, host: '127.0.0.1', apiPort: server.port})
 assert.equal((await load(loadInput)).outcome, 'pending')
 assert.equal(server.requests.length, 1)
 assert.equal((await load(loadInput)).outcome, 'pending')
 assert.equal(server.requests.length, 2)
 assert.equal(server.requests[0].label, server.requests[1].label)
 assert.equal(server.requests[0].expect, '100-continue')
})
test('Stream Load never forwards credentials to an unlisted redirect host', async (context) => {
 const server = await streamEndpoint(context, () => ({status: 307, location: 'http://outside.invalid:8040/api/analytics/orders/_stream_load'}))
 const load = createDorisStreamLoad({...mockOptions, host: '127.0.0.1', apiPort: server.port})
 assert.equal((await load(loadInput)).outcome, 'unknown')
 assert.equal(server.requests.length, 1)
})
test('Stream Load accepts a configured BE redirect and retains filtered row evidence', async (context) => {
 const backend = await streamEndpoint(context, () => ({body: {Status: 'Success', NumberLoadedRows: 1, NumberFilteredRows: 1}}))
 const frontend = await streamEndpoint(context, () => ({status: 307, location: `http://127.0.0.1:${backend.port}/api/analytics/orders/_stream_load`}))
 const load = createDorisStreamLoad({...mockOptions, host: '127.0.0.1', apiPort: frontend.port, streamLoadHosts: ['127.0.0.1']})
 const receipt = await load(loadInput)
 assert.equal(receipt.outcome, 'succeeded')
 assert.equal(receipt.filteredRows, 1)
 assert.ok(receipt.diagnostics.includes('filtered_rows_reported'))
 assert.equal(frontend.requests.length, 1)
 assert.equal(backend.requests.length, 1)
 assert.equal(backend.requests[0].expect, '100-continue')
 assert.equal(backend.requests[0].authorization, frontend.requests[0].authorization)
})
test('a success response without row counts never invents zero counts',()=>assert.throws(()=>parseStreamLoadReceipt({Status:'Success'},'mock'),/count/))
