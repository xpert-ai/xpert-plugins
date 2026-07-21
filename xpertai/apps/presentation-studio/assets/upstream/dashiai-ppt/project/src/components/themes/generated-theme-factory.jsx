import React from 'react';
import { normalizeRuntimePages } from './runtime-helpers.jsx';
import { applyGeneratedControls, chromeControl, colorControl, controlsForSlot } from './generated-theme-common/controls.js';
import { Body, Eyebrow, Frame, Title } from './generated-theme-common/primitives.jsx';

const visual = tokens => tokens.visualPreset || {};
function cardGrid(tokens,count) {
  const flow=visual(tokens).cardFlow;
  if(flow==='rail'||flow==='split') return count===3?'1.35fr .82fr .82fr':`repeat(${count},1fr)`;
  if(flow==='columns') return count===3?'1fr 1fr 1fr':`repeat(${count},1fr)`;
  if(flow==='dashboard'||flow==='ledger'||flow==='terminal') return `repeat(${count},1fr)`;
  if(flow==='mosaic') return count===3?'1.15fr .85fr .85fr':`repeat(${count},1fr)`;
  return `repeat(${count},1fr)`;
}
function surface(tokens,index=0,active=false) {
  const flow=visual(tokens).cardFlow;
  const playful=['stagger','mosaic','pixel'].includes(flow);
  return {padding:flow==='dashboard'||flow==='terminal'?20:25,minHeight:205,position:'relative',background:active?tokens.accent:`${tokens.foreground}${flow==='glass'?'12':'0d'}`,color:active?tokens.background:tokens.foreground,transform:playful?`translateY(${index%2?14:0}px) rotate(${index%2?1:-.6}deg)`:undefined};
}
function chartPanel(tokens) {
  const flow=visual(tokens).cardFlow;
  return {padding:['dashboard','terminal','mission'].includes(flow)?22:0,border:['dashboard','terminal','mission'].includes(flow)?`1px solid ${tokens.accent}44`:undefined,background:['dashboard','terminal'].includes(flow)?`${tokens.foreground}06`:undefined};
}

function Cover({ tokens, kicker, title, subtitle, page }) {
  const mode=tokens.layoutPreset?.coverMode;
  const centered=mode==='centered';
  const split=mode==='split';
  const playful=mode==='playful';
  const panel=split?{left:'8%',right:'42%',top:'24%',bottom:'18%',borderLeft:`8px solid ${tokens.accent}`,paddingLeft:30}:centered?{left:'14%',right:'14%',top:'28%',textAlign:'center'}:playful?{left:'9%',right:'28%',bottom:'15%',transform:'rotate(-1deg)',padding:28,background:`${tokens.background}dd`,border:`3px solid ${tokens.foreground}`,boxShadow:`14px 14px 0 ${tokens.accent}`}: {left:64,right:64,bottom:66};
  return <Frame tokens={tokens} page={page}><div style={{position:'absolute',...panel}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={centered?68:74}>{title}</Title><div style={{height:centered?2:7,width:centered?220:150,background:tokens.accent,margin:centered?'28px auto 22px':'28px 0 22px'}}/><div style={centered?{display:'flex',justifyContent:'center'}:{}}><Body>{subtitle}</Body></div></div>{split&&<div style={{position:'absolute',right:'8%',top:'21%',bottom:'15%',width:'27%',border:`1px solid ${tokens.accent}66`,background:`linear-gradient(145deg,${tokens.accent}30,transparent)`,display:'grid',placeItems:'center'}}><span style={{fontSize:88,fontWeight:900,color:tokens.accent,opacity:.72}}>{tokens.profile?.ornament?.slice(0,2).toUpperCase()}</span></div>}</Frame>;
}
function Statement({ tokens, kicker, title, subtitle, page }) { return <Frame tokens={tokens} page={page} inverse>
  <div style={{ display:'grid', placeItems:'center', height:'100%', textAlign:'center' }}><div><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={66} serif>{title}</Title><div style={{ margin:'28px auto 0' }}><Body width={900}>{subtitle}</Body></div></div></div>
</Frame>; }
function BigNumber({ tokens, kicker, value, unit, title, body, page }) { return <Frame tokens={tokens} page={page}><div style={{height:'100%',display:'grid',gridTemplateColumns:'1.1fr .9fr',alignItems:'center',gap:54}}><div><Eyebrow tokens={tokens}>{kicker}</Eyebrow><div style={{fontSize:150,fontWeight:900,letterSpacing:'-.07em',lineHeight:.82,color:tokens.accent}}>{value}<span style={{fontSize:38,letterSpacing:0,marginLeft:12}}>{unit}</span></div></div><div style={{borderLeft:`2px solid ${tokens.foreground}22`,paddingLeft:40}}><Title size={42}>{title}</Title><div style={{marginTop:24}}><Body width={430}>{body}</Body></div></div></div></Frame>; }
function Metrics({ tokens, kicker, title, metrics, page }) { return <Frame tokens={tokens} page={page}>
  <div style={{ marginTop:48 }}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={48}>{title}</Title><div style={{ display:'grid', gridTemplateColumns:cardGrid(tokens,metrics.length), gap:22, marginTop:54 }}>{metrics.map((m,i)=><div className="theme-surface" key={i} style={{ ...surface(tokens,i,i===tokens.focusIndex),minHeight:170,borderTop:`5px solid ${i===tokens.focusIndex?tokens.accent:tokens.secondary}`, opacity:i===tokens.focusIndex?1:.76 }}><div style={{ fontSize:54, fontWeight:850, letterSpacing:'-.04em' }}>{m.value}</div><div style={{ fontSize:17, fontWeight:700, marginTop:8 }}>{m.label}</div><div style={{ fontSize:14, opacity:.62, marginTop:8, lineHeight:1.45 }}>{m.note}</div></div>)}</div></div>
</Frame>; }
function Cards({ tokens, kicker, title, items, page }) { const cardMode=tokens.layoutPreset?.cardMode; return <Frame tokens={tokens} page={page}>
  <div style={{ marginTop:42 }}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={45}>{title}</Title><div style={{ display:'grid', gridTemplateColumns:cardGrid(tokens,items.length), gap:cardMode==='soft'?24:18, marginTop:38 }}>{items.map((x,i)=><div className="theme-surface" key={i} style={surface(tokens,i,i===tokens.focusIndex)}><div style={{ fontSize:13, opacity:.7,fontFamily:'monospace' }}>0{i+1}</div><div style={{ fontSize:24, fontWeight:800, marginTop:35 }}>{x.title}</div><div style={{ fontSize:15, lineHeight:1.55, opacity:.72, marginTop:12 }}>{x.body}</div></div>)}</div></div>
</Frame>; }
function Timeline({ tokens, kicker, title, items, page }) { const mode=visual(tokens).timeline; const vertical=mode==='vertical'; return <Frame tokens={tokens} page={page}>
  <div style={{ marginTop:42 }}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={45}>{title}</Title><div style={{ display:'grid', gridTemplateColumns:vertical?'1fr 1fr':`repeat(${items.length},1fr)`, gap:vertical?14:0, marginTop:vertical?34:72, borderTop:vertical?'none':`2px solid ${tokens.foreground}33` }}>{items.map((x,i)=><div className={mode==='steps'?'theme-surface':undefined} key={i} style={{ padding:vertical?'17px 22px 17px 64px':'28px 24px 0 0', position:'relative',borderLeft:vertical?`3px solid ${i===tokens.focusIndex?tokens.accent:tokens.secondary}`:undefined,background:vertical?`${tokens.foreground}08`:undefined,transform:mode==='steps'?`translateY(${i%2?18:0}px)`:undefined }}><span style={{ position:'absolute', width:mode==='steps'?26:16, height:mode==='steps'?26:16, borderRadius:mode==='steps'?4:20, background:i===tokens.focusIndex?tokens.accent:tokens.secondary, top:vertical?20:-9,left:vertical?20:0 }}/><div style={{ color:tokens.accent, fontWeight:800, fontSize:14 }}>{x.time}</div><div style={{ fontSize:22, fontWeight:750, marginTop:10 }}>{x.title}</div><div style={{ fontSize:14, opacity:.65, lineHeight:1.5, marginTop:9 }}>{x.body}</div></div>)}</div></div>
</Frame>; }
function Compare({ tokens, kicker, title, left, right, page }) { return <Frame tokens={tokens} page={page}>
  <div style={{ marginTop:42 }}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={45}>{title}</Title><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:22, marginTop:38 }}><CompareSide x={left} tokens={tokens}/><CompareSide x={right} tokens={tokens} accent/></div></div>
