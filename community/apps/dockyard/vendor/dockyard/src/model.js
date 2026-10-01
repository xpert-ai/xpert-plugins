import { ObservableObject, ObservableCollection, EventSignal, CancelEventArgs, properties, getSchema, GridLength, finite, positive, boolean, uid } from './events.js';
export { ObservableCollection, GridLength } from './events.js';
export const AnchorSide = Object.freeze({ Left: 'Left', Top: 'Top', Right: 'Right', Bottom: 'Bottom' });
export const AnchorableShowStrategy = Object.freeze({ Most: 1, Left: 2, Right: 4, Top: 16, Bottom: 32 });

export class LayoutElement extends ObservableObject {
  constructor() { super(); this._values.Id = uid(); this._parent = null; }
  get Parent() { return this._parent; }
  get Root() {
    let node = this;
    while (node && !(node instanceof LayoutRoot)) node = node.Parent;
    return node || null;
  }
  get Manager() { return this.Root?._manager || null; }
  get Children() { return []; }
  get ChildrenCount() { return this.Children.length; }
  *Descendents() { for (const child of this.Children) { yield child; yield* child.Descendents(); } }
  *Descendants() { yield* this.Descendents(); }
  FindParent(type) {
    let node = this.Parent;
    while (node) { if (typeof type === 'string' ? node.constructor.name === type : node instanceof type) return node; node = node.Parent; }
    return null;
  }
  FindRoot() { return this.Root; }
  _validateProperty(name, value) {
    if (!this.Root || !['Id','ContentId'].includes(name) || value == null) return;
    const all = [this.Root, ...this.Root.Descendents()];
    if (all.some(node => node !== this && node[name] === value)) throw new Error(`Duplicate ${name}: ${value}`);
  }
  _willChange(name) { this.Manager?._modelWillChange(this, name); }
  _didChange(name, args) { this.Manager?._modelDidChange(this, name, args); }
  _collectionChanged(role, args) {
    const root = this.Root;
    for (const node of args.OldItems) if (args.Action !== 'Move') root?.ElementRemoved.emit(root, { Element: node });
    for (const node of args.NewItems) if (args.Action !== 'Move') root?.ElementAdded.emit(root, { Element: node });
    this.ChildrenCollectionChanged?.emit(this, args);
    this.ChildrenTreeChanged?.emit(this, { Change: args, TreeChange: args.Action });
    this._didChange(role, args);
  }
  _validateChild(item) {
    if (!(item instanceof LayoutElement)) throw new TypeError('Layout children must be LayoutElement instances');
    for (let node = this; node; node = node.Parent) if (node === item) throw new Error('Layout cycles are not allowed');
    const targetManager = this.Manager, sourceManager = item.Manager;
    if (targetManager && sourceManager && targetManager !== sourceManager) throw new Error('Use TransferTo() to move content between managers');
    const root = this.Root;
    if (root && item.Root !== root) {
      const incoming = [item, ...item.Descendents()], existing = [root, ...root.Descendents()];
      const ids = new Set(existing.map(node => node.Id)), contentIds = new Set(existing.filter(node => node instanceof LayoutContent).map(node => node.ContentId).filter(id => id != null));
      for (const node of incoming) {
        if (ids.has(node.Id)) throw new Error(`Duplicate Id: ${node.Id}`); ids.add(node.Id);
        if (node instanceof LayoutContent && node.ContentId != null) { if (contentIds.has(node.ContentId)) throw new Error(`Duplicate ContentId: ${node.ContentId}`); contentIds.add(node.ContentId); }
      }
    }
  }
  _init(options = {}) {
    if (options instanceof LayoutElement) options = { Children: [options] };
    if (Array.isArray(options)) options = { Children: options };
    if (!options || typeof options !== 'object') throw new TypeError('Layout options must be an object');
    const late = [];
    for (const [key, value] of Object.entries(options)) {
      if (key.startsWith('_') || ['__proto__', 'prototype', 'constructor', 'Parent', 'Manager', 'Root'].includes(key)) throw new Error(`Invalid option ${key}`);
      if (['Children', 'FloatingWindows', 'Hidden'].includes(key)) { this[key].AddRange(value); }
      else if (key === 'IsActive' || key === 'IsSelected' || key === 'SelectedContentIndex') late.push([key, value]);
      else this[key] = value;
    }
    for (const [key, value] of late) this[key] = value;
    return this;
  }
  toString() { return `${this.constructor.name}(${this.Title || this.Id})`; }
}

