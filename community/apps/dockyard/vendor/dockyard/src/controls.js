import { LayoutContent, LayoutDocument, LayoutAnchorable, LayoutPanel, LayoutDocumentPane, LayoutAnchorablePane, LayoutDocumentPaneGroup, LayoutAnchorablePaneGroup, LayoutAnchorGroup, LayoutAnchorSide, LayoutDocumentFloatingWindow, LayoutAnchorableFloatingWindow } from './model.js';
/** View adapters expose the actual retained DOM element; the layout model remains authoritative. */
export class LayoutControl {
  constructor(model,manager=model?.Manager){this.Model=model;this.Manager=manager;}
  get Element(){return this.Manager?._view?.elementFor(this.Model)||null;}
  Focus(){this.Element?.focus({preventScroll:true});}
}
export class LayoutDocumentControl extends LayoutControl {get Element(){return this.Manager?._view?.contentElement(this.Model)||null;}}
export class LayoutAnchorableControl extends LayoutDocumentControl {}
export class LayoutPanelControl extends LayoutControl {}
export class LayoutDocumentPaneControl extends LayoutControl {}
export class LayoutAnchorablePaneControl extends LayoutControl {}
export class LayoutDocumentPaneGroupControl extends LayoutControl {}
export class LayoutAnchorablePaneGroupControl extends LayoutControl {}
export class LayoutAnchorGroupControl extends LayoutControl {}
export class LayoutAnchorSideControl extends LayoutControl {get Element(){return this.Manager?._view?.sideElements[this.Model.Side]||null;}}
export class LayoutFloatingWindowControl extends LayoutControl {
  Show(){this.Manager?._view?.requestRender();}
  Close(){return this.Manager.CloseFloatingWindow(this.Model);}
  Dock(){return this.Manager.Dock(this.Model);}
  Maximize(){this.Manager.Transaction('Maximize window',()=>{this.Model.IsMaximized=true;});}
  Restore(){this.Manager.Transaction('Restore window',()=>{this.Model.IsMaximized=false;});}
  get IsMaximized(){return this.Model.IsMaximized;}
}
export class LayoutDocumentFloatingWindowControl extends LayoutFloatingWindowControl {}
export class LayoutAnchorableFloatingWindowControl extends LayoutFloatingWindowControl {}
export class LayoutAutoHideWindowControl extends LayoutControl {
  get Element(){return this.Manager?._view?.peek||null;}
  Show(model=this.Model){return this.Manager.ShowAutoHideWindow(model);}
  Hide(){this.Manager.HideAutoHideWindow();}
}
export class LayoutAnchorControl extends LayoutControl {
  get Element(){return this.Manager?._view?.records.get(this.Model.Parent?.Id)?.buttons.get(this.Model.ContentId)||null;}
}
export class NavigatorWindow extends LayoutControl {
  constructor(manager){super(null,manager);}
  get Element(){return this.Manager?._view?.navigator||null;}
  Show(){this.Manager.ShowNavigator();}
  Close(){this.Manager?._view?.closeNavigator(false);}
}
const types=[[LayoutDocument,LayoutDocumentControl],[LayoutAnchorable,LayoutAnchorableControl],[LayoutDocumentPane,LayoutDocumentPaneControl],[LayoutAnchorablePane,LayoutAnchorablePaneControl],[LayoutDocumentPaneGroup,LayoutDocumentPaneGroupControl],[LayoutAnchorablePaneGroup,LayoutAnchorablePaneGroupControl],[LayoutPanel,LayoutPanelControl],[LayoutAnchorGroup,LayoutAnchorGroupControl],[LayoutAnchorSide,LayoutAnchorSideControl],[LayoutDocumentFloatingWindow,LayoutDocumentFloatingWindowControl],[LayoutAnchorableFloatingWindow,LayoutAnchorableFloatingWindowControl]];
export function controlFor(model,manager){const Type=types.find(([Model])=>model instanceof Model)?.[1]||LayoutControl;return new Type(model,manager);}
