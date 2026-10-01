/** AvalonDock Web 0.1.0. Independent browser API; not WPF/CLR binary compatibility. */
export type Unsubscribe = () => void;
export type EventHandler<S, E> = (sender: S, args: E) => void;
export class EventSignal<S = unknown, E = Record<string, unknown>> {
  readonly Count: number;
  add(listener: EventHandler<S, E>): Unsubscribe;
  Add(listener: EventHandler<S, E>): Unsubscribe;
  subscribe(listener: EventHandler<S, E>): Unsubscribe;
  remove(listener: EventHandler<S, E>): void;
  Remove(listener: EventHandler<S, E>): void;
  emit(sender: S, args?: E): void;
  clear(): void;
}
export class CancelEventArgs {
  constructor(values?: Record<string, unknown>);
  Cancel: boolean;
  preventDefault(): void;
}
export class PropertyChangedEventArgs<T = unknown> {
  constructor(PropertyName: string, OldValue: T, NewValue: T);
  PropertyName: string; OldValue: T; NewValue: T;
}
export interface PropertyToken<T = unknown> { readonly Name: string; readonly OwnerType: string; }
export class ObservableObject {
  PropertyChanging: EventSignal<this, PropertyChangedEventArgs>;
  PropertyChanged: EventSignal<this, PropertyChangedEventArgs>;
  on(name: string, handler: EventHandler<this, any>): Unsubscribe;
  off(name: string, handler: EventHandler<this, any>): void;
  GetValue<T>(property: PropertyToken<T> | string): T;
  SetValue<T>(property: PropertyToken<T> | string, value: T): void;
  SetCurrentValue<T>(property: PropertyToken<T> | string, value: T): void;
  ClearValue(property: PropertyToken | string): void;
}
/** Low-level schema helpers; these are not a WPF dependency-property engine. */
export interface PropertyDescriptor<T = any> {
  default: T; coerce?: (value: any) => T; validate?: (value: T) => boolean;
  changed?: (this: ObservableObject, value: T, old: T) => void;
}
export function getSchema(ctor: Function): Record<string, PropertyDescriptor>;
export function properties(ctor: Function, schema: Record<string, PropertyDescriptor>): void;
export function finite(value: unknown): number;
export function positive(value: unknown): number;
export function boolean(value: unknown): boolean;
export function uid(prefix?: string): string;
export interface CollectionChangedEventArgs<T> {
  Action: 'Add' | 'Remove' | 'Replace' | 'Move' | 'Reset';
  NewItems: T[]; OldItems: T[]; NewStartingIndex: number; OldStartingIndex: number;
}
export class ObservableCollection<T = unknown> implements Iterable<T> {
  constructor(items?: Iterable<T>);
  [index: number]: T;
  readonly Count: number; readonly length: number;
  CollectionChanged: EventSignal<this, CollectionChangedEventArgs<T>>;
  [Symbol.iterator](): Iterator<T>;
  at(index: number): T | undefined;
  get(index: number): T | undefined;
  Add(item: T): T; AddRange(items: Iterable<T>): void;
  Insert(index: number, item: T): void; Set(index: number, item: T): void;
  Remove(item: T): boolean; RemoveAt(index: number): T; Move(oldIndex: number, newIndex: number): void;
  Clear(): void; Contains(item: T): boolean; IndexOf(item: T): number; ToArray(): T[];
  includes(item: T): boolean; indexOf(item: T): number;
  find(predicate: (value: T, index: number, array: T[]) => unknown): T | undefined;
  findIndex(predicate: (value: T, index: number, array: T[]) => unknown): number;
  filter(predicate: (value: T, index: number, array: T[]) => unknown): T[];
  map<U>(callback: (value: T, index: number, array: T[]) => U): U[];
  forEach(callback: (value: T, index: number, array: T[]) => void): void;
  every(predicate: (value: T, index: number, array: T[]) => unknown): boolean;
  some(predicate: (value: T, index: number, array: T[]) => unknown): boolean;
  reduce<U>(callback: (previous: U, current: T, index: number, array: T[]) => U, initial: U): U;
  slice(start?: number, end?: number): T[];
  push(...items: T[]): number; pop(): T | undefined; shift(): T | undefined; unshift(...items: T[]): number;
  splice(start: number, deleteCount?: number, ...items: T[]): T[];
}
export class RelayCommand<T = unknown, R = unknown> {
  constructor(execute: (parameter?: T) => R, canExecute?: (parameter?: T) => boolean);
  CanExecute(parameter?: T): boolean;
  Execute(parameter?: T): R | false;
  CanExecuteChanged: EventSignal<this>;
  RaiseCanExecuteChanged(): void;
}
export type GridUnit = 'Auto' | 'Pixel' | 'Star';
export const GridUnitType: Readonly<Record<GridUnit, GridUnit>>;
export type GridLengthLike = GridLength | number | string;
export class GridLength {
  constructor(value?: number, unit?: GridUnit);
  readonly Value: number; readonly GridUnitType: GridUnit;
  readonly IsStar: boolean; readonly IsAbsolute: boolean; readonly IsAuto: boolean;
  Equals(other: unknown): boolean; toString(): string; toJSON(): string;
  static Parse(value: GridLengthLike): GridLength;
  static readonly Auto: GridLength;
}
export type OrientationValue = 'Horizontal' | 'Vertical';
export const Orientation: Readonly<Record<OrientationValue, OrientationValue>>;
export type AnchorSideValue = 'Left' | 'Top' | 'Right' | 'Bottom';
export const AnchorSide: Readonly<Record<AnchorSideValue, AnchorSideValue>>;
export const AnchorableShowStrategy: Readonly<{ Most: 1; Left: 2; Right: 4; Top: 16; Bottom: 32 }>;
export type DockPosition = AnchorSideValue | 'Center';
export type Constructor<T> = abstract new (...args: any[]) => T;