</Frame>; }
function CompareSide({ x,tokens,accent }) { return <div style={{ padding:28, border:`2px solid ${accent?tokens.accent:tokens.foreground+'22'}`, minHeight:260 }}><div style={{ fontSize:28,fontWeight:850 }}>{x.title}</div>{x.points.map((p,i)=><div key={i} style={{ display:'flex', gap:12, borderTop:`1px solid ${tokens.foreground}1f`, paddingTop:14, marginTop:14, fontSize:16 }}><b style={{ color:tokens.accent }}>0{i+1}</b><span>{p}</span></div>)}</div>; }
function Process({ tokens, kicker, title, items, page }) { return <Frame tokens={tokens} page={page}>
  <div style={{ marginTop:42 }}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={45}>{title}</Title><div style={{ display:'flex', alignItems:'stretch', marginTop:54 }}>{items.map((x,i)=><React.Fragment key={i}><div style={{ flex:1, padding:22, background:i%2?`${tokens.secondary}22`:`${tokens.accent}22`, minHeight:180 }}><div style={{ fontSize:42,fontWeight:900,color:tokens.accent }}>{i+1}</div><div style={{ fontSize:21,fontWeight:800,marginTop:18 }}>{x.title}</div><div style={{ fontSize:14,opacity:.68,lineHeight:1.5,marginTop:8 }}>{x.body}</div></div>{i<items.length-1&&<div style={{ alignSelf:'center',fontSize:27,padding:'0 9px',color:tokens.accent }}>→</div>}</React.Fragment>)}</div></div>
</Frame>; }
function Quote({ tokens, kicker, quote, author, page }) { return <Frame tokens={tokens} page={page} inverse>
  <div style={{ height:'100%', display:'flex', flexDirection:'column', justifyContent:'center' }}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><div style={{ color:tokens.accent,fontFamily:SERIF,fontSize:92,lineHeight:.7 }}>“</div><Title size={51} serif>{quote}</Title><div style={{ marginTop:35,fontSize:16,fontWeight:750,letterSpacing:'.08em' }}>— {author}</div></div>
</Frame>; }
function Bars({ tokens, kicker, title, items, page }) { const max=Math.max(...items.map(x=>x.value)); return <Frame tokens={tokens} page={page}>
  <div style={{ marginTop:42 }}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={45}>{title}</Title><div style={{ marginTop:42 }}>{items.map((x,i)=><div key={i} style={{ display:'grid',gridTemplateColumns:'150px 1fr 70px',alignItems:'center',gap:16,margin:'15px 0' }}><div style={{ fontSize:15,fontWeight:700 }}>{x.label}</div><div style={{ height:22,background:`${tokens.foreground}12` }}><div style={{ width:`${x.value/max*100}%`,height:'100%',background:i===0?tokens.accent:tokens.secondary }}/></div><div style={{ fontSize:18,fontWeight:850 }}>{x.value}</div></div>)}</div></div>
</Frame>; }
function Matrix({ tokens, kicker, title, items, page }) { return <Frame tokens={tokens} page={page}>
  <div style={{ marginTop:38 }}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={42}>{title}</Title><div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:30 }}>{items.map((x,i)=><div key={i} style={{ padding:20,border:`1px solid ${tokens.foreground}26`,background:i===0?`${tokens.accent}20`:'transparent' }}><b style={{ fontSize:19 }}>{x.title}</b><div style={{ fontSize:14,opacity:.68,marginTop:8 }}>{x.body}</div></div>)}</div></div>
