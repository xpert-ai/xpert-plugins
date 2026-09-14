import { DockingManager } from './manager.js';
import { LayoutTypes, LayoutRoot, LayoutPanel, LayoutContent, LayoutAnchorSide } from './model.js';
import { getSchema } from './events.js';
const HTMLElementBase = globalThis.HTMLElement || class {};
const names=Object.fromEntries(Object.entries(LayoutTypes).map(([name,Type])=>[name.toLowerCase(),Type]));
export function parseLayoutElement(element) {
  const normalized=element.localName.replace(/-/g,'').toLowerCase(),Type=names[normalized];
  if(!Type)throw new TypeError(`Unknown declarative layout element: ${element.localName}`);
  const model=new Type(),schema=getSchema(Type),lookup=Object.fromEntries([...Object.keys(schema),'Id','IsSelected','IsActive','SelectedContentIndex'].map(key=>[key.toLowerCase(),key]));
  for(const attr of element.attributes){
    const key=lookup[attr.name.replace(/-/g,'').toLowerCase()];if(!key)continue;
    if(key==='SelectedContentIndex'||key==='IsActive'||key==='IsSelected')continue;
    let value=attr.value;const defaultValue=schema[key]?.default;
    if(typeof defaultValue==='boolean')value=value===''||value.toLowerCase()==='true';else if(typeof defaultValue==='number')value=Number(value);
    model[key]=value;
  }
  if(model instanceof LayoutContent){
    const container=element.ownerDocument.createElement('div');container.className='ad-user-content';container.style.cssText='height:100%;min-height:0;overflow:auto';
    const template=element.querySelector(':scope > template');
    if(template)container.append(template.content.cloneNode(true));else container.append(...element.childNodes);
    model.Content=container;
  }else if(model instanceof LayoutRoot){
    for(const child of [...element.children]){
      const tag=child.localName.replace(/-/g,'').toLowerCase();
      if(tag==='layoutpanel')model.RootPanel=parseLayoutElement(child);
      else if(['leftside','rightside','topside','bottomside'].includes(tag)){
        const side=tag.replace('side','');const name=side[0].toUpperCase()+side.slice(1);const sideModel=new LayoutAnchorSide({Side:name});
        for(const group of [...child.children])sideModel.Children.Add(parseLayoutElement(group));model[`${name}Side`]=sideModel;
      }else if(tag==='floatingwindows'||tag==='hidden')for(const item of [...child.children])model[tag==='hidden'?'Hidden':'FloatingWindows'].Add(parseLayoutElement(item));
      else throw new TypeError(`Unexpected LayoutRoot child: ${child.localName}`);
    }
  }else for(const child of [...element.children])model.Children.Add(parseLayoutElement(child));
  if(element.hasAttribute('selected-content-index'))model.SelectedContentIndex=Number(element.getAttribute('selected-content-index'));
  if(element.getAttribute('is-selected')==='true')model.IsSelected=true;
  if(element.getAttribute('is-active')==='true')model.IsActive=true;
  return model;
}
export class AvalonDockElement extends HTMLElementBase {
  static get observedAttributes(){return['theme','dir'];}
  connectedCallback(){
    if(this.manager)return;
    queueMicrotask(()=>{
      if(!this.isConnected||this.manager)return;
      const definition=[...this.children].find(child=>child.localName.replace(/-/g,'').toLowerCase()==='layoutroot');
      const layout=this._layout||(definition?parseLayoutElement(definition):null);
      definition?.remove();
      this.manager=new DockingManager(this,{...(this.options||{}),...(layout?{Layout:layout}:{}),Theme:this.getAttribute('theme')||this.options?.Theme||'dark',FlowDirection:this.getAttribute('dir')==='rtl'?'RightToLeft':'LeftToRight'});
      this.dispatchEvent(new CustomEvent('ready',{detail:{manager:this.manager},bubbles:true}));
    });
  }
  disconnectedCallback(){queueMicrotask(()=>{if(!this.isConnected&&this.manager){this._layout=this.manager.Layout;this.manager.Dispose();this.manager=null;}});}
  attributeChangedCallback(name,_old,value){if(!this.manager)return;if(name==='theme')this.manager.Theme=value||'dark';if(name==='dir')this.manager.FlowDirection=value==='rtl'?'RightToLeft':'LeftToRight';}
  get Layout(){return this.manager?.Layout||this._layout||null;}
  set Layout(value){if(this.manager)this.manager.Layout=value;else this._layout=value;}
  get DockingManager(){return this.manager;}
}
export function registerAvalonDock(tagName='avalon-dock') {
  if(typeof customElements==='undefined')return false;
  if(!customElements.get(tagName))customElements.define(tagName,tagName==='avalon-dock'?AvalonDockElement:class extends AvalonDockElement{});
  return true;
}
registerAvalonDock();