properties(LayoutElement, { Id: { default: null, coerce: value => String(value), validate: value => value.length > 0 && value.length <= 512 } });

export class LayoutGroupBase extends LayoutElement {
  constructor() {
    super(); this._children = new ObservableCollection([], this);
    this.ChildrenCollectionChanged = new EventSignal(); this.ChildrenTreeChanged = new EventSignal();
  }
  get Children() { return this._children; }
  get ChildrenCount() { return this.Children.Count; }
  IndexOf(item) { return this.Children.IndexOf(item); }
  InsertChildAt(index, item) { this.Children.Insert(index, item); }
  RemoveChild(item) { return this.Children.Remove(item); }
  RemoveChildAt(index) { return this.Children.RemoveAt(index); }
  ReplaceChild(old, replacement) { const i = this.Children.IndexOf(old); if (i < 0) throw new Error('Child not found'); this.Children.Set(i, replacement); }
  MoveChild(oldIndex, newIndex) { this.Children.Move(oldIndex, newIndex); }
  get IsVisible() { return this.Children.some(x => x.IsVisible); }
  ComputeVisibility() { return this.IsVisible; }
}
export class LayoutGroup extends LayoutGroupBase {}
export class LayoutPositionableGroup extends LayoutGroup {}
properties(LayoutPositionableGroup, {
  DockWidth: { default: '1*', coerce: GridLength.Parse }, DockHeight: { default: '1*', coerce: GridLength.Parse },
  DockMinWidth: { default: 80, coerce: positive }, DockMinHeight: { default: 48, coerce: positive },
  DockMaxWidth: { default: 1000000, coerce: positive }, DockMaxHeight: { default: 1000000, coerce: positive },
  FloatingLeft: { default: 60, coerce: finite }, FloatingTop: { default: 60, coerce: finite },
  FloatingWidth: { default: 480, coerce: positive }, FloatingHeight: { default: 320, coerce: positive },
  IsMaximized: { default: false, coerce: boolean },
  ActualWidth: { default: 0, coerce: positive, serialize: false }, ActualHeight: { default: 0, coerce: positive, serialize: false },
  ResizableAbsoluteDockWidth: { default: true, coerce: boolean }, ResizableAbsoluteDockHeight: { default: true, coerce: boolean }
});
export class LayoutPanel extends LayoutPositionableGroup {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) {
    super._validateChild(item);
    if (!(item instanceof LayoutPositionableGroup)) throw new TypeError('A LayoutPanel accepts panes and pane groups, not content');
  }
}
properties(LayoutPanel, { Orientation: { default: 'Horizontal', validate: x => ['Horizontal', 'Vertical'].includes(x) } });
export class LayoutAnchorablePaneGroup extends LayoutPositionableGroup {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) {
    super._validateChild(item);
    if (!(item instanceof LayoutAnchorablePane || item instanceof LayoutAnchorablePaneGroup)) throw new TypeError('Anchorable groups accept anchorable panes/groups');
  }
}
properties(LayoutAnchorablePaneGroup, { Orientation: { default: 'Horizontal', validate: x => ['Horizontal', 'Vertical'].includes(x) } });
export class LayoutDocumentPaneGroup extends LayoutPositionableGroup {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) {
    super._validateChild(item);
    if (!(item instanceof LayoutDocumentPane || item instanceof LayoutDocumentPaneGroup)) throw new TypeError('Document groups accept document panes/groups');
  }
}
properties(LayoutDocumentPaneGroup, { Orientation: { default: 'Horizontal', validate: x => ['Horizontal', 'Vertical'].includes(x) } });

