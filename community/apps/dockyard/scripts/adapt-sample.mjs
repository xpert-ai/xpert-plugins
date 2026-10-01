// Explicit build-time edits to the pinned public sample. Vendor files remain byte-identical.
export function adaptSample(source) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error(`Upstream adapter anchor must occur exactly once: ${before.slice(0, 100)}`)
    source = source.replace(before, after)
  }
  replace("import * as AD from '../src/index.js';", "import * as AD from '../vendor/dockyard/src/index.js';\nimport { adapter } from '../src/lib/remote/adapter.ts';\nimport { t } from '../src/lib/remote/i18n.ts';")
  replace("try { const saved = JSON.parse(localStorage.getItem('dockyard.buffers.v1') || '{}'); for (const [id, text] of Object.entries(saved)) if (typeof text === 'string') buffers.set(id, text); } catch {}", "for (const {contentId, text} of adapter.initial.buffers.items) buffers.set(contentId, text);")
  replace('const sourceDocuments = new AD.ObservableCollection();', 'const sourceDocuments = new AD.ObservableCollection(adapter.initial.workspace.state?.sources || []);')
  replace("let storageAvailable = false; try { localStorage.setItem('dockyard.storage-check','1'); localStorage.removeItem('dockyard.storage-check'); storageAvailable = true; } catch {}", '// Persistence is asynchronous and authenticated through the Xpert host bridge.')
  replace("function saveBuffers() {\n  try { localStorage.setItem('dockyard.buffers.v1', JSON.stringify(Object.fromEntries(buffers))); for (const model of AD.contents(manager.Layout)) if (buffers.has(model.ContentId)) model.IsModified = false; toast('Editor buffers saved on this device.'); }\n  catch (error) { toast(`Storage unavailable: ${error.message}`); }\n}", `async function saveBuffers() {
  const saving = Array.from(buffers, ([contentId,text]) => ({contentId,text}));
  try {
    await adapter.saveBuffers(saving);
    for (const item of saving) if (buffers.get(item.contentId) === item.text) {
      const model = manager.Find(item.contentId); if (model) model.IsModified = false;
      for (const input of document.querySelectorAll('[data-editor]')) if (input.dataset.editor === item.contentId)
        input.closest('.sample-editor')?.querySelector('.buffer-status')?.replaceChildren(document.createTextNode(t('saved')));
    }
    toast(t('buffersSaved')); return true;
  } catch (error) { adapter.showError(error); return false; }
}`)
  replace("function saveWorkspace() { if (manager.SaveToStorage()) toast('Workspace layout saved locally.'); else toast('Local storage is unavailable in this context. Export a layout file instead.'); }", "async function saveWorkspace() { try { await adapter.saveWorkspace(); toast(t('saved')); } catch(error) { adapter.showError(error); } }")
  replace("saveBuffers();crumb.lastChild.textContent='Saved locally';", 'saveBuffers();')
  replace('if(dirty){const live=mgr.Find(id);', 'if(dirty){adapter.bufferEdited();const live=mgr.Find(id);')
  replace("$('#status-save').addEventListener('click',saveWorkspace);", "$('#status-save').addEventListener('click',async()=>{if(await saveBuffers())await saveWorkspace();});")
  replace("try{input.value=localStorage.getItem('dockyard.scratchpad')||'';}catch{}input.addEventListener('input',()=>{try{localStorage.setItem('dockyard.scratchpad',input.value);}catch{}});", "input.value=adapter.scratchpadText;input.addEventListener('input',()=>adapter.saveScratchpad(input.value));")
  replace("StorageKey:storageAvailable?'dockyard.layout.v1':null,AutoSave:storageAvailable", 'StorageKey:null,AutoSave:false')
  replace("$('#status-save').textContent=manager.StorageKey?'✓ Local autosave':'Save workspace';", 'adapter.updateStatus();')
  replace("try { if(localStorage.getItem(manager.StorageKey))manager.LoadFromStorage(); } catch {}", `const restoredState = adapter.initial.workspace.state;
if (restoredState) {
  const serializer = new AD.JsonLayoutSerializer(manager);
  serializer.LayoutSerializationCallback.add((_sender, args) => {
    if (args.Content == null) args.Content = args.Model instanceof AD.LayoutDocument ? makeDocument(args.Model.ContentId).Content : makeTool(args.Model.ContentId).Content;
  });
  manager.AllowMixedOrientation = restoredState.options.allowMixedOrientation;
  manager.FloatingWindowMinWidth = restoredState.options.floatingWindowMinWidth;
  manager.FloatingWindowMinHeight = restoredState.options.floatingWindowMinHeight;
  serializer.Deserialize(restoredState.layoutJson);
  manager.Theme = restoredState.theme; document.body.dataset.theme = restoredState.theme;
  $('#theme-select').value = restoredState.theme;
  currentPreset = restoredState.preset; $('#preset-select').value = currentPreset;
  $('#preset-caption').textContent = {development:'Development',focus:'Focus',design:'Design review',debug:'Debugging'}[currentPreset];
  sourceCounter = Math.max(0, ...sourceDocuments.map(item => /^source-(\\d+)$/.exec(item.ContentId)?.[1] || 0));
}`)
  replace("label:'Save workspace locally'", "label:t('saveWorkspace')")
  replace("document.createTextNode('Local workspace · no account required')", "document.createTextNode(t('workspaceScope'))")
  replace('while (manager.Find(id)); buffers.set', 'while (manager.Find(id) || buffers.has(id)); buffers.set')
  replace("const refresh=()=>tree.querySelectorAll('[data-file]').forEach(row=>row.classList.toggle('current',mgr.ActiveModel?.ContentId===row.dataset.file));", `const refresh=()=>{
    for(const row of tree.querySelectorAll('[data-generated-file]')) if(!buffers.has(row.dataset.file)) row.remove();
    const present=new Set(Array.from(tree.querySelectorAll('[data-file]'),row=>row.dataset.file));
    for(const id of buffers.keys()) if(!present.has(id)) {
      const row=action('',()=>openFile(id),'file-row'); row.dataset.file=id; row.dataset.generatedFile='true';
      row.append(h('span','file-icon','≡'),h('span','',id));folder.append(row);
      row.hidden=!row.textContent.toLowerCase().includes(search.value.toLowerCase());
    }
    tree.querySelectorAll('[data-file]').forEach(row=>row.classList.toggle('current',mgr.ActiveModel?.ContentId===row.dataset.file));
  };`)
  replace('window.demo={manager,AD,applyPreset,', 'window.demo={toast,getPreset:()=>currentPreset,manager,AD,applyPreset,')
  if (/\blocalStorage\b|\bsessionStorage\b/.test(source)) throw new Error('Adapted sample must not access Web Storage')
  return source
}
