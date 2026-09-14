import { GridLength } from './events.js';
import { LayoutRoot, LayoutPanel, LayoutContent, LayoutDocument, LayoutAnchorable, LayoutPane, LayoutDocumentPane, LayoutAnchorablePane, LayoutDocumentPaneGroup, LayoutAnchorablePaneGroup, LayoutAnchorSide, LayoutAnchorGroup, LayoutFloatingWindow, LayoutDocumentFloatingWindow, contents } from './model.js';
import { element, icon, button, syncChildren, moveNode, clamp, rectRelative, applyStyle, selectTemplate } from './dom.js';
import { controlFor } from './controls.js';

const SIDES = ['Left','Top','Right','Bottom'];
export class DockRenderer {
  constructor(manager, host) {
    this.manager = manager; this.host = host; this.doc = host.ownerDocument; this.win = this.doc.defaultView;
    this.abort = new this.win.AbortController(); this.records = new Map(); this.contentRecords = new Map(); this.tabs = new Map(); this.splitters = new Map();
    this.popups = new Map(); this.sideElements = {}; this.frame = 0; this.rendering = false; this.disposed = false;
    this._originalNodes = [...host.childNodes]; this._oldClass = host.className; this._oldTabIndex = host.getAttribute('tabindex'); this._oldRole = host.getAttribute('role');
    host.classList.add('ad-manager'); host.tabIndex = 0; host.setAttribute('role', 'region'); host.setAttribute('aria-label', 'Docking workspace');
    this.stage = element(this.doc, 'div', 'ad-stage');
    this.workspace = element(this.doc, 'div', 'ad-workspace');
    for (const side of SIDES) {
      const rail = element(this.doc, 'div', `ad-side ad-side-${side.toLowerCase()}`);
      rail.setAttribute('aria-label', `${side} auto-hidden tools`); this.sideElements[side] = rail; this.stage.append(rail);
    }
    this.stage.append(this.workspace);
    this.floatingLayer = element(this.doc, 'div', 'ad-floating-layer');
    this.overlay = element(this.doc, 'div', 'ad-drag-overlay'); this.overlay.setAttribute('aria-hidden', 'true');
    this.parking = element(this.doc, 'div', 'ad-parking'); this.parking.hidden = true;
    this.live = element(this.doc, 'div', 'ad-live'); this.live.setAttribute('aria-live', 'polite'); this.live.setAttribute('aria-atomic','true');
    host.replaceChildren(this.stage, this.floatingLayer, this.overlay, this.parking, this.live);
    const opts = { signal: this.abort.signal };
    host.addEventListener('keydown', event => this.onKeyDown(event), opts);
    host.addEventListener('keyup', event => this.onKeyUp(event), opts);
    host.addEventListener('focusin', event => {
      const content = event.target.closest?.('[data-ad-content]');
      if (content && host.contains(content)) { const model = manager.Find(content.dataset.adContent); if (model && !model.IsActive) manager.Activate(model); }
    }, opts);
    this.doc.addEventListener('pointerdown', event => {
      if (this.menu && !this.menu.contains(event.target)) this.closeMenu();
      if (manager._autoHideModel && !this.peek?.contains(event.target) && !event.target.closest?.('.ad-anchor-tab')) manager.HideAutoHideWindow();
    }, opts);
    this.win.addEventListener('blur', () => this.cancelInteraction(), opts);
    this.resizeObserver = new this.win.ResizeObserver(() => { if (!this.interaction) this.requestRender(); }); this.resizeObserver.observe(host);
  }
  requestRender() {
    if (this.disposed || this.frame) return;
    this.frame = this.win.requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  invalidateTemplates() { for (const rec of this.contentRecords.values()) rec.template = Symbol('invalid'); this.requestRender(); }
  render() {
    if (this.disposed || this.rendering) return;
    this.rendering = true;
    const active = this.doc.activeElement;
    const selection = active && 'selectionStart' in active ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
    const start = this.win.performance.now();
    try {
      const theme = this.manager.Theme; this.host.dataset.theme = typeof theme === 'string' ? theme : theme?.Name || 'dark';
      this.host.dir = this.manager.FlowDirection === 'RightToLeft' ? 'rtl' : 'ltr';
      this.host.style.setProperty('--ad-splitter-width', `${this.manager.GridSplitterWidth}px`);
      this.host.style.setProperty('--ad-splitter-height', `${this.manager.GridSplitterHeight}px`);
      const variables = Object.fromEntries(Object.entries(theme?.Variables || {}).map(([key,value]) => [key.startsWith('--') ? key : `--ad-${key}`, value]));
      for (const key of this.themeVariableKeys || []) if (!(key in variables)) this.host.style.removeProperty(key);
      for (const [key,value] of Object.entries(variables)) this.host.style.setProperty(key, value);
      this.themeVariableKeys = Object.keys(variables);
      this.usedRecords = new Set(); this.usedTabs = new Set(); this.usedSplitters = new Set(); this.visibleContents = new Set();
      const root = this.renderNode(this.manager.Layout.RootPanel); this.sync(this.workspace, [root]);
      this.renderSides();
      const floating = [];
      for (const model of this.manager.Layout.FloatingWindows) {
        const popup = this.popups.get(model.Id);
        if (popup && !popup.window.closed) { this.renderPopup(model, popup); continue; }
        floating.push(this.renderFloating(model));
      }
      this.sync(this.floatingLayer, floating);
      this.renderPeek();
      for (const [id, rec] of this.contentRecords) {
        if (!this.visibleContents.has(id)) {
          rec.el.hidden = true;
          // Keep hidden content alive and connected; factories are disposed only on explicit release.
          if (!rec.el.isConnected || !this.host.contains(rec.el)) moveNode(this.parking, rec.el);
        }
      }
      for (const [id, record] of this.records) if (!this.usedRecords.has(id)) {
        for (const rec of this.contentRecords.values()) if (record.el.contains(rec.el)) moveNode(this.parking, rec.el);
        record.el.remove(); this.records.delete(id);
      }
      for (const [id, tab] of this.tabs) if (!this.usedTabs.has(id)) { tab.el.remove(); this.tabs.delete(id); }
      for (const [id, splitter] of this.splitters) if (!this.usedSplitters.has(id)) { splitter.el.remove(); this.splitters.delete(id); }
      for (const [id, popup] of this.popups) if (!this.manager.FindById(id)) this.closePopup(id);
      for (const rec of this.records.values()) {
        if ('ActualWidth' in rec.model) { const rect = rec.el.getBoundingClientRect(); rec.model._values.ActualWidth = rect.width; rec.model._values.ActualHeight = rect.height; }
      }
      if (active?.isConnected && this.doc.activeElement !== active && this.host.contains(active)) {
        try { active.focus({ preventScroll: true }); if (selection && selection.start != null) active.setSelectionRange(selection.start, selection.end, selection.direction); } catch { /* Not all editable elements expose text selection. */ }
      }
    } finally { this.rendering = false; this.lastRenderTime = this.win.performance.now() - start; }
  }
  parkContentIn(node) {
    if (!node) return;
    for (const rec of this.contentRecords.values()) if (node === rec.el || node.contains(rec.el)) moveNode(this.parking, rec.el);
  }
  sync(parent, desired) {
    const keep = new Set(desired);
    // Move hosted subtrees while they are still connected. Removing an old pane
    // first would destroy iframe browsing contexts even if its DOM node survives.
    for (const child of [...parent.children]) if (!keep.has(child)) this.parkContentIn(child);
    syncChildren(parent, desired);
  }
  record(model, create) {
    this.usedRecords.add(model.Id);
    let rec = this.records.get(model.Id);
    if (rec && rec.model.constructor !== model.constructor) { this.parkContentIn(rec.el); rec.el.remove(); this.records.delete(model.Id); rec = null; }
    if (!rec) { rec = create(); rec.model = model; this.records.set(model.Id, rec); this.parking.append(rec.el); }
    rec.model = model; return rec;
  }
  renderNode(model) {
    if (model instanceof LayoutPane) return this.renderPane(model);
    if (model instanceof LayoutContent) return this.renderContent(model, true);
    return this.renderGroup(model);
  }
  renderGroup(model) {
    const rec = this.record(model, () => ({ el: element(this.doc, 'div', 'ad-group') }));
    rec.el.dataset.layoutId = model.Id;
    rec.el.style.flexDirection = model.Orientation === 'Vertical' ? 'column' : 'row';
    const children = [...model.Children].filter(x => x.IsVisible), nodes = [];
    children.forEach((child, index) => {
      const node = this.renderNode(child); this.applySizing(node, child, model.Orientation); nodes.push(node);
      if (index < children.length - 1) nodes.push(this.renderSplitter(model, child, children[index + 1]));
    });
    this.sync(rec.el, nodes); return rec.el;
  }
  applySizing(node, model, orientation) {
    const horizontal = orientation !== 'Vertical', length = horizontal ? model.DockWidth : model.DockHeight;
    if (length) node.style.flex = length.IsStar ? `${Math.max(.0001, length.Value)} 1 0px` : length.IsAbsolute ? `0 0 ${length.Value}px` : '0 1 auto';
    node.style.minWidth = `${model.DockMinWidth ?? 0}px`; node.style.minHeight = `${model.DockMinHeight ?? 0}px`;
    node.style.maxWidth = model.DockMaxWidth < 1000000 ? `${model.DockMaxWidth}px` : '';
    node.style.maxHeight = model.DockMaxHeight < 1000000 ? `${model.DockMaxHeight}px` : '';
  }
  renderPane(model) {
    const isDoc = model instanceof LayoutDocumentPane;
    const rec = this.record(model, () => {
      const el = element(this.doc, 'section', `ad-pane ${isDoc ? 'ad-document-pane' : 'ad-anchorable-pane'}`);
      el.dataset.paneId = model.Id;
      const title = element(this.doc, 'div', 'ad-pane-title');
      const caption = element(this.doc, 'div', 'ad-pane-caption');
      const actions = element(this.doc, 'div', 'ad-pane-actions');
      const menu = button(this.doc, 'down', 'Window actions', event => this.openContextMenu(rec.model.SelectedContent, event.clientX, event.clientY));
      const pin = button(this.doc, 'pin', 'Auto-hide group', () => this.manager.ToggleAutoHide(rec.model));
      const close = button(this.doc, 'close', 'Hide tool window', () => {
        const item = rec.model.SelectedContent; if (item instanceof LayoutAnchorable && item.CanHide) item.Hide(); else item?.Close();
      });
      actions.append(menu, pin, close); title.append(caption, actions);
      title.addEventListener('pointerdown', event => { if (!event.target.closest('button') && rec.model.ChildrenCount) this.beginDrag(event, rec.model); });
      title.addEventListener('dblclick', event => { if (!event.target.closest('button')) this.manager.Float(rec.model); });
      title.addEventListener('contextmenu', event => { event.preventDefault(); this.openContextMenu(rec.model.SelectedContent, event.clientX, event.clientY); });
      const tabRow = element(this.doc, 'div', 'ad-tab-row');
      const tabs = element(this.doc, 'div', 'ad-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', isDoc ? 'Documents' : 'Tool windows');
      const overflow = button(this.doc, 'down', 'All tabs', event => this.openTabList(rec.model, event)); overflow.classList.add('ad-tab-overflow');
      tabRow.append(tabs, overflow);
      const body = element(this.doc, 'div', 'ad-pane-body');
      const empty = element(this.doc, 'div', 'ad-empty-pane'); empty.append(icon(this.doc,'dock',30), element(this.doc,'p','','Drop a document here'));
      el.append(title, tabRow, body);
      const template = this.manager[isDoc ? 'DocumentPaneTemplate' : 'AnchorablePaneTemplate'];
      if (typeof template === 'function') template(model, el, this.manager);
      return { el, title, caption, actions, menu, pin, close, tabRow, tabs, overflow, body, empty };
    });
    const selected = model.SelectedContent;
    rec.el.classList.toggle('ad-active-pane', model.IsActive);
    rec.el.setAttribute('aria-label', selected?.Title || (isDoc ? 'Document pane' : 'Tool pane'));
    rec.title.hidden = isDoc || !model.ShowHeader;
    if (!isDoc) {
      this.renderLabel(rec.caption, selected, 'AnchorableTitleTemplate');
      rec.pin.hidden = !!model.FindParent(LayoutFloatingWindow); rec.pin.disabled = !model.CanAutoHide;
      rec.close.disabled = !selected || !(selected.CanHide || selected.CanClose);
    }
    const tabNodes = model.Children.map(child => this.renderTab(child, model)); this.sync(rec.tabs, tabNodes);
    rec.tabRow.hidden = !isDoc && model.ChildrenCount < 2;
    rec.overflow.hidden = model.ChildrenCount < 2;
    applyStyle(rec.el, this.manager[isDoc ? 'DocumentPaneControlStyle' : 'AnchorablePaneControlStyle'], model, this.manager);
    const panels = [];
    for (const child of model.Children) {
      // Once mounted, nonselected panels remain alive, so editors keep undo buffers, scroll and subscriptions.
      const already = this.contentRecords.has(child.ContentId);
      if (child === selected || already) panels.push(this.renderContent(child, child === selected));
    }
    if (!model.ChildrenCount) panels.push(rec.empty);
    this.sync(rec.body, panels);
    return rec.el;
  }
  renderTab(model, pane) {
    const key = `${pane.Id}:${model.ContentId}`; this.usedTabs.add(key);
    let rec = this.tabs.get(key);
    if (!rec) {
      const el = element(this.doc, 'div', 'ad-tab'); el.setAttribute('role','tab'); el.dataset.tabId = model.ContentId;
      const label = element(this.doc, 'span', 'ad-tab-label');
      const modified = element(this.doc,'span','ad-modified-dot','•'); modified.title = 'Modified';
      const close = button(this.doc,'close','Close tab',() => rec.model instanceof LayoutAnchorable && rec.model.CanHide ? rec.model.Hide() : rec.model.Close()); close.tabIndex = -1;
      el.append(label, modified, close);
      rec = { el, label, modified, close, model, pane };
      el.addEventListener('click', () => this.manager.Activate(rec.model));
      el.addEventListener('pointerdown', event => { if (!event.target.closest('button')) { this.manager.Activate(rec.model); this.beginDrag(event, rec.model); } });
      el.addEventListener('auxclick', event => { if (event.button === 1) { event.preventDefault(); rec.model.Close(); } });
      el.addEventListener('dblclick', event => { if (!event.target.closest('button')) rec.model.IsFloating ? rec.model.Dock() : rec.model.Float(); });
      el.addEventListener('contextmenu', event => { event.preventDefault(); this.openContextMenu(rec.model,event.clientX,event.clientY); });
      el.addEventListener('keydown', event => {
        if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key) && !event.altKey) {
          event.preventDefault(); const items = [...rec.pane.Children].filter(x => x.IsEnabled); let i = items.indexOf(rec.model);
          i = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
          if (items[i]) { this.manager.Activate(items[i]); this.requestRender(); this.win.requestAnimationFrame(() => this.tabs.get(`${rec.pane.Id}:${items[i].ContentId}`)?.el.focus()); }
        } else if (event.key === 'Delete' && event.shiftKey) { event.preventDefault(); rec.model.Close(); }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.manager.Activate(rec.model); }
      });
      this.tabs.set(key,rec);
    }
    rec.model = model; rec.pane = pane;
    rec.el.id = `${this.manager.Id}-tab-${encodeURIComponent(model.Id)}`; rec.el.tabIndex = model.IsSelected ? 0 : -1;
    rec.el.setAttribute('aria-selected', String(model.IsSelected)); rec.el.setAttribute('aria-disabled', String(!model.IsEnabled));
    rec.el.setAttribute('aria-controls',`${this.manager.Id}-content-${encodeURIComponent(model.ContentId)}`);
    rec.el.classList.toggle('ad-selected', model.IsSelected); rec.el.classList.toggle('ad-pinned', model.IsPinned);
    rec.el.title = String(model.ToolTip || model.Title);
    this.renderLabel(rec.label,model, model instanceof LayoutAnchorable ? 'AnchorableHeaderTemplate' : 'DocumentHeaderTemplate');
    rec.modified.hidden = !model.IsModified; rec.close.hidden = model instanceof LayoutAnchorable ? !model.CanHide && !model.CanClose : !model.CanClose;
    return rec.el;
  }
  renderLabel(holder, model, property) {
    if (!model) { holder.replaceChildren(); return; }
    const template = selectTemplate(this.manager, property, model);
    const signature = [model, model.Title, model.IconSource, template];
    if (holder._signature?.every((x,i) => x === signature[i])) return;
    holder._signature = signature;
    if (typeof template === 'function') {
      const output = template(model, this.manager);
      holder.replaceChildren(output?.nodeType ? output : this.doc.createTextNode(String(output ?? ''))); return;
    }
    const glyph = element(this.doc,'span','ad-content-icon');
    const iconTemplate = selectTemplate(this.manager,'IconContentTemplate',model,model.IconSource);
    if (typeof iconTemplate === 'function') {
      const node = iconTemplate(model.IconSource, model, this.manager); glyph.append(node?.nodeType ? node : this.doc.createTextNode(String(node ?? '')));
    } else if (typeof model.IconSource === 'string' && /^(https?:|data:image\/(png|jpeg|gif|webp);|\.\.?\/|\/)/i.test(model.IconSource)) {
      const img = this.doc.createElement('img'); img.src = model.IconSource; img.alt = ''; img.width = 16; img.height = 16; glyph.append(img);
    } else if (model.IconSource) glyph.textContent = String(model.IconSource);
    else glyph.append(icon(this.doc,model instanceof LayoutDocument ? 'document' : 'tool'));
    holder.replaceChildren(glyph, element(this.doc,'span','ad-label-text',model.Title || 'Untitled'));
  }
  renderContent(model, visible) {
    let rec = this.contentRecords.get(model.ContentId);
    const template = selectTemplate(this.manager,'LayoutItemTemplate',model,model.Content);
    if (!rec) {
      const el = element(this.doc,'div','ad-content'); el.tabIndex = 0; el.setAttribute('role','tabpanel');
      rec = { el, ref: Symbol('new'), template: Symbol('new'), model, dispose: null }; this.contentRecords.set(model.ContentId,rec); this.parking.append(el);
    }
    rec.model = model;
    if (rec.ref !== model.Content || rec.template !== template) {
      rec.dispose?.(); rec.dispose = null;
      let result;
      try {
      if (typeof template === 'function') result = template(model.Content, model, this.manager);
      else if (typeof model.Content === 'function') result = model.Content(model, this.manager);
      else result = model.Content;
      if (result?.element?.nodeType || result?.Element?.nodeType) {
        rec.dispose = result.dispose || result.Dispose || null; result = result.element || result.Element;
      }
      if (result?.nodeType) {
        for (const other of this.contentRecords.values()) if (other !== rec && other.el.contains(result)) throw new Error('The same DOM content cannot be hosted in two layout items');
        rec.el.replaceChildren(result);
      } else {
        const body = element(this.doc,'div','ad-default-content');
        if (result == null) { body.append(icon(this.doc,model instanceof LayoutDocument ? 'document' : 'tool',32), element(this.doc,'h3','',model.Title), element(this.doc,'p','','Provide Content or a LayoutItemTemplate to populate this panel.')); }
        else { const pre = element(this.doc,'pre'); pre.textContent = typeof result === 'object' ? JSON.stringify(result,null,2) : String(result); body.append(pre); }
        rec.el.replaceChildren(body);
      }
      } catch (error) {
        const failure = element(this.doc, 'div', 'ad-default-content'); failure.setAttribute('role','alert');
        failure.append(element(this.doc,'h3','','Content could not be rendered'),element(this.doc,'p','',error.message || String(error)));
        rec.el.replaceChildren(failure); this.manager._emit('Error',{Error:error,Operation:'Render content',Model:model});
      }
      rec.ref = model.Content; rec.template = template;
    }
    rec.el.dataset.adContent = model.ContentId; rec.el.id = `${this.manager.Id}-content-${encodeURIComponent(model.ContentId)}`;
    rec.el.setAttribute('aria-label',model.Title); rec.el.hidden = !visible;
    if (visible) this.visibleContents.add(model.ContentId);
    return rec.el;
  }
  renderSides() {
    for (const side of SIDES) {
      const model = this.manager.Layout[`${side}Side`], rail = this.sideElements[side];
      const groups = [];
      for (const group of model.Children) {
        const record = this.record(group, () => {
          const el = element(this.doc,'div','ad-anchor-group');
          const template = this.manager.AnchorGroupTemplate; if (typeof template === 'function') template(group,el,this.manager);
          return { el, buttons: new Map() };
        });
        const buttons = [];
        for (const item of group.Children) {
          let btn = record.buttons.get(item.ContentId);
          if (!btn) {
            btn = element(this.doc,'button','ad-anchor-tab'); btn.type = 'button'; btn.dataset.contentId = item.ContentId;
            btn.addEventListener('pointerdown', event => this.beginDrag(event, this.manager.Find(btn.dataset.contentId)));
            btn.addEventListener('click', () => { const content = this.manager.Find(btn.dataset.contentId); if (this.manager._autoHideModel === content) this.manager.HideAutoHideWindow(); else this.manager.Activate(content); });
            btn.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { clearTimeout(this.hoverTimer); this.hoverTimer = this.win.setTimeout(() => this.manager.ShowAutoHideWindow(this.manager.Find(btn.dataset.contentId)),this.manager.AutoHideDelay); } });
            btn.addEventListener('pointerleave', () => { clearTimeout(this.hoverTimer); this.schedulePeekClose(); });
            btn.addEventListener('contextmenu', event => { event.preventDefault(); this.openContextMenu(this.manager.Find(btn.dataset.contentId),event.clientX,event.clientY); });
            const template = this.manager.AnchorTemplate; if (typeof template === 'function') template(item,btn,this.manager);
            record.buttons.set(item.ContentId,btn);
          }
          btn.disabled = !item.IsEnabled; btn.title = item.Title; btn.setAttribute('aria-expanded',String(this.manager._autoHideModel === item));
          this.renderLabel(btn,item,'AnchorableHeaderTemplate'); buttons.push(btn);
        }
        this.sync(record.el,buttons); groups.push(record.el);
      }
      this.sync(rail,groups); rail.hidden = !groups.length;
      if (rail._template !== this.manager.AnchorSideTemplate) {
        rail._template = this.manager.AnchorSideTemplate;
        if (typeof rail._template === 'function') rail._template(model,rail,this.manager);
      }
    }
  }
  renderPeek() {
    const model = this.manager._autoHideModel;
    if (!model || !model.IsAutoHidden) { this.parkContentIn(this.peek); this.peek?.remove(); this.peek = null; return; }
    if (!this.peek) {
      this.peek = element(this.doc,'section','ad-peek'); this.peek.setAttribute('role','dialog');
      const title = element(this.doc,'div','ad-pane-title'); this.peekCaption = element(this.doc,'div','ad-pane-caption');
      title.append(this.peekCaption, button(this.doc,'pin','Pin tool window',()=>this.manager.ToggleAutoHide(this.manager._autoHideModel)),button(this.doc,'close','Hide tool window',()=>this.manager.Hide(this.manager._autoHideModel)));
      this.peekBody = element(this.doc,'div','ad-pane-body'); this.peekHandle = element(this.doc,'div','ad-peek-resizer');
      this.peekHandle.tabIndex = 0; this.peekHandle.setAttribute('role','separator'); this.peekHandle.setAttribute('aria-label','Resize auto-hidden window');
      this.peekHandle.addEventListener('pointerdown',event=>this.beginPeekResize(event));
      this.peekHandle.addEventListener('keydown',event=>{
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault();
        const item=this.manager._autoHideModel, side=item.Parent.Parent.Side, key=['Left','Right'].includes(side)?'AutoHideWidth':'AutoHideHeight';
        const delta=['ArrowRight','ArrowDown'].includes(event.key)?10:-10;
        this.manager.Transaction('Resize auto-hide',()=>{item[key]=Math.max(100,item[key]+delta);});
      });
      this.peek.append(title,this.peekBody,this.peekHandle); this.host.append(this.peek);
      this.peek.addEventListener('pointerenter',()=>clearTimeout(this.peekCloseTimer));
      this.peek.addEventListener('pointerleave',()=>this.schedulePeekClose());
    }
    const side = model.Parent.Parent.Side, bounds = this.workspace.getBoundingClientRect(), origin = this.host.getBoundingClientRect();
    const rect = rectRelative(bounds,origin), horizontal = ['Left','Right'].includes(side);
    const width = horizontal ? clamp(model.AutoHideWidth, model.AutoHideMinWidth, rect.width) : rect.width;
    const height = horizontal ? rect.height : clamp(model.AutoHideHeight, model.AutoHideMinHeight, rect.height);
    this.peek.dataset.side = side.toLowerCase(); this.peek.setAttribute('aria-label',model.Title);
    Object.assign(this.peek.style,{ left:`${rect.x + (side==='Right'?rect.width-width:0)}px`,top:`${rect.y+(side==='Bottom'?rect.height-height:0)}px`,width:`${width}px`,height:`${height}px` });
    this.renderLabel(this.peekCaption,model,'AnchorableTitleTemplate');
    this.sync(this.peekBody,[this.renderContent(model,true)]);
  }
  schedulePeekClose() {
    clearTimeout(this.peekCloseTimer);
    this.peekCloseTimer = this.win.setTimeout(()=>{
      if (!this.peek?.matches(':hover') && !this.peek?.contains(this.doc.activeElement)) this.manager.HideAutoHideWindow();
    },this.manager.AutoHideCloseDelay);
  }
  renderFloating(model) {
    const rec = this.record(model,()=>{
      const el=element(this.doc,'section','ad-floating'); el.setAttribute('role','dialog'); el.setAttribute('aria-modal','false');
      const title=element(this.doc,'div','ad-float-title'); const caption=element(this.doc,'div','ad-float-caption');
      const dock=button(this.doc,'dock','Dock window',()=>this.manager.Dock(rec.model));
      const maximize=button(this.doc,'maximize','Maximize window',()=>this.manager.Transaction('Maximize window',()=>{rec.model.IsMaximized=!rec.model.IsMaximized;}));
      const close=button(this.doc,'close','Close floating window',()=>this.manager.CloseFloatingWindow(rec.model),'ad-close-window');
      title.append(caption,dock,maximize,close);
      title.addEventListener('pointerdown',event=>{if(!event.target.closest('button'))this.beginDrag(event,rec.model);});
      title.addEventListener('dblclick',event=>{if(!event.target.closest('button'))this.manager.Transaction('Maximize window',()=>{rec.model.IsMaximized=!rec.model.IsMaximized;});});
      title.addEventListener('contextmenu',event=>{if(this.manager.ShowSystemMenu){event.preventDefault();this.openContextMenu(contents(rec.model)[0],event.clientX,event.clientY);}});
      const body=element(this.doc,'div','ad-float-body'); el.append(title,body);
      for(const edge of ['n','s','e','w','ne','nw','se','sw']){
        const grip=element(this.doc,'div',`ad-resize-handle ad-resize-${edge}`);grip.dataset.edge=edge;grip.tabIndex=edge==='se'?0:-1;
        grip.setAttribute('role','separator');grip.setAttribute('aria-label',`Resize floating window ${edge}`);
        grip.addEventListener('pointerdown',event=>this.beginFloatingResize(event,rec.model,edge));
        grip.addEventListener('keydown',event=>{
          if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
          this.manager.Transaction('Resize floating window',()=>{
            if(['ArrowLeft','ArrowRight'].includes(event.key))rec.model.FloatingWidth=Math.max(this.manager.FloatingWindowMinWidth,rec.model.FloatingWidth+(event.key==='ArrowRight'?10:-10));
            else rec.model.FloatingHeight=Math.max(this.manager.FloatingWindowMinHeight,rec.model.FloatingHeight+(event.key==='ArrowDown'?10:-10));
          });
        });el.append(grip);
      }
      el.addEventListener('pointerdown',()=>{const item=contents(rec.model).find(x=>x.IsSelected)||contents(rec.model)[0];if(item)this.manager.Activate(item);});
      return {el,title,caption,dock,maximize,close,body};
    });
    const all=contents(model),selected=all.find(x=>x.IsActive)||all.find(x=>x.IsSelected)||all[0];
    this.renderLabel(rec.caption,selected,selected instanceof LayoutAnchorable?'AnchorableTitleTemplate':'DocumentTitleTemplate');
    rec.el.setAttribute('aria-label',selected?.Title||'Floating window');rec.el.dataset.floatingId=model.Id;
    rec.el.classList.toggle('ad-maximized',model.IsMaximized);rec.el.classList.toggle('ad-active-floating',all.some(x=>x.IsActive));
    const bounds=this.floatingBounds(model);Object.assign(rec.el.style,{left:`${bounds.x}px`,top:`${bounds.y}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,zIndex:String(model.ZIndex)});
    rec.maximize.replaceChildren(icon(this.doc,model.IsMaximized?'restore':'maximize'));rec.maximize.title=model.IsMaximized?'Restore window':'Maximize window';rec.maximize.setAttribute('aria-label',rec.maximize.title);
    rec.dock.disabled=!all.every(x=>x.CanDock&&x.CanMove);
    if(model.RootPanel)this.sync(rec.body,[this.renderNode(model.RootPanel)]);else this.sync(rec.body,[]);
    return rec.el;
  }
  floatingBounds(model) {
    const width=this.host.clientWidth,height=this.host.clientHeight;
    if(model.IsMaximized)return{x:0,y:0,width,height};
    const w=Math.min(width,Math.max(this.manager.FloatingWindowMinWidth,model.FloatingWidth)),h=Math.min(height,Math.max(this.manager.FloatingWindowMinHeight,model.FloatingHeight));
    return{x:clamp(model.FloatingLeft,0,width-w),y:clamp(model.FloatingTop,0,height-h),width:w,height:h};
  }
  renderSplitter(parent,a,b) {
    const id=`${parent.Id}:${a.Id}:${b.Id}`;this.usedSplitters.add(id);let rec=this.splitters.get(id);
    if(!rec){
      const el=element(this.doc,'div','ad-splitter');el.tabIndex=0;el.setAttribute('role','separator');
      rec={el,parent,a,b};el.addEventListener('pointerdown',event=>this.beginSplitterResize(event,rec));
      el.addEventListener('keydown',event=>{
        if (!this.canResizeSplit(rec)) return;
        const horizontal=rec.parent.Orientation!=='Vertical';
        const delta=event.key===(horizontal?'ArrowRight':'ArrowDown')?1:event.key===(horizontal?'ArrowLeft':'ArrowUp')?-1:0;
        if(!delta&&event.key!=='Home'&&event.key!=='End')return;event.preventDefault();
        const metrics=this.splitterMetrics(rec);let value=metrics.aSize+delta*(event.shiftKey?50:event.altKey?1:10);
        if(event.key==='Home')value=metrics.total/2;if(event.key==='End')value=metrics.max;
        this.commitSplitter(rec,metrics,clamp(value,metrics.min,metrics.max));
      });
      el.addEventListener('dblclick',()=>{if(!this.canResizeSplit(rec))return;const metrics=this.splitterMetrics(rec);this.commitSplitter(rec,metrics,clamp(metrics.total/2,metrics.min,metrics.max));});
      this.splitters.set(id,rec);
    }
    Object.assign(rec,{parent,a,b});const horizontal=parent.Orientation!=='Vertical';
    rec.el.setAttribute('aria-disabled',String(!this.canResizeSplit(rec)));rec.el.tabIndex=this.canResizeSplit(rec)?0:-1;
    rec.el.classList.toggle('ad-splitter-vertical',horizontal);rec.el.classList.toggle('ad-splitter-horizontal',!horizontal);
    rec.el.setAttribute('aria-orientation',horizontal?'vertical':'horizontal');rec.el.setAttribute('aria-label',horizontal?'Resize columns':'Resize rows');
    rec.el.setAttribute('aria-valuemin','0');rec.el.setAttribute('aria-valuemax','100');
    const av=a[horizontal?'DockWidth':'DockHeight'].Value,bv=b[horizontal?'DockWidth':'DockHeight'].Value;
    rec.el.setAttribute('aria-valuenow',String(Math.round(100*av/(av+bv||1))));
    return rec.el;
  }
  elementFor(model) { return this.records.get(model.Id)?.el || (model instanceof LayoutContent ? this.contentRecords.get(model.ContentId)?.el : null); }
  contentElement(model) { return this.contentRecords.get(model.ContentId)?.el || null; }
  controlFor(model) { return controlFor(model,this.manager); }
  focusContent(model) {
    if(!model)return;this.requestRender();this.win.requestAnimationFrame(()=>{
      const content=this.contentElement(model);const target=content?.querySelector('textarea,input,button,[contenteditable="true"],[tabindex="0"]')||content;
      target?.focus({preventScroll:true});
    });
  }
  announce(text){this.live.textContent=text;}
  strings(key){return this.manager.Strings?.[key]||key;}
  openContextMenu(model,x,y) {
    if(!model)return;const wrapper=this.manager.GetLayoutItemFromModel(model);
    const cmd=(Label,command,Shortcut='')=>({Label,Command:command,Shortcut});
    const defaults=[
      cmd('Float',wrapper.FloatCommand),cmd('Dock',wrapper.DockCommand),
      ...(model instanceof LayoutAnchorable?[cmd('Dock as document',wrapper.DockAsDocumentCommand),cmd(model.IsAutoHidden?'Pin tool window':'Auto-hide group',wrapper.AutoHideCommand),cmd('Hide',wrapper.HideCommand)]:[]),
      null,
      cmd('New vertical tab group',wrapper.NewVerticalTabGroupCommand),cmd('New horizontal tab group',wrapper.NewHorizontalTabGroupCommand),
      cmd('Move to next tab group',wrapper.MoveToNextTabGroupCommand),cmd('Move to previous tab group',wrapper.MoveToPreviousTabGroupCommand),
      ...(model instanceof LayoutAnchorable?[null,...SIDES.map(side=>({Label:`Dock to ${side.toLowerCase()} edge`,Execute:()=>this.manager.Dock(model,this.manager.Layout,side),CanExecute:()=>this.manager.CanDockAt(model,this.manager.Layout,side)}))]:[]),
      null,{Label:'Open in browser window',Execute:()=>this.popOut(model),CanExecute:()=>model.CanFloat&&model.CanMove},
      null,cmd('Close',wrapper.CloseCommand,'Ctrl+F4'),cmd('Close other tabs',wrapper.CloseAllButThisCommand),cmd('Close all tabs',wrapper.CloseAllCommand)
    ];
    const provider=model instanceof LayoutAnchorable?this.manager.AnchorableContextMenu:this.manager.DocumentContextMenu;
    const entries=typeof provider==='function'?provider(model,this.manager,defaults):Array.isArray(provider)?provider:defaults;
    this.showMenu(entries,x,y,model.Title);
  }
  openTabList(pane,event) {
    this.showMenu(pane.Children.map(model=>({
      Label:model.Title,Checked:model.IsSelected,Execute:()=>{this.manager.Activate(model);this.focusContent(model);},CanExecute:()=>model.IsEnabled,
      HeaderTemplate:selectTemplate(this.manager,'DocumentPaneMenuItemHeaderTemplate',model),Model:model
    })),event.clientX,event.clientY,'Open tabs');
  }
  showMenu(entries,x,y,title='Window actions') {
    this.closeMenu();if(!Array.isArray(entries))throw new TypeError('Context menus must return an array of menu entries');
    this.menuFocus=this.doc.activeElement;
    const menu=element(this.doc,'div','ad-context-menu');menu.setAttribute('role','menu');menu.setAttribute('aria-label',title);
    menu.append(element(this.doc,'div','ad-menu-title',title));
    for(const entry of entries){
      if(!entry){menu.append(element(this.doc,'div','ad-menu-separator'));continue;}
      const row=element(this.doc,'button','ad-menu-item');row.type='button';row.setAttribute('role',entry.Checked!=null?'menuitemradio':'menuitem');
      if(entry.Checked!=null)row.setAttribute('aria-checked',String(entry.Checked));
      const enabled=entry.Command?.CanExecute?.()??(typeof entry.CanExecute==='function'?entry.CanExecute():entry.CanExecute!==false);row.disabled=!enabled;
      const check=element(this.doc,'span','ad-menu-check');if(entry.Checked)check.append(icon(this.doc,'check'));
      const label=element(this.doc,'span','ad-menu-label',this.strings(entry.Label||entry.label||''));
      if(typeof entry.HeaderTemplate==='function'){
        const node=entry.HeaderTemplate(entry.Model,this.manager);label.replaceChildren(node?.nodeType?node:this.doc.createTextNode(String(node??'')));
      }
      row.append(check,label,element(this.doc,'kbd','',entry.Shortcut||''));
      row.addEventListener('click',()=>{this.closeMenu();if(entry.Command)entry.Command.Execute();else(entry.Execute||entry.action)?.();});menu.append(row);
    }
    this.host.append(menu);this.menu=menu;
    const origin=this.host.getBoundingClientRect(),rect=menu.getBoundingClientRect();
    if(!Number.isFinite(x)||!Number.isFinite(y)||x===0&&y===0){const active=this.elementFor(this.manager.ActiveModel?.Parent||this.manager.Layout.RootPanel)?.getBoundingClientRect();x=active?.left||origin.left+20;y=active?.top||origin.top+20;}
    menu.style.left=`${clamp(x-origin.left,4,origin.width-rect.width-4)}px`;menu.style.top=`${clamp(y-origin.top,4,origin.height-rect.height-4)}px`;
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  closeMenu() {if(!this.menu)return;this.menu.remove();this.menu=null;if(this.menuFocus?.isConnected)this.menuFocus.focus({preventScroll:true});}
  beginDrag(event,subject) {
    if(event.button!==0||event.isPrimary===false||this.interaction)return;
    const items=this.manager._subjectItems(subject);
    if(!items.length||!items.every(x=>x.CanMove&&x.IsEnabled))return;
    if(subject instanceof LayoutContent&&subject.Parent instanceof LayoutPane&&!subject.Parent.CanRepositionItems)return;
    if(subject instanceof LayoutFloatingWindow&&subject.IsMaximized)return;
    const start={x:event.clientX,y:event.clientY};let active=false,drop=null;
    const floating=subject instanceof LayoutFloatingWindow?subject:null;
    const floatingElement=floating?this.elementFor(floating):null;
    const original=floating?this.floatingBounds(floating):null;
    const payload={subject,items};this.closeMenu();
    const activate=()=>{
      active=true;this.host.classList.add('ad-dragging');this.dragPayload=payload;
      if(floatingElement)floatingElement.style.pointerEvents='none';
      else{this.ghost=element(this.doc,'div','ad-drag-ghost');this.ghost.append(icon(this.doc,items[0] instanceof LayoutDocument?'document':'tool'),element(this.doc,'span','',items.length===1?items[0].Title:`${items.length} tool windows`));this.host.append(this.ghost);}
      this.announce(`Dragging ${items[0].Title}. Drop on a guide to dock. Escape cancels.`);
    };
    const clean=()=>{
      this.ghost?.remove();this.ghost=null;this.overlay.replaceChildren();this.host.classList.remove('ad-dragging');this.dragPayload=null;
      if(floatingElement){floatingElement.style.transform='';floatingElement.style.pointerEvents='';}this.requestRender();
    };
    this.trackPointer(event,{
      type:'drag',
      move:e=>{
        const dx=e.clientX-start.x,dy=e.clientY-start.y;
        if(!active&&Math.hypot(dx,dy)<5)return;if(!active)activate();
        if(this.ghost)Object.assign(this.ghost.style,{left:`${e.clientX+14}px`,top:`${e.clientY+14}px`});
        if(floatingElement)floatingElement.style.transform=`translate(${dx}px,${dy}px)`;
        drop=e.ctrlKey?null:this.findDrop(payload,e.clientX,e.clientY);this.drawDropGuides(payload,drop,e.clientX,e.clientY,e.ctrlKey);
      },
      end:e=>{
        if(!active){clean();return;}
        clean();
        if(drop&&this.manager.CanDockAt(subject,drop.target,drop.position)){
          this.manager.Dock(subject,drop.target,drop.position,drop.index);this.announce(`Docked ${items[0].Title} ${drop.position.toLowerCase()}.`);
        }else if(floating){
          this.manager.Transaction('Move floating window',()=>{floating.FloatingLeft=clamp(original.x+e.clientX-start.x,0,this.host.clientWidth-original.width);floating.FloatingTop=clamp(original.y+e.clientY-start.y,0,this.host.clientHeight-original.height);});
        }else if(items.every(x=>x.CanFloat)){
          const origin=this.host.getBoundingClientRect();this.manager.Float(subject,{FloatingLeft:Math.max(0,e.clientX-origin.left-120),FloatingTop:Math.max(0,e.clientY-origin.top-18)});this.announce(`Floated ${items[0].Title}.`);
        }else this.announce('No valid docking target. Layout unchanged.');
      },cancel:clean
    });
  }
  findDrop(payload,x,y) {
    const hostRect=this.host.getBoundingClientRect();
    if(x<hostRect.left||x>hostRect.right||y<hostRect.top||y>hostRect.bottom)return null;
    const edge=32;let side=null;
    if(x-hostRect.left<edge)side='Left';else if(hostRect.right-x<edge)side='Right';else if(y-hostRect.top<edge)side='Top';else if(hostRect.bottom-y<edge)side='Bottom';
    if(side&&this.manager.CanDockAt(payload.subject,this.manager.Layout,side))return{target:this.manager.Layout,position:side,rect:rectRelative(this.workspace.getBoundingClientRect(),hostRect),outer:true};
    const root=this.host.getRootNode();
    const hits=root.elementsFromPoint?root.elementsFromPoint(x,y):this.doc.elementsFromPoint(x,y);
    let pane=null,paneElement=null;
    for(const hit of hits){
      const candidate=hit.closest?.('.ad-pane');if(!candidate||!this.host.contains(candidate)||candidate.closest('.ad-manager')!==this.host)continue;
      const model=this.manager.FindById(candidate.dataset.paneId);
      if(!model||model===payload.subject||payload.subject instanceof LayoutFloatingWindow&&model.FindParent(LayoutFloatingWindow)===payload.subject)continue;
      pane=model;paneElement=candidate;break;
    }
    if(!pane)return null;
    const rect=paneElement.getBoundingClientRect(),relative=rectRelative(rect,hostRect);
    const tabs=this.records.get(pane.Id)?.tabs,tabRect=tabs?.getBoundingClientRect();
    if(tabRect&&y>=tabRect.top&&y<=tabRect.bottom){
      let index=pane.ChildrenCount;
      for(let i=0;i<pane.ChildrenCount;i++){
        const tab=this.tabs.get(`${pane.Id}:${pane.Children[i].ContentId}`)?.el.getBoundingClientRect();
        if(tab&&x<tab.left+tab.width/2){index=i;break;}
      }
      return this.manager.CanDockAt(payload.subject,pane,'Center')?{target:pane,position:'Center',index,rect:relative,tab:true}:null;
    }
    const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    const positions=[['Top',0,-40],['Left',-40,0],['Center',0,0],['Right',40,0],['Bottom',0,40]];
    let position=positions.find(([,dx,dy])=>Math.abs(x-cx-dx)<19&&Math.abs(y-cy-dy)<19)?.[0];
    if(!position){
      const nx=(x-rect.left)/rect.width,ny=(y-rect.top)/rect.height;
      const edges=[['Left',nx],['Right',1-nx],['Top',ny],['Bottom',1-ny]].sort((a,b)=>a[1]-b[1]);position=edges[0][1]<.23?edges[0][0]:'Center';
    }
    if(!this.manager.CanDockAt(payload.subject,pane,position))return{target:pane,position:null,rect:relative,invalid:true};
    return{target:pane,position,rect:relative};
  }
  drawDropGuides(payload,drop,x,y,suspended=false) {
    this.overlay.replaceChildren();if(suspended)return;
    const origin=this.host.getBoundingClientRect();
    if(drop?.rect){
      const {rect}=drop;
      if(drop.position){
        const preview=element(this.doc,'div','ad-drop-preview');let{x:px,y:py,width,height}=rect;
        if(drop.position==='Left')width=drop.outer?Math.min(260,width*.35):width/2;
        if(drop.position==='Right'){const w=drop.outer?Math.min(260,width*.35):width/2;px+=width-w;width=w;}
        if(drop.position==='Top')height=drop.outer?Math.min(210,height*.35):height/2;
        if(drop.position==='Bottom'){const h=drop.outer?Math.min(210,height*.35):height/2;py+=height-h;height=h;}
        Object.assign(preview.style,{left:`${px}px`,top:`${py}px`,width:`${width}px`,height:`${height}px`});this.overlay.append(preview);
      }
      if(!drop.outer){
        const cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
        for(const [side,dx,dy]of[['Top',0,-40],['Left',-40,0],['Center',0,0],['Right',40,0],['Bottom',0,40]]){
          if(!this.manager.CanDockAt(payload.subject,drop.target,side))continue;
          const guide=element(this.doc,'div',`ad-drop-guide ${drop.position===side?'ad-drop-guide-active':''}`);guide.dataset.dockPosition=side;
          guide.append(icon(this.doc,side.toLowerCase(),22));Object.assign(guide.style,{left:`${cx+dx-18}px`,top:`${cy+dy-18}px`});this.overlay.append(guide);
        }
      }
    }
    for(const side of SIDES){
      if(!this.manager.CanDockAt(payload.subject,this.manager.Layout,side))continue;
      const guide=element(this.doc,'div',`ad-drop-guide ad-root-guide ${drop?.outer&&drop.position===side?'ad-drop-guide-active':''}`);guide.dataset.rootDock=side;guide.append(icon(this.doc,side.toLowerCase(),20));
      const left=side==='Left'?7:side==='Right'?origin.width-43:origin.width/2-18;
      const top=side==='Top'?7:side==='Bottom'?origin.height-43:origin.height/2-18;
      Object.assign(guide.style,{left:`${left}px`,top:`${top}px`});this.overlay.append(guide);
    }
    if(drop?.tab){
      const pane=drop.target,index=drop.index,reference=this.tabs.get(`${pane.Id}:${pane.Children[Math.min(index,pane.ChildrenCount-1)]?.ContentId}`)?.el.getBoundingClientRect();
      if(reference){const marker=element(this.doc,'div','ad-tab-drop-marker');Object.assign(marker.style,{left:`${(index===pane.ChildrenCount?reference.right:reference.left)-origin.left}px`,top:`${reference.top-origin.top}px`,height:`${reference.height}px`});this.overlay.append(marker);}
    }
  }
  trackPointer(event,callbacks) {
    event.preventDefault();
    const capture=event.currentTarget||event.target;
    try{capture.setPointerCapture?.(event.pointerId);}catch{}
    const controller=new this.win.AbortController(),opts={signal:controller.signal,capture:true};let latest=null,frame=0,finished=false;
    const cleanup=()=>{if(frame)this.win.cancelAnimationFrame(frame);controller.abort();try{capture.releasePointerCapture?.(event.pointerId);}catch{}this.interaction=null;this.doc.documentElement.classList.remove('ad-is-interacting');};
    const cancel=()=>{if(finished)return;finished=true;cleanup();callbacks.cancel?.();};
    this.interaction={type:callbacks.type,cancel};this.doc.documentElement.classList.add('ad-is-interacting');
    this.doc.addEventListener('pointermove',e=>{
      if(e.pointerId!==event.pointerId)return;e.preventDefault();latest=e;
      if(!frame)frame=this.win.requestAnimationFrame(()=>{frame=0;const point=latest;latest=null;if(point&&!finished)callbacks.move?.(point);});
    },opts);
    this.doc.addEventListener('pointerup',e=>{
      if(e.pointerId!==event.pointerId||finished)return;
      if(frame){this.win.cancelAnimationFrame(frame);frame=0;}callbacks.move?.(e);finished=true;cleanup();callbacks.end?.(e);
    },opts);
    this.doc.addEventListener('pointercancel',e=>{if(e.pointerId===event.pointerId)cancel();},opts);
    this.doc.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancel();}},opts);
  }
  cancelInteraction(){this.interaction?.cancel();}
  minSize(model,axis) {
    const key=axis==='x'?'DockMinWidth':'DockMinHeight',own=model[key]||0;
    if(model instanceof LayoutPane||model instanceof LayoutContent)return own;
    const kids=[...model.Children].filter(x=>x.IsVisible);if(!kids.length)return own;
    const parallel=(axis==='x')===(model.Orientation!=='Vertical');
    return Math.max(own,parallel?kids.reduce((sum,child)=>sum+this.minSize(child,axis),0)+(kids.length-1)*(axis==='x'?this.manager.GridSplitterWidth:this.manager.GridSplitterHeight):Math.max(...kids.map(child=>this.minSize(child,axis))));
  }
  splitterMetrics(rec) {
    const horizontal=rec.parent.Orientation!=='Vertical',axis=horizontal?'x':'y',dimension=horizontal?'width':'height';
    const aRect=this.elementFor(rec.a).getBoundingClientRect(),bRect=this.elementFor(rec.b).getBoundingClientRect();
    const aSize=aRect[dimension],total=aSize+bRect[dimension],aMin=this.minSize(rec.a,axis),bMin=this.minSize(rec.b,axis);
    let min=Math.max(aMin,total-(rec.b[horizontal?'DockMaxWidth':'DockMaxHeight']||1000000));
    let max=Math.min(total-bMin,rec.a[horizontal?'DockMaxWidth':'DockMaxHeight']||1000000);
    if(min>max){min=Math.min(aSize,total);max=min;}
    const siblings=[...rec.parent.Children].filter(x=>x.IsVisible).map(model=>({model,size:this.elementFor(model).getBoundingClientRect()[dimension]}));
    return{horizontal,axis,aSize,total,min,max,siblings};
  }
  canResizeSplit(rec) {
    const horizontal = rec.parent.Orientation !== 'Vertical', key = horizontal ? 'DockWidth' : 'DockHeight', flag = horizontal ? 'ResizableAbsoluteDockWidth' : 'ResizableAbsoluteDockHeight';
    return [rec.a, rec.b].every(model => !model[key].IsAbsolute || model[flag] !== false);
  }
  beginSplitterResize(event,rec) {
    if(event.button!==0||this.interaction||!this.canResizeSplit(rec))return;
    const metrics=this.splitterMetrics(rec),start=metrics.horizontal?event.clientX:event.clientY;let value=metrics.aSize;
    this.host.classList.add('ad-resizing');
    this.trackPointer(event,{type:'splitter',move:e=>{
      value=clamp(metrics.aSize+(metrics.horizontal?e.clientX:e.clientY)-start,metrics.min,metrics.max);
      for(const{model,size}of metrics.siblings)this.elementFor(model).style.flex=`0 0 ${model===rec.a?value:model===rec.b?metrics.total-value:size}px`;
      rec.el.setAttribute('aria-valuenow',String(Math.round(100*value/metrics.total)));
    },end:()=>{this.host.classList.remove('ad-resizing');this.commitSplitter(rec,metrics,value);},cancel:()=>{this.host.classList.remove('ad-resizing');this.requestRender();}});
  }
  commitSplitter(rec,metrics,value) {
    const key=metrics.horizontal?'DockWidth':'DockHeight';
    this.manager.Transaction('Resize split',()=>{for(const{model,size}of metrics.siblings)model[key]=`${Math.max(.01,model===rec.a?value:model===rec.b?metrics.total-value:size)}*`;});
    this.announce('Pane sizes updated.');
  }
  beginFloatingResize(event,model,edge) {
    if(event.button!==0||this.interaction||model.IsMaximized)return;event.stopPropagation();
    const start={x:event.clientX,y:event.clientY},original=this.floatingBounds(model);let bounds={...original};const el=this.elementFor(model);
    this.trackPointer(event,{type:'floating-resize',move:e=>{
      const dx=e.clientX-start.x,dy=e.clientY-start.y;let{x,y,width,height}=original;
      if(edge.includes('e'))width=clamp(original.width+dx,this.manager.FloatingWindowMinWidth,this.host.clientWidth-x);
      if(edge.includes('s'))height=clamp(original.height+dy,this.manager.FloatingWindowMinHeight,this.host.clientHeight-y);
      if(edge.includes('w')){x=clamp(original.x+dx,0,original.x+original.width-this.manager.FloatingWindowMinWidth);width=original.x+original.width-x;}
      if(edge.includes('n')){y=clamp(original.y+dy,0,original.y+original.height-this.manager.FloatingWindowMinHeight);height=original.y+original.height-y;}
      bounds={x,y,width,height};Object.assign(el.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`,height:`${height}px`});
    },end:()=>this.manager.Transaction('Resize floating window',()=>{model.FloatingLeft=bounds.x;model.FloatingTop=bounds.y;model.FloatingWidth=bounds.width;model.FloatingHeight=bounds.height;for(const item of contents(model)){item.FloatingLeft=bounds.x;item.FloatingTop=bounds.y;item.FloatingWidth=bounds.width;item.FloatingHeight=bounds.height;}}),cancel:()=>this.requestRender()});
  }
  beginPeekResize(event) {
    if(event.button!==0||this.interaction)return;const model=this.manager._autoHideModel;if(!model)return;
    const side=model.Parent.Parent.Side,horizontal=['Left','Right'].includes(side),key=horizontal?'AutoHideWidth':'AutoHideHeight';
    const start=horizontal?event.clientX:event.clientY,original=model[key],sign=['Right','Bottom'].includes(side)?-1:1;
    const max=horizontal?this.workspace.clientWidth:this.workspace.clientHeight,min=horizontal?model.AutoHideMinWidth:model.AutoHideMinHeight;let value=original;
    this.trackPointer(event,{type:'auto-hide-resize',move:e=>{value=clamp(original+sign*((horizontal?e.clientX:e.clientY)-start),min,max);if(horizontal){this.peek.style.width=`${value}px`;if(side==='Right'){const r=rectRelative(this.workspace.getBoundingClientRect(),this.host.getBoundingClientRect());this.peek.style.left=`${r.x+r.width-value}px`;}}else{this.peek.style.height=`${value}px`;if(side==='Bottom'){const r=rectRelative(this.workspace.getBoundingClientRect(),this.host.getBoundingClientRect());this.peek.style.top=`${r.y+r.height-value}px`;}}},end:()=>this.manager.Transaction('Resize auto-hide',()=>{model[key]=value;}),cancel:()=>this.requestRender()});
  }
  onKeyDown(event) {
    if(!this.manager.AllowKeyboardNavigation)return;
    if(event.key==='Escape'){
      if(this.interaction){event.preventDefault();this.cancelInteraction();return;}
      if(this.menu){event.preventDefault();this.closeMenu();return;}
      if(this.navigator){event.preventDefault();this.closeNavigator(false);return;}
      if(this.peek){event.preventDefault();this.manager.HideAutoHideWindow();this.host.focus();return;}
    }
    if(this.menu){
      const rows=[...this.menu.querySelectorAll('button:not(:disabled)')];let index=rows.indexOf(this.doc.activeElement);
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();index=event.key==='Home'?0:event.key==='End'?rows.length-1:(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;rows[index]?.focus();}
      return;
    }
    if(this.navigator){
      if(['Tab','ArrowDown','ArrowUp','ArrowRight','ArrowLeft'].includes(event.key)){event.preventDefault();this.stepNavigator(event.shiftKey||['ArrowUp','ArrowLeft'].includes(event.key)?-1:1);}
      if(event.key==='Enter'){event.preventDefault();this.closeNavigator(true);}return;
    }
    const editable=event.target.closest?.('input,textarea,[contenteditable="true"]');
    if((event.ctrlKey&&event.key==='Tab')||(event.altKey&&event.key==='`')){event.preventDefault();this.showNavigator();this.stepNavigator(event.shiftKey?-1:1);return;}
    if(event.key==='F6'){event.preventDefault();this.manager.FocusNextPane(event.shiftKey);return;}
    if(event.ctrlKey&&event.key==='F4'){event.preventDefault();this.manager.ActiveModel?.Close();return;}
    if(event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=this.elementFor(this.manager.ActiveModel?.Parent||this.manager.Layout.RootPanel)?.getBoundingClientRect();this.openContextMenu(this.manager.ActiveModel,rect?.left+20,rect?.top+30);return;}
    if(event.altKey&&event.shiftKey&&['ArrowLeft','ArrowRight'].includes(event.key)){
      const item=this.manager.ActiveModel,pane=item?.Parent;if(pane instanceof LayoutPane&&pane.CanRepositionItems&&item.CanMove){const old=pane.IndexOf(item),next=clamp(old+(event.key==='ArrowRight'?1:-1),0,pane.ChildrenCount-1);event.preventDefault();this.manager.Transaction('Reorder tab',()=>pane.Children.Move(old,next));}return;
    }
    if(!editable&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?this.manager.Redo():this.manager.Undo();}
    else if(!editable&&event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();this.manager.Redo();}
  }
  onKeyUp(event){if(this.navigator&&event.key==='Control')this.closeNavigator(true);}
  showNavigator() {
    if(this.navigator)return;
    const all=contents(this.manager.Layout).filter(x=>x.IsEnabled&&!x.IsHidden);
    this.navigatorItems=[...this.manager._mru.map(id=>all.find(x=>x.ContentId===id)).filter(Boolean),...all.filter(x=>!this.manager._mru.includes(x.ContentId))];
    if(!this.navigatorItems.length)return;
    this.navigatorIndex=0;this.navigatorFocus=this.doc.activeElement;
    const backdrop=element(this.doc,'div','ad-navigator-backdrop');const dialog=element(this.doc,'div','ad-navigator');dialog.tabIndex=-1;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Switch active window');
    dialog.append(element(this.doc,'div','ad-navigator-heading','Switch window'),element(this.doc,'div','ad-navigator-hint','Arrow keys to navigate · Enter to select · Esc to cancel'));
    const list=element(this.doc,'div','ad-navigator-list');list.setAttribute('role','listbox');
    this.navigatorRows=this.navigatorItems.map((model,index)=>{
      const row=element(this.doc,'button','ad-navigator-row');row.type='button';row.setAttribute('role','option');
      row.append(icon(this.doc,model instanceof LayoutDocument?'document':'tool'),element(this.doc,'span','',model.Title),element(this.doc,'small','',model instanceof LayoutDocument?'Document':model.IsAutoHidden?'Auto-hidden tool':'Tool window'));
      row.addEventListener('click',()=>{this.navigatorIndex=index;this.closeNavigator(true);});list.append(row);return row;
    });dialog.append(list);backdrop.append(dialog);backdrop.addEventListener('pointerdown',event=>{if(event.target===backdrop)this.closeNavigator(false);});
    this.host.append(backdrop);this.navigator=backdrop;this.updateNavigator();dialog.focus();
  }
  stepNavigator(delta){if(!this.navigator)return;this.navigatorIndex=(this.navigatorIndex+delta+this.navigatorItems.length)%this.navigatorItems.length;this.updateNavigator();}
  updateNavigator(){this.navigatorRows.forEach((row,index)=>{row.classList.toggle('ad-selected',index===this.navigatorIndex);row.setAttribute('aria-selected',String(index===this.navigatorIndex));});this.navigatorRows[this.navigatorIndex]?.scrollIntoView({block:'nearest'});}
  closeNavigator(commit){if(!this.navigator)return;const model=this.navigatorItems[this.navigatorIndex];this.navigator.remove();this.navigator=null;if(commit&&model){this.manager.Activate(model);this.focusContent(model);}else this.navigatorFocus?.focus({preventScroll:true});}
  popOut(subject) {
    const items=this.manager._subjectItems(subject);if(!items.length||!items.every(x=>x.CanFloat&&x.CanMove))return null;
    let model=subject instanceof LayoutFloatingWindow?subject:subject.FindParent(LayoutFloatingWindow);
    if(model&&this.popups.has(model.Id)){this.popups.get(model.Id).window.focus();return this.popups.get(model.Id).window;}
    const popup=this.win.open('about:blank',`${this.manager.Id}-${subject.Id}`,`popup,width=${Math.round(model?.FloatingWidth||640)},height=${Math.round(model?.FloatingHeight||440)}`);
    if(!popup){this.manager._emit('Error',{Error:new Error('The browser blocked this popup. Allow popups or use in-page floating windows.'),Operation:'Open browser window'});return null;}
    if(!model)model=this.manager.Float(subject);if(!model){popup.close();return null;}
    const doc=popup.document;doc.title=items[0].Title;
    for(const source of this.doc.querySelectorAll('link[rel="stylesheet"],style')){
      const clone=source.cloneNode(true);if(clone.tagName==='LINK')clone.href=source.href;doc.head.append(clone);
    }
    const style=doc.createElement('style');style.textContent='html,body{margin:0;width:100%;height:100%;overflow:hidden}.ad-popup-shell{display:flex;flex-direction:column;width:100%;height:100%}.ad-popup-toolbar{display:flex;align-items:center;padding:6px 10px;gap:10px;border-bottom:1px solid var(--ad-border);background:var(--ad-chrome);font:12px system-ui}.ad-popup-toolbar strong{flex:1}.ad-popup-body{flex:1;min-height:0;display:flex}.ad-popup-body>.ad-group,.ad-popup-body>.ad-content{flex:1}';doc.head.append(style);
    const shell=element(doc,'div','ad-manager ad-popup-shell');shell.dataset.theme=this.host.dataset.theme;shell.tabIndex=0;
    const bar=element(doc,'div','ad-popup-toolbar');bar.append(element(doc,'strong','',items[0].Title),button(doc,'dock','Dock back into workspace',()=>{const live=this.manager.FindById(model.Id);this.closePopup(model.Id);if(live)this.manager.Dock(live);}));
    const body=element(doc,'div','ad-popup-body');shell.append(bar,body);doc.body.replaceChildren(shell);
    const rec={window:popup,body,shell,modelId:model.Id,closing:false};this.popups.set(model.Id,rec);
    popup.addEventListener('beforeunload',()=>this.closePopup(model.Id,false));
    shell.addEventListener('keydown',event=>this.onKeyDown(event));shell.addEventListener('keyup',event=>this.onKeyUp(event));
    shell.addEventListener('focusin',event=>{const id=event.target.closest?.('[data-ad-content]')?.dataset.adContent;if(id){const item=this.manager.Find(id);if(item)this.manager.Activate(item);}});
    popup.addEventListener('resize',()=>{const live=this.manager.FindById(rec.modelId);if(!rec.closing&&live)this.manager.Transaction('Resize browser window',()=>{live.FloatingWidth=Math.max(220,popup.innerWidth);live.FloatingHeight=Math.max(140,popup.innerHeight);});});
    this.requestRender();return popup;
  }
  renderPopup(model,popup){popup.shell.dataset.theme=this.host.dataset.theme;const root=model.RootPanel;if(root)this.sync(popup.body,[this.renderNode(root)]);}
  closePopup(id,closeWindow=true){
    const rec=this.popups.get(id);if(!rec||rec.closing)return;rec.closing=true;
    for(const child of [...rec.body.children])moveNode(this.parking,child);
    this.popups.delete(id);if(closeWindow&&!rec.window.closed)rec.window.close();this.requestRender();
  }
  releaseContent(id){const rec=this.contentRecords.get(id);if(!rec)return;rec.dispose?.();rec.el.remove();this.contentRecords.delete(id);}
  dispose(){
    if(this.disposed)return;this.cancelInteraction();this.disposed=true;this.abort.abort();this.resizeObserver.disconnect();
    if(this.frame)this.win.cancelAnimationFrame(this.frame);clearTimeout(this.hoverTimer);clearTimeout(this.peekCloseTimer);
    for(const id of [...this.popups.keys()])this.closePopup(id);
    for(const rec of this.contentRecords.values())rec.dispose?.();
    this.contentRecords.clear();this.records.clear();this.tabs.clear();this.splitters.clear();
    this.host.replaceChildren(...this._originalNodes);this.host.className=this._oldClass;
    if(this._oldTabIndex==null)this.host.removeAttribute('tabindex');else this.host.setAttribute('tabindex',this._oldTabIndex);
    if(this._oldRole==null)this.host.removeAttribute('role');else this.host.setAttribute('role',this._oldRole);
    this.host.removeAttribute('aria-label');this.host.removeAttribute('data-theme');
  }
}
