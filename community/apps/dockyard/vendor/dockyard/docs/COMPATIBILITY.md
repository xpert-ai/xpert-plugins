# Compatibility and capability boundaries

Version: 0.1.0. Status refers to the code and tests delivered here, not an assertion of complete AvalonDock feature parity.

## Meaning of “same API” in this package

The browser API retains familiar class names, PascalCase members, layout relationships, event subscription concepts, commands, and common serialization tags. JavaScript constructors accept option objects; collections provide `Add`, `Insert`, `Remove`, `Move`, indexing and iteration. The classic build exposes `AvalonDock` and `Xceed.Wpf.AvalonDock` aliases. ESM exports may be imported directly or through `Layout`, `Controls`, `Themes`, `Serialization`, and `Commands` namespaces.

**An existing C#/XAML AvalonDock application cannot be dropped into this package unchanged.** This implementation does not supply the CLR, WPF control hierarchy, all public upstream classes or members, native Windows messages, or the dependency-property/binding/routed-event system. Exact upstream event ordering and every overload/default are not parity-certified. `API-SURFACE.json` describes this implementation only.

## Detailed matrix

| Capability | Browser status | Boundary |
|---|---|---|
| Root/panel/document/tool layout tree | Implemented | Explicit runtime child typing and ownership checks; generic CLR interfaces become JavaScript inheritance and iterable collections |
| Document and anchorable content | Implemented | `Content` is a DOM node, plain data, or factory, not a WPF `UIElement`; content IDs must be unique within a manager |
| Active/selected content | Implemented | One root active model and one selected item per pane; `ActiveContent` returns hosted content while `ActiveModel` returns its layout wrapper |
| Property notifications and property tokens | Adapted | `PropertyChanging`, `PropertyChanged`, `GetValue`, `SetValue`, and static tokens are provided; there is no WPF value precedence, coercion metadata inheritance, expression binding, or resource lookup engine |
| Collection and tree notifications | Adapted | Collections and their owners notify; full WPF event routing and ancestor `ChildrenTreeChanged` bubbling are not reproduced |
| Docking, splits, tab movement | Implemented | Model/API and pointer paths enforce capability/type checks; keyboard equivalents cover common tab and splitter operations |
| Tool group movement | Implemented with boundary | Root-edge moves preserve nested structure; grouped floating retains return panes. Some interior group merges flatten the group into the destination pane |
| Document/tool destination rules | Implemented | Documents cannot become tools or dock directly to outer tool edges. Tools may enter document panes when allowed. Whole document-pane floating is not exposed; documents float individually |
| Floating windows | Browser adaptation | In-page windows support moving, resizing, maximizing and redocking. They are not native `HWND` windows and cannot exceed their host viewport |
| Separate browser pop-outs | Implemented and Chromium-tested | Requires a permitted `window.open` call. Explicit dock-back and parent-side tracking work. Native OS taskbar, owner-window, multi-monitor geometry and unrestricted drag between browser windows are not reproduced |
| Auto-hide | Implemented | Four rails, tool groups, peek timers, flyout resizing, hide/show, pinning and saved return positions |
| Close cancellation and commands | Implemented | Manager signals and cancelable DOM events are honored. Command `CanExecute` tracks supported model flags; not every WPF command overload exists |
| Tab pin state | Visual extension | `IsPinned` displays a pin state; it does not implement an independent pinned-tab ordering or close-all exclusion policy |
| Grid lengths and splitters | Implemented | Pixel/star/auto sizing, minimums, maximums and absolute-size locks. CSS sizing is not WPF's complete measure/arrange algorithm |
| Content templates | Function adaptation | Header/title/item/icon selectors return functions or nodes. Pane/side templates are decorators around working DOM; arbitrary WPF `ControlTemplate` replacement is not available |
| Styles and themes | Original browser styles | Original dark/light/aero/vs2010/metro/contrast CSS and theme adapters. Not exact copies of upstream resource dictionaries or pixel-identical desktop themes. Style decorators are not a resource-state restoration engine |
| Observable sources | Implemented with boundary | `ObservableCollection` structural changes synchronize. Plain arrays and scalar data changes require `RefreshSources()`. No automatic observation of arbitrary business objects or a general MVVM binding engine |
| Layout update strategy | Implemented | Before/after insertion hooks may direct documents or tools to custom destinations; a handled insertion must actually attach the content |
| Layout JSON | Implemented and round-trip-tested | Versioned browser schema; layout metadata only. DOM, functions and external application data are rebound, not serialized |
| Layout XML | Common structure implemented | RootPanel/sides/floating/hidden sections and common layout properties are recognized. Custom CLR types, extension attributes and every historical XML variant are not supported in strict mode. Native .NET ↔ browser interchange was not jointly executed |
| XML floating documents | Restricted | A direct single floating document matches the inspected upstream representation. Arbitrary multi-document floating extensions should use JSON; unsupported shapes can be rejected |
| File-path serializer overloads | Browser adaptation | `Serialize()` returns text or writes to a supplied text writer; `Deserialize()` takes text/data/DOM XML. It does not open a filename on the user's disk |
| History and transactions | Browser extension | Synchronous layout transactions, rollback, undo/redo, coalesced direct mutations. Not a transactional database or an asynchronous action coordinator |
| History with application data | Explicit boundary | History does not rewind editor text, external collections, network requests or other application side effects. Coordinate source changes and business-data undo in the host application |
| Model identity on restore | Explicit boundary | Undo/redo/deserialization recreates layout wrappers. Hosted content is rebound by `ContentId`; resolve fresh models with `manager.Find(id)` |
| Content lifetime | Implemented | Existing nodes/factories are retained across layout moves and tab switches. Closed content may stay retained for history until explicitly released or the manager is disposed |
| Iframe state | Chromium-tested for same-document moves | Uses state-preserving DOM moves when available. Fallback `insertBefore` and cross-document popup adoption do not guarantee preservation of an iframe browsing context |
| Separate manager instances | Implemented | Independent state, host-scoped CSS and explicit `TransferTo`. Pointer drag between two managers is not implemented |
| Localization/RTL | Browser hooks | `Strings` and `FlowDirection` are exposed; the sample UI is English, not a bundled set of upstream satellite resource translations |
| Accessibility | Semantics and keyboard support | ARIA tabs/panels/dialogs/separators, focus styling and common key paths are tested. This is not a completed WCAG or screen-reader certification |
| Touch | PointerEvents implementation | A synthetic touch-pointer drag was exercised. Physical touch/stylus hardware, multi-touch behavior and mobile-browser quirks remain target-environment validation work |
| Browser storage | Guarded implementation | Missing/denied storage is handled; layout auto-save is opt-in through a key. Cross-reload native-origin persistence was not browser-tested in this restricted environment |
| Browser coverage | Chromium only in this delivery | 144.0.7559.96 tested. Firefox, Safari, physical mobile devices and older engines were not run |
| WPF converters, interop and rendering classes | Not ported wholesale | Exported `Controls` classes are DOM adapters; there is no complete mirror of upstream converter classes, `DependencyObject`, native window hooks, drag service internals, or framework interfaces |

## Serialization safety and migration

The parsers apply allowlisted types/properties, reject XML DTDs/custom entities, and enforce input size, nesting and node-count limits. These checks reduce accidental or hostile layout input risk; they are not a security audit. Factories and templates remain trusted application code. Treat `UserData` as application-owned JSON metadata, not a place for credentials.

Restore content through stable IDs. For a migration, first export a representative layout from the exact native library version you use, test importing it, inspect unsupported attributes/types, and compare docking behavior. This delivery includes native-shaped fixtures but does not certify this migration step as already complete.

## Sources inspected

Primary references were the public AvalonDock wiki, the `Xceed.Wpf.AvalonDock` directory, layout models, `XmlLayoutSerializer`, root XML structure, floating-document XML structure, and `AnchorableShowStrategy` numeric flags. Specific inspected blob identifiers and URLs are recorded in `NOTICE.md`. No upstream source or resources are shipped.
