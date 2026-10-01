import { ObservableObject, ObservableCollection, EventSignal, CancelEventArgs, properties, getSchema, positive, boolean, uid } from './events.js';
import { LayoutRoot, LayoutPanel, LayoutContent, LayoutDocument, LayoutAnchorable, LayoutPane, LayoutDocumentPane, LayoutAnchorablePane, LayoutDocumentPaneGroup, LayoutAnchorablePaneGroup, LayoutAnchorGroup, LayoutFloatingWindow, LayoutDocumentFloatingWindow, LayoutAnchorableFloatingWindow, AnchorableShowStrategy, contents, validateLayout } from './model.js';
import { snapshot, hydrate, JsonLayoutSerializer, XmlLayoutSerializer } from './serialization.js';
import { LayoutDocumentItem, LayoutAnchorableItem } from './items.js';
import { DockRenderer } from './view.js';

const EVENTS = ['ActiveContentChanged','DocumentClosing','DocumentClosed','AnchorableClosing','AnchorableClosed','AnchorableHiding','AnchorableHidden','LayoutChanging','LayoutChanged','LayoutUpdated','LayoutFloatingWindowControlCreated','LayoutFloatingWindowControlClosed','HistoryChanged','Error','ContentMoved','ThemeChanged'];
function identitySnapshot(value) {
  return JSON.stringify(value, (key, val) => ['LastActivationTimeStamp','activeContentId','lastFocusedDocumentId','IsSelected'].includes(key) ? undefined : val);
}
export class DockingManager extends ObservableObject {
  constructor(hostOrOptions = {}, options = {}) {
    super();
    const host = hostOrOptions?.nodeType === 1 ? hostOrOptions : hostOrOptions?.Host || null;
    if (!hostOrOptions?.nodeType) options = hostOrOptions || {};
    for (const name of EVENTS) this[name] = new EventSignal();
    this.Id = uid('manager'); this.Host = null; this._view = null;
    this._registry = new Map(); this._items = new Map(); this._sources = new Map();
    this._undo = []; this._redo = []; this._depth = 0; this._suspended = 1; this._pendingBefore = null;
    this._queued = false; this._disposed = false; this._mru = []; this._autoHideModel = null;
    this._layout = new LayoutRoot({ RootPanel: new LayoutPanel({ Children: [new LayoutDocumentPane()] }) });
    this._layout._manager = this;
    for (const [key, value] of Object.entries(options)) {
      if (key === 'Host' || key === 'Layout' || key === 'DocumentsSource' || key === 'AnchorablesSource') continue;
      if (key.startsWith('_') || ['__proto__','constructor','prototype'].includes(key)) throw new TypeError(`Invalid manager option ${key}`);
      if (this[key] instanceof EventSignal && typeof value === 'function') this[key].add(value);
      else this[key] = value;
    }
    if (options.Layout) this._replaceLayout(options.Layout);
    if (options.DocumentsSource) this.DocumentsSource = options.DocumentsSource;
    if (options.AnchorablesSource) this.AnchorablesSource = options.AnchorablesSource;
    this._normalize(); this._registerContents(); this._suspended = 0;
    this._lastSnapshot = snapshot(this.Layout);
    if (host) this.Attach(host);
    if (this.StorageKey && this.RestoreOnLoad) this.LoadFromStorage();
  }
  get Layout() { return this._layout; }
  set Layout(value) {
    if (value === this._layout) return;
    if (!(value instanceof LayoutRoot)) throw new TypeError('Layout must be a LayoutRoot');
    validateLayout(value);
    this.Transaction('Replace layout', () => this._replaceLayout(value));
  }
  _replaceLayout(value) {
    if (!(value instanceof LayoutRoot)) throw new TypeError('Layout must be a LayoutRoot');
    if (value._manager && value._manager !== this) throw new Error('This LayoutRoot is attached to another manager');
    validateLayout(value);
    const old = this._layout;
    this._emit('LayoutChanging', { OldLayout: old, NewLayout: value });
    if (old) old._manager = null;
    this._layout = value; value._manager = this; this._autoHideModel = null;
    this._registerContents(); for (const item of this._items.values()) item.Dispose(); this._items.clear();
    this._emit('LayoutChanged', { OldLayout: old, Layout: value });
    this._view?.requestRender();
  }
  get ActiveContent() { return this.Layout.ActiveContent?.Content ?? null; }
  set ActiveContent(value) { this.Activate(value); }
  get ActiveModel() { return this.Layout.ActiveContent; }
  get FloatingWindows() { return this.Layout.FloatingWindows.ToArray().map(x => this._view?.controlFor(x) || x); }
  get AutoHideWindow() { return this._autoHideModel ? { Model: this._autoHideModel, Element: this._view?.peek || null, Hide: () => this.HideAutoHideWindow() } : null; }
  get LayoutRootPanel() { return this._view?.elementFor(this.Layout.RootPanel) || null; }
  get LeftSidePanel() { return this._view?.sideElements.Left || null; }
  get RightSidePanel() { return this._view?.sideElements.Right || null; }
  get TopSidePanel() { return this._view?.sideElements.Top || null; }
  get BottomSidePanel() { return this._view?.sideElements.Bottom || null; }
  get CanUndo() { return this._undo.length > 0; }
  get CanRedo() { return this._redo.length > 0; }
  get DocumentsSource() { return this._sources.get('document')?.source || null; }
  set DocumentsSource(value) { this._bindSource('document', value); }
  get AnchorablesSource() { return this._sources.get('anchorable')?.source || null; }
  set AnchorablesSource(value) { this._bindSource('anchorable', value); }
  Attach(host) {
    if (!host || host.nodeType !== 1) throw new TypeError('Attach requires an HTMLElement');
    if (this._disposed) throw new Error('DockingManager has been disposed');
    if (this.Host === host) return this;
    this._view?.dispose(); this.Host = host;
    this._view = new DockRenderer(this, host); this._view.render(); return this;
  }
  Detach() { this._view?.dispose(); this._view = null; this.Host = null; }
  Dispose() {
    if (this._disposed) return;
    this._disposed = true; this.Detach();
    for (const binding of this._sources.values()) binding.unsubscribe?.();
    this._sources.clear(); this._registry.clear(); for (const item of this._items.values()) item.Dispose(); this._items.clear(); this._undo = []; this._redo = [];
    this.Layout._manager = null;
    for (const event of EVENTS) this[event].clear();
  }
  dispose() { this.Dispose(); }
  OnApplyTemplate() { this._view?.invalidateTemplates(); this._view?.render(); }
  ApplyTemplate() { this.OnApplyTemplate(); return !!this.Host; }
  Refresh() { this.RefreshSources(); this._view?.requestRender(); }
  _emit(name, args = {}) {
    this[name]?.emit(this, args);
    if (this.Host && typeof CustomEvent !== 'undefined') {
      const event = new CustomEvent(`avalondock:${name}`, { detail: args, bubbles: true, composed: true, cancelable: args instanceof CancelEventArgs });
      this.Host.dispatchEvent(event); if (event.defaultPrevented) args.Cancel = true;
    }
  }
  _willChange(name) { this._modelWillChange(this, name); }
  _didChange(name) {
    if (name === 'Theme') this._emit('ThemeChanged', { Theme: this.Theme });
    this._modelDidChange(this, name);
  }
  _modelWillChange(_model, name) {
    if (this._disposed || this._suspended || this._depth || ['ActualWidth','ActualHeight'].includes(name)) return;
    if (!this._pendingBefore) this._pendingBefore = snapshot(this.Layout);
  }
  _modelDidChange(_model, name) {
    if (this._disposed || this._suspended) return;
    if (!this._queued) {
      this._queued = true;
      queueMicrotask(() => {
        this._queued = false;
        if (this._disposed || this._depth) return;
        try { this._normalize(); this._commit(this._pendingBefore, 'Edit layout'); }
        catch (error) { this._emit('Error', { Error: error, Operation: 'Layout update' }); }
      });
    }
    this._view?.requestRender();
  }
  _registerContents() {
    for (const model of contents(this.Layout)) {
      if (model.ContentId == null) model._values.ContentId = model.Id;
      this._registry.set(model.ContentId, model);
    }
  }
  _normalize() {
    this._suspended++;
    try {
      this._registerContents();
      this.Layout.CollectGarbage();
      if (![...this.Layout.RootPanel.Descendents()].some(x => x instanceof LayoutDocumentPane)) this.Layout.RootPanel.Children.Add(new LayoutDocumentPane());
      const all = contents(this.Layout);
      if (!all.includes(this.Layout._activeContent) || this.Layout._activeContent?.IsHidden || !this.Layout._activeContent?.IsEnabled) {
        const next = this._mru.map(id => all.find(c => c.ContentId === id)).find(c => c && c.IsVisible && !c.IsAutoHidden && c.IsEnabled)
          || all.find(c => c instanceof LayoutDocument && c.IsVisible && c.IsEnabled)
          || all.find(c => c.IsVisible && !c.IsAutoHidden && c.IsEnabled) || null;
        this._activate(next, false);
      }
      if (!all.includes(this.Layout._lastFocusedDocument)) this.Layout._lastFocusedDocument = all.find(c => c instanceof LayoutDocument) || null;
      if (this._autoHideModel && !this._autoHideModel.IsAutoHidden) this._autoHideModel = null;
      validateLayout(this.Layout);
    } finally { this._suspended--; }
  }
  _commit(before, label) {
    this._registerContents();
    const after = snapshot(this.Layout);
    if (before && !this._suspended && identitySnapshot(before) !== identitySnapshot(after) && this.EnableHistory) {
      this._undo.push({ before, after, label });
      while (this._undo.length > this.HistoryLimit) this._undo.shift();
      this._redo.length = 0; this._emit('HistoryChanged', { CanUndo: this.CanUndo, CanRedo: this.CanRedo, Label: label });
    }
    this._pendingBefore = null; this._lastSnapshot = after;
    for (const item of this._items.values()) item.RaiseCanExecuteChanged();
    this.Layout.Updated.emit(this.Layout, {});
    this._emit('LayoutUpdated', { Layout: this.Layout, Label: label });
    this._view?.requestRender();
    if (this.StorageKey && this.AutoSave) this.SaveToStorage();
  }
  Transaction(label, action) {
    if (typeof label === 'function') { action = label; label = 'Edit layout'; }
    if (typeof action !== 'function') throw new TypeError('Transaction requires a callback');
    if (this._disposed) throw new Error('DockingManager has been disposed');
    if (this._depth) return action();
    const before = this._pendingBefore || snapshot(this.Layout);
    this._registerContents(); this._depth++;
    try {
      const result = action();
      if (result && typeof result.then === 'function') throw new TypeError('Layout transactions must be synchronous');
      this._normalize(); this._depth--; this._commit(before, label); return result;
    } catch (error) {
      this._depth = 0; this._suspended++;
      try { this._replaceLayout(hydrate(before, this._registry)); this._pendingBefore = null; }
      finally { this._suspended--; }
      this._view?.requestRender(); throw error;
    }
  }
  BeginUpdate() {
    if (this._depth === 0) this._pendingBefore ||= snapshot(this.Layout);
    this._depth++; let done = false;
    return { Dispose: () => { if (!done) { done = true; this.EndUpdate(); } } };
  }
  EndUpdate() {
    if (!this._depth) throw new Error('EndUpdate has no matching BeginUpdate');
    if (--this._depth === 0) { this._normalize(); this._commit(this._pendingBefore, 'Batch update'); }
  }
  Undo() {
    if (!this.CanUndo) return false;
    const entry = this._undo.pop(); this._redo.push(entry); this._restoreHistory(entry.before);
    this._emit('HistoryChanged', { CanUndo: this.CanUndo, CanRedo: this.CanRedo, Label: entry.label }); return true;
  }
  Redo() {
    if (!this.CanRedo) return false;
    const entry = this._redo.pop(); this._undo.push(entry); this._restoreHistory(entry.after);
    this._emit('HistoryChanged', { CanUndo: this.CanUndo, CanRedo: this.CanRedo, Label: entry.label }); return true;
  }
  _restoreHistory(state) {
    this._suspended++;
    try { this._replaceLayout(hydrate(state, this._registry)); this._normalize(); }
    finally { this._suspended--; }
    this._commit(null, 'Restore history');
  }
  ClearHistory() { this._undo = []; this._redo = []; this._emit('HistoryChanged', { CanUndo: this.CanUndo, CanRedo: this.CanRedo }); }
  Find(contentId) { return contents(this.Layout).find(x => x.ContentId === contentId) || null; }
  FindById(id) { return [this.Layout, ...this.Layout.Descendents()].find(x => x.Id === id) || null; }
  GetLayoutItemFromModel(model) {
    if (!(model instanceof LayoutContent)) throw new TypeError('Expected LayoutContent');
    let item = this._items.get(model);
    if (!item) { item = model instanceof LayoutAnchorable ? new LayoutAnchorableItem(this, model) : new LayoutDocumentItem(this, model); this._items.set(model, item); }
    return item;
  }
  CreateUIElementForModel(model) { return this._view?.controlFor(model) || null; }
  Activate(value) {
    let model = value instanceof LayoutContent ? value : contents(this.Layout).find(c => c.Content === value || c.ContentId === value) || null;
    if (value != null && !model) throw new Error('Active content does not belong to this layout');
    if (model && (model.Root !== this.Layout || !model.IsEnabled)) return false;
    if (model?.IsHidden) this.Show(model);
    this._activate(model, true);
    if (model?.IsAutoHidden) this.ShowAutoHideWindow(model);
    this._view?.requestRender(); return true;
  }
  _activate(model, notify = true) {
    const old = this.Layout._activeContent;
    if (old === model) { if (model) model.IsSelected = true; return; }
    old?._setActive(false); this.Layout._activeContent = model;
    model?._setActive(true);
    if (model) {
      this._mru = [model.ContentId, ...this._mru.filter(x => x !== model.ContentId)];
      if (model instanceof LayoutDocument || model.Parent instanceof LayoutDocumentPane) this.Layout._lastFocusedDocument = model;
      const floating = model.FindParent(LayoutFloatingWindow);
      if (floating) floating._values.ZIndex = Math.max(1, ...this.Layout.FloatingWindows.map(x => x.ZIndex)) + 1;
    }
    if (notify) this._emit('ActiveContentChanged', { OldContent: old?.Content ?? null, Content: model?.Content ?? null, Model: model });
  }
  _documentPane() {
    const focused = this.Layout.LastFocusedDocument?.Parent;
    return focused instanceof LayoutDocumentPane && !focused.FindParent(LayoutFloatingWindow) ? focused
      : [...this.Layout.RootPanel.Descendents()].find(x => x instanceof LayoutDocumentPane) || null;
  }
  _remember(model) {
    if (!model.Parent || model.IsHidden || model.IsAutoHidden || model.IsFloating) return;
    const parent = model.Parent;
    model.PreviousContainer = parent;
    model.PreviousContainerIndex = parent.IndexOf?.(model) ?? 0;
    model._return = { paneId: parent.Id, index: model.PreviousContainerIndex, side: this._sideFor(parent), kind: parent instanceof LayoutDocumentPane ? 'document' : 'anchorable' };
  }
  _sideFor(node) {
    for (let item = node; item && item.Parent && item.Parent !== this.Layout; item = item.Parent) {
      const parent = item.Parent;
      if (parent instanceof LayoutPanel || parent instanceof LayoutAnchorablePaneGroup) {
        const index = parent.Children.IndexOf(item);
        if (parent.Children.Count > 1) return parent.Orientation === 'Vertical' ? (index === 0 ? 'Top' : 'Bottom') : (index === 0 ? 'Left' : 'Right');
      }
    }
    return 'Right';
  }
  _subjectItems(subject) { return subject instanceof LayoutContent ? [subject] : subject?.Descendents ? contents(subject) : []; }
  AddDocument(document, pane = null) {
    if (!(document instanceof LayoutDocument)) document = new LayoutDocument(document);
    return this.Transaction('Add document', () => {
      this._assertUnique(document);
      pane ||= this._documentPane();
      const handled = this.LayoutUpdateStrategy?.BeforeInsertDocument?.(this.Layout, document, pane);
      if (!handled) { if (!pane) { pane = new LayoutDocumentPane(); this.Layout.RootPanel.Children.Add(pane); } pane.Children.Add(document); }
      if (document.Root !== this.Layout) throw new Error('BeforeInsertDocument returned true without inserting the document');
      this.LayoutUpdateStrategy?.AfterInsertDocument?.(this.Layout, document);
      this.Activate(document); return document;
    });
  }
  AddAnchorable(anchorable, strategy = AnchorableShowStrategy.Most) {
    if (!(anchorable instanceof LayoutAnchorable)) anchorable = new LayoutAnchorable(anchorable);
    return this.Transaction('Add tool window', () => {
      this._assertUnique(anchorable);
      let side = typeof strategy === 'string' ? strategy : (strategy & 2 ? 'Left' : strategy & 4 ? 'Right' : strategy & 16 ? 'Top' : strategy & 32 ? 'Bottom' : null);
      let pane = [...this.Layout.RootPanel.Descendents()].find(x => x instanceof LayoutAnchorablePane && (!side || this._sideFor(x) === side));
      const handled = this.LayoutUpdateStrategy?.BeforeInsertAnchorable?.(this.Layout, anchorable, pane || null);
      if (!handled) {
        if (pane) pane.Children.Add(anchorable);
        else this._dockRoot([anchorable], side || 'Right');
      }
      if (anchorable.Root !== this.Layout) throw new Error('BeforeInsertAnchorable returned true without inserting the anchorable');
      this.LayoutUpdateStrategy?.AfterInsertAnchorable?.(this.Layout, anchorable);
      this.Activate(anchorable); return anchorable;
    });
  }
  _assertUnique(model) {
    if (model.Manager && model.Manager !== this) throw new Error('Use TransferTo to move content between managers');
    for (const incoming of this._subjectItems(model)) {
      if (incoming.ContentId) {
        const existing = this.Find(incoming.ContentId);
        if (existing && existing !== incoming) throw new Error(`Duplicate ContentId: ${incoming.ContentId}`);
      }
    }
  }
  Float(subject, bounds = {}) {
    const list = this._subjectItems(subject);
    if (!list.length || !list.every(x => x.Root === this.Layout && x.CanFloat && x.CanMove && x.IsEnabled)) return false;
    if (subject instanceof LayoutDocumentPane || subject instanceof LayoutDocumentPaneGroup) return false;
    return this.Transaction('Float window', () => {
      if (subject instanceof LayoutFloatingWindow) {
        for (const name of ['FloatingLeft','FloatingTop','FloatingWidth','FloatingHeight']) if (bounds[name] != null) subject[name] = bounds[name];
        return subject;
      }
      for (const item of list) this._remember(item);
      const seed = list[0];
      const metrics = Object.fromEntries(['FloatingLeft','FloatingTop','FloatingWidth','FloatingHeight'].map(key => [key, bounds[key] ?? seed[key]]));
      metrics.FloatingWidth = Math.max(this.FloatingWindowMinWidth, metrics.FloatingWidth || 480);
      metrics.FloatingHeight = Math.max(this.FloatingWindowMinHeight, metrics.FloatingHeight || 320);
      let floating;
      if (subject instanceof LayoutDocument) floating = new LayoutDocumentFloatingWindow({ ...metrics, RootDocument: subject });
      else {
        let panel;
        if (subject instanceof LayoutAnchorablePaneGroup) panel = this._copyFloatingGroup(subject);
        else if (subject instanceof LayoutAnchorablePane) panel = new LayoutAnchorablePaneGroup({ Children: [this._copyFloatingGroup(subject)] });
        else panel = new LayoutAnchorablePaneGroup({ Children: [new LayoutAnchorablePane({ Children: list })] });
        floating = new LayoutAnchorableFloatingWindow({ ...metrics, RootPanel: panel });
      }
      this.Layout.FloatingWindows.Add(floating);
      this._autoHideModel = null; this.Activate(seed);
      this._emit('LayoutFloatingWindowControlCreated', { Model: floating });
      this._emit('ContentMoved', { Contents: list, Operation: 'Float' });
      return floating;
    });
  }
  _copyFloatingGroup(source) {
    // Keep the original panes as hidden return anchors. Content nodes are moved,
    // never cloned, so each item still has an unambiguous dock-back location.
    const options = {};
    for (const key of Object.keys(getSchema(source.constructor))) if (key !== 'Id' && !key.startsWith('Actual')) options[key] = source[key];
    options.Children = source instanceof LayoutAnchorablePane ? [...source.Children] : [...source.Children].map(child => this._copyFloatingGroup(child));
    return new source.constructor(options);
  }
  CanDockAt(subject, target, position = 'Center') {
    const list = this._subjectItems(subject);
    if (!list.length || !list.every(x => x.CanDock && x.CanMove && x.IsEnabled && (!x.Manager || x.Manager === this))) return false;
    if (!['Center','Left','Right','Top','Bottom'].includes(position)) return false;
    if (target === this.Layout || target === this.Layout.RootPanel) return position !== 'Center' && list.every(x => x instanceof LayoutAnchorable);
    if (!(target instanceof LayoutPane) || target.Root !== this.Layout) return false;
    if (list.includes(target) || target === subject || (subject?.Descendents && [...subject.Descendents()].includes(target))) return false;
    if (target instanceof LayoutAnchorablePane && list.some(x => !(x instanceof LayoutAnchorable))) return false;
    if (target instanceof LayoutDocumentPane && list.some(x => x instanceof LayoutAnchorable && !x.CanDockAsTabbedDocument)) return false;
    if (position === 'Center' && list.every(x => x.Parent === target) && !target.CanRepositionItems) return false;
    if (position !== 'Center' && target instanceof LayoutDocumentPane && target.Parent instanceof LayoutDocumentPaneGroup && !this.AllowMixedOrientation) {
      const orientation = ['Left','Right'].includes(position) ? 'Horizontal' : 'Vertical';
      if (target.Parent.Orientation !== orientation && target.Parent.ChildrenCount > 1) return false;
    }
    return true;
  }
  Dock(subject, target = null, position = 'Center', index = null) {
    const list = this._subjectItems(subject);
    if (!list.length || !list.every(x => x.CanDock && x.CanMove && x.IsEnabled && (!x.Manager || x.Manager === this))) return false;
    if (target) {
      if (!this.CanDockAt(subject, target, position)) return false;
      return this.Transaction(`Dock ${position.toLowerCase()}`, () => {
        let pane;
        if (target === this.Layout || target === this.Layout.RootPanel) pane = this._dockRoot(list, position, subject);
        else if (position === 'Center') {
          pane = target; let insertion = index == null ? target.Children.Count : Math.max(0, Math.min(target.Children.Count, index));
          for (const item of list) {
            const oldIndex = item.Parent === target ? target.IndexOf(item) : -1;
            if (oldIndex >= 0) { target.Children.Remove(item); if (oldIndex < insertion) insertion--; }
            target.Children.Insert(Math.min(insertion++, target.Children.Count), item);
          }
        } else {
          const Type = target instanceof LayoutDocumentPane ? LayoutDocumentPane : LayoutAnchorablePane;
          pane = new Type({ Children: list }); this._split(target, pane, position);
        }
        this._autoHideModel = null; this.Activate(list[0]); this._pruneEmptyPanes();
        this._emit('ContentMoved', { Contents: list, Target: pane, Position: position, Operation: 'Dock' }); return pane;
      });
    }
    return this.Transaction('Dock window', () => {
      for (const item of list) this._restoreItem(item);
      this.Activate(list[0]); this._pruneEmptyPanes(); this._autoHideModel = null;
      this._emit('ContentMoved', { Contents: list, Operation: 'Dock' }); return true;
    });
  }
  _restoreItem(item) {
    let pane = item.PreviousContainer?.Root === this.Layout ? item.PreviousContainer : this.FindById(item.PreviousContainerId || item._return?.paneId);
    if (!(pane instanceof LayoutPane) || pane.FindParent(LayoutFloatingWindow)) pane = null;
    if (item instanceof LayoutDocument && !(pane instanceof LayoutDocumentPane)) pane = null;
    if (!pane) {
      if (item instanceof LayoutDocument || item._return?.kind === 'document') pane = this._documentPane();
      else pane = this._dockRoot([], item._return?.side || 'Right');
    }
    if (!pane) { pane = new LayoutDocumentPane(); this.Layout.RootPanel.Children.Add(pane); }
    const index = Math.min(pane.Children.Count, Math.max(0, item.PreviousContainerIndex));
    pane.Children.Insert(index, item); return pane;
  }
  _split(target, pane, side) {
    const orientation = ['Left','Right'].includes(side) ? 'Horizontal' : 'Vertical';
    const before = side === 'Left' || side === 'Top';
    const parent = target.Parent;
    if (!parent?.Children?.Insert) throw new Error('The target pane is not in a splittable group');
    const compatible = parent instanceof LayoutPanel || (parent instanceof LayoutDocumentPaneGroup && pane instanceof LayoutDocumentPane) || (parent instanceof LayoutAnchorablePaneGroup && pane instanceof LayoutAnchorablePane);
    if (compatible && parent.Orientation === orientation) {
      parent.Children.Insert(parent.Children.IndexOf(target) + (before ? 0 : 1), pane);
      const key = orientation === 'Horizontal' ? 'DockWidth' : 'DockHeight';
      const size = target[key];
      if (size.IsStar) { target[key] = `${Math.max(.01, size.Value / 2)}*`; pane[key] = target[key]; }
      else { target[key] = Math.max(80, size.Value / 2); pane[key] = target[key]; }
    } else {
      const Group = target instanceof LayoutDocumentPane && pane instanceof LayoutDocumentPane ? LayoutDocumentPaneGroup : target instanceof LayoutAnchorablePane && pane instanceof LayoutAnchorablePane ? LayoutAnchorablePaneGroup : LayoutPanel;
      const group = new Group({ Orientation: orientation, DockWidth: target.DockWidth, DockHeight: target.DockHeight });
      parent.ReplaceChild(target, group);
      target.DockWidth = '1*'; target.DockHeight = '1*'; pane.DockWidth = '1*'; pane.DockHeight = '1*';
      group.Children.AddRange(before ? [pane, target] : [target, pane]);
    }
  }
  _dockRoot(list, side, subject = null) {
    if (!['Left','Right','Top','Bottom'].includes(side)) throw new TypeError('Invalid docking side');
    if (!list.every(x => x instanceof LayoutAnchorable)) throw new TypeError('Only anchorables dock at manager edges');
    const orientation = ['Left','Right'].includes(side) ? 'Horizontal' : 'Vertical', before = side === 'Left' || side === 'Top';
    let insert;
    if (subject instanceof LayoutAnchorablePaneGroup) insert = subject;
    else if (subject instanceof LayoutAnchorableFloatingWindow && subject.RootPanel) insert = subject.RootPanel;
    else insert = new LayoutAnchorablePane({ Children: list });
    insert.DockWidth = orientation === 'Horizontal' ? 260 : '1*';
    insert.DockHeight = orientation === 'Vertical' ? 210 : '1*';
    let root = this.Layout.RootPanel;
    if (root.Orientation !== orientation && root.ChildrenCount > 1) {
      const old = root; root = new LayoutPanel({ Orientation: orientation });
      this.Layout.RootPanel = root; root.Children.Add(old);
    } else root.Orientation = orientation;
    root.Children.Insert(before ? 0 : root.Children.Count, insert);
    return insert instanceof LayoutPane ? insert : [...insert.Descendents()].find(x => x instanceof LayoutPane);
  }
  DockAsDocument(item) {
    if (!(item instanceof LayoutContent) || item instanceof LayoutAnchorable && !item.CanDockAsTabbedDocument) return false;
    const pane = this._documentPane(); return pane ? this.Dock(item, pane, 'Center') : false;
  }
  NewTabGroup(item, orientation = 'Horizontal') {
    if (!(item?.Parent instanceof LayoutDocumentPane) || item.Parent.Children.Count < 2) return false;
    return this.Dock(item, item.Parent, orientation === 'Horizontal' ? 'Bottom' : 'Right');
  }
  MoveToTabGroup(item, direction = 1) {
    const panes = [...this.Layout.RootPanel.Descendents()].filter(x => x instanceof LayoutDocumentPane);
    const target = panes[panes.indexOf(item.Parent) + direction];
    return target ? this.Dock(item, target) : false;
  }
  _pruneEmptyPanes() {
    const protectedIds = new Set(contents(this.Layout).filter(x => x.IsFloating || x.IsAutoHidden || x.IsHidden).map(x => x.PreviousContainerId));
    const docs = [...this.Layout.RootPanel.Descendents()].filter(x => x instanceof LayoutDocumentPane);
    let count = docs.length;
    for (const pane of docs) if (!pane.Children.Count && count > 1 && !protectedIds.has(pane.Id)) { pane.Parent.RemoveChild(pane); count--; }
    this.Layout.CollectGarbage();
  }
  Hide(item, cancelable = true) {
    if (!(item instanceof LayoutAnchorable) || !item.CanHide || item.IsHidden || item.Root !== this.Layout) return false;
    const args = new CancelEventArgs({ Model: item, Anchorable: item });
    if (cancelable) { item.Hiding.emit(item, args); this._emit('AnchorableHiding', args); if (args.Cancel) return false; }
    return this.Transaction('Hide tool window', () => {
      this._remember(item); this.Layout.Hidden.Add(item);
      if (this._autoHideModel === item) this._autoHideModel = null;
      item.IsVisibleChanged.emit(item, { IsVisible: false });
      this._emit('AnchorableHidden', { Anchorable: item }); return true;
    });
  }
  Show(item) {
    if (!(item instanceof LayoutAnchorable) || item.Root !== this.Layout) return false;
    if (!item.IsHidden) { this.Activate(item); return true; }
    return this.Transaction('Show tool window', () => {
      this._restoreItem(item); item.IsVisibleChanged.emit(item, { IsVisible: true }); this.Activate(item); return true;
    });
  }
  ToggleAutoHide(subject) {
    const group = subject instanceof LayoutAnchorGroup ? subject : subject?.IsAutoHidden ? subject.Parent : null;
    if (group) {
      const list = [...group.Children];
      if (group.Root !== this.Layout || !list.every(item => item.CanAutoHide && item.IsEnabled)) return false;
      return this.Transaction('Pin tool window', () => {
        for (const item of list) { this._restoreItem(item); item.IsAutoHiddenChanged.emit(item, { IsAutoHidden: false }); }
        this._autoHideModel = null; if (list[0]) this.Activate(list[0]); return true;
      });
    }
    const pane = subject instanceof LayoutAnchorablePane ? subject : subject?.Parent;
    if (!(pane instanceof LayoutAnchorablePane) || pane.FindParent(LayoutFloatingWindow) || !pane.Children.Count || !pane.Children.every(x => x.CanAutoHide && x.IsEnabled)) return false;
    return this.Transaction('Auto-hide tool group', () => {
      const side = this._sideFor(pane), list = [...pane.Children];
      const anchorGroup = new LayoutAnchorGroup({ PreviousContainer: pane, PreviousContainerId: pane.Id });
      for (const item of list) this._remember(item);
      this.Layout[`${side}Side`].Children.Add(anchorGroup);
      for (const item of list) { anchorGroup.Children.Add(item); item.IsAutoHiddenChanged.emit(item, { IsAutoHidden: true }); }
      if (list.includes(this.ActiveModel)) this._activate(null, true);
      this._autoHideModel = null; return true;
    });
  }
  ShowAutoHideWindow(item) {
    if (!(item instanceof LayoutAnchorable) || !item.IsAutoHidden || !item.IsEnabled) return false;
    this._autoHideModel = item; this._view?.requestRender(); return true;
  }
  HideAutoHideWindow() { this._autoHideModel = null; this._view?.requestRender(); }
  _approveClose(item) {
    if (!(item instanceof LayoutContent) || !item.CanClose || item.Root !== this.Layout) return false;
    const args = new CancelEventArgs({ Model: item, Document: item instanceof LayoutDocument ? item : undefined, Anchorable: item instanceof LayoutAnchorable ? item : undefined });
    item.Closing.emit(item, args);
    this._emit(item instanceof LayoutDocument ? 'DocumentClosing' : 'AnchorableClosing', args); return !args.Cancel;
  }
  _removeClosed(item) {
    this._registry.set(item.ContentId, item); item.Parent?.RemoveChild(item);
    if (this._autoHideModel === item) this._autoHideModel = null;
    item._setActive(false); this._removeFromSource(item);
    item.Closed.emit(item, {});
    this._emit(item instanceof LayoutDocument ? 'DocumentClosed' : 'AnchorableClosed', { Model: item, Document: item instanceof LayoutDocument ? item : undefined, Anchorable: item instanceof LayoutAnchorable ? item : undefined });
  }
  Close(item) {
    if (!this._approveClose(item)) return false;
    return this.Transaction('Close content', () => { this._removeClosed(item); this._pruneEmptyPanes(); return true; });
  }
  CloseAll(except = null, pane = null) {
    const list = pane ? [...pane.Children] : contents(this.Layout).filter(x => x instanceof LayoutDocument);
    let closed = 0;
    this.Transaction('Close documents', () => { for (const item of list) if (item !== except && this.Close(item)) closed++; }); return closed;
  }
  CloseFloatingWindow(floating) {
    const list = contents(floating), actions = [];
    for (const item of list) {
      if (item instanceof LayoutAnchorable && item.CanHide) {
        const args = new CancelEventArgs({ Model: item, Anchorable: item }); item.Hiding.emit(item, args); this._emit('AnchorableHiding', args);
        if (args.Cancel) return false; actions.push([item, 'hide']);
      } else { if (!this._approveClose(item)) return false; actions.push([item, 'close']); }
    }
    return this.Transaction('Close floating window', () => {
      for (const [item, action] of actions) { if (action === 'hide') this.Hide(item, false); else this._removeClosed(item); }
      this.Layout.FloatingWindows.Remove(floating); this._emit('LayoutFloatingWindowControlClosed', { Model: floating }); return true;
    });
  }
  PopOut(item) { return this._view?.popOut(item) || null; }
  FocusNextPane(reverse = false) {
    const panes = [...this.Layout.Descendents()].filter(x => x instanceof LayoutPane && x.ChildrenCount && x.IsVisible);
    if (!panes.length) return;
    let index = panes.indexOf(this.ActiveModel?.Parent); index = (index + (reverse ? -1 : 1) + panes.length) % panes.length;
    this.Activate(panes[index].SelectedContent || panes[index].Children[0]); this._view?.focusContent(this.ActiveModel);
  }
  ShowNavigator() { this._view?.showNavigator(); }
  ShowMenu(entries, x, y, title) { this._view?.showMenu(entries, x, y, title); }
  ShowContextMenu(model, x, y) { this._view?.openContextMenu(model, x, y); }
  SaveLayout(format = 'json') { return format.toLowerCase() === 'xml' ? new XmlLayoutSerializer(this).Serialize() : new JsonLayoutSerializer(this).Serialize(); }
  LoadLayout(text, format = null) {
    format ||= typeof text === 'string' && text.trimStart().startsWith('<') ? 'xml' : 'json';
    return format === 'xml' ? new XmlLayoutSerializer(this).Deserialize(text) : new JsonLayoutSerializer(this).Deserialize(text);
  }
  SaveToStorage(key = this.StorageKey) {
    if (!key) return false;
    try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(key, this.SaveLayout()); return true; }
    catch (error) { this._emit('Error', { Error: error, Operation: 'Save storage' }); return false; }
  }
  LoadFromStorage(key = this.StorageKey) {
    if (!key) return false;
    try { if (typeof localStorage === 'undefined') return false; const value = localStorage.getItem(key); if (!value) return false; this.LoadLayout(value); return true; }
    catch (error) { this._emit('Error', { Error: error, Operation: 'Load storage' }); return false; }
  }
  ReleaseContent(contentId) {
    if (this.Find(contentId)) return false;
    this._registry.delete(contentId); for (const [model,item] of this._items) if (model.ContentId === contentId) { item.Dispose(); this._items.delete(model); } this._view?.releaseContent(contentId); return true;
  }
  _bindSource(kind, source) {
    if (source != null && !source[Symbol.iterator]) throw new TypeError('A source must be iterable');
    const old = this._sources.get(kind); old?.unsubscribe?.();
    if (old) this.Transaction('Replace source', () => { for (const model of old.map.values()) if (model.Root === this.Layout) model.Parent.RemoveChild(model); });
    const binding = { source, map: new Map(), unsubscribe: null };
    this._sources.set(kind, binding);
    if (source?.CollectionChanged instanceof EventSignal) binding.unsubscribe = source.CollectionChanged.add(() => this._syncSource(kind));
    this._syncSource(kind);
  }
  RefreshSources() { for (const kind of this._sources.keys()) this._syncSource(kind); }
  _syncSource(kind) {
    const binding = this._sources.get(kind); if (!binding || binding.syncing) return;
    binding.syncing = true;
    const previousMap = new Map(binding.map);
    try {
      this.Transaction('Synchronize source', () => {
        const values = [...(binding.source || [])];
        if (new Set(values).size !== values.length) throw new Error('Source entries must have distinct identities');
        for (const [value, original] of binding.map) if (!values.includes(value)) {
          const model = this.Find(original.ContentId) || original;
          if (model.Root === this.Layout) model.Parent.RemoveChild(model); binding.map.delete(value);
        }
        for (const value of values) {
          if (binding.map.has(value)) {
            const original = binding.map.get(value), live = this.Find(original.ContentId);
            if (live) {
              binding.map.set(value, live);
              if (!(value instanceof LayoutContent)) {
                const title = value?.Title ?? value?.title ?? value?.name;
                if (title != null) live.Title = String(title);
                const style = this.LayoutItemContainerStyleSelector?.SelectStyle?.(value, live) || (typeof this.LayoutItemContainerStyleSelector === 'function' ? this.LayoutItemContainerStyleSelector(value, live) : null) || this.LayoutItemContainerStyle;
                if (style && typeof style === 'object') for (const [key, setting] of Object.entries(style)) if (key in live) live[key] = typeof setting === 'function' ? setting(value, live) : setting;
              }
            }
            continue;
          }
          const Type = kind === 'document' ? LayoutDocument : LayoutAnchorable;
          const model = value instanceof Type ? value : new Type({
            ContentId: String(value?.ContentId ?? value?.id ?? uid(kind)), Title: String(value?.Title ?? value?.title ?? value?.name ?? value), Content: value
          });
          const style = this.LayoutItemContainerStyleSelector?.SelectStyle?.(value, model) || (typeof this.LayoutItemContainerStyleSelector === 'function' ? this.LayoutItemContainerStyleSelector(value, model) : null) || this.LayoutItemContainerStyle;
          if (style && typeof style === 'object') for (const [key, setting] of Object.entries(style)) if (key in model) model[key] = typeof setting === 'function' ? setting(value, model) : setting;
          binding.map.set(value, model);
          if (kind === 'document') this.AddDocument(model); else this.AddAnchorable(model);
        }
      });
    } catch (error) { binding.map = previousMap; throw error; } finally { binding.syncing = false; }
  }
  _removeFromSource(item) {
    for (const binding of this._sources.values()) for (const [value, model] of binding.map) if (model.ContentId === item.ContentId) {
      binding.syncing = true;
      try {
        if (binding.source instanceof ObservableCollection) binding.source.Remove(value);
        else if (Array.isArray(binding.source)) { const i = binding.source.indexOf(value); if (i >= 0) binding.source.splice(i, 1); }
        binding.map.delete(value);
      } finally { binding.syncing = false; }
    }
  }
  TransferTo(destination, item, target = null, position = 'Center') {
    if (!(destination instanceof DockingManager) || destination === this || item.Root !== this.Layout) return false;
    if (!item.CanMove || !item.CanDock || destination.Find(item.ContentId)) return false;
    const a = snapshot(this.Layout), b = snapshot(destination.Layout);
    this._depth++; destination._depth++;
    try {
      item.Parent.RemoveChild(item); item.PreviousContainer = null; item._return = null;
      destination._registry.set(item.ContentId, item);
      let result;
      if (target) result = destination.Dock(item, target, position);
      else result = item instanceof LayoutDocument ? destination.AddDocument(item) : destination.AddAnchorable(item);
      if (!result) throw new Error('Destination rejected the transfer');
      this._normalize(); destination._normalize();
      this._depth--; destination._depth--;
      this._commit(a, 'Transfer content'); destination._commit(b, 'Receive content'); return true;
    } catch (error) {
      this._depth--; destination._depth--;
      this._restoreHistory(a); destination._restoreHistory(b); throw error;
    }
  }
}
properties(DockingManager, {
  AllowMixedOrientation: { default: false, coerce: boolean }, Theme: { default: 'dark' },
  GridSplitterWidth: { default: 5, coerce: positive }, GridSplitterHeight: { default: 5, coerce: positive },
  FloatingWindowMinWidth: { default: 220, coerce: positive }, FloatingWindowMinHeight: { default: 140, coerce: positive },
  ShowSystemMenu: { default: true, coerce: boolean }, AllowKeyboardNavigation: { default: true, coerce: boolean },
  AutoHideDelay: { default: 350, coerce: positive }, AutoHideCloseDelay: { default: 500, coerce: positive },
  EnableHistory: { default: true, coerce: boolean }, HistoryLimit: { default: 100, coerce: positive },
  StorageKey: { default: null }, AutoSave: { default: true, coerce: boolean }, RestoreOnLoad: { default: true, coerce: boolean },
  FlowDirection: { default: 'LeftToRight', validate: x => ['LeftToRight','RightToLeft'].includes(x) },
  LayoutUpdateStrategy: { default: null },
  LayoutItemTemplate: { default: null }, LayoutItemTemplateSelector: { default: null },
  DocumentHeaderTemplate: { default: null }, DocumentHeaderTemplateSelector: { default: null },
  AnchorableHeaderTemplate: { default: null }, AnchorableHeaderTemplateSelector: { default: null },
  DocumentTitleTemplate: { default: null }, DocumentTitleTemplateSelector: { default: null },
  AnchorableTitleTemplate: { default: null }, AnchorableTitleTemplateSelector: { default: null },
  DocumentPaneMenuItemHeaderTemplate: { default: null }, DocumentPaneMenuItemHeaderTemplateSelector: { default: null },
  IconContentTemplate: { default: null }, IconContentTemplateSelector: { default: null },
  DocumentPaneTemplate: { default: null }, AnchorablePaneTemplate: { default: null },
  AnchorGroupTemplate: { default: null }, AnchorSideTemplate: { default: null }, AnchorTemplate: { default: null },
  DocumentPaneControlStyle: { default: null }, AnchorablePaneControlStyle: { default: null },
  LayoutItemContainerStyle: { default: null }, LayoutItemContainerStyleSelector: { default: null },
  DocumentContextMenu: { default: null }, AnchorableContextMenu: { default: null },
  Strings: { default: null }
});
for (const key of ['Layout','ActiveContent','DocumentsSource','AnchorablesSource']) Object.defineProperty(DockingManager, `${key}Property`, { value: Object.freeze({ Name: key, OwnerType: 'DockingManager' }) });