export class LayoutContent extends LayoutElement {
  constructor() {
    super();
    for (const name of ['IsSelectedChanged', 'IsActiveChanged', 'Closing', 'Closed']) this[name] = new EventSignal();
    this._selected = false; this._active = false;
    this._previous = null; this._previousId = null; this._return = null;
  }
  get IsSelected() { return this._selected; }
  set IsSelected(value) {
    value = boolean(value);
    if (this._selected === value) return;
    if (this.Parent instanceof LayoutPane) {
      if (value) this.Parent.SelectedContentIndex = this.Parent.IndexOf(this);
      else if (this.Parent.SelectedContent === this) this.Parent.SelectedContentIndex = -1;
    } else this._setSelected(value);
  }
  _setSelected(value) {
    if (value === this._selected) return;
    this._selected = value;
    this.IsSelectedChanged.emit(this, {});
    this.PropertyChanged.emit(this, { PropertyName: 'IsSelected', NewValue: value });
    this._didChange('IsSelected');
  }
  get IsActive() { return this._active; }
  set IsActive(value) {
    value = boolean(value);
    if (value === this._active) return;
    if (this.Manager) { if (value) this.Manager.Activate(this); else if (this.Root.ActiveContent === this) this.Manager.Activate(null); }
    else this._setActive(value);
  }
  _setActive(value) {
    if (this._active === value) return;
    this._active = value;
    if (value) { this.IsSelected = true; this._values.LastActivationTimeStamp = new Date().toISOString(); }
    this.IsActiveChanged.emit(this, {});
    this.PropertyChanged.emit(this, { PropertyName: 'IsActive', NewValue: value });
  }
  get IsFloating() { return !!this.FindParent(LayoutFloatingWindow); }
  get IsLastFocusedDocument() { return this.Root?.LastFocusedDocument === this; }
  get IsVisible() { return !!this.Parent && !(this.Parent instanceof LayoutRoot && this.Parent.Hidden.Contains(this)); }
  get PreviousContainer() { return this._previous; }
  set PreviousContainer(value) { this._previous = value; this._previousId = value?.Id || null; }
  get PreviousContainerId() { return this._previous?.Id || this._previousId; }
  set PreviousContainerId(value) { this._previousId = value; }
  get IsDocked() { return this.IsVisible && !this.IsFloating && !this.IsAutoHidden; }
  get IsAutoHidden() { return false; }
  Activate() { if (this.Manager) this.Manager.Activate(this); else this._setActive(true); return this; }
  Float() { return this.Manager ? this.Manager.Float(this) : false; }
  Dock() { return this.Manager ? this.Manager.Dock(this) : false; }
  DockAsDocument() { return this.Manager ? this.Manager.DockAsDocument(this) : false; }
  Close() {
    if (this.Manager) return this.Manager.Close(this);
    if (!this.CanClose) return false;
    const args = new CancelEventArgs(); this.Closing.emit(this, args);
    if (args.Cancel) return false;
    this.Parent?.RemoveChild(this); this.Closed.emit(this, {}); return true;
  }
}
properties(LayoutContent, {
  Title: { default: '', coerce: x => String(x ?? '') },
  ContentId: { default: null, coerce: x => x == null ? null : String(x) },
  Content: { default: null, serialize: false },
  IconSource: { default: null }, ToolTip: { default: null }, Description: { default: '' },
  CanClose: { default: true, coerce: boolean }, CanFloat: { default: true, coerce: boolean },
  CanMove: { default: true, coerce: boolean }, CanDock: { default: true, coerce: boolean },
  IsEnabled: { default: true, coerce: boolean }, IsModified: { default: false, coerce: boolean },
  IsPinned: { default: false, coerce: boolean },
  FloatingLeft: { default: 60, coerce: finite }, FloatingTop: { default: 60, coerce: finite },
  FloatingWidth: { default: 480, coerce: positive }, FloatingHeight: { default: 320, coerce: positive },
  IsMaximized: { default: false, coerce: boolean },
  PreviousContainerIndex: { default: -1, coerce: finite },
  LastActivationTimeStamp: { default: null },
  UserData: { default: null }
});
export class LayoutDocument extends LayoutContent {
  constructor(options = {}) { super(); this._init(options); }
}
export class LayoutAnchorable extends LayoutContent {
  constructor(options = {}) {
    super();
    this.Hiding = new EventSignal(); this.IsVisibleChanged = new EventSignal(); this.IsAutoHiddenChanged = new EventSignal();
    this._init(options);
  }
  get IsAutoHidden() { return this.Parent instanceof LayoutAnchorGroup; }
  get IsHidden() { return !!this.Root?.Hidden.Contains(this); }
  get IsVisible() { return super.IsVisible; }
  set IsVisible(value) { if (value) this.Show(); else this.Hide(); }
  Hide(cancelable = true) { return this.Manager ? this.Manager.Hide(this, cancelable) : false; }
  Show() { return this.Manager ? this.Manager.Show(this) : false; }
  ToggleAutoHide() { return this.Manager ? this.Manager.ToggleAutoHide(this) : false; }
  AddToLayout(manager, strategy = AnchorableShowStrategy.Most) { return manager.AddAnchorable(this, strategy); }
}
properties(LayoutAnchorable, {
  CanHide: { default: true, coerce: boolean }, CanAutoHide: { default: true, coerce: boolean },
  CanDockAsTabbedDocument: { default: true, coerce: boolean },
  AutoHideWidth: { default: 280, coerce: positive }, AutoHideHeight: { default: 220, coerce: positive },
  AutoHideMinWidth: { default: 100, coerce: positive }, AutoHideMinHeight: { default: 80, coerce: positive }
});

