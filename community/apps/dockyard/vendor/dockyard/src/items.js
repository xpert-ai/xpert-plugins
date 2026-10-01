import { ObservableObject, RelayCommand, CancelEventArgs } from './events.js';
import { LayoutDocumentPane, LayoutAnchorable, LayoutDocument, LayoutFloatingWindow } from './model.js';
export class LayoutItem extends ObservableObject {
  constructor(manager, model) {
    super(); this.Manager = manager; this.LayoutElement = model; this.Model = model.Content;
    this._unsubscribe = model.PropertyChanged.add((_sender, args) => { this.PropertyChanged.emit(this, args); this.RaiseCanExecuteChanged(); });
    const command = (name, execute, canExecute) => { this[name] = new RelayCommand(execute, canExecute); };
    command('ActivateCommand', () => manager.Activate(model), () => model.IsEnabled && model.Root === manager.Layout);
    command('CloseCommand', () => model.Close(), () => model.CanClose && model.Root === manager.Layout);
    command('FloatCommand', () => model.Float(), () => model.CanFloat && model.CanMove && !model.IsFloating);
    command('DockAsDocumentCommand', () => model.DockAsDocument(), () => model.CanDock && model.CanMove && !(model.Parent instanceof LayoutDocumentPane) && (!(model instanceof LayoutAnchorable) || model.CanDockAsTabbedDocument));
    command('CloseAllButThisCommand', () => manager.CloseAll(model, model.Parent instanceof LayoutDocumentPane ? model.Parent : null), () => model.Parent instanceof LayoutDocumentPane && model.Parent.ChildrenCount > 1);
    command('CloseAllCommand', () => manager.CloseAll(null, model.Parent instanceof LayoutDocumentPane ? model.Parent : null), () => model.Parent instanceof LayoutDocumentPane);
    command('NewVerticalTabGroupCommand', () => manager.NewTabGroup(model, 'Vertical'), () => model.Parent instanceof LayoutDocumentPane && model.Parent.ChildrenCount > 1 && model.CanMove && manager.CanDockAt(model, model.Parent, 'Right'));
    command('NewHorizontalTabGroupCommand', () => manager.NewTabGroup(model, 'Horizontal'), () => model.Parent instanceof LayoutDocumentPane && model.Parent.ChildrenCount > 1 && model.CanMove && manager.CanDockAt(model, model.Parent, 'Bottom'));
    command('MoveToNextTabGroupCommand', () => manager.MoveToTabGroup(model, 1), () => this._canMoveGroup(1));
    command('MoveToPreviousTabGroupCommand', () => manager.MoveToTabGroup(model, -1), () => this._canMoveGroup(-1));
    command('DockCommand', () => manager.Dock(model), () => model.CanDock && model.CanMove && (model.IsFloating || model.IsAutoHidden));
  }
  RaiseCanExecuteChanged() { for (const value of Object.values(this)) if (value instanceof RelayCommand) value.RaiseCanExecuteChanged(); }
  Dispose() { this._unsubscribe?.(); this._unsubscribe = null; }
  _canMoveGroup(direction) {
    const panes = [...this.Manager.Layout.RootPanel.Descendents()].filter(x => x instanceof LayoutDocumentPane);
    const target = panes[panes.indexOf(this.LayoutElement.Parent) + direction];
    return !!target && this.Manager.CanDockAt(this.LayoutElement, target);
  }
  get View() { return this.Manager._view?.contentElement(this.LayoutElement); }
}
for (const key of ['Title','ContentId','IconSource','ToolTip','CanClose','CanFloat','IsSelected','IsActive','IsEnabled','Description']) Object.defineProperty(LayoutItem.prototype, key, {
  get() { return this.LayoutElement[key]; }, set(value) { this.LayoutElement[key] = value; }
});
export class LayoutDocumentItem extends LayoutItem {}
export class LayoutAnchorableItem extends LayoutItem {
  constructor(manager, model) {
    super(manager, model);
    this.HideCommand = new RelayCommand(() => model.Hide(), () => model.CanHide && !model.IsHidden);
    this.AutoHideCommand = new RelayCommand(() => model.ToggleAutoHide(), () => model.CanAutoHide && !model.IsFloating && (model.IsAutoHidden || !!model.Parent?.CanAutoHide));
  }
  get CanHide() { return this.LayoutElement.CanHide; }
  set CanHide(value) { this.LayoutElement.CanHide = value; }
  get CanAutoHide() { return this.LayoutElement.CanAutoHide; }
  set CanAutoHide(value) { this.LayoutElement.CanAutoHide = value; }
}
export class DocumentClosingEventArgs extends CancelEventArgs { constructor(Document) { super({Document, Model:Document}); } }
export class DocumentClosedEventArgs { constructor(Document) { this.Document = Document; } }
export class LayoutEventArgs { constructor(Layout) { this.Layout = Layout; } }
export class LayoutElementEventArgs { constructor(Element) { this.Element = Element; } }
