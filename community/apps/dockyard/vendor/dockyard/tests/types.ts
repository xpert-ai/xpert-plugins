import AvalonDock, {
  DockingManager, LayoutRoot, LayoutPanel, LayoutDocumentPane, LayoutAnchorablePane,
  LayoutDocument, LayoutAnchorable, ObservableCollection, XmlLayoutSerializer,
  DarkTheme, GridLength, AnchorableShowStrategy, ContentFactory, Layout, Controls,
  AvalonDockElement, RelayCommand
} from '../src/index.js';

const textarea = document.createElement('textarea');
const docs = new LayoutDocumentPane({Children:[new LayoutDocument({Title:'Editor',ContentId:'editor',Content:textarea})]});
const tools = new LayoutAnchorablePane({DockWidth:240, Children:[new LayoutAnchorable({ContentId:'tools',Title:'Tools'})]});
const root = new LayoutRoot({RootPanel:new LayoutPanel({Orientation:'Horizontal',Children:[tools, docs]})});
const manager = new DockingManager(document.createElement('main'), {
  Layout:root, Theme:new DarkTheme(),
  DocumentClosing(_sender,args) { if (args.Document.IsModified) args.Cancel = true; },
  DocumentHeaderTemplate: model => model.Title,
  LayoutItemTemplate(content) { return content instanceof Node ? content : String(content); },
  LayoutUpdateStrategy: { BeforeInsertDocument(_layout, doc, destination) { destination?.Children.Add(doc); return !!destination; } }
});
const factory: ContentFactory = (model, mgr) => {const node=document.createElement('section');node.textContent=model.Title;return{element:node,dispose(){mgr.HideAutoHideWindow();}};};
const model=manager.AddDocument({ContentId:'factory',Content:factory});
model.PropertyChanged.add((sender,args)=>console.log(sender.Title,args.PropertyName));
model.Float(); model.Dock(); manager.GetLayoutItemFromModel(model).CloseCommand.CanExecute();
manager.DocumentsSource=new ObservableCollection([{ContentId:'bound',Title:'Bound'}]);
manager.AddAnchorable({ContentId:'bottom'},AnchorableShowStrategy.Bottom|AnchorableShowStrategy.Most);
docs.DockWidth='2*';const width:GridLength=docs.DockWidth;
const serializer=new XmlLayoutSerializer(manager);
serializer.LayoutSerializationCallback.add((_sender,args)=>{if(args.Model.ContentId==='editor')args.Content=textarea;});
serializer.Deserialize(serializer.Serialize());
manager.ShowMenu([{Label:'Float',Execute:()=>model.Float(),CanExecute:()=>model.CanFloat}],100,100);
const adapter=new Controls.LayoutDocumentPaneControl(docs,manager);adapter.Element?.focus();
const element:AvalonDockElement=document.createElement('avalon-dock');element.Layout=new Layout.LayoutRoot(new Layout.LayoutPanel());
const headless=new AvalonDock.DockingManager();headless.Dispose();
const command=new RelayCommand<number,string>(value=>String(value));command.Execute(1);
manager.Transaction('Resize',()=>{tools.DockWidth=width;});manager.Dispose();
// @ts-expect-error invalid orientation must be caught
new LayoutPanel({Orientation:'Diagonal'});
// @ts-expect-error documents cannot be inserted into tool panes
new LayoutAnchorablePane({Children:[new LayoutDocument()]});
// @ts-expect-error invalid capability type must be caught
new LayoutDocument({CanFloat:'yes'});