export class LayoutPane extends LayoutPositionableGroup {
  constructor() { super(); this._selectedIndex = -1; }
  get SelectedContentIndex() { return this._selectedIndex; }
  set SelectedContentIndex(value) {
    value = Number(value);
    if (!Number.isInteger(value) || value < -1 || value >= this.Children.Count) throw new RangeError('SelectedContentIndex out of range');
    if (value === this._selectedIndex && this.Children.every((c, i) => c.IsSelected === (i === value))) return;
    this._selectedIndex = value;
    this.Children.forEach((c, i) => c._setSelected(i === value));
    this.PropertyChanged.emit(this, { PropertyName: 'SelectedContentIndex', NewValue: value });
    this._didChange('SelectedContentIndex');
  }
  get SelectedContent() { return this.Children[this.SelectedContentIndex] || null; }
  get IsActive() { return this.Children.some(x => x.IsActive); }
  get CanClose() { return this.Children.every(x => x.CanClose); }
  get CanHide() { return this.Children.every(x => x.CanHide); }
  get CanAutoHide() { return this.Children.every(x => x.CanAutoHide); }
  get IsDirectlyHostedInFloatingWindow() { return this.Parent instanceof LayoutFloatingWindow || (this.Parent?.Parent instanceof LayoutFloatingWindow && this.Parent.ChildrenCount === 1); }
  _collectionChanged(role, args) {
    if (role === 'Children') {
      let selected = this.Children.findIndex(x => x.IsSelected);
      if (selected < 0 && this.Children.Count) selected = Math.max(0, Math.min(this._selectedIndex, this.Children.Count - 1));
      this._selectedIndex = -2;
      this.SelectedContentIndex = selected;
    }
    super._collectionChanged(role, args);
  }
  SetNextSelectedIndex() { if (this.Children.Count) this.SelectedContentIndex = (this.SelectedContentIndex + 1) % this.Children.Count; }
}
properties(LayoutPane, {
  CanRepositionItems: { default: true, coerce: boolean }, ShowHeader: { default: true, coerce: boolean }, Name: { default: '' }
});
export class LayoutDocumentPane extends LayoutPane {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) { super._validateChild(item); if (!(item instanceof LayoutContent)) throw new TypeError('Document panes accept documents or anchorables'); }
  get IsVisible() { return true; }
}
export class LayoutAnchorablePane extends LayoutPane {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) { super._validateChild(item); if (!(item instanceof LayoutAnchorable)) throw new TypeError('Anchorable panes accept only anchorables'); }
}
export class LayoutAnchorGroup extends LayoutGroup {
  constructor(options = {}) { super(); this.PreviousContainer = null; this.PreviousContainerId = null; this._init(options); }
  _validateChild(item) { super._validateChild(item); if (!(item instanceof LayoutAnchorable)) throw new TypeError('Auto-hide groups accept only anchorables'); }
}
export class LayoutAnchorSide extends LayoutGroup {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) { super._validateChild(item); if (!(item instanceof LayoutAnchorGroup)) throw new TypeError('Sides accept LayoutAnchorGroup children'); }
}
properties(LayoutAnchorSide, { Side: { default: 'Left', validate: x => Object.hasOwn(AnchorSide, x) } });

