# API guide

The authoritative declarations for this release are `src/index.d.ts`; the generated export/method/property inventory is `docs/API-SURFACE.json`. Examples below assume imported names from `src/index.js` and an existing manager unless shown otherwise.

## 1. Entry points and namespaces

ESM imports are available from `src/index.js` or an installed local `avalondock-web` package. The narrower `src/model.js`/`avalondock-web/model` entry is headless. `dist/avalondock.js` is a classic script with `AvalonDock` and `Xceed.Wpf.AvalonDock` globals. It does not require a CommonJS loader.

`Layout` contains models and `Serialization`; `Controls` contains DOM adapters; `Themes` contains original theme adapters; `Commands.RelayCommand` provides the command abstraction. Named imports are preferred when static tooling or TypeScript is available.

An attached manager needs an `HTMLElement` with definite height. A headless manager needs no DOM:

```js
const headless = new DockingManager({EnableHistory: true});
headless.AddDocument({ContentId: 'report', Title: 'Report', Content: {value: 42}});
const json = headless.SaveLayout();
headless.Dispose();
```

`Attach(host)` creates a renderer. `Detach()` tears down the view but leaves the layout model. `Dispose()` additionally releases subscriptions, history, registry, pop-outs and manager ownership. Factory cleanup runs on view teardown; application-owned content data should outlive a detach if it must be remounted.

## 2. Layout hierarchy

```text
LayoutRoot
 ├─ RootPanel: LayoutPanel
 │   ├─ LayoutAnchorablePane / LayoutAnchorablePaneGroup
 │   │   └─ LayoutAnchorable
 │   └─ LayoutDocumentPane / LayoutDocumentPaneGroup
 │       └─ LayoutDocument or an eligible LayoutAnchorable
 ├─ LeftSide / TopSide / RightSide / BottomSide: LayoutAnchorSide
 │   └─ LayoutAnchorGroup
 │       └─ LayoutAnchorable
 ├─ FloatingWindows
 │   ├─ LayoutDocumentFloatingWindow
 │   └─ LayoutAnchorableFloatingWindow
 └─ Hidden: LayoutAnchorable collection
```

Nested panels and pane groups express split layouts. `Orientation` is `Horizontal` for side-by-side children and `Vertical` for stacked children. Each child supports `DockWidth`, `DockHeight`, minimum and maximum dimensions where relevant.

```js
const pane = new LayoutDocumentPane();
pane.Children.Add(new LayoutDocument({ContentId: 'a', Title: 'A'}));
pane.Children.Add(new LayoutDocument({ContentId: 'b', Title: 'B'}));
pane.Children.Move(1, 0);
pane.SelectedContentIndex = 0;  // SelectedContent is read-only.
pane.DockWidth = '2*';
pane.DockMinWidth = 180;
```

`Children` is an observable iterable with .NET-style methods and array helpers. Numeric indexing is supported. Structural edits reparent nodes, update parent/root ownership and reject cycles or type violations. Distinct live nodes and content IDs are required. `AddRange` is not a database transaction by itself; wrap multi-step edits in `manager.Transaction` for rollback.

`Descendents()` preserves the upstream spelling; `Descendants()` is also available. `FindParent(Type)`, `FindRoot()`, manager `Find(contentId)` and `FindById(layoutId)` provide lookup. `validateLayout(root)` checks invariants and returns counts. `Root.CollectGarbage()` prunes empty structures while preserving referenced return panes.

## 3. Content and lifecycle

`LayoutDocument` and `LayoutAnchorable` share `Title`, `ContentId`, `Content`, `ToolTip`, `IconSource`, selection/activation state, floating geometry, previous-container information, and capabilities. Browser extensions include `CanMove`, `CanDock`, `IsModified`, `IsPinned` and JSON-compatible `UserData`.

Use one DOM node per hosted item. Reusing the same live node in two content items is rejected. Primitive values and plain objects render as text; they are not interpreted as HTML. To render markup, create a trusted DOM node or use a factory:

```js
manager.AddDocument({
  ContentId: 'live-editor', Title: 'Editor',
  Content(model, manager) {
    const textarea = document.createElement('textarea');
    textarea.value = 'Editable content';
    const onInput = () => { manager.Find(model.ContentId).IsModified = true; };
    textarea.addEventListener('input', onInput);
    return {
      element: textarea,
      dispose() { textarea.removeEventListener('input', onInput); }
    };
  }
});
```

Factories are lazy: unseen tab bodies are not constructed. Switching tabs, floating, redocking, and peeking do not intentionally destroy hosted nodes. Factory failures render an error panel and emit `Error` without stopping other content. Changing `Content` or the selected item template disposes/recreates the rendered body.

Undo/redo/import rebuilds layout model wrappers while rebinding content. Do not keep a captured model as the permanent authority; retain its `ContentId` and call `manager.Find(id)` from long-lived callbacks. Existing editor text, canvas state, and form state belong to the hosted content, not the layout snapshot.

Closed items are retained for layout history. When permanent cleanup is appropriate, clear related history and call `manager.ReleaseContent(id)` after the item is no longer live. Disposing a manager releases its retained views and factory hooks. Arbitrary plain DOM listeners owned by your application remain your responsibility.

## 4. Docking methods and rules

```js
const doc = manager.Find('a');
const tool = manager.Find('inspector');

doc.Activate();
doc.Float();
doc.Dock();                  // Restore its saved container or a valid fallback.
tool.ToggleAutoHide();
tool.Show();

manager.Dock(doc, otherDocumentPane, 'Center');
manager.Dock(doc, otherDocumentPane, 'Right');
manager.Dock(tool, manager.Layout.RootPanel, 'Left');
manager.NewTabGroup(doc, 'Vertical');
manager.MoveToTabGroup(doc, 1);
```

`CanDockAt(subject, target, position)` is the preflight check. Positions are `Center`, `Left`, `Right`, `Top`, `Bottom`. Center merges/reorders tabs; interior edges create a pane split. Documents only enter document destinations. Eligible tools can enter document panes, ordinary tool panes, or outer workspace edges.

`NewTabGroup(content, 'Vertical')` means a vertical divider (side-by-side groups); `'Horizontal'` means a horizontal divider (stacked groups). This naming follows command terminology, not the child-layout `Orientation` interpretation.

`Float(content, bounds)` floats a document or tool. A tool pane/group can float together. Bounds use `FloatingLeft`, `FloatingTop`, `FloatingWidth`, `FloatingHeight`. In-page bounds are constrained to the host. Double-click title controls or use the commands to maximize/restore. Floating tool return anchors retain their original pane membership.

`PopOut(subject)` returns a browser `Window`, or `null` when opening is denied. Call it from an explicit user gesture. The popup offers dock-back, and the host tracks its lifetime. Native Windows ownership/taskbar/multi-monitor behavior is not part of this API.

`TransferTo(otherManager, content, target?, position?)` provides an explicit cross-manager transfer. It does not enable pointer dragging between manager instances.

## 5. Tool visibility and capabilities

`CanClose`, `CanFloat`, `CanMove`, `CanDock`, and `IsEnabled` are enforced by supported commands and interactions. Tools additionally expose `CanHide`, `CanAutoHide`, and `CanDockAsTabbedDocument`.

`Hide()` retains the model in `Layout.Hidden`; `Show()` restores its previous pane when possible. `ToggleAutoHide()` applies to the eligible tool's group and moves it to an appropriate side rail. `ShowAutoHideWindow(tool)` opens the flyout; `HideAutoHideWindow()` dismisses it. Flyout dimensions use `AutoHideWidth/Height` with corresponding minima.