</Frame>; }
function Agenda({ tokens, kicker, title, items, page }) { return <Frame tokens={tokens} page={page}>
  <div style={{marginTop:38}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={43}>{title}</Title><div style={{marginTop:34}}>{items.map((x,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'65px 230px 1fr',gap:18,padding:'17px 0',borderTop:`1px solid ${tokens.foreground}28`,background:i===tokens.focusIndex?`${tokens.accent}16`:'transparent'}}><b style={{color:tokens.accent,fontSize:18}}>0{i+1}</b><b style={{fontSize:20}}>{x.title}</b><span style={{fontSize:15,opacity:.66}}>{x.body}</span></div>)}</div></div>
</Frame>; }
function Risks({ tokens, kicker, title, items, page }) { return <Frame tokens={tokens} page={page}>
  <div style={{marginTop:38}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={43}>{title}</Title><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:30}}>{items.map((x,i)=><div key={i} style={{padding:20,border:`2px solid ${i===tokens.focusIndex?tokens.accent:tokens.foreground+'22'}`}}><div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:tokens.accent,fontWeight:800}}><span>{x.level}</span><span>{x.owner}</span></div><div style={{fontSize:20,fontWeight:800,marginTop:13}}>{x.title}</div><div style={{fontSize:14,opacity:.67,marginTop:9}}>{x.action}</div></div>)}</div></div>