export class LayoutElement extends ObservableObject {
  Id: string;
  static readonly IdProperty: PropertyToken<string>;
  readonly Parent: LayoutElement | null;
  readonly Root: LayoutRoot | null;
  readonly Manager: DockingManager | null;
  readonly Children: Iterable<LayoutElement> & { readonly length: number };
  readonly ChildrenCount: number;
  Descendents(): Generator<LayoutElement>;
  Descendants(): Generator<LayoutElement>;
  FindParent<T extends LayoutElement>(type: Constructor<T>): T | null;
  FindParent(type: string): LayoutElement | null;
  FindRoot(): LayoutRoot | null;
  toString(): string;
}
export class LayoutGroupBase<T extends LayoutElement = LayoutElement> extends LayoutElement {
  readonly Children: ObservableCollection<T>;
  readonly ChildrenCount: number; get IsVisible(): boolean;
  ChildrenCollectionChanged: EventSignal<this, CollectionChangedEventArgs<T>>;
  ChildrenTreeChanged: EventSignal<this, {Change: CollectionChangedEventArgs<LayoutElement>; TreeChange: string}>;
  IndexOf(item: T): number; InsertChildAt(index: number, item: T): void;
  RemoveChild(item: T): boolean; RemoveChildAt(index: number): T;
  ReplaceChild(old: T, replacement: T): void; MoveChild(oldIndex: number, newIndex: number): void;
  ComputeVisibility(): boolean;
}
export class LayoutGroup<T extends LayoutElement = LayoutElement> extends LayoutGroupBase<T> {}
export interface PositionableOptions {
  Id?: string; DockWidth?: GridLengthLike; DockHeight?: GridLengthLike;
  DockMinWidth?: number; DockMinHeight?: number; DockMaxWidth?: number; DockMaxHeight?: number;
  FloatingLeft?: number; FloatingTop?: number; FloatingWidth?: number; FloatingHeight?: number;
  IsMaximized?: boolean; ResizableAbsoluteDockWidth?: boolean; ResizableAbsoluteDockHeight?: boolean;
}
export class LayoutPositionableGroup<T extends LayoutElement = LayoutElement> extends LayoutGroup<T> {
  static readonly ActualHeightProperty: PropertyToken<LayoutPositionableGroup["ActualHeight"]>;
  static readonly ActualWidthProperty: PropertyToken<LayoutPositionableGroup["ActualWidth"]>;
  static readonly DockMaxHeightProperty: PropertyToken<LayoutPositionableGroup["DockMaxHeight"]>;
  static readonly DockMaxWidthProperty: PropertyToken<LayoutPositionableGroup["DockMaxWidth"]>;
  static readonly DockMinHeightProperty: PropertyToken<LayoutPositionableGroup["DockMinHeight"]>;
  static readonly DockMinWidthProperty: PropertyToken<LayoutPositionableGroup["DockMinWidth"]>;
  static readonly FloatingHeightProperty: PropertyToken<LayoutPositionableGroup["FloatingHeight"]>;
  static readonly FloatingLeftProperty: PropertyToken<LayoutPositionableGroup["FloatingLeft"]>;
  static readonly FloatingTopProperty: PropertyToken<LayoutPositionableGroup["FloatingTop"]>;
  static readonly FloatingWidthProperty: PropertyToken<LayoutPositionableGroup["FloatingWidth"]>;
  static readonly IsMaximizedProperty: PropertyToken<LayoutPositionableGroup["IsMaximized"]>;
  static readonly ResizableAbsoluteDockHeightProperty: PropertyToken<LayoutPositionableGroup["ResizableAbsoluteDockHeight"]>;
  static readonly ResizableAbsoluteDockWidthProperty: PropertyToken<LayoutPositionableGroup["ResizableAbsoluteDockWidth"]>;
  get DockWidth(): GridLength; set DockWidth(value: GridLengthLike);
  get DockHeight(): GridLength; set DockHeight(value: GridLengthLike);
  DockMinWidth: number; DockMinHeight: number; DockMaxWidth: number; DockMaxHeight: number;
  FloatingLeft: number; FloatingTop: number; FloatingWidth: number; FloatingHeight: number;
  IsMaximized: boolean; ActualWidth: number; ActualHeight: number;
  ResizableAbsoluteDockWidth: boolean; ResizableAbsoluteDockHeight: boolean;
  static readonly DockWidthProperty: PropertyToken<GridLengthLike>;
  static readonly DockHeightProperty: PropertyToken<GridLengthLike>;
}
export interface GroupOptions<T extends LayoutElement> extends PositionableOptions { Orientation?: OrientationValue; Children?: Iterable<T>; }
export class LayoutPanel extends LayoutPositionableGroup<LayoutPositionableGroup> {
  static readonly OrientationProperty: PropertyToken<LayoutPanel["Orientation"]>;
  constructor(options?: GroupOptions<LayoutPositionableGroup> | LayoutPositionableGroup[] | LayoutPositionableGroup);
  Orientation: OrientationValue;
}
export class LayoutDocumentPaneGroup extends LayoutPositionableGroup<LayoutDocumentPane | LayoutDocumentPaneGroup> {
  static readonly OrientationProperty: PropertyToken<LayoutDocumentPaneGroup["Orientation"]>;
  constructor(options?: GroupOptions<LayoutDocumentPane | LayoutDocumentPaneGroup> | (LayoutDocumentPane | LayoutDocumentPaneGroup)[]);
  Orientation: OrientationValue;
}
export class LayoutAnchorablePaneGroup extends LayoutPositionableGroup<LayoutAnchorablePane | LayoutAnchorablePaneGroup> {
  static readonly OrientationProperty: PropertyToken<LayoutAnchorablePaneGroup["Orientation"]>;
  constructor(options?: GroupOptions<LayoutAnchorablePane | LayoutAnchorablePaneGroup> | (LayoutAnchorablePane | LayoutAnchorablePaneGroup)[]);
  Orientation: OrientationValue;
}
export type ContentResult = Node | string | number | boolean | object | null | undefined;
export interface ContentLifecycle { element: Node; dispose?(): void; }
export type ContentFactory = (model: LayoutContent, manager: DockingManager) => ContentResult | ContentLifecycle;
export interface ContentOptions {
  Id?: string; ContentId?: string | null; Title?: string; Content?: unknown;
  IconSource?: unknown; ToolTip?: unknown; Description?: string;
  CanClose?: boolean; CanFloat?: boolean; CanMove?: boolean; CanDock?: boolean; IsEnabled?: boolean;
  IsModified?: boolean; IsPinned?: boolean; IsSelected?: boolean; IsActive?: boolean;
  FloatingLeft?: number; FloatingTop?: number; FloatingWidth?: number; FloatingHeight?: number;
  IsMaximized?: boolean; PreviousContainerIndex?: number; LastActivationTimeStamp?: string | Date | null; UserData?: unknown;
}
export class LayoutContent extends LayoutElement {
  static readonly CanDockProperty: PropertyToken<LayoutContent["CanDock"]>;
  static readonly CanMoveProperty: PropertyToken<LayoutContent["CanMove"]>;
  static readonly DescriptionProperty: PropertyToken<LayoutContent["Description"]>;
  static readonly FloatingHeightProperty: PropertyToken<LayoutContent["FloatingHeight"]>;
  static readonly FloatingLeftProperty: PropertyToken<LayoutContent["FloatingLeft"]>;
  static readonly FloatingTopProperty: PropertyToken<LayoutContent["FloatingTop"]>;
  static readonly FloatingWidthProperty: PropertyToken<LayoutContent["FloatingWidth"]>;
  static readonly IconSourceProperty: PropertyToken<LayoutContent["IconSource"]>;
  static readonly IsMaximizedProperty: PropertyToken<LayoutContent["IsMaximized"]>;
  static readonly IsModifiedProperty: PropertyToken<LayoutContent["IsModified"]>;
  static readonly IsPinnedProperty: PropertyToken<LayoutContent["IsPinned"]>;
  static readonly LastActivationTimeStampProperty: PropertyToken<LayoutContent["LastActivationTimeStamp"]>;
  static readonly PreviousContainerIndexProperty: PropertyToken<LayoutContent["PreviousContainerIndex"]>;
  static readonly ToolTipProperty: PropertyToken<LayoutContent["ToolTip"]>;
  static readonly UserDataProperty: PropertyToken<LayoutContent["UserData"]>;
  Title: string; ContentId: string | null; Content: unknown;
  IconSource: unknown; ToolTip: unknown; Description: string;
  CanClose: boolean; CanFloat: boolean; CanMove: boolean; CanDock: boolean; IsEnabled: boolean;
  IsModified: boolean; IsPinned: boolean; IsSelected: boolean; IsActive: boolean;
  FloatingLeft: number; FloatingTop: number; FloatingWidth: number; FloatingHeight: number; IsMaximized: boolean;
  LastActivationTimeStamp: string | Date | null; UserData: unknown;
  PreviousContainer: LayoutElement | null; PreviousContainerId: string | null; PreviousContainerIndex: number;
  readonly IsFloating: boolean; get IsVisible(): boolean; readonly IsDocked: boolean;
  readonly IsAutoHidden: boolean; readonly IsLastFocusedDocument: boolean;
  IsSelectedChanged: EventSignal<this>; IsActiveChanged: EventSignal<this>;
  Closing: EventSignal<this, CancelEventArgs>; Closed: EventSignal<this>;
  Activate(): this; Float(): LayoutFloatingWindow | false;
  Dock(): boolean | LayoutPane; DockAsDocument(): LayoutPane | false; Close(): boolean;
  static readonly TitleProperty: PropertyToken<string>;
  static readonly ContentIdProperty: PropertyToken<string | null>;
  static readonly ContentProperty: PropertyToken<unknown>;
  static readonly CanCloseProperty: PropertyToken<boolean>;
  static readonly CanFloatProperty: PropertyToken<boolean>;
  static readonly IsEnabledProperty: PropertyToken<boolean>;
}
export class LayoutDocument extends LayoutContent { constructor(options?: ContentOptions); }
export interface AnchorableOptions extends ContentOptions {
  CanHide?: boolean; CanAutoHide?: boolean; CanDockAsTabbedDocument?: boolean;
  AutoHideWidth?: number; AutoHideHeight?: number; AutoHideMinWidth?: number; AutoHideMinHeight?: number;
}
export class LayoutAnchorable extends LayoutContent {
  static readonly AutoHideHeightProperty: PropertyToken<LayoutAnchorable["AutoHideHeight"]>;
  static readonly AutoHideMinHeightProperty: PropertyToken<LayoutAnchorable["AutoHideMinHeight"]>;
  static readonly AutoHideMinWidthProperty: PropertyToken<LayoutAnchorable["AutoHideMinWidth"]>;
  static readonly AutoHideWidthProperty: PropertyToken<LayoutAnchorable["AutoHideWidth"]>;
  static readonly CanAutoHideProperty: PropertyToken<LayoutAnchorable["CanAutoHide"]>;
  static readonly CanDockAsTabbedDocumentProperty: PropertyToken<LayoutAnchorable["CanDockAsTabbedDocument"]>;
  static readonly CanHideProperty: PropertyToken<LayoutAnchorable["CanHide"]>;
  constructor(options?: AnchorableOptions);
  CanHide: boolean; CanAutoHide: boolean; CanDockAsTabbedDocument: boolean;
  AutoHideWidth: number; AutoHideHeight: number; AutoHideMinWidth: number; AutoHideMinHeight: number;
  readonly IsHidden: boolean;
  get IsVisible(): boolean; set IsVisible(value: boolean);
  Hiding: EventSignal<this, CancelEventArgs>; IsVisibleChanged: EventSignal<this, {IsVisible: boolean}>;
  IsAutoHiddenChanged: EventSignal<this, {IsAutoHidden: boolean}>;
  Hide(cancelable?: boolean): boolean; Show(): boolean; ToggleAutoHide(): boolean;
  AddToLayout(manager: DockingManager, strategy?: number | AnchorSideValue): LayoutAnchorable;
}
export interface PaneOptions<T extends LayoutContent> extends PositionableOptions {
  Children?: Iterable<T>; SelectedContentIndex?: number; CanRepositionItems?: boolean; ShowHeader?: boolean; Name?: string;
}
export class LayoutPane<T extends LayoutContent = LayoutContent> extends LayoutPositionableGroup<T> {
  static readonly CanRepositionItemsProperty: PropertyToken<LayoutPane["CanRepositionItems"]>;
  static readonly NameProperty: PropertyToken<LayoutPane["Name"]>;
  static readonly ShowHeaderProperty: PropertyToken<LayoutPane["ShowHeader"]>;
  SelectedContentIndex: number;
  readonly SelectedContent: T | null;
  readonly IsActive: boolean; readonly CanClose: boolean; readonly CanHide: boolean; readonly CanAutoHide: boolean;
  readonly IsDirectlyHostedInFloatingWindow: boolean;
  CanRepositionItems: boolean; ShowHeader: boolean; Name: string;
  SetNextSelectedIndex(): void;
}
export class LayoutDocumentPane extends LayoutPane<LayoutContent> {
  constructor(options?: PaneOptions<LayoutContent> | LayoutContent[] | LayoutContent);
}
export class LayoutAnchorablePane extends LayoutPane<LayoutAnchorable> {
  constructor(options?: PaneOptions<LayoutAnchorable> | LayoutAnchorable[] | LayoutAnchorable);
}
export class LayoutAnchorGroup extends LayoutGroup<LayoutAnchorable> {
  constructor(options?: {Id?: string; Children?: Iterable<LayoutAnchorable>; PreviousContainer?: LayoutElement | null; PreviousContainerId?: string | null} | LayoutAnchorable[]);
  PreviousContainer: LayoutElement | null; PreviousContainerId: string | null;
}
export class LayoutAnchorSide extends LayoutGroup<LayoutAnchorGroup> {
  static readonly SideProperty: PropertyToken<LayoutAnchorSide["Side"]>;
  constructor(options?: {Id?: string; Side?: AnchorSideValue; Children?: Iterable<LayoutAnchorGroup>} | LayoutAnchorGroup[]);
  Side: AnchorSideValue;
}
export interface FloatingBounds { FloatingLeft?: number; FloatingTop?: number; FloatingWidth?: number; FloatingHeight?: number; }
export class LayoutFloatingWindow extends LayoutGroup {
  static readonly FloatingHeightProperty: PropertyToken<LayoutFloatingWindow["FloatingHeight"]>;
  static readonly FloatingLeftProperty: PropertyToken<LayoutFloatingWindow["FloatingLeft"]>;
  static readonly FloatingTopProperty: PropertyToken<LayoutFloatingWindow["FloatingTop"]>;
  static readonly FloatingWidthProperty: PropertyToken<LayoutFloatingWindow["FloatingWidth"]>;
  static readonly IsMaximizedProperty: PropertyToken<LayoutFloatingWindow["IsMaximized"]>;
  static readonly ZIndexProperty: PropertyToken<LayoutFloatingWindow["ZIndex"]>;
  readonly IsValid: boolean; readonly IsSinglePane: boolean; readonly SinglePane: LayoutPane | null;
  RootPanel: LayoutElement | null;
  FloatingLeft: number; FloatingTop: number; FloatingWidth: number; FloatingHeight: number;
  IsMaximized: boolean; ZIndex: number;
}
export class LayoutDocumentFloatingWindow extends LayoutFloatingWindow {
  constructor(options?: FloatingBounds & {Id?: string; RootDocument?: LayoutDocument; RootPanel?: LayoutDocument | LayoutDocumentPane | LayoutDocumentPaneGroup; IsMaximized?: boolean; Children?: Iterable<LayoutElement>});
  RootDocument: LayoutDocument | null;
}
export class LayoutAnchorableFloatingWindow extends LayoutFloatingWindow {
  constructor(options?: FloatingBounds & {Id?: string; RootPanel?: LayoutAnchorablePaneGroup | LayoutAnchorablePane; IsMaximized?: boolean; Children?: Iterable<LayoutElement>});
}
export interface LayoutRootOptions {
  Id?: string; RootPanel?: LayoutPanel; TopSide?: LayoutAnchorSide; RightSide?: LayoutAnchorSide; LeftSide?: LayoutAnchorSide; BottomSide?: LayoutAnchorSide;
  FloatingWindows?: Iterable<LayoutFloatingWindow>; Hidden?: Iterable<LayoutAnchorable>; ActiveContent?: LayoutContent | null;
}
export class LayoutRoot extends LayoutElement {
  constructor(options?: LayoutRootOptions | LayoutPanel);
  RootPanel: LayoutPanel;
  TopSide: LayoutAnchorSide; RightSide: LayoutAnchorSide; LeftSide: LayoutAnchorSide; BottomSide: LayoutAnchorSide;
  readonly Children: LayoutElement[];
  FloatingWindows: ObservableCollection<LayoutFloatingWindow>; Hidden: ObservableCollection<LayoutAnchorable>;
  ActiveContent: LayoutContent | null; readonly LastFocusedDocument: LayoutContent | null;
  get IsVisible(): boolean;
  Updated: EventSignal<this>; ElementAdded: EventSignal<this, {Element: LayoutElement}>; ElementRemoved: EventSignal<this, {Element: LayoutElement}>;
  RemoveChild(item: LayoutElement): boolean; ReplaceChild(old: LayoutElement, replacement: LayoutElement): void;
  CollectGarbage(): void;
}
export function contents(node: LayoutElement): LayoutContent[];
export function validateLayout(root: LayoutRoot, limits?: {maxNodes?: number; maxDepth?: number}): {nodes: number; contents: number};

