export function colorControl(tokens) {
  return {key:'accent',label:'强调色',type:'color',default:tokens.accent,options:[tokens.accent,tokens.secondary,tokens.foreground].map((value,i)=>({value,label:`颜色 ${i+1}`}))};
}

export const chromeControl={key:'showChrome',label:'页眉与页码',type:'toggle',default:true};
const focusControl=(countKey,max)=>({key:'focusIndex',label:'强调项',type:'number',default:0,min:0,max:max-1,step:1,maxFromKey:countKey,maxFromKeyOffset:-1});
const countControl=(key,label,def,max,arrays)=>({key,label,type:'number',default:def,min:1,max,step:1,countArrays:arrays});
const mediaControls=max=>[
  {key:'imageSlotCount',label:'图片数量',type:'number',default:max,min:0,max,step:1,countArrays:['images']},
  {key:'images',label:'图片 / 视频',type:'images',default:[],countKey:'imageSlotCount'},
  {key:'imageFit',label:'媒体填充',type:'select',default:'cover',options:[{value:'cover',label:'裁切铺满'},{value:'contain',label:'完整显示'}]},
];

export function controlsForSlot(slot) {
  if(slot==='metrics'||slot==='scorecard') return [countControl('metricCount','指标数量',3,3,['metrics']),focusControl('metricCount',3)];
  if(['cards','cards2','bento'].includes(slot)) return [countControl('itemCount','卡片数量',3,3,['items']),focusControl('itemCount',3)];
  if(['timeline','roadmap','process','architecture','bars','matrix','swot','agenda','risks','funnel','waterfall'].includes(slot)) return [countControl('itemCount','项目数量',4,4,['items']),focusControl('itemCount',4)];
  if(slot==='donut') return [countControl('itemCount','扇区数量',4,5,['segments']),focusControl('itemCount',5)];
  if(slot==='radar') return [countControl('itemCount','维度数量',5,6,['axes']),focusControl('itemCount',6)];
  if(slot==='table') return [countControl('rowCount','表格行数',4,4,['rows']),focusControl('rowCount',4)];
  if(slot==='case-media'||slot==='media-banner') return [...mediaControls(1),{key:'imageSide',label:'媒体位置',type:'select',default:'right',options:[{value:'left',label:'左侧'},{value:'right',label:'右侧'}]},{key:'showCaption',label:'显示说明',type:'toggle',default:true}];
  if(slot==='media-gallery') return [...mediaControls(3),{key:'galleryLayout',label:'画廊布局',type:'select',default:'grid',options:[{value:'grid',label:'主次网格'},{value:'strip',label:'等宽横排'}]},{key:'showCaption',label:'显示说明',type:'toggle',default:true}];
  if(slot==='media-compare') return mediaControls(2);
  return [];
}

export function applyGeneratedControls(props) {
  const next={...props};
  if(Array.isArray(next.metrics)&&Number.isFinite(Number(next.metricCount))) next.metrics=next.metrics.slice(0,Number(next.metricCount));
  if(Array.isArray(next.items)&&Number.isFinite(Number(next.itemCount))) next.items=next.items.slice(0,Number(next.itemCount));
  if(Array.isArray(next.segments)&&Number.isFinite(Number(next.itemCount))) next.segments=next.segments.slice(0,Number(next.itemCount));
  if(Array.isArray(next.axes)&&Number.isFinite(Number(next.itemCount))) next.axes=next.axes.slice(0,Number(next.itemCount));
  if(Array.isArray(next.rows)&&Number.isFinite(Number(next.rowCount))) next.rows=next.rows.slice(0,Number(next.rowCount));
  return next;
}