`AddAnchorable` and `LayoutAnchorable.AddToLayout` accept `AnchorableShowStrategy`. Numeric flags match the inspected declaration: `Most=1`, `Left=2`, `Right=4`, `Top=16`, `Bottom=32`. They can be OR-combined; side strings are also a browser convenience.

`IsPinned` is a visual browser extension, not an independent pinned-tab ordering policy.

## 6. Events, cancellation and commands

Signals accept `(sender, args)` handlers and return an unsubscribe function:

```js
const unsubscribe = manager.DocumentClosing.add((_sender, args) => {
  if (args.Document.IsModified) args.Cancel = true;
});
// unsubscribe();

manager.LayoutUpdated.add((_sender, args) => console.log(args.Label));
manager.Error.add((_sender, args) => console.error(args.Operation, args.Error));
```

Cancelable paths include document/tool closing and tool hiding. Setting `Cancel = true` or calling the argument's `preventDefault()` cancels them. `CloseFloatingWindow` preflights its contents so one cancellation does not partly close a group. Multi-item close reports the number actually closed.

Attached managers also dispatch `avalondock:EventName` `CustomEvent`s on their host. `event.detail` contains the event arguments. For cancelable events, DOM `event.preventDefault()` is honored.

Other manager signals include `ActiveContentChanged`, `LayoutChanging`, `LayoutChanged`, `LayoutUpdated`, `HistoryChanged`, `ContentMoved`, `ThemeChanged`, and floating-control creation/closure signals. `LayoutChanging` is a notification, not a promise of cancelable replacement. Native WPF routed-event order is not reproduced in full.

```js
const item = manager.GetLayoutItemFromModel(manager.Find('a'));
if (item.FloatCommand.CanExecute()) item.FloatCommand.Execute();
```

Item commands include Activate, Close, Float, Dock, DockAsDocument, CloseAll, CloseAllButThis, NewVerticalTabGroup, NewHorizontalTabGroup, MoveToNextTabGroup and MoveToPreviousTabGroup. Anchorable items add Hide and AutoHide. Their `CanExecuteChanged` signals are refreshed as capabilities/layout change.

`GetValue(LayoutDocument.TitleProperty)` and `SetValue(token, value)` are property adapters, not expression binding or WPF dependency-property precedence.

## 7. Sources and insertion strategies

```js
const files = new ObservableCollection([
  {ContentId: 'file-1', Title: 'First file', text: 'Hello'}
]);
manager.LayoutItemTemplate = data => {
  const node = document.createElement('pre');
  node.textContent = data.text;
  return node;
};
manager.DocumentsSource = files;
files.Add({ContentId: 'file-2', Title: 'Second file', text: 'World'});
files[0].Title = 'Renamed';
manager.RefreshSources();
```

`AnchorablesSource` is the equivalent tool source. Entries may be matching layout models or data objects; data identity must be distinct. IDs come from `ContentId`/`id`, and titles from `Title`/`title`/`name`. Source collections notify structural changes. Plain arrays and scalar changes require explicit refresh. Existing content template output is not a general two-way data-binding engine; update your hosted view when business data changes.

`LayoutItemContainerStyle` and its selector can project supported layout properties from source data. `LayoutUpdateStrategy` supports `BeforeInsertDocument`, `AfterInsertDocument`, `BeforeInsertAnchorable`, and `AfterInsertAnchorable`. A Before hook returning `true` must actually attach the item to this manager's root.

Closing a source-backed item removes it from a supported mutable source. Layout undo does not rewind arbitrary external source objects; applications needing unified document/business-history semantics must coordinate those changes themselves.

## 8. Serialization, persistence and history

```js
const serializer = new XmlLayoutSerializer(manager);
serializer.LayoutSerializationCallback.add((_sender, args) => {
  if (args.Model.ContentId === 'editor') args.Content = existingEditorNode;
  // args.Cancel = true skips a content item that cannot be rebound.
});
const xml = serializer.Serialize();
serializer.Deserialize(xml);

const json = new JsonLayoutSerializer(manager).Serialize();
manager.LoadLayout(json);  // Detects XML/JSON text, or accepts explicit format.
```