export type HeaderTemplate = (model: LayoutContent, manager: DockingManager) => Node | string | null;
export type ItemTemplate = (content: unknown, model: LayoutContent, manager: DockingManager) => ContentResult | ContentLifecycle;
export type IconTemplate = (icon: unknown, model: LayoutContent, manager: DockingManager) => Node | string | null;
export type TemplateSelector<T> = ((content: unknown, model: LayoutContent, manager: DockingManager) => T | null) | {SelectTemplate(content: unknown, model: LayoutContent): T | null};
export type ElementDecorator<T extends LayoutElement = LayoutElement> = (model: T, element: HTMLElement, manager: DockingManager) => void;
export type CSSStyle = string | Partial<CSSStyleDeclaration> | Record<string, string | number> | ((model: LayoutElement, manager: DockingManager) => string | object | null);
export type ModelStyle = Record<string, unknown | ((data: any, model: LayoutContent) => unknown)>;
export interface ILayoutUpdateStrategy {
  BeforeInsertDocument?(layout: LayoutRoot, document: LayoutDocument, destination: LayoutDocumentPane | null): boolean;
  AfterInsertDocument?(layout: LayoutRoot, document: LayoutDocument): void;
  BeforeInsertAnchorable?(layout: LayoutRoot, anchorable: LayoutAnchorable, destination: LayoutAnchorablePane | null): boolean;
  AfterInsertAnchorable?(layout: LayoutRoot, anchorable: LayoutAnchorable): void;
}
export interface MenuEntry {
  Label?: string; label?: string; Shortcut?: string; Checked?: boolean;
  CanExecute?: boolean | (() => boolean); Execute?: () => unknown; action?: () => unknown;
  Command?: RelayCommand<any, any>; HeaderTemplate?: HeaderTemplate; Model?: LayoutContent;
}
export type MenuProvider = (model: LayoutContent, manager: DockingManager, defaults: (MenuEntry | null)[]) => (MenuEntry | null)[];
export interface DockingSettings {
  AllowMixedOrientation: boolean; Theme: string | Theme; FlowDirection: 'LeftToRight' | 'RightToLeft';
  GridSplitterWidth: number; GridSplitterHeight: number; FloatingWindowMinWidth: number; FloatingWindowMinHeight: number;
  ShowSystemMenu: boolean; AllowKeyboardNavigation: boolean; AutoHideDelay: number; AutoHideCloseDelay: number;
  EnableHistory: boolean; HistoryLimit: number; StorageKey: string | null; AutoSave: boolean; RestoreOnLoad: boolean;
  LayoutUpdateStrategy: ILayoutUpdateStrategy | null;
  LayoutItemTemplate: ItemTemplate | null; LayoutItemTemplateSelector: TemplateSelector<ItemTemplate> | null;
  DocumentHeaderTemplate: HeaderTemplate | null; DocumentHeaderTemplateSelector: TemplateSelector<HeaderTemplate> | null;
  AnchorableHeaderTemplate: HeaderTemplate | null; AnchorableHeaderTemplateSelector: TemplateSelector<HeaderTemplate> | null;
  DocumentTitleTemplate: HeaderTemplate | null; DocumentTitleTemplateSelector: TemplateSelector<HeaderTemplate> | null;
  AnchorableTitleTemplate: HeaderTemplate | null; AnchorableTitleTemplateSelector: TemplateSelector<HeaderTemplate> | null;
  DocumentPaneMenuItemHeaderTemplate: HeaderTemplate | null; DocumentPaneMenuItemHeaderTemplateSelector: TemplateSelector<HeaderTemplate> | null;
  IconContentTemplate: IconTemplate | null; IconContentTemplateSelector: TemplateSelector<IconTemplate> | null;
  DocumentPaneTemplate: ElementDecorator<LayoutDocumentPane> | null; AnchorablePaneTemplate: ElementDecorator<LayoutAnchorablePane> | null;
  AnchorGroupTemplate: ElementDecorator<LayoutAnchorGroup> | null; AnchorSideTemplate: ElementDecorator<LayoutAnchorSide> | null; AnchorTemplate: ElementDecorator<LayoutAnchorable> | null;
  DocumentPaneControlStyle: CSSStyle | null; AnchorablePaneControlStyle: CSSStyle | null;
  LayoutItemContainerStyle: ModelStyle | null;
  LayoutItemContainerStyleSelector: ((data: any, model: LayoutContent) => ModelStyle | null) | {SelectStyle(data: any, model: LayoutContent): ModelStyle | null} | null;
  DocumentContextMenu: MenuProvider | (MenuEntry | null)[] | null; AnchorableContextMenu: MenuProvider | (MenuEntry | null)[] | null;
  Strings: Record<string, string> | null;
}
export interface ManagerEventArgs {
  ActiveContentChanged: {OldContent: unknown; Content: unknown; Model: LayoutContent | null};
  DocumentClosing: CancelEventArgs & {Document: LayoutDocument; Model: LayoutDocument};
  DocumentClosed: {Document: LayoutDocument; Model: LayoutDocument};
  AnchorableClosing: CancelEventArgs & {Anchorable: LayoutAnchorable; Model: LayoutAnchorable};
  AnchorableClosed: {Anchorable: LayoutAnchorable; Model: LayoutAnchorable};
  AnchorableHiding: CancelEventArgs & {Anchorable: LayoutAnchorable; Model: LayoutAnchorable};
  AnchorableHidden: {Anchorable: LayoutAnchorable};
  LayoutChanging: {OldLayout: LayoutRoot; NewLayout: LayoutRoot};
  LayoutChanged: {OldLayout: LayoutRoot; Layout: LayoutRoot};
  LayoutUpdated: {Layout: LayoutRoot; Label: string};
  LayoutFloatingWindowControlCreated: {Model: LayoutFloatingWindow};
  LayoutFloatingWindowControlClosed: {Model: LayoutFloatingWindow};
  HistoryChanged: {CanUndo: boolean; CanRedo: boolean; Label?: string};
  Error: {Error: Error; Operation: string; Model?: LayoutContent};
  ContentMoved: {Contents: LayoutContent[]; Operation: string; Target?: LayoutPane; Position?: DockPosition};
  ThemeChanged: {Theme: string | Theme};
}
export type DockingManagerOptions = Partial<DockingSettings> & {
  Host?: HTMLElement; Layout?: LayoutRoot; DocumentsSource?: Iterable<unknown>; AnchorablesSource?: Iterable<unknown>;
} & { [K in keyof ManagerEventArgs]?: EventHandler<DockingManager, ManagerEventArgs[K]> };
export interface DockingManager extends DockingSettings {}
export class DockingManager extends ObservableObject {
  static readonly AllowKeyboardNavigationProperty: PropertyToken<DockingManager["AllowKeyboardNavigation"]>;
  static readonly AllowMixedOrientationProperty: PropertyToken<DockingManager["AllowMixedOrientation"]>;
  static readonly AnchorGroupTemplateProperty: PropertyToken<DockingManager["AnchorGroupTemplate"]>;
  static readonly AnchorSideTemplateProperty: PropertyToken<DockingManager["AnchorSideTemplate"]>;
  static readonly AnchorTemplateProperty: PropertyToken<DockingManager["AnchorTemplate"]>;
  static readonly AnchorableContextMenuProperty: PropertyToken<DockingManager["AnchorableContextMenu"]>;
  static readonly AnchorableHeaderTemplateProperty: PropertyToken<DockingManager["AnchorableHeaderTemplate"]>;
  static readonly AnchorableHeaderTemplateSelectorProperty: PropertyToken<DockingManager["AnchorableHeaderTemplateSelector"]>;
  static readonly AnchorablePaneControlStyleProperty: PropertyToken<DockingManager["AnchorablePaneControlStyle"]>;
  static readonly AnchorablePaneTemplateProperty: PropertyToken<DockingManager["AnchorablePaneTemplate"]>;
  static readonly AnchorableTitleTemplateProperty: PropertyToken<DockingManager["AnchorableTitleTemplate"]>;
  static readonly AnchorableTitleTemplateSelectorProperty: PropertyToken<DockingManager["AnchorableTitleTemplateSelector"]>;
  static readonly AutoHideCloseDelayProperty: PropertyToken<DockingManager["AutoHideCloseDelay"]>;
  static readonly AutoHideDelayProperty: PropertyToken<DockingManager["AutoHideDelay"]>;
  static readonly AutoSaveProperty: PropertyToken<DockingManager["AutoSave"]>;
  static readonly DocumentContextMenuProperty: PropertyToken<DockingManager["DocumentContextMenu"]>;
  static readonly DocumentHeaderTemplateProperty: PropertyToken<DockingManager["DocumentHeaderTemplate"]>;
  static readonly DocumentHeaderTemplateSelectorProperty: PropertyToken<DockingManager["DocumentHeaderTemplateSelector"]>;
  static readonly DocumentPaneControlStyleProperty: PropertyToken<DockingManager["DocumentPaneControlStyle"]>;
  static readonly DocumentPaneMenuItemHeaderTemplateProperty: PropertyToken<DockingManager["DocumentPaneMenuItemHeaderTemplate"]>;
  static readonly DocumentPaneMenuItemHeaderTemplateSelectorProperty: PropertyToken<DockingManager["DocumentPaneMenuItemHeaderTemplateSelector"]>;
  static readonly DocumentPaneTemplateProperty: PropertyToken<DockingManager["DocumentPaneTemplate"]>;
  static readonly DocumentTitleTemplateProperty: PropertyToken<DockingManager["DocumentTitleTemplate"]>;
  static readonly DocumentTitleTemplateSelectorProperty: PropertyToken<DockingManager["DocumentTitleTemplateSelector"]>;
  static readonly EnableHistoryProperty: PropertyToken<DockingManager["EnableHistory"]>;
  static readonly FloatingWindowMinHeightProperty: PropertyToken<DockingManager["FloatingWindowMinHeight"]>;
  static readonly FloatingWindowMinWidthProperty: PropertyToken<DockingManager["FloatingWindowMinWidth"]>;
  static readonly FlowDirectionProperty: PropertyToken<DockingManager["FlowDirection"]>;
  static readonly GridSplitterHeightProperty: PropertyToken<DockingManager["GridSplitterHeight"]>;
  static readonly GridSplitterWidthProperty: PropertyToken<DockingManager["GridSplitterWidth"]>;
  static readonly HistoryLimitProperty: PropertyToken<DockingManager["HistoryLimit"]>;
  static readonly IconContentTemplateProperty: PropertyToken<DockingManager["IconContentTemplate"]>;
  static readonly IconContentTemplateSelectorProperty: PropertyToken<DockingManager["IconContentTemplateSelector"]>;
  static readonly LayoutItemContainerStyleProperty: PropertyToken<DockingManager["LayoutItemContainerStyle"]>;
  static readonly LayoutItemContainerStyleSelectorProperty: PropertyToken<DockingManager["LayoutItemContainerStyleSelector"]>;
  static readonly LayoutItemTemplateProperty: PropertyToken<DockingManager["LayoutItemTemplate"]>;
  static readonly LayoutItemTemplateSelectorProperty: PropertyToken<DockingManager["LayoutItemTemplateSelector"]>;
  static readonly LayoutUpdateStrategyProperty: PropertyToken<DockingManager["LayoutUpdateStrategy"]>;
  static readonly RestoreOnLoadProperty: PropertyToken<DockingManager["RestoreOnLoad"]>;
  static readonly ShowSystemMenuProperty: PropertyToken<DockingManager["ShowSystemMenu"]>;
  static readonly StorageKeyProperty: PropertyToken<DockingManager["StorageKey"]>;
  static readonly StringsProperty: PropertyToken<DockingManager["Strings"]>;
  static readonly ThemeProperty: PropertyToken<DockingManager["Theme"]>;
  constructor(options?: DockingManagerOptions);
  constructor(host: HTMLElement, options?: DockingManagerOptions);
  Id: string; readonly Host: HTMLElement | null;
  Layout: LayoutRoot; ActiveContent: unknown; readonly ActiveModel: LayoutContent | null;
  DocumentsSource: Iterable<unknown> | null; AnchorablesSource: Iterable<unknown> | null;
  readonly FloatingWindows: (LayoutFloatingWindow | LayoutFloatingWindowControl)[];
  readonly AutoHideWindow: {Model: LayoutAnchorable; Element: HTMLElement | null; Hide(): void} | null;
  readonly LayoutRootPanel: HTMLElement | null;
  readonly LeftSidePanel: HTMLElement | null; readonly RightSidePanel: HTMLElement | null; readonly TopSidePanel: HTMLElement | null; readonly BottomSidePanel: HTMLElement | null;
  readonly CanUndo: boolean; readonly CanRedo: boolean;
  ActiveContentChanged: EventSignal<this, ManagerEventArgs['ActiveContentChanged']>;
  DocumentClosing: EventSignal<this, ManagerEventArgs['DocumentClosing']>; DocumentClosed: EventSignal<this, ManagerEventArgs['DocumentClosed']>;
  AnchorableClosing: EventSignal<this, ManagerEventArgs['AnchorableClosing']>; AnchorableClosed: EventSignal<this, ManagerEventArgs['AnchorableClosed']>;
  AnchorableHiding: EventSignal<this, ManagerEventArgs['AnchorableHiding']>; AnchorableHidden: EventSignal<this, ManagerEventArgs['AnchorableHidden']>;
  LayoutChanging: EventSignal<this, ManagerEventArgs['LayoutChanging']>; LayoutChanged: EventSignal<this, ManagerEventArgs['LayoutChanged']>; LayoutUpdated: EventSignal<this, ManagerEventArgs['LayoutUpdated']>;
  LayoutFloatingWindowControlCreated: EventSignal<this, ManagerEventArgs['LayoutFloatingWindowControlCreated']>; LayoutFloatingWindowControlClosed: EventSignal<this, ManagerEventArgs['LayoutFloatingWindowControlClosed']>;
  HistoryChanged: EventSignal<this, ManagerEventArgs['HistoryChanged']>; Error: EventSignal<this, ManagerEventArgs['Error']>;
  ContentMoved: EventSignal<this, ManagerEventArgs['ContentMoved']>; ThemeChanged: EventSignal<this, ManagerEventArgs['ThemeChanged']>;
  Attach(host: HTMLElement): this; Detach(): void; Dispose(): void; dispose(): void;
  Refresh(): void; RefreshSources(): void; OnApplyTemplate(): void; ApplyTemplate(): boolean;
  Transaction<T>(label: string, action: () => T): T; Transaction<T>(action: () => T): T;
  BeginUpdate(): {Dispose(): void}; EndUpdate(): void;
  Undo(): boolean; Redo(): boolean; ClearHistory(): void;
  Find(contentId: string): LayoutContent | null; FindById(id: string): LayoutElement | null;
  GetLayoutItemFromModel(model: LayoutDocument): LayoutDocumentItem;
  GetLayoutItemFromModel(model: LayoutAnchorable): LayoutAnchorableItem;
  GetLayoutItemFromModel(model: LayoutContent): LayoutItem;
  CreateUIElementForModel(model: LayoutElement): LayoutControl | null;
  Activate(value: unknown): boolean;
  AddDocument(document: LayoutDocument | ContentOptions, pane?: LayoutDocumentPane | null): LayoutDocument;
  AddAnchorable(anchorable: LayoutAnchorable | AnchorableOptions, strategy?: number | AnchorSideValue): LayoutAnchorable;
  Float(subject: LayoutElement, bounds?: FloatingBounds): LayoutFloatingWindow | false;
  CanDockAt(subject: LayoutElement, target: LayoutElement, position?: DockPosition): boolean;
  Dock(subject: LayoutElement, target?: LayoutElement | null, position?: DockPosition, index?: number | null): LayoutPane | boolean;
  DockAsDocument(item: LayoutContent): LayoutPane | false;
  NewTabGroup(item: LayoutContent, orientation?: OrientationValue): LayoutPane | false;
  MoveToTabGroup(item: LayoutContent, direction?: number): LayoutPane | false;
  Hide(item: LayoutAnchorable, cancelable?: boolean): boolean; Show(item: LayoutAnchorable): boolean;
  ToggleAutoHide(subject: LayoutAnchorable | LayoutAnchorablePane | LayoutAnchorGroup): boolean;
  ShowAutoHideWindow(item: LayoutAnchorable): boolean; HideAutoHideWindow(): void;
  Close(item: LayoutContent): boolean; CloseAll(except?: LayoutContent | null, pane?: LayoutPane | null): number;
  CloseFloatingWindow(floating: LayoutFloatingWindow): boolean;
  PopOut(subject: LayoutElement): Window | null;
  FocusNextPane(reverse?: boolean): void; ShowNavigator(): void;
  ShowMenu(entries: (MenuEntry | null)[], x: number, y: number, title?: string): void;
  ShowContextMenu(model: LayoutContent, x: number, y: number): void;
  SaveLayout(format?: 'json' | 'xml'): string; LoadLayout(text: string | LayoutSnapshot, format?: 'json' | 'xml' | null): LayoutRoot;
  SaveToStorage(key?: string | null): boolean; LoadFromStorage(key?: string | null): boolean;
  ReleaseContent(contentId: string): boolean;
  TransferTo(destination: DockingManager, item: LayoutContent, target?: LayoutElement | null, position?: DockPosition): boolean;
  static readonly LayoutProperty: PropertyToken<LayoutRoot>; static readonly ActiveContentProperty: PropertyToken<unknown>;
  static readonly DocumentsSourceProperty: PropertyToken<Iterable<unknown>>; static readonly AnchorablesSourceProperty: PropertyToken<Iterable<unknown>>;
}
export class LayoutItem extends ObservableObject {
  constructor(manager: DockingManager, model: LayoutContent);
  Manager: DockingManager; LayoutElement: LayoutContent; Model: unknown;
  readonly View: HTMLElement | null;
  Title: string; ContentId: string | null; IconSource: unknown; ToolTip: unknown; Description: string;
  CanClose: boolean; CanFloat: boolean; IsSelected: boolean; IsActive: boolean; IsEnabled: boolean;
  ActivateCommand: RelayCommand; CloseCommand: RelayCommand; FloatCommand: RelayCommand; DockCommand: RelayCommand; DockAsDocumentCommand: RelayCommand;
  CloseAllButThisCommand: RelayCommand; CloseAllCommand: RelayCommand;
  NewVerticalTabGroupCommand: RelayCommand; NewHorizontalTabGroupCommand: RelayCommand;
  MoveToNextTabGroupCommand: RelayCommand; MoveToPreviousTabGroupCommand: RelayCommand;
  RaiseCanExecuteChanged(): void; Dispose(): void;
}
export class LayoutDocumentItem extends LayoutItem {}
export class LayoutAnchorableItem extends LayoutItem { CanHide: boolean; CanAutoHide: boolean; HideCommand: RelayCommand; AutoHideCommand: RelayCommand; }
export class DocumentClosingEventArgs extends CancelEventArgs { constructor(Document: LayoutDocument); Document: LayoutDocument; Model: LayoutDocument; }
export class DocumentClosedEventArgs { constructor(Document: LayoutDocument); Document: LayoutDocument; }
export class LayoutEventArgs { constructor(Layout: LayoutRoot); Layout: LayoutRoot; }
export class LayoutElementEventArgs { constructor(Element: LayoutElement); Element: LayoutElement; }
export class LayoutControl<T extends LayoutElement = LayoutElement> {
  constructor(model: T, manager?: DockingManager | null); Model: T; Manager: DockingManager | null;
  readonly Element: HTMLElement | null; Focus(): void;
}
export class LayoutDocumentControl extends LayoutControl<LayoutContent> {}
export class LayoutAnchorableControl extends LayoutDocumentControl {}
export class LayoutPanelControl extends LayoutControl<LayoutPanel> {}
export class LayoutDocumentPaneControl extends LayoutControl<LayoutDocumentPane> {}
export class LayoutAnchorablePaneControl extends LayoutControl<LayoutAnchorablePane> {}
export class LayoutDocumentPaneGroupControl extends LayoutControl<LayoutDocumentPaneGroup> {}
export class LayoutAnchorablePaneGroupControl extends LayoutControl<LayoutAnchorablePaneGroup> {}
export class LayoutAnchorGroupControl extends LayoutControl<LayoutAnchorGroup> {}
export class LayoutAnchorSideControl extends LayoutControl<LayoutAnchorSide> {}
export class LayoutFloatingWindowControl extends LayoutControl<LayoutFloatingWindow> {
  Show(): void; Close(): boolean; Dock(): boolean | LayoutPane; Maximize(): void; Restore(): void; readonly IsMaximized: boolean;
}
export class LayoutDocumentFloatingWindowControl extends LayoutFloatingWindowControl {}
export class LayoutAnchorableFloatingWindowControl extends LayoutFloatingWindowControl {}
export class LayoutAutoHideWindowControl extends LayoutControl<LayoutAnchorable> { Show(model?: LayoutAnchorable): boolean; Hide(): void; }
export class LayoutAnchorControl extends LayoutControl<LayoutAnchorable> {}
export class NavigatorWindow extends LayoutControl { constructor(manager: DockingManager); Show(): void; Close(): void; }
export function controlFor(model: LayoutElement, manager: DockingManager): LayoutControl;
export interface LayoutRecord { type: string; props: Record<string, unknown>; children?: LayoutRecord[]; rootPanel?: LayoutRecord; sides?: Record<string, LayoutRecord>; floatingWindows?: LayoutRecord[]; hidden?: LayoutRecord[]; activeContentId?: string | null; lastFocusedDocumentId?: string | null; }
export interface LayoutSnapshot { format: 'avalondock-web'; version: 1; layout: LayoutRecord; }
export interface DeserializeOptions { maxNodes?: number; maxDepth?: number; strict?: boolean; }
export interface TextWriter { Write?(text: string): unknown; write?(text: string): unknown; }
export class LayoutSerializationCallbackEventArgs extends CancelEventArgs { constructor(Model: LayoutContent, Content?: unknown); Model: LayoutContent; Content: unknown; }
export class LayoutSerializer {
  constructor(manager: DockingManager); Manager: DockingManager;
  LayoutSerializationCallback: EventSignal<this, LayoutSerializationCallbackEventArgs>;
}
export class JsonLayoutSerializer extends LayoutSerializer { Serialize(writer?: TextWriter | null): string; Deserialize(value: string | LayoutSnapshot, options?: DeserializeOptions): LayoutRoot; }
export class XmlLayoutSerializer extends LayoutSerializer { Serialize(writer?: TextWriter | null): string; Deserialize(value: string | Document, options?: DeserializeOptions): LayoutRoot; }
export function snapshot(root: LayoutRoot): LayoutSnapshot;
export function hydrate(data: string | LayoutSnapshot, registry?: Map<string, unknown>, options?: DeserializeOptions & {onContent?: (args: LayoutSerializationCallbackEventArgs) => void}): LayoutRoot;
export function toXml(root: LayoutRoot): string;
export function xmlToSnapshot(text: string): LayoutSnapshot;
export class Theme { constructor(name?: string, variables?: Record<string, string>); Name: string; Variables: Record<string, string>; GetResourceUri(): string; toString(): string; }
export class GenericTheme extends Theme { constructor(); }
export class AeroTheme extends Theme { constructor(); }
export class VS2010Theme extends Theme { constructor(); }
export class MetroTheme extends Theme { constructor(); }
export class DarkTheme extends Theme { constructor(); }
export class LightTheme extends Theme { constructor(); }
export class HighContrastTheme extends Theme { constructor(); }
export class AvalonDockElement extends HTMLElement {
  options?: DockingManagerOptions; manager: DockingManager | null;
  Layout: LayoutRoot | null; readonly DockingManager: DockingManager | null;
}
export function parseLayoutElement(element: Element): LayoutElement;
export function registerAvalonDock(tagName?: string): boolean;
export const version: '0.1.0';
export const Commands: Readonly<{RelayCommand: typeof RelayCommand}>;
export const Serialization: Readonly<{LayoutSerializer: typeof LayoutSerializer; XmlLayoutSerializer: typeof XmlLayoutSerializer; JsonLayoutSerializer: typeof JsonLayoutSerializer; LayoutSerializationCallbackEventArgs: typeof LayoutSerializationCallbackEventArgs; snapshot: typeof snapshot; hydrate: typeof hydrate; toXml: typeof toXml; xmlToSnapshot: typeof xmlToSnapshot}>;
export const Themes: Readonly<{Theme: typeof Theme; GenericTheme: typeof GenericTheme; AeroTheme: typeof AeroTheme; VS2010Theme: typeof VS2010Theme; MetroTheme: typeof MetroTheme; DarkTheme: typeof DarkTheme; LightTheme: typeof LightTheme; HighContrastTheme: typeof HighContrastTheme}>;
export const LayoutTypes: Readonly<{
  LayoutElement: typeof LayoutElement; LayoutGroupBase: typeof LayoutGroupBase; LayoutGroup: typeof LayoutGroup; LayoutPositionableGroup: typeof LayoutPositionableGroup;
  LayoutRoot: typeof LayoutRoot; LayoutPanel: typeof LayoutPanel; LayoutContent: typeof LayoutContent; LayoutDocument: typeof LayoutDocument; LayoutAnchorable: typeof LayoutAnchorable;
  LayoutPane: typeof LayoutPane; LayoutDocumentPane: typeof LayoutDocumentPane; LayoutAnchorablePane: typeof LayoutAnchorablePane;
  LayoutDocumentPaneGroup: typeof LayoutDocumentPaneGroup; LayoutAnchorablePaneGroup: typeof LayoutAnchorablePaneGroup;
  LayoutAnchorGroup: typeof LayoutAnchorGroup; LayoutAnchorSide: typeof LayoutAnchorSide; LayoutFloatingWindow: typeof LayoutFloatingWindow;
  LayoutDocumentFloatingWindow: typeof LayoutDocumentFloatingWindow; LayoutAnchorableFloatingWindow: typeof LayoutAnchorableFloatingWindow;
}>;
export const Layout: typeof LayoutTypes & {Serialization: typeof Serialization; AnchorSide: typeof AnchorSide; AnchorableShowStrategy: typeof AnchorableShowStrategy; ObservableCollection: typeof ObservableCollection; GridLength: typeof GridLength; contents: typeof contents; validateLayout: typeof validateLayout; LayoutTypes: typeof LayoutTypes};
export const Controls: Readonly<{LayoutControl: typeof LayoutControl; LayoutDocumentControl: typeof LayoutDocumentControl; LayoutAnchorableControl: typeof LayoutAnchorableControl; LayoutPanelControl: typeof LayoutPanelControl; LayoutDocumentPaneControl: typeof LayoutDocumentPaneControl; LayoutAnchorablePaneControl: typeof LayoutAnchorablePaneControl; LayoutDocumentPaneGroupControl: typeof LayoutDocumentPaneGroupControl; LayoutAnchorablePaneGroupControl: typeof LayoutAnchorablePaneGroupControl; LayoutAnchorGroupControl: typeof LayoutAnchorGroupControl; LayoutAnchorSideControl: typeof LayoutAnchorSideControl; LayoutFloatingWindowControl: typeof LayoutFloatingWindowControl; LayoutDocumentFloatingWindowControl: typeof LayoutDocumentFloatingWindowControl; LayoutAnchorableFloatingWindowControl: typeof LayoutAnchorableFloatingWindowControl; LayoutAutoHideWindowControl: typeof LayoutAutoHideWindowControl; LayoutAnchorControl: typeof LayoutAnchorControl; NavigatorWindow: typeof NavigatorWindow; controlFor: typeof controlFor}>;
export const AvalonDock: typeof Layout & typeof Serialization & typeof Themes & typeof Controls & {
  DockingManager: typeof DockingManager; AvalonDockElement: typeof AvalonDockElement; registerAvalonDock: typeof registerAvalonDock;
  Layout: typeof Layout; Serialization: typeof Serialization; Themes: typeof Themes; Controls: typeof Controls; Commands: typeof Commands;
  EventSignal: typeof EventSignal; ObservableObject: typeof ObservableObject; RelayCommand: typeof RelayCommand; GridUnitType: typeof GridUnitType; Orientation: typeof Orientation;
  LayoutItem: typeof LayoutItem; LayoutDocumentItem: typeof LayoutDocumentItem; LayoutAnchorableItem: typeof LayoutAnchorableItem;
  CancelEventArgs: typeof CancelEventArgs; PropertyChangedEventArgs: typeof PropertyChangedEventArgs;
  DocumentClosingEventArgs: typeof DocumentClosingEventArgs; DocumentClosedEventArgs: typeof DocumentClosedEventArgs; LayoutEventArgs: typeof LayoutEventArgs; LayoutElementEventArgs: typeof LayoutElementEventArgs;
  getSchema: typeof getSchema; properties: typeof properties; finite: typeof finite; positive: typeof positive; boolean: typeof boolean; uid: typeof uid;
  version: typeof version;
};
export default AvalonDock;
declare global { interface HTMLElementTagNameMap { 'avalon-dock': AvalonDockElement; } }