</Frame>; }
function DataTable({ tokens, kicker, title, columns, rows, page }) { return <Frame tokens={tokens} page={page}>
  <div style={{marginTop:38}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={41}>{title}</Title><div className="theme-surface" style={{marginTop:28,overflow:'hidden'}}><div style={{display:'grid',gridTemplateColumns:`repeat(${columns.length},1fr)`,background:['journal','ledger'].includes(visual(tokens).grammar)?'transparent':tokens.foreground,color:['journal','ledger'].includes(visual(tokens).grammar)?tokens.foreground:tokens.background,borderBottom:`3px solid ${tokens.accent}`}}>{columns.map((x,i)=><b key={i} style={{padding:'13px 16px',fontSize:14,textTransform:'uppercase',letterSpacing:'.06em'}}>{x}</b>)}</div>{rows.map((row,i)=><div key={i} style={{display:'grid',gridTemplateColumns:`repeat(${columns.length},1fr)`,background:i===tokens.focusIndex?`${tokens.accent}20`:i%2?`${tokens.foreground}06`:'transparent',borderTop:`1px solid ${tokens.foreground}18`}}>{row.map((cell,j)=><span key={j} style={{padding:'14px 16px',fontSize:14,fontWeight:j===0?750:450}}>{cell}</span>)}</div>)}</div></div>
</Frame>; }
function Donut({ tokens, kicker, title, segments, centerLabel, page }) {
  const total=segments.reduce((sum,x)=>sum+Number(x.value||0),0)||1; let offset=0;
  const palette=tokens.chartPreset?.palette||[tokens.accent,tokens.secondary,tokens.foreground];
  return <Frame tokens={tokens} page={page}><div style={{marginTop:38}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={42}>{title}</Title><div className="theme-surface" style={{...chartPanel(tokens),display:'grid',gridTemplateColumns:visual(tokens).cardFlow==='editorial'?'.78fr 1.22fr':'1fr 1fr',gap:50,alignItems:'center',marginTop:24}}><div style={{position:'relative',height:330}}><svg viewBox="0 0 240 240" style={{width:'100%',height:'100%',transform:'rotate(-90deg)'}}><circle cx="120" cy="120" r="82" fill="none" stroke={`${tokens.foreground}12`} strokeWidth="38"/>{segments.map((x,i)=>{const length=Number(x.value||0)/total*515;const node=<circle key={i} cx="120" cy="120" r="82" fill="none" stroke={palette[i%palette.length]} strokeWidth={i===tokens.focusIndex?46:34} strokeDasharray={`${Math.max(0,length-5)} ${515-Math.max(0,length-5)}`} strokeDashoffset={-offset}/>;offset+=length;return node;})}</svg><div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',textAlign:'center'}}><div><b style={{fontSize:48}}>{total}</b><div style={{fontSize:13,opacity:.62}}>{centerLabel}</div></div></div></div><div>{segments.map((x,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'14px 1fr auto',gap:14,alignItems:'center',padding:'14px 0',borderTop:`1px solid ${tokens.foreground}20`,opacity:i===tokens.focusIndex?1:.65}}><span style={{width:12,height:12,background:palette[i%palette.length]}}/><b>{x.label}</b><b>{x.value}</b></div>)}</div></div></div></Frame>;
}
function Radar({ tokens, kicker, title, axes, page }) {
  const palette=tokens.chartPreset?.palette||[tokens.accent,tokens.secondary]; const n=axes.length; const pt=(i,r)=>{const a=-Math.PI/2+i*Math.PI*2/n;return `${120+Math.cos(a)*r},${120+Math.sin(a)*r}`};
  const polygon=axes.map((x,i)=>pt(i,Math.max(0,Math.min(100,Number(x.value||0)))*.82)).join(' ');
  return <Frame tokens={tokens} page={page}><div style={{marginTop:38}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={42}>{title}</Title><div className="theme-surface" style={{...chartPanel(tokens),display:'grid',gridTemplateColumns:visual(tokens).cardFlow==='columns'?'.9fr 1.1fr':'1.15fr .85fr',gap:42,alignItems:'center',marginTop:20}}><svg viewBox="0 0 240 240" style={{height:360,width:'100%'}}>{[.25,.5,.75,1].map(r=><polygon key={r} points={axes.map((_,i)=>pt(i,82*r)).join(' ')} fill="none" stroke={`${tokens.foreground}22`}/>) }{axes.map((_,i)=><line key={i} x1="120" y1="120" x2={pt(i,82).split(',')[0]} y2={pt(i,82).split(',')[1]} stroke={`${tokens.foreground}22`}/>)}<polygon points={polygon} fill={`${palette[0]}38`} stroke={palette[0]} strokeWidth="3"/>{axes.map((x,i)=><circle key={i} cx={pt(i,Math.max(0,Math.min(100,Number(x.value||0)))*.82).split(',')[0]} cy={pt(i,Math.max(0,Math.min(100,Number(x.value||0)))*.82).split(',')[1]} r={i===tokens.focusIndex?6:4} fill={i===tokens.focusIndex?palette[1]:palette[0]}/>)}</svg><div>{axes.map((x,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:`1px solid ${tokens.foreground}1c`,fontSize:16,opacity:i===tokens.focusIndex?1:.65}}><span>{x.label}</span><b style={{color:i===tokens.focusIndex?tokens.accent:'inherit'}}>{x.value}</b></div>)}</div></div></div></Frame>;
}
function Funnel({ tokens, kicker, title, items, page }) { const max=Math.max(...items.map(x=>Number(x.value||0)),1); return <Frame tokens={tokens} page={page}><div style={{marginTop:38}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={42}>{title}</Title><div style={{marginTop:30,display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>{items.map((x,i)=><div key={i} style={{width:`${38+Number(x.value||0)/max*62}%`,padding:'15px 22px',display:'flex',justifyContent:'space-between',background:i===tokens.focusIndex?tokens.accent:`${tokens.secondary}${Math.max(28,72-i*10).toString(16)}`,color:i===tokens.focusIndex?tokens.background:tokens.foreground,clipPath:'polygon(4% 0,96% 0,100% 100%,0 100%)'}}><b>{x.label}</b><b>{x.value}</b></div>)}</div></div></Frame>; }
function Waterfall({ tokens, kicker, title, items, page }) { const values=items.map(x=>Number(x.value||0)); let running=0; const points=values.map(v=>{const start=running;running+=v;return{start,end:running}}); const min=Math.min(0,...points.flatMap(x=>[x.start,x.end]));const max=Math.max(1,...points.flatMap(x=>[x.start,x.end]));const scale=v=>(v-min)/(max-min)*250; return <Frame tokens={tokens} page={page}><div style={{marginTop:38}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={42}>{title}</Title><div style={{height:330,display:'flex',alignItems:'flex-end',gap:18,marginTop:30,borderBottom:`1px solid ${tokens.foreground}40`}}>{items.map((x,i)=>{const p=points[i],top=Math.max(scale(p.start),scale(p.end)),height=Math.max(8,Math.abs(scale(p.end)-scale(p.start)));return <div key={i} style={{flex:1,height:'100%',position:'relative'}}><div style={{position:'absolute',bottom:Math.min(scale(p.start),scale(p.end)),height,width:'100%',background:x.value>=0?tokens.accent:tokens.secondary,opacity:i===tokens.focusIndex?1:.62}}><b style={{position:'absolute',top:-24,width:'100%',textAlign:'center',fontSize:14}}>{x.value>0?'+':''}{x.value}</b></div><div style={{position:'absolute',bottom:-28,width:'100%',textAlign:'center',fontSize:12}}>{x.label}</div></div>})}</div></div></Frame>; }
function Closing({ tokens, kicker, title, subtitle, page }) { return <Frame tokens={tokens} page={page} inverse><div style={{height:'100%',display:'grid',placeItems:'center',textAlign:'center'}}><div><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={72}>{title}</Title><div style={{margin:'24px auto 0'}}><Body>{subtitle}</Body></div><div style={{width:90,height:9,background:tokens.accent,margin:'34px auto 0'}}/></div></div></Frame>; }

function MediaFeature({ tokens, kicker, title, body, caption, imageSlotCount=1, imageSide='right', imageFit='cover', showCaption=true, renderSlot, page }) {
  const media = imageSlotCount > 0 && renderSlot ? renderSlot(0, { containMedia:imageFit === 'contain', fallbackRatio:4/3, adaptiveMedia:true }) : null;
  const text = <div style={{alignSelf:'center'}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={45}>{title}</Title><div style={{marginTop:24}}><Body width={500}>{body}</Body></div>{showCaption&&<div style={{fontSize:13,opacity:.6,marginTop:24}}>{caption}</div>}</div>;
  const mediaFrame={minHeight:0,overflow:'hidden',borderRadius:tokens.mediaPreset?.radius||0,border:`1px solid ${tokens.accent}55`,boxShadow:tokens.mediaPreset?.style==='hologram'?`0 0 36px ${tokens.accent}44`:undefined};
  return <Frame tokens={tokens} page={page}><div style={{display:'grid',gridTemplateColumns:media?'1fr 1.05fr':'1fr',gap:40,height:'100%',paddingTop:34}}>{imageSide==='left'&&media?<div style={mediaFrame}>{media}</div>:null}{text}{imageSide!=='left'&&media?<div style={mediaFrame}>{media}</div>:null}</div></Frame>;
}

function MediaGallery({ tokens, kicker, title, caption, imageSlotCount=3, imageFit='cover', galleryLayout='grid', showCaption=true, renderSlot, page }) {
  const indexes=Array.from({length:imageSlotCount},(_,i)=>i);
  const columns=galleryLayout==='strip'?`repeat(${Math.max(1,indexes.length)},1fr)`:'2fr 1fr 1fr';
  return <Frame tokens={tokens} page={page}><div style={{paddingTop:35,height:'100%',display:'flex',flexDirection:'column'}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={42}>{title}</Title><div style={{display:'grid',gridTemplateColumns:columns,gap:14,flex:1,minHeight:0,marginTop:28}}>{indexes.map(i=><div key={i} style={{minHeight:0,overflow:'hidden',borderRadius:tokens.mediaPreset?.radius||0,border:`1px solid ${tokens.accent}44`}}>{renderSlot?.(i,{containMedia:imageFit==='contain',fallbackRatio:4/3,adaptiveMedia:true})}</div>)}</div>{showCaption&&<div style={{fontSize:13,opacity:.62,marginTop:14}}>{caption}</div>}</div></Frame>;
}

function MediaCompare({ tokens, kicker, title, leftLabel, rightLabel, imageSlotCount=2, imageFit='cover', renderSlot, page }) {
  const labels=[leftLabel,rightLabel];
  return <Frame tokens={tokens} page={page}><div style={{paddingTop:35,height:'100%',display:'flex',flexDirection:'column'}}><Eyebrow tokens={tokens}>{kicker}</Eyebrow><Title size={42}>{title}</Title><div style={{display:'grid',gridTemplateColumns:`repeat(${Math.max(1,imageSlotCount)},1fr)`,gap:18,flex:1,minHeight:0,marginTop:28}}>{Array.from({length:imageSlotCount},(_,i)=><div key={i} style={{display:'flex',flexDirection:'column',minHeight:0}}><div style={{fontSize:14,fontWeight:800,marginBottom:9,color:tokens.accent}}>{labels[i]||`视图 ${i+1}`}</div><div style={{flex:1,minHeight:0,overflow:'hidden',borderRadius:tokens.mediaPreset?.radius||0,border:`1px solid ${tokens.accent}44`}}>{renderSlot?.(i,{containMedia:imageFit==='contain',fallbackRatio:16/9,adaptiveMedia:true})}</div></div>)}</div></div></Frame>;
}

const common = {
  kicker:'INSIGHT / 2026', title:'把复杂问题，讲成清晰行动', subtitle:'以结构化叙事连接关键事实、判断与下一步。',
  metrics:[{value:'72%',label:'核心进展',note:'关键指标保持稳定提升'},{value:'3.4×',label:'效率增幅',note:'流程重构释放团队产能'},{value:'18周',label:'落地周期',note:'从试点走向规模化复制'}],
  items:[{title:'识别机会',body:'从用户、市场与能力边界中找到高价值切口。'},{title:'建立共识',body:'用统一指标与清晰职责降低协作损耗。'},{title:'持续迭代',body:'以小步验证形成可复用的增长飞轮。'}],
  timeline:[{time:'Q1',title:'定义',body:'明确目标与成功标准'},{time:'Q2',title:'验证',body:'完成关键场景试点'},{time:'Q3',title:'扩展',body:'复制到核心业务线'},{time:'Q4',title:'沉淀',body:'形成组织级能力'}],
};

function extendedRegistrations(definition) {
  const subject=definition.scenario.split('、')[0];
  const audience=definition.audience.split('、')[0];
  const variants=[
    {id:'overview',cn:'全景',angle:'现状、边界与关键变化'},
    {id:'deep-dive',cn:'深度',angle:'驱动因素、因果关系与核心机制'},
    {id:'outlook',cn:'展望',angle:'未来路径、优先事项与行动窗口'},
  ];
  const topicItems=(v)=>[
    {title:`${v.cn}观察`,body:`从${subject}中识别最值得关注的事实。`},
    {title:'关键判断',body:`解释${v.angle}，形成清晰结论。`},
    {title:'行动含义',body:`把判断转换为${audience}可以执行的下一步。`},
  ];
  return variants.flatMap((v,index)=>[
    [`statement-${v.id}`,`章节观点 · ${v.cn}`,Statement,{kicker:`${30+index} / ${v.id.toUpperCase()}`,title:`${subject} · ${v.cn}判断`,subtitle:`围绕${v.angle}建立本章节的核心论点。`},'statement'],
    [`metrics-${v.id}`,`指标组 · ${v.cn}`,Metrics,{kicker:`${33+index} / METRICS`,title:`${subject}的${v.cn}指标`,metrics:[{value:`${68+index*7}%`,label:'完成度',note:'关键目标按计划推进'},{value:`${2.4+index*.5}×`,label:'效率比',note:'投入产出持续改善'},{value:`${12+index*4}周`,label:'验证期',note:'从假设到证据的周期'}]},'metrics'],
    [`cards-${v.id}`,`要点卡 · ${v.cn}`,Cards,{kicker:`${36+index} / INSIGHTS`,title:`${subject}的三项${v.cn}要点`,items:topicItems(v)},'cards'],
    [`timeline-${v.id}`,`时间轴 · ${v.cn}`,Timeline,{kicker:`${39+index} / TIMELINE`,title:`${subject}的${v.cn}演进`,items:[{time:'阶段 1',title:'起点',body:'建立共同基线'},{time:'阶段 2',title:'变化',body:'识别关键转折'},{time:'阶段 3',title:'突破',body:'验证核心假设'},{time:'阶段 4',title:'下一步',body:'形成规模化路径'}]},'timeline'],
    [`compare-${v.id}`,`双栏对比 · ${v.cn}`,Compare,{kicker:`${42+index} / CONTRAST`,title:`${subject}的两种${v.cn}路径`,left:{title:'路径 A · 聚焦',points:['范围集中','验证更快','短期收益清晰']},right:{title:'路径 B · 平台',points:['能力复用','扩展更强','长期价值更高']}},'compare'],
    [`process-${v.id}`,`流程图 · ${v.cn}`,Process,{kicker:`${45+index} / WORKFLOW`,title:`${subject}的${v.cn}闭环`,items:topicItems(v).map((x,i)=>({title:x.title,body:i===2?'复盘结果并进入下一轮':x.body})).concat({title:'持续复盘',body:'用结果校准下一轮行动'})},'process'],
    [`quote-${v.id}`,`引语页 · ${v.cn}`,Quote,{kicker:`${48+index} / PRINCIPLE`,quote:[`先定义问题，再讨论答案。`,`证据决定判断，判断决定行动。`,`未来不是等待出来的，而是被一轮轮验证出来的。`][index],author:`${subject} · ${v.cn}原则`},'quote'],
    [`bars-${v.id}`,`横向条形图 · ${v.cn}`,Bars,{kicker:`${51+index} / RANKING`,title:`${subject}的${v.cn}维度排序`,items:[{label:'价值潜力',value:92-index*3},{label:'实施条件',value:76+index*4},{label:'组织准备',value:64+index*5},{label:'长期壁垒',value:82+index*2}]},'bars'],
    [`matrix-${v.id}`,`四象限 · ${v.cn}`,Matrix,{kicker:`${54+index} / MATRIX`,title:`${subject}的${v.cn}决策矩阵`,items:[{title:'高价值 · 易实施',body:'立即启动并快速复制'},{title:'高价值 · 难实施',body:'建立专项进行攻坚'},{title:'低价值 · 易实施',body:'作为补充择机推进'},{title:'低价值 · 难实施',body:'暂缓资源投入'}]},'matrix'],
    [`risks-${v.id}`,`风险卡 · ${v.cn}`,Risks,{kicker:`${57+index} / RISK`,title:`${subject}的${v.cn}风险清单`,items:[{level:'HIGH',owner:'负责人',title:'目标口径不一致',action:'统一定义与验收标准'},{level:'HIGH',owner:'技术',title:'关键假设缺少证据',action:'提前完成高风险验证'},{level:'MEDIUM',owner:'运营',title:'采用速度不及预期',action:'建立示范场景与培训'},{level:'LOW',owner:'项目',title:'协同节奏存在偏差',action:'固定复盘与升级机制'}]},'risks'],
    [`table-${v.id}`,`数据表 · ${v.cn}`,DataTable,{kicker:`${60+index} / EVIDENCE`,title:`${subject}的${v.cn}证据表`,columns:['维度','当前状态','目标状态','判断'],rows:[['价值','已验证','规模化','积极'],['能力','局部具备','体系化','可提升'],['组织','试点协同','常态运营','需推进'],['风险','基本可控','持续监测','关注']]},'table'],
    [`donut-${v.id}`,`环形图 · ${v.cn}`,Donut,{kicker:`${63+index} / MIX`,title:`${subject}的${v.cn}结构`,centerLabel:'结构总量',segments:[{label:'核心板块',value:40+index*2},{label:'增长板块',value:28-index},{label:'创新板块',value:20},{label:'支撑板块',value:12-index}]},'donut'],
    [`radar-${v.id}`,`雷达图 · ${v.cn}`,Radar,{kicker:`${66+index} / RADAR`,title:`${subject}的${v.cn}能力图谱`,axes:[{label:'战略',value:76+index*4},{label:'产品',value:72+index*3},{label:'技术',value:84-index*2},{label:'运营',value:64+index*5},{label:'组织',value:68+index*4}]},'radar'],
    [`funnel-${v.id}`,`漏斗图 · ${v.cn}`,Funnel,{kicker:`${69+index} / FUNNEL`,title:`${subject}的${v.cn}转化链路`,items:[{label:'潜在机会',value:100},{label:'有效识别',value:78-index*3},{label:'重点验证',value:52-index*2},{label:'形成结果',value:30+index*3}]},'funnel'],
    [`waterfall-${v.id}`,`瀑布图 · ${v.cn}`,Waterfall,{kicker:`${72+index} / BRIDGE`,title:`${subject}的${v.cn}增量拆解`,items:[{label:'基线',value:52+index*3},{label:'增长',value:22+index*2},{label:'提效',value:14+index},{label:'损耗',value:-8-index}]},'waterfall'],
    [`media-story-${v.id}`,`媒体故事 · ${v.cn}`,MediaFeature,{kicker:`${75+index} / STORY`,title:`用真实画面讲述${subject}的${v.cn}故事`,body:`以一个具体人物、产品或场景承载${v.angle}。`,caption:`${v.cn}媒体特写 · 支持图片与视频`,images:[],imageSlotCount:1,imageSide:index%2?'right':'left',imageFit:'cover',showCaption:true},'case-media'],
  ]);
}

export function createGeneratedThemeRuntime(definition, modules={}) {
  const t=definition.tokens;
  const themeDefaults=modules.themeDefaults||{};
  const themeControls=modules.themeControls||[];
  const raw=[
    ['cover','封面',Cover,{kicker:'NEXT / PRESENTATION',title:definition.displayName,subtitle:`适用于${definition.scenario}`}],
    ['cover-minimal','封面 · 极简',Statement,{kicker:'PRESENTATION / 2026',title:definition.displayName,subtitle:`面向${definition.audience}`}],
    ['cover-insight','封面 · 观点',Cover,{kicker:'INSIGHT / REPORT',title:'从信息走向洞察',subtitle:`以${definition.displayName}呈现关键判断与行动建议`}],
    ['cover-strategy','封面 · 战略',Statement,{kicker:'STRATEGY / ACTION',title:'聚焦关键问题，形成一致行动',subtitle:common.subtitle}],
    ['cover-brief','封面 · 简报',Cover,{kicker:'EXECUTIVE / BRIEF',title:'年度重点工作简报',subtitle:'目标、进展、挑战与下一阶段计划'}],
    ['statement','章节观点',Statement,{kicker:'01 / CONTEXT',title:common.title,subtitle:common.subtitle}],
    ['agenda','目录 · 内容拆解',Agenda,{kicker:'02 / AGENDA',title:'今天讨论四个关键问题',items:common.timeline}],
    ['metrics','核心指标',Metrics,{kicker:'02 / METRICS',title:'三个数字看清当前进展',metrics:common.metrics}],
    ['cards','关键要点',Cards,{kicker:'03 / PRIORITIES',title:'从机会到执行的三项重点',items:common.items}],
    ['timeline','路线图',Timeline,{kicker:'04 / ROADMAP',title:'分阶段推进，持续积累确定性',items:common.timeline}],
    ['compare','方案对比',Compare,{kicker:'05 / OPTIONS',title:'两种路径的关键取舍',left:{title:'稳健推进',points:['投入可控','风险较低','反馈周期较长']},right:{title:'集中突破',points:['资源聚焦','速度更快','组织要求更高']}}],
    ['process','执行流程',Process,{kicker:'06 / PROCESS',title:'四步形成闭环',items:common.timeline.map(x=>({title:x.title,body:x.body}))}],
    ['quote','核心引语',Quote,{kicker:'07 / PRINCIPLE',quote:'真正的进步，不是增加更多动作，而是让每个动作都指向同一个结果。',author:'项目原则'}],
    ['bars','数据排行',Bars,{kicker:'08 / DATA',title:'关键维度表现对比',items:[{label:'用户价值',value:92},{label:'交付效率',value:78},{label:'组织协同',value:67},{label:'长期壁垒',value:84}]}],
    ['matrix','决策矩阵',Matrix,{kicker:'09 / MATRIX',title:'以影响与难度确定优先级',items:[{title:'立即推进',body:'高影响、低难度的快速收益项'},{title:'重点攻坚',body:'高影响、高难度的战略项目'},{title:'择机处理',body:'低影响、低难度的补充事项'},{title:'暂缓投入',body:'低影响、高难度的非核心事项'}]}],
    ['risks','风险与应对',Risks,{kicker:'10 / RISKS',title:'提前识别风险并明确应对责任',items:[{level:'HIGH',owner:'产品',title:'需求边界持续扩大',action:'建立变更评审与冻结节点'},{level:'HIGH',owner:'技术',title:'关键能力验证不足',action:'优先完成高风险技术试验'},{level:'MEDIUM',owner:'运营',title:'一线采纳速度偏慢',action:'用试点标杆与培训降低门槛'},{level:'LOW',owner:'项目',title:'协同节奏不一致',action:'固定周会与决策升级路径'}]}],
    ['table','对比表格',DataTable,{kicker:'11 / TABLE',title:'把关键方案放在同一标准下比较',columns:['维度','方案 A','方案 B','建议'],rows:[['实施周期','8 周','12 周','方案 A'],['初期投入','中','高','分阶段'],['扩展能力','中','高','方案 B'],['综合风险','低','中','可控']]}],
    ['donut','占比分析',Donut,{kicker:'12 / SHARE',title:'结构占比与资源分布',centerLabel:'总量',segments:[{label:'核心业务',value:42},{label:'增长业务',value:28},{label:'创新业务',value:18},{label:'基础能力',value:12}]}],
    ['radar','能力雷达',Radar,{kicker:'13 / CAPABILITY',title:'关键能力成熟度评估',axes:[{label:'战略',value:82},{label:'产品',value:74},{label:'技术',value:88},{label:'运营',value:63},{label:'组织',value:69}]}],
    ['funnel','转化漏斗',Funnel,{kicker:'14 / FUNNEL',title:'从触达到结果的关键转化',items:[{label:'目标触达',value:100},{label:'有效互动',value:72},{label:'深度评估',value:46},{label:'最终转化',value:28}]}],
    ['waterfall','增减瀑布',Waterfall,{kicker:'15 / WATERFALL',title:'拆解结果变化的主要来源',items:[{label:'基础盘',value:58},{label:'新增',value:24},{label:'提效',value:16},{label:'流失',value:-11}]}],
    ['cards2','行动建议',Cards,{kicker:'10 / ACTIONS',title:'下一步行动清单',items:[{title:'本周',body:'确认负责人、范围与基线数据。'},{title:'本月',body:'完成试点并复盘关键假设。'},{title:'本季度',body:'固化方法并复制到更多场景。'}]}],
    ['case-media','案例图文特写',MediaFeature,{kicker:'12 / CASE',title:'让关键画面成为案例叙事中心',body:'上传产品、人物、场景或视频素材，用一个真实案例建立清晰记忆点。',caption:'点击或拖拽替换媒体 · 支持图片与视频',images:[],imageSlotCount:1,imageSide:'right',imageFit:'cover',showCaption:true}],
    ['media-gallery','图片画廊',MediaGallery,{kicker:'12 / GALLERY',title:'用一组画面呈现完整故事',caption:'主视觉、细节与场景可以分别替换',images:[],imageSlotCount:3,imageFit:'cover',galleryLayout:'grid',showCaption:true}],
    ['media-compare','影像对比',MediaCompare,{kicker:'13 / COMPARISON',title:'把变化放在同一视野中',leftLabel:'BEFORE / 之前',rightLabel:'AFTER / 之后',images:[],imageSlotCount:2,imageFit:'cover'}],
    ['closing','结束页',Closing,{kicker:'THANK YOU',title:'让判断转化为行动',subtitle:'Q & A · 期待与您继续讨论'}],
    ['bignum','大数字洞察',BigNumber,{kicker:'16 / HERO METRIC',value:'72',unit:'%',title:'一个数字概括核心变化',body:'用清晰口径解释数字背后的业务意义与下一步判断。'}],
    ['scorecard','综合评分卡',Metrics,{kicker:'17 / SCORECARD',title:'从三个维度评估综合表现',metrics:[{value:'A',label:'战略一致性',note:'目标与资源配置保持一致'},{value:'86',label:'执行成熟度',note:'关键流程已经形成闭环'},{value:'LOW',label:'综合风险',note:'主要风险均有明确责任人'}]}],
    ['bento','便当信息板',Cards,{kicker:'18 / BENTO',title:'一页汇总重点信息',items:[{title:'核心发现',body:'最值得关注的事实与变化。'},{title:'关键判断',body:'基于证据形成的明确结论。'},{title:'行动建议',body:'下一阶段最优先推进的事项。'}]}],
    ['swot','SWOT 分析',Matrix,{kicker:'19 / SWOT',title:'内部能力与外部环境交叉判断',items:[{title:'优势 Strength',body:'已经形成的差异化能力'},{title:'机会 Opportunity',body:'可被把握的外部窗口'},{title:'短板 Weakness',body:'限制规模化的内部问题'},{title:'威胁 Threat',body:'需要提前应对的不确定性'}]}],
    ['roadmap','里程碑路线图',Timeline,{kicker:'20 / MILESTONES',title:'从启动到规模化的关键里程碑',items:common.timeline}],
    ['architecture','架构与协同',Process,{kicker:'21 / ARCHITECTURE',title:'四个模块协同形成完整系统',items:[{title:'输入层',body:'统一数据、需求与约束'},{title:'能力层',body:'沉淀核心方法与组件'},{title:'应用层',body:'支持关键业务场景'},{title:'反馈层',body:'监测结果并持续迭代'}]}],
    ['case-compare','案例横向对比',Compare,{kicker:'22 / CASES',title:'两个案例揭示不同成功路径',left:{title:'案例 A · 效率型',points:['聚焦单一场景','快速验证价值','标准化复制']},right:{title:'案例 B · 能力型',points:['建设基础平台','覆盖多类场景','形成长期壁垒']}}],
    ['insight','结论与启示',Statement,{kicker:'23 / TAKEAWAY',title:'把事实凝结为一句可行动的判断',subtitle:'真正有价值的结论，必须同时回答为什么、意味着什么，以及下一步做什么。'}],
    ['sources','数据来源与口径',DataTable,{kicker:'24 / SOURCES',title:'让每个结论都可以追溯',columns:['来源','口径','周期','可信度'],rows:[['业务系统','核心指标','月度','高'],['用户调研','定性反馈','季度','中高'],['行业数据库','市场对标','年度','高'],['专家访谈','趋势判断','按需','中']]}],
    ['media-banner','全景媒体特写',MediaFeature,{kicker:'25 / VISUAL',title:'用一张全景画面建立情境',body:'适合产品全貌、空间场景、人物故事或关键视频片段。',caption:'全景媒体 · 支持图片与视频',images:[],imageSlotCount:1,imageSide:'left',imageFit:'cover',showCaption:true}],
    ...extendedRegistrations(definition),
  ].map(([slot,label,Component,defaults,baseSlot=slot])=>({
    slot,label,Component,
    defaultProps:{...defaults,...(themeDefaults[slot]||{}),page:'01',total:'01'},
    controls:[colorControl(t),chromeControl,...themeControls,...controlsForSlot(baseSlot)],
    ...(['bars','funnel'].includes(baseSlot)?{numberBounds:{'items[].value':{min:0,max:100,semantics:'percent'}}}:{}),
    ...(baseSlot==='donut'?{numberBounds:{'segments[].value':{min:0,max:100,semantics:'value'}}}:{}),
    ...(baseSlot==='radar'?{numberBounds:{'axes[].value':{min:0,max:100,semantics:'percent'}}}:{}),
  }));
  const pages=normalizeRuntimePages(raw,{themeKey:definition.key,layoutPrefix:definition.key.toUpperCase()});
  return pages.map(page=>({ ...page, Component: props => {
    const normalized=applyGeneratedControls({...page.defaultProps,...props});
    const tokens={...t,profile:definition.profile,chartPreset:modules.chartPreset,mediaPreset:modules.mediaPreset,visualPreset:modules.visualPreset,layoutPreset:modules.layoutPreset,accent:normalized.accent||t.accent,density:normalized.density,showChrome:normalized.showChrome,focusIndex:Number(normalized.focusIndex)||0,total:normalized.total};
    const content=<page.Component {...normalized} tokens={tokens} />;
    if(!modules.ThemeProvider) return content;
    const Provider=modules.ThemeProvider;
    const Decor=modules.ThemeDecor;
    return <Provider tokens={tokens}>{content}{Decor?<Decor show={normalized.showOrnament}/>:null}</Provider>;
  }}));
}