Serializers accept text and, where applicable, data/DOM XML objects or simple `Write`/`write` text writers. String arguments are data, not filenames. JSON captures the browser layout schema. XML matches the inspected common root/sides/floating/hidden structure and restores known properties/return containers. Use JSON for browser-specific layout shapes. Unknown XML types/attributes and unsupported extensions can be rejected. No native .NET interoperability certification is implied.

Content factories, DOM nodes, arbitrary class instances and business data are not serialized. Layout metadata and explicitly supplied JSON `UserData` may be serialized. The in-memory registry restores known content by ID; use callbacks for fresh application instances.

```js
manager.Transaction('Resize tools', () => {
  toolPane.DockWidth = 280;
  toolPane.DockMinWidth = 180;
});
manager.Undo();
manager.Redo();
```

Transactions are synchronous. A thrown error restores the layout snapshot; it does not undo arbitrary application side effects. `BeginUpdate()/EndUpdate()` batches notifications; prefer `Transaction()` when atomic rollback is required. Direct model changes coalesce into layout history. Selection changes do not create separate layout-undo entries. Text editing retains native/editor-specific undo.

Set `StorageKey` to enable optional local storage and choose `AutoSave`/`RestoreOnLoad`. `SaveToStorage()` and `LoadFromStorage()` return success booleans and surface storage errors through `Error`. Storage may be unavailable on restricted/opaque origins. Use explicit persistence around your host application for durable or remote storage; this package has no server.

## 9. Templates, menus and themes

Content template signature: `(content, model, manager) => Node | primitive | {element, dispose}`. Header/title signature: `(model, manager) => Node | string`. Selectors may be functions or objects exposing `SelectTemplate(content, model)`.

Header/title hooks are available separately for documents and tools. Icon templates receive `(icon, model, manager)`. Pane/side/group templates decorate the supplied working element; they do not replace the complete docking DOM contract. Reapply changed decorators with `ApplyTemplate()` when necessary.

```js
manager.DocumentHeaderTemplate = model => model.IsModified ? `${model.Title} •` : model.Title;
manager.DocumentContextMenu = (_model, _manager, defaults) => [
  ...defaults,
  null,  // Separator.
  {Label: 'Application action', Execute: () => console.log('Action')}
];
manager.Theme = new DarkTheme();
manager.FlowDirection = 'RightToLeft';
```

`ShowMenu(entries, x, y)` supports Label, Shortcut, Checked, CanExecute and Execute/Command fields. `ShowContextMenu(model, x, y)` opens the model's command menu. Theme values are `dark`, `light`, `aero`, `vs2010`, `metro`, `contrast`, or a `Theme` instance. `Theme.Variables` customizes CSS variables. These are original CSS themes, not native resource dictionaries.

## 10. Keyboard and sizing

Focused tab strips use arrows, Home/End, and activation. F6/Shift+F6 cycles panes; Ctrl+Tab opens the MRU navigator; Ctrl+F4 closes active content; Shift+F10 opens its context menu. Alt+Shift+arrows reorders a tab. Focused splitters accept arrow resizing with modifier increments. Escape cancels drag/menus/peek. Ctrl+Z/Y acts on layout history when focus is not editing text. Ctrl+K and Ctrl+S belong to the sample application, not the generic component.

Manager defaults: 5 px splitter dimensions; 220×140 minimum floating windows; 350 ms auto-hide open delay and 500 ms close delay; 100 history entries; mixed-orientation docking disabled; keyboard navigation enabled. `DockWidth/Height` accept `GridLength`, numbers (pixels), `Auto`, or star strings such as `2*`. `ResizableAbsoluteDockWidth/Height` can lock absolute dimensions against splitter operations. `ActualWidth/Height` are browser measurements, not WPF layout-pass objects.