export class LayoutFloatingWindow extends LayoutGroup {
  get IsValid() { return this.ChildrenCount > 0; }
  get IsVisible() { return this.IsValid; }
  get IsSinglePane() { return [...this.Descendents()].filter(x => x instanceof LayoutPane).length === 1; }
  get SinglePane() { return this.IsSinglePane ? [...this.Descendents()].find(x => x instanceof LayoutPane) : null; }
  get RootPanel() { return this.Children[0] || null; }
  set RootPanel(value) { if (this.RootPanel === value) return; if (value) { if (this.ChildrenCount) this.Children.Set(0, value); else this.Children.Add(value); } else this.Children.Clear(); }
}
properties(LayoutFloatingWindow, {
  FloatingLeft: { default: 60, coerce: finite }, FloatingTop: { default: 60, coerce: finite },
  FloatingWidth: { default: 480, coerce: positive }, FloatingHeight: { default: 320, coerce: positive },
  IsMaximized: { default: false, coerce: boolean }, ZIndex: { default: 1, coerce: finite }
});
export class LayoutAnchorableFloatingWindow extends LayoutFloatingWindow {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item, role, replacing = false) {
    super._validateChild(item);
    if (!(item instanceof LayoutAnchorablePaneGroup || item instanceof LayoutAnchorablePane)) throw new TypeError('Anchorable floating windows accept anchorable pane groups');
    if (!replacing && this.ChildrenCount && !this.Children.Contains(item)) throw new Error('A floating window has only one root');
  }
}
export class LayoutDocumentFloatingWindow extends LayoutFloatingWindow {
  constructor(options = {}) { super(); this._init(options); }
  get RootDocument() {
    const root = this.Children[0];
    return root instanceof LayoutDocument ? root : [...this.Descendents()].find(x => x instanceof LayoutDocument) || null;
  }
  set RootDocument(value) {
    if (value != null && !(value instanceof LayoutDocument)) throw new TypeError('RootDocument must be a LayoutDocument');
    this.RootPanel = value;
  }
  _validateChild(item, role, replacing = false) {
    super._validateChild(item);
    if (!(item instanceof LayoutDocument || item instanceof LayoutDocumentPane || item instanceof LayoutDocumentPaneGroup)) throw new TypeError('Document floating windows accept document content/panes');
    if (!replacing && this.ChildrenCount && !this.Children.Contains(item)) throw new Error('A floating window has only one root');
  }
}

