import type JSZip from 'jszip';
import { relationshipPath } from './pptx-package.utils';
import { parseXml, resolveZipPath } from './pptx-xml.utils';
import type { PptxSlide } from './pptx-types';

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml';
const children = (node: Element, name: string) => Array.from(node.getElementsByTagName('*')).filter(el => el.localName === name);
const serialize = (node: Element) => new XMLSerializer().serializeToString(node);

async function relationships(zip: JSZip, owner: string) {
  return parseXml(await zip.file(relationshipPath(owner))?.async('text') ?? `<Relationships xmlns="${PKG}"/>`);
}
function relation(root: Element, kind: string) {
  return children(root, 'Relationship').find(el => el.getAttribute('Type') === `${R}/${kind}`);
}
function addRelation(root: Element, kind: string, target: string) {
  const existing = relation(root, kind);
  const node = existing ?? root.ownerDocument.createElementNS(PKG, 'Relationship');
  if (!existing) {
    const ids = new Set(children(root, 'Relationship').map(el => el.getAttribute('Id')));
    let n = 1; while (ids.has(`rId${n}`)) n++;
    node.setAttribute('Id', `rId${n}`);
    node.setAttribute('Type', `${R}/${kind}`);
    root.appendChild(node);
  }
  node.setAttribute('Target', target);
  return node.getAttribute('Id')!;
}
function body(root: Element) {
  return children(root, 'sp').find(shape => children(shape, 'ph').some(ph => ph.getAttribute('type') === 'body'));
}
export async function readSlideNotes(zip: JSZip, slidePath: string) {
  const rel = relation(await relationships(zip, slidePath), 'notesSlide');
  if (!rel || rel.getAttribute('TargetMode') === 'External') return { notes: '', sourceNotes: '' };
  const notesPath = resolveZipPath(slidePath, rel.getAttribute('Target') ?? '');
  const xml = await zip.file(notesPath)?.async('text');
  if (!xml) return { notes: '', sourceNotes: '' };
  const shape = body(parseXml(xml));
  const notes = shape ? children(shape, 'p').map(p => children(p, 't').map(t => t.textContent ?? '').join('')).join('\n') : '';
  return { notes, sourceNotes: notes, notesPath };
}

/** Keep header/footer/slide-number placeholders and unrelated package parts intact. */
export async function saveSlideNotes(zip: JSZip, slide: PptxSlide) {
  const notes = slide.notes ?? '';
  if (!slide.created && notes === (slide.sourceNotes ?? '')) return;
  if (slide.created && !notes && !slide.notesPath) return;
  const oldPath = slide.notesPath;
  let path = oldPath;
  if (!path || slide.created) {
    let n = 1; while (zip.file(`ppt/notesSlides/notesSlide${n}.xml`)) n++;
    path = `ppt/notesSlides/notesSlide${n}.xml`;
  }
  const oldXml = oldPath ? await zip.file(oldPath)?.async('text') : undefined;
  const root = parseXml(oldXml ?? `<p:notes xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
  let shape = body(root);
  if (!shape) {
    shape = root.ownerDocument.createElementNS(P, 'p:sp');
    const existingIds = children(root, 'cNvPr').map(el => Number(el.getAttribute('id')) || 0);
    const snippet = parseXml(`<p:sp xmlns:p="${P}" xmlns:a="${A}"><p:nvSpPr><p:cNvPr id="${Math.max(1, ...existingIds) + 1}" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/></p:txBody></p:sp>`);
    shape = root.ownerDocument.importNode(snippet, true);
    children(root, 'spTree')[0].appendChild(shape);
  }
  let tx = children(shape, 'txBody')[0];
  if (!tx) {
    tx = root.ownerDocument.createElementNS(P, 'p:txBody');
    tx.appendChild(root.ownerDocument.createElementNS(A, 'a:bodyPr'));
    tx.appendChild(root.ownerDocument.createElementNS(A, 'a:lstStyle'));
    shape.appendChild(tx);
  }
  for (const p of Array.from(tx.children).filter(el => el.localName === 'p')) p.remove();
  for (const line of notes.split('\n')) {
    const p = root.ownerDocument.createElementNS(A, 'a:p');
    const run = root.ownerDocument.createElementNS(A, 'a:r');
    const text = root.ownerDocument.createElementNS(A, 'a:t');
    text.textContent = line; run.appendChild(text); p.appendChild(run); tx.appendChild(p);
  }
  zip.file(path, serialize(root));
  const slideRels = await relationships(zip, slide.path);
  addRelation(slideRels, 'notesSlide', `../notesSlides/${path.split('/').pop()}`);
  zip.file(relationshipPath(slide.path), serialize(slideRels));
  const notesRels = await relationships(zip, oldPath ?? path);
  addRelation(notesRels, 'slide', `../slides/${slide.path.split('/').pop()}`);
  const master = Object.keys(zip.files).find(name => /^ppt\/notesMasters\/[^/]+\.xml$/.test(name));
  // Existing notes can use a different master; editing their text must retain it.
  if (master && !relation(notesRels, 'notesMaster')) addRelation(notesRels, 'notesMaster', `../notesMasters/${master.split('/').pop()}`);
  zip.file(relationshipPath(path), serialize(notesRels));
  const types = parseXml(await zip.file('[Content_Types].xml')!.async('text'));
  if (!children(types, 'Override').some(el => el.getAttribute('PartName') === `/${path}`)) {
    const node = types.ownerDocument.createElementNS(types.namespaceURI, 'Override');
    node.setAttribute('PartName', `/${path}`); node.setAttribute('ContentType', CT); types.appendChild(node);
    zip.file('[Content_Types].xml', serialize(types));
  }
}

export async function removeOrphanedNotes(zip: JSZip) {
  const removed = new Set<string>();
  for (const path of Object.keys(zip.files).filter(name => /^ppt\/notesSlides\/[^/]+\.xml$/.test(name))) {
    const rel = relation(await relationships(zip, path), 'slide');
    if (rel && !zip.file(resolveZipPath(path, rel.getAttribute('Target') ?? ''))) {
      zip.remove(path); zip.remove(relationshipPath(path)); removed.add(`/${path}`);
    }
  }
  if (!removed.size) return;
  const types = parseXml(await zip.file('[Content_Types].xml')!.async('text'));
  children(types, 'Override').filter(node => removed.has(node.getAttribute('PartName') ?? '')).forEach(node => node.remove());
  zip.file('[Content_Types].xml', serialize(types));
}
