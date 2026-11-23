import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { createServerAutomationHost } from '@docx-editor.dev/core/automation'
import { blankDocumentBytes } from '@docx-editor.dev/core'
import { automate } from '../dist/lib/native/automation.js'
function template({ locked = false, duplicate = false } = {}) {
 const { host } = createServerAutomationHost(blankDocumentBytes())
 const run = op => { const r=host.execute({operations:[op]}); assert.equal(r.ok,true,JSON.stringify(r)); return r.results[0].value }
 const document=run({op:'getDocument'}).handle,body=run({op:'getBody',document}).handle
 run({op:'replaceStoryBlocks',body,paragraphs:['公司名称','保留条款','另一个字段']})
 const paragraphs=run({op:'getParagraphs',body}).handles
 run({op:'insertContentControl',span:{paragraph:paragraphs[0]},subtype:'plainText',tag:'company',title:'公司名称'})
 if(duplicate)run({op:'insertContentControl',span:{paragraph:paragraphs[2]},subtype:'plainText',tag:'company'})
 if(locked){const contentControl=run({op:'getContentControls',scope:{body}}).handles[0];run({op:'setContentControlProperties',contentControl,lock:'contentLocked'})}
 const saved=host.save();host.dispose();assert.equal(saved.ok,true);return Buffer.from(saved.bytes)
}
test('enterprise native content-control fill produces a new editable file while preserving original and unrelated parts',async()=>{
 const original=template(),before=Buffer.from(original)
 const inspected=automate({action:'inspect',buffer:original,offset:0,limit:10})
 assert.equal(inspected.slots[0].tag,'company')
 const result=automate({action:'fill',buffer:original,slots:[{tag:'company',text:'南京元数信息技术有限公司'}]})
 assert.ok(original.equals(before))
 const text=automate({action:'inspect',buffer:result.buffer,offset:0,limit:10}).paragraphs.map(p=>p.text)
 assert.ok(text.includes('南京元数信息技术有限公司'));assert.ok(text.includes('保留条款'))
 const a=await JSZip.loadAsync(original),b=await JSZip.loadAsync(result.buffer)
 for(const name of Object.keys(a.files).filter(n=>n!=='word/document.xml'&&!a.files[n].dir))assert.deepEqual(await a.file(name).async('uint8array'),await b.file(name).async('uint8array'),name)
})
test('unknown, duplicate and locked native template slots are rejected',()=>{
 assert.throws(()=>automate({action:'fill',buffer:template(),slots:[{tag:'missing',text:'x'}]}),/ambiguous_slot/)
 assert.throws(()=>automate({action:'fill',buffer:template({duplicate:true}),slots:[{tag:'company',text:'x'}]}),/ambiguous_slot/)
 assert.throws(()=>automate({action:'fill',buffer:template({locked:true}),slots:[{tag:'company',text:'x'}]}),/operation_refused/)
})