export class LayoutRoot extends LayoutElement {
  constructor(options = {}) {
    super(); this._manager = null;
    this.Updated = new EventSignal(); this.ElementAdded = new EventSignal(); this.ElementRemoved = new EventSignal();
    this._rootPanel = null; this._sides = Object.create(null);
    this.FloatingWindows = new ObservableCollection([], this, 'FloatingWindows');
    this.Hidden = new ObservableCollection([], this, 'Hidden');
    this._activeContent = null; this._lastFocusedDocument = null;
    this.RootPanel = new LayoutPanel();
    for (const side of Object.keys(AnchorSide)) this[`${side}Side`] = new LayoutAnchorSide({ Side: side });
    this._init(options instanceof LayoutPanel ? { RootPanel: options } : options);
  }
  get RootPanel() { return this._rootPanel; }
  set RootPanel(value) {
    if (!(value instanceof LayoutPanel)) throw new TypeError('RootPanel must be a LayoutPanel');
    if (value === this._rootPanel) return;
    this._validateChild(value, 'RootPanel'); this._willChange('RootPanel');
    value.Parent?.RemoveChild(value);
    if (this._rootPanel) this._rootPanel._parent = null;
    this._rootPanel = value; value._parent = this; this._didChange('RootPanel');
  }
  get Children() { return [this.RootPanel, ...Object.values(this._sides), ...this.FloatingWindows, ...this.Hidden].filter(Boolean); }
  get ActiveContent() { return this._activeContent; }
  set ActiveContent(value) {
    if (this._manager) this._manager.Activate(value);
    else { this._activeContent?._setActive(false); this._activeContent = value; value?._setActive(true); }
  }
  get LastFocusedDocument() { return this._lastFocusedDocument; }
  get IsVisible() { return true; }
  RemoveChild(item) {
    if (this.FloatingWindows.Contains(item)) return this.FloatingWindows.Remove(item);
    if (this.Hidden.Contains(item)) return this.Hidden.Remove(item);
    if (this.RootPanel === item) { this.RootPanel = new LayoutPanel(); return true; }
    for (const side of Object.keys(AnchorSide)) if (this[`${side}Side`] === item) { this[`${side}Side`] = new LayoutAnchorSide({ Side: side }); return true; }
    return false;
  }
  ReplaceChild(old, replacement) {
    if (old === this.RootPanel) { this.RootPanel = replacement; return; }
    for (const collection of [this.FloatingWindows, this.Hidden]) {
      const index = collection.IndexOf(old); if (index !== -1) { collection.Set(index, replacement); return; }
    }
    throw new Error('Root child not found');
  }
  _validateChild(item, role) {
    super._validateChild(item);
    if (role === 'FloatingWindows' && !(item instanceof LayoutFloatingWindow)) throw new TypeError('FloatingWindows accepts floating window models');
    if (role === 'Hidden' && !(item instanceof LayoutAnchorable)) throw new TypeError('Only anchorables can be hidden');
  }
  CollectGarbage() {
    const protectedIds = new Set([...this.Descendents()].filter(x => x instanceof LayoutContent).map(x => x.PreviousContainerId).filter(Boolean));
    const prune = node => {
      for (const child of [...node.Children]) prune(child);
      if (node instanceof LayoutFloatingWindow && ![...node.Descendents()].some(x => x instanceof LayoutContent)) this.FloatingWindows.Remove(node);
      if ((node instanceof LayoutAnchorGroup || node instanceof LayoutAnchorablePane || node instanceof LayoutAnchorablePaneGroup) && !node.ChildrenCount && !protectedIds.has(node.Id)) node.Parent?.RemoveChild(node);
      if (node instanceof LayoutDocumentPaneGroup && !node.ChildrenCount) node.Parent?.RemoveChild(node);
    };
    prune(this);
  }
}
for (const side of Object.keys(AnchorSide)) Object.defineProperty(LayoutRoot.prototype, `${side}Side`, {
  enumerable: true, configurable: true,
  get() { return this._sides[side]; },
  set(value) {
    if (!(value instanceof LayoutAnchorSide)) throw new TypeError(`${side}Side must be a LayoutAnchorSide`);
    if (this._sides[side] === value) return;
    this._validateChild(value); this._willChange(`${side}Side`);
    value.Parent?.RemoveChild(value);
    if (this._sides[side]) this._sides[side]._parent = null;
    value.Side = side; this._sides[side] = value; value._parent = this;
    this._didChange(`${side}Side`);
  }
});

export function contents(node) { return [node, ...node.Descendents()].filter(x => x instanceof LayoutContent); }
export function validateLayout(root, { maxNodes = 10000, maxDepth = 64 } = {}) {
  if (!(root instanceof LayoutRoot)) throw new TypeError('Expected LayoutRoot');
  const nodes = new Set(), ids = new Set(), contentIds = new Set();
  function visit(node, depth) {
    if (depth > maxDepth || nodes.size >= maxNodes) throw new RangeError('Layout exceeds node/depth limit');
    if (nodes.has(node)) throw new Error('Layout cycle or repeated node');
    nodes.add(node);
    if (ids.has(node.Id)) throw new Error(`Duplicate layout Id: ${node.Id}`);
    ids.add(node.Id);
    if (node instanceof LayoutContent && node.ContentId != null) {
      if (contentIds.has(node.ContentId)) throw new Error(`Duplicate ContentId: ${node.ContentId}`);
      contentIds.add(node.ContentId);
    }
    for (const child of node.Children) {
      if (child.Parent !== node) throw new Error('Inconsistent layout parent');
      node._validateChild(child, node instanceof LayoutRoot ? (node.Hidden.Contains(child) ? 'Hidden' : node.FloatingWindows.Contains(child) ? 'FloatingWindows' : '') : 'Children');
      visit(child, depth + 1);
    }
  }
  visit(root, 0); return { nodes: nodes.size, contents: contentIds.size };
}
export const LayoutTypes = Object.freeze({ LayoutElement, LayoutGroupBase, LayoutGroup, LayoutPositionableGroup,
  LayoutRoot, LayoutPanel, LayoutContent, LayoutDocument, LayoutAnchorable, LayoutPane,
  LayoutDocumentPane, LayoutAnchorablePane, LayoutDocumentPaneGroup, LayoutAnchorablePaneGroup,
  LayoutAnchorSide, LayoutAnchorGroup, LayoutFloatingWindow, LayoutAnchorableFloatingWindow, LayoutDocumentFloatingWindow });
