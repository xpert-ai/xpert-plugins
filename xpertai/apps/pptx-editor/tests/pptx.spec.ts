import JSZip from 'jszip'
import { parsePptx, savePptx } from '../src/core/pptx-file.utils'
import { createSlideCopy, paragraphsForShapeText } from '../src/core/pptx-editor-model.utils'
import { relationshipPath } from '../src/core/pptx-package.utils'
import { resolveZipPath } from '../src/core/pptx-xml.utils'

const Presentation = require('pptxgenjs')
async function fixture() {
  const pptx = new Presentation()
  pptx.layout = 'LAYOUT_WIDE'
  const slide = pptx.addSlide()
  slide.addText('Original title', {x:1,y:1,w:8,h:1,fontSize:32,fontFace:'Arial'})
  slide.addNotes('Original notes\nSecond paragraph')
  slide.addTable([['Year','Value'],['2026','100']],{x:1,y:3,w:6,h:1})
  return (await pptx.write({outputType:'arraybuffer'})) as ArrayBuffer
}
async function assertRelationships(source: ArrayBuffer | Blob) {
  const zip = await JSZip.loadAsync(source)
  for (const name of Object.keys(zip.files).filter(p=>p.endsWith('.rels'))) {
    const root = new DOMParser().parseFromString(await zip.file(name)!.async('text'),'application/xml')
    const owner = name === '_rels/.rels' ? 'root.xml' : name.replace('/_rels/','/').replace(/\.rels$/,'')
    for(const rel of Array.from(root.getElementsByTagName('Relationship'))) {
      if(rel.getAttribute('TargetMode') === 'External') continue
      const target=resolveZipPath(owner,rel.getAttribute('Target')!)
      expect({relationship:name,target,exists:!!zip.file(target)}).toEqual({relationship:name,target,exists:true})
    }
  }
}
it('round trips text and notes, preserves media/theme, and keeps relationships resolvable',async()=>{
  const source=await fixture(), deck=await parsePptx(source)
  expect(deck.slides[0].notes).toContain('Original notes')
  const title=deck.slides[0].shapes.find(s=>s.text==='Original title')!
  title.text='Edited title'; title.paragraphs=paragraphsForShapeText(title,title.text)
  deck.slides[0].notes='Updated notes\n中文备注 & <example>'
  const saved=await savePptx(deck,source), reloaded=await parsePptx(saved)
  expect(reloaded.slides[0].shapes.find(s=>s.id===title.id)?.text).toBe('Edited title')
  expect(reloaded.slides[0].notes).toBe(deck.slides[0].notes)
  const [original,changed]=await Promise.all([JSZip.loadAsync(source),JSZip.loadAsync(saved)])
  for(const name of Object.keys(original.files).filter(n=>/ppt\/(theme|slideMasters|slideLayouts|media)\//.test(n)&&!original.files[n].dir))
    expect(await changed.file(name)!.async('uint8array')).toEqual(await original.file(name)!.async('uint8array'))
  await assertRelationships(saved)
})
it('gives duplicate slides independent notes and blank slides no inherited notes',async()=>{
  const source=await fixture(), deck=await parsePptx(source)
  deck.slides.push(createSlideCopy(deck,deck.slides[0],false))
  deck.slides.push(createSlideCopy(deck,deck.slides[0],true))
  const saved=await savePptx(deck,source), reread=await parsePptx(saved)
  expect(reread.slides).toHaveLength(3)
  expect(reread.slides[1].notes).toBe(deck.slides[0].notes)
  expect(reread.slides[1].notesPath).not.toBe(reread.slides[0].notesPath)
  expect(reread.slides[2].notes).toBe('')
  reread.slides[1].notes='Only copy'
  reread.slides[2].notes='New blank note'
  const twice=await savePptx(reread,saved), again=await parsePptx(twice)
  expect(again.slides.map(s=>s.notes)).toEqual([deck.slides[0].notes,'Only copy','New blank note'])
  await assertRelationships(twice)
  again.slides.splice(1,1)
  const removed=await savePptx(again,twice)
  await assertRelationships(removed)
})
it('retains nested group coordinates when editing text and maps dragged coordinates back to the group',async()=>{
  const zip=await JSZip.loadAsync(await fixture())
  const path='ppt/slides/slide1.xml'
  let xml=await zip.file(path)!.async('text')
  const shape=xml.match(/<p:sp>.*?<\/p:sp>/s)![0]
  xml=xml.replace(shape,`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="99" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="100000" y="200000"/><a:ext cx="2000000" cy="2000000"/><a:chOff x="10000" y="20000"/><a:chExt cx="1000000" cy="1000000"/></a:xfrm></p:grpSpPr>${shape}</p:grpSp>`)
  zip.file(path,xml)
  const source=await zip.generateAsync({type:'arraybuffer'}), deck=await parsePptx(source)
  const target=deck.slides[0].shapes.find(s=>s.text==='Original title')!
  const position={x:target.x,y:target.y,width:target.width,height:target.height}
  target.text='Grouped edit';target.paragraphs=paragraphsForShapeText(target,target.text)
  const saved=await savePptx(deck,source), reread=await parsePptx(saved)
  const edited=reread.slides[0].shapes.find(s=>s.id===target.id)!
  expect(edited).toMatchObject(position)
  edited.x+=100000
  const moved=await parsePptx(await savePptx(reread,saved))
  expect(moved.slides[0].shapes.find(s=>s.id===target.id)?.x).toBe(position.x+100000)
})

it('keeps a copied slide independent when the original is edited and loses an object before save',async()=>{
  const source=await fixture(), deck=await parsePptx(source)
  deck.slides.push(createSlideCopy(deck,deck.slides[0],false))
  const title=deck.slides[0].shapes.find(s=>s.text==='Original title')!
  title.text='Only the original';title.paragraphs=paragraphsForShapeText(title,title.text)
  deck.slides[0].shapes.find(s=>s.kind==='table')!.deleted=true
  const saved=await savePptx(deck,source), reread=await parsePptx(saved)
  expect(reread.slides[0].shapes.some(s=>s.text==='Only the original')).toBe(true)
  expect(reread.slides[0].shapes.some(s=>s.kind==='table')).toBe(false)
  expect(reread.slides[1].shapes.some(s=>s.text==='Original title')).toBe(true)
  expect(reread.slides[1].shapes.some(s=>s.kind==='table')).toBe(true)
  await assertRelationships(saved)
})

it('preserves the existing notes master and other notes shapes when editing speaker notes',async()=>{
  const zip=await JSZip.loadAsync(await fixture())
  const first='ppt/notesMasters/notesMaster1.xml', second='ppt/notesMasters/notesMaster2.xml'
  zip.file(second,await zip.file(first)!.async('text'))
  zip.file(relationshipPath(second),await zip.file(relationshipPath(first))!.async('text'))
  zip.file('[Content_Types].xml',(await zip.file('[Content_Types].xml')!.async('text')).replace('</Types>',
    '<Override PartName="/ppt/notesMasters/notesMaster2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/></Types>'))
  const relPath=relationshipPath('ppt/notesSlides/notesSlide1.xml')
  zip.file(relPath,(await zip.file(relPath)!.async('text')).replace('notesMaster1.xml','notesMaster2.xml'))
  const source=await zip.generateAsync({type:'arraybuffer'}), deck=await parsePptx(source)
  const notesPath=deck.slides[0].notesPath!
  const otherShapes=(xml:string)=>Array.from(new DOMParser().parseFromString(xml,'application/xml').getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main','sp'))
    .filter(s=>!Array.from(s.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main','ph')).some(ph=>ph.getAttribute('type')==='body'))
    .map(s=>new XMLSerializer().serializeToString(s))
  const unchanged=otherShapes(await zip.file(notesPath)!.async('text'))
  deck.slides[0].notes='Edited speaker notes'
  const saved=await savePptx(deck,source), changed=await JSZip.loadAsync(saved)
  expect(await changed.file(relPath)!.async('text')).toContain('notesMaster2.xml')
  expect(otherShapes(await changed.file(notesPath)!.async('text'))).toEqual(unchanged)
  await assertRelationships(saved)
})

it('edits text without corrupting a table that reuses the same numeric shape id',async()=>{
  const zip=await JSZip.loadAsync(await fixture()), path='ppt/slides/slide1.xml'
  let xml=await zip.file(path)!.async('text')
  const id=xml.match(/<p:sp>.*?<p:cNvPr id="([^"]+)"/s)![1]
  xml=xml.replace(/(<p:graphicFrame>.*?<p:cNvPr id=")[^"]+/s,`$1${id}`)
  zip.file(path,xml)
  const source=await zip.generateAsync({type:'arraybuffer'}), deck=await parsePptx(source)
  const title=deck.slides[0].shapes.find(s=>s.text==='Original title')!
  const table=deck.slides[0].shapes.find(s=>s.kind==='table')!
  title.text='Edited title';title.paragraphs=paragraphsForShapeText(title,title.text)
  const reread=await parsePptx(await savePptx(deck,source))
  expect(reread.slides[0].shapes.find(s=>s.kind==='table')?.table).toEqual(table.table)
  expect(reread.slides[0].shapes.some(s=>s.text==='Edited title')).toBe(true)
})
