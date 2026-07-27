import React from 'react';

const CANVAS={width:'100%',height:'100%',boxSizing:'border-box',position:'relative',overflow:'hidden'};
const EFFECTS={
  signature:{scope:'section',targets:['signature-system','ornament','page-marker'],minChangedRatio:.008,minRegions:2},
  density:{scope:'section',targets:['content-frame','spacing','type-scale'],minChangedRatio:.012,minRegions:2},
  layout:{scope:'section',targets:['content-grid','reading-order','emphasis'],minChangedRatio:.012,minRegions:2},
  media:{scope:'section',targets:['media','layout'],minChangedRatio:.01,minRegions:2},
};
const LAYOUT_KEYS={cover:'coverLayout',general:'cardLayout',metrics:'metricLayout',media:'mediaLayout',comparison:'comparisonLayout',timeline:'timelineLayout',table:'tableLayout',statement:'statementLayout',distribution:'distributionLayout',relationship:'networkLayout',proportion:'scoreLayout',ranking:'rankingLayout',transition:'transitionLayout',closing:'closingLayout'};
const LAYOUT_LABELS={cover:'封面结构',general:'卡片结构',metrics:'指标结构',media:'媒体结构',comparison:'对比结构',timeline:'路径结构',table:'表格结构',statement:'观点结构',distribution:'构成结构',relationship:'关系结构',proportion:'评分结构',ranking:'排行结构',transition:'转场结构',closing:'收束结构'};

function srcOf(item){return typeof item==='string'?item:item?.src;}
function rgb(hex){const value=String(hex||'').replace('#','');if(!/^[0-9a-f]{6}$/i.test(value)) return [0,0,0];return [0,2,4].map(index=>Number.parseInt(value.slice(index,index+2),16));}
function luminance(hex){return rgb(hex).map(value=>{const channel=value/255;return channel<=.03928?channel/12.92:((channel+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);}
function contrast(a,b){const [high,low]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (high+.05)/(low+.05);}
function textOn(background,cfg){const candidates=[cfg.tokens.foreground,cfg.tokens.background,'#101217','#ffffff'];return candidates.sort((a,b)=>contrast(background,b)-contrast(background,a))[0];}
function accentInk(cfg,background=cfg.tokens.background){return contrast(cfg.tokens.accent,background)>=3?cfg.tokens.accent:cfg.tokens.foreground;}
function modeOf(props){return Object.entries(props).find(([key])=>key.endsWith('Layout'))?.[1]||'structured';}
function densityOf(props){return props.density==='compact'?'compact':'balanced';}
function visibleItems(items,count){return (items||[]).slice(0,Math.max(1,Number(count)||items?.length||1));}
function visualUnits(value){
  let units=0;
  for(const char of String(value??'')) units+=/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffe6]/u.test(char)?1:.52;
  return units;
}
function fittedFontSize(value,base,min,capacity){
  const units=visualUnits(value);
  return units<=capacity?base:Math.max(min,Math.round(base*capacity/units));
}

function SignatureSystem({cfg,show=true,background=cfg.tokens.background}){
  if(!show) return null;
  const {accent,secondary,foreground}=cfg.tokens;
  const segments=cfg.dialect==='spooky'?[accent,secondary,accent,secondary,accent]:[accent,accent,secondary,accent,foreground];
  return <>
    <div aria-hidden="true" data-signature-system="true" data-decorative="true" style={{position:'absolute',left:0,right:0,top:0,height:58,display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr .7fr',zIndex:6}}>{segments.map((color,index)=><div key={index} style={{background:color,opacity:index===4?.22:.94}}/>)}</div>
    <div data-signature-system="true" data-decorative="true" style={{position:'absolute',left:72,right:72,bottom:24,zIndex:7,display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:13,fontWeight:900,letterSpacing:'.16em',color:accentInk(cfg,background)}}><span>{cfg.badge}</span><span style={{display:'flex',alignItems:'center',gap:14}}><i style={{display:'block',width:96,height:3,background:accent}}/>STYLE DNA / {cfg.dialect.toUpperCase()}</span></div>
  </>;
}

function ThemeOrnament({cfg,show=true}){
  if(!show) return null;
  const {accent,secondary,foreground,background}=cfg.tokens;
  if(cfg.dialect==='halo') return <>{[0,1,2,3].map(index=><div aria-hidden="true" key={index} style={{position:'absolute',right:-80+index*116,top:-80+index*34,width:330-index*32,height:330-index*32,borderRadius:'50%',background:`radial-gradient(circle at 35% 30%,${index%2?accent:secondary}88,transparent 68%)`,opacity:.42}}/>)}<div aria-hidden="true" style={{position:'absolute',left:-120,right:-120,bottom:-150,height:250,borderRadius:'50% 50% 0 0',background:`linear-gradient(180deg,${accent}55,${background})`}}/></>;
  return <svg aria-hidden="true" data-decorative="true" viewBox="0 0 420 280" style={{position:'absolute',left:0,top:56,width:410,height:272,opacity:.55}}><g fill="none" stroke={foreground} strokeWidth="3"><path d="M0 0 L405 0 M0 0 L360 260 M0 0 L0 270 M0 0 L210 275"/><path d="M66 0 Q58 62 0 76 M135 0 Q118 122 0 145 M210 0 Q182 184 0 218"/><path d="M280 0 Q250 78 182 120 M355 0 Q316 128 250 175"/></g></svg>;
}

function Frame({cfg,props,children,inverse=false}){
  const t=cfg.tokens;
  const bg=inverse?t.foreground:t.background;
  const fg=inverse?t.background:t.foreground;
  const compact=densityOf(props)==='compact';
  const offset=modeOf(props)==='offset';
  const inset=compact?'76px 62px 52px':offset?'92px 66px 66px 182px':'92px 84px 66px';
  return <div style={{...CANVAS,background:bg,color:fg,fontFamily:cfg.body,backgroundImage:inverse?`linear-gradient(145deg,${bg},${bg})`:cfg.backgroundCss}}>
    <ThemeOrnament cfg={cfg} show={props.showSignatureSystem}/><SignatureSystem cfg={cfg} show={props.showSignatureSystem} background={bg}/>
    {offset?<div aria-hidden="true" style={{position:'absolute',left:72,top:116,bottom:76,width:26,background:t.accent,zIndex:2}}/>:null}
    <div data-content-frame="true" style={{position:'absolute',inset,zIndex:3}}>{children}</div>
  </div>;
}

function Header({cfg,kicker='SIGNATURE / 2026',title,compact=false}){
  const base=compact?60:72;
  return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',alignItems:'end',gap:28}}><div style={{minWidth:0}}><div style={{fontSize:compact?17:20,fontWeight:900,letterSpacing:'.14em',textTransform:'uppercase',color:accentInk(cfg),marginBottom:compact?10:16}}>{kicker}</div><h1 style={{fontFamily:cfg.heading,fontSize:fittedFontSize(title,base,44,30),lineHeight:1.04,letterSpacing:'-.04em',margin:0,maxWidth:1280,overflowWrap:'anywhere'}}>{title}</h1></div><div aria-hidden="true" style={{width:180,height:14,background:cfg.tokens.accent,marginBottom:8}}/></div>;
}

function Surface({cfg,children,active=false,style={}}){
  const background=active?cfg.tokens.accent:cfg.surface;
  return <div style={{padding:'28px 32px',borderRadius:cfg.radius,border:`2px solid ${active?cfg.tokens.accent:cfg.tokens.foreground}`,background,color:textOn(background,cfg),position:'relative',...style}}>{children}</div>;
}

function DialectPanel({cfg,props}){
  const items=visibleItems(props.pillars||[],4);
  if(cfg.dialect==='halo') return <Surface cfg={cfg} active style={{height:'100%',borderRadius:cfg.radius,display:'grid',placeItems:'center',background:`radial-gradient(circle,${cfg.tokens.accent},${cfg.surface} 64%)`,color:textOn(cfg.surface,cfg)}}><div style={{width:330,height:330,border:`4px solid ${cfg.tokens.secondary}`,borderRadius:'50%',display:'grid',placeItems:'center',textAlign:'center',boxShadow:`0 0 52px ${cfg.tokens.accent}`}}><div><b>ORBITAL NODE</b><div style={{fontFamily:cfg.heading,fontSize:58,marginTop:14}}>{cfg.badge}</div></div></div>{items.slice(0,4).map((item,index)=><span key={item} style={{position:'absolute',left:index%2===0?28:undefined,right:index%2===1?28:undefined,top:index<2?30:undefined,bottom:index>=2?30:undefined,padding:'10px 14px',border:`2px solid ${cfg.tokens.secondary}`,background:cfg.surface,color:textOn(cfg.surface,cfg),fontSize:17,fontWeight:900}}>NODE 0{index+1} / {item}</span>)}</Surface>;
  return <div style={{height:'100%',display:'grid',gridTemplateColumns:'1.15fr .85fr',gap:18}}><Surface cfg={cfg} active style={{display:'flex',flexDirection:'column',justifyContent:'space-between',borderRadius:'46% 54% 42% 58%'}}><b>TRICK / TREAT</b><strong style={{fontFamily:cfg.heading,fontSize:58}}>{cfg.badge}</strong><p style={{fontSize:18,lineHeight:1.45}}>{props.summary}</p></Surface><div style={{display:'grid',gap:18}}>{items.slice(0,3).map((item,index)=><Surface cfg={cfg} key={item}><b style={{fontSize:18}}>CANDY 0{index+1}</b><h3 style={{fontSize:24,margin:'20px 0 0'}}>{item}</h3></Surface>)}</div></div>;
}

function MediaTile({cfg,item,label='MEDIA'}){
  const src=srcOf(item);
  const labelBg=cfg.tokens.foreground;
  return <div style={{height:'100%',minHeight:220,position:'relative',overflow:'hidden',borderRadius:cfg.radius,border:`3px solid ${cfg.tokens.foreground}`,background:`linear-gradient(145deg,${cfg.tokens.secondary},${cfg.tokens.accent})`}}>{src?<img src={src} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>:<><div aria-hidden="true" style={{position:'absolute',inset:'10%',border:`2px solid ${textOn(cfg.tokens.secondary,cfg)}99`}}/><div aria-hidden="true" style={{position:'absolute',right:'8%',top:'10%',width:'38%',height:'62%',background:cfg.surface,opacity:.84}}/><strong style={{position:'absolute',right:'8%',bottom:'12%',padding:'10px 14px',background:cfg.surface,color:textOn(cfg.surface,cfg),fontSize:16,letterSpacing:'.1em'}}>DROP / REPLACE</strong></>}<span style={{position:'absolute',left:18,bottom:14,padding:'7px 12px',background:labelBg,color:textOn(labelBg,cfg),fontSize:14,fontWeight:900,letterSpacing:'.12em'}}>{label}</span></div>;
}

function CoverPage({cfg,props}){
  const media=(props.media||[]).slice(0,props.mediaCount||0);
  const slots=Math.max(props.mediaCount||0,media.length);
  const offset=modeOf(props)==='offset';
  const base=densityOf(props)==='compact'?86:100;
  return <Frame cfg={cfg} props={props}><div style={{height:'100%',display:'grid',gridTemplateColumns:offset?'.86fr 1.14fr':'1.06fr .94fr',alignItems:'stretch',gap:52}}><div style={{display:'flex',flexDirection:'column',justifyContent:'center',minWidth:0}}><div style={{fontSize:20,fontWeight:900,color:accentInk(cfg),letterSpacing:'.16em'}}>{props.kicker||'PRESENTATION / 2026'}</div><h1 style={{fontFamily:cfg.heading,fontSize:fittedFontSize(props.title,base,58,18),lineHeight:1,letterSpacing:'-.055em',margin:'28px 0 24px',maxWidth:940,overflowWrap:'anywhere'}}>{props.title}</h1><p style={{fontSize:25,lineHeight:1.5,maxWidth:800,margin:0,opacity:.84,overflowWrap:'anywhere'}}>{props.subtitle}</p><div style={{display:'flex',gap:10,marginTop:34,flexWrap:'wrap'}}>{props.pillars.slice(0,4).map(item=><span key={item} style={{padding:'10px 14px',border:`2px solid ${cfg.tokens.foreground}`,fontWeight:800}}>{item}</span>)}</div></div><div style={{minHeight:700,minWidth:0}}>{slots?<div style={{height:'100%',display:'grid',gridTemplateColumns:slots>1?'repeat(2,minmax(0,1fr))':'minmax(0,1fr)',gap:18}}>{Array.from({length:slots},(_,index)=><MediaTile key={index} cfg={cfg} item={media[index]} label={`MEDIA 0${index+1}`}/>)}</div>:<DialectPanel cfg={cfg} props={props}/>}</div></div></Frame>;
}

function GeneralPage({cfg,props}){
  const source=props.items||props.sections?.map((title,index)=>({title,body:`第 ${props.numbers?.[index]||index+1} 项重点内容`}))||[];
  const offset=modeOf(props)==='offset';
  return <Frame cfg={cfg} props={props}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><p style={{fontSize:22,maxWidth:1180,lineHeight:1.5,opacity:.78,margin:'18px 0 0'}}>{props.lead}</p><div style={{display:'grid',gridTemplateColumns:offset?'1.3fr 1fr 1fr':'repeat(4,1fr)',gridTemplateRows:offset?'1fr 1fr':'1fr',gap:20,marginTop:32,height:densityOf(props)==='compact'?530:575}}>{visibleItems(source,4).map((item,index)=><Surface key={index} cfg={cfg} active={index===0} style={{gridRow:offset&&index===0?'1 / 3':undefined,minHeight:offset?undefined:330,display:'flex',flexDirection:'column',justifyContent:'space-between'}}><div style={{fontSize:17,fontWeight:900,opacity:.72}}>0{index+1} / {cfg.dialect.toUpperCase()}</div><div><h3 style={{fontSize:30,lineHeight:1.15,margin:'0 0 16px'}}>{item.title||item}</h3><p style={{fontSize:18,lineHeight:1.52,opacity:.82,margin:0}}>{item.body||'围绕目标、证据与行动形成清晰说明。'}</p></div></Surface>)}</div></Frame>;
}

function MetricsPage({cfg,props}){
  const metrics=visibleItems(props.metrics,3);const offset=modeOf(props)==='offset';
  return <Frame cfg={cfg} props={props}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><div style={{display:'grid',gridTemplateColumns:offset?'1.35fr .825fr .825fr':'repeat(3,1fr)',gap:24,marginTop:44,height:590}}>{metrics.map((item,index)=><Surface key={index} cfg={cfg} active={offset?index===0:index===1} style={{display:'flex',flexDirection:'column',justifyContent:'space-between'}}><div><div style={{fontFamily:cfg.heading,fontSize:offset&&index===0?108:82,letterSpacing:'-.05em'}}>{item.value}</div><h3 style={{fontSize:27,margin:'16px 0'}}>{item.label}</h3></div><div><div style={{height:18,background:cfg.tokens.secondary}}><div style={{width:`${68+index*11}%`,height:'100%',background:cfg.tokens.accent}}/></div><p style={{fontSize:18,lineHeight:1.5,opacity:.8,margin:'22px 0 0'}}>{item.note}</p></div></Surface>)}</div></Frame>;
}

function MediaPage({cfg,props}){
  const count=Math.max(1,Number(props.mediaCount)||1);const media=props.media||[];const offset=modeOf(props)==='offset';
  return <Frame cfg={cfg} props={props}><div style={{height:'100%',display:'grid',gridTemplateRows:'auto 1fr',gap:30}}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><div style={{display:'grid',gridTemplateColumns:offset&&count>1?'1.35fr repeat(2,.825fr)':`repeat(${count},1fr)`,gap:20}}>{Array.from({length:count},(_,index)=><div key={index} style={{display:'grid',gridTemplateRows:'1fr auto',gap:12}}><MediaTile cfg={cfg} item={media[index]} label={`STORY 0${index+1}`}/><p style={{fontSize:17,lineHeight:1.42,margin:0}}>{props.facts?.[index]||props.caption}</p></div>)}</div></div></Frame>;
}

function ComparisonPage({cfg,props}){
  const offset=modeOf(props)==='offset';
  return <Frame cfg={cfg} props={props}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><div style={{display:'grid',gridTemplateColumns:offset?'1.22fr .78fr':'1fr 1fr',gap:28,marginTop:38,height:590}}>{visibleItems(props.options,2).map((option,index)=><Surface key={index} cfg={cfg} active={offset?index===0:index===1} style={{display:'flex',flexDirection:'column',justifyContent:'space-between'}}><div><div style={{fontSize:17,fontWeight:900}}>PATH 0{index+1}</div><h2 style={{fontSize:42,margin:'42px 0 24px'}}>{option.title}</h2><p style={{fontSize:21,lineHeight:1.56,maxWidth:650}}>{option.body}</p></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{(props.criteria||[]).map(item=><span key={item} style={{padding:'9px 14px',border:`1px solid currentColor`,fontSize:15,fontWeight:800}}>{item}</span>)}</div></Surface>)}</div></Frame>;
}

function TimelinePage({cfg,props}){
  const stages=visibleItems(props.stages,4);const offset=modeOf(props)==='offset';
  return <Frame cfg={cfg} props={props}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><div style={{position:'relative',display:'grid',gridTemplateColumns:offset?'1.35fr repeat(3,.88fr)':`repeat(${stages.length},1fr)`,gap:18,marginTop:58,height:540}}><div aria-hidden="true" style={{position:'absolute',left:0,right:0,top:28,height:7,background:cfg.tokens.secondary}}/>{stages.map((stage,index)=>{const nodeBg=index===1?cfg.tokens.accent:cfg.tokens.foreground;return <div key={index} style={{position:'relative',paddingTop:76,display:'flex',flexDirection:'column',height:'100%'}}><div style={{position:'absolute',left:0,top:0,width:62,height:62,borderRadius:'50%',background:nodeBg,color:textOn(nodeBg,cfg),display:'grid',placeItems:'center',fontWeight:900,fontSize:19}}>{index+1}</div><div style={{fontSize:16,fontWeight:900,color:accentInk(cfg)}}>{props.dates?.[index]||`阶段 ${index+1}`}</div><h3 style={{fontSize:28,margin:'15px 0'}}>{stage.title||stage}</h3><p style={{fontSize:17,lineHeight:1.52,opacity:.78,maxWidth:320}}>{stage.body||'明确阶段目标、验证结果与下一步。'}</p><b style={{marginTop:'auto',paddingTop:18,borderTop:`3px solid ${cfg.tokens.accent}`,fontSize:15,letterSpacing:'.12em'}}>CHECKPOINT 0{index+1}</b></div>;})}</div></Frame>;
}

function TablePage({cfg,props}){
  const offset=modeOf(props)==='offset';const headerBg=offset?cfg.tokens.accent:cfg.tokens.foreground;
  const columns=(props.columns||[]).slice(0,6);const rows=(props.rows||[]).slice(0,6);
  const columnCount=Math.max(1,columns.length);const rowCount=Math.max(1,rows.length);
  const maxCellUnits=Math.max(0,...rows.flat().map(visualUnits));const cellFont=maxCellUnits>28?14:maxCellUnits>20?15:rows.length>4?16:18;
  const cellStyle={minWidth:0,padding:rows.length>4?'14px 18px':'18px 22px',fontSize:cellFont,lineHeight:1.32,display:'flex',alignItems:'center',overflowWrap:'anywhere',wordBreak:'break-word'};
  return <Frame cfg={cfg} props={props}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><div data-layout-table="true" style={{marginTop:28,height:densityOf(props)==='compact'?650:680,border:`2px solid ${cfg.tokens.foreground}`,background:cfg.surface,transform:offset?'translateX(54px)':undefined,width:offset?'calc(100% - 54px)':'100%',display:'grid',gridTemplateRows:`minmax(58px,auto) repeat(${rowCount},minmax(0,1fr))`,overflow:'hidden'}}><div style={{display:'grid',gridTemplateColumns:`repeat(${columnCount},minmax(0,1fr))`,background:headerBg,color:textOn(headerBg,cfg)}}>{columns.map((column,index)=><div key={`${index}-${column}`} style={{...cellStyle,padding:'16px 22px',fontSize:17,fontWeight:900}}>{column}</div>)}</div>{rows.map((row,index)=>{const active=index===1;const rowBg=active?cfg.tokens.accent:cfg.surface;return <div key={index} style={{minHeight:0,display:'grid',gridTemplateColumns:`repeat(${columnCount},minmax(0,1fr))`,borderTop:`1px solid ${cfg.tokens.foreground}55`,background:rowBg,color:textOn(rowBg,cfg),overflow:'hidden'}}>{Array.from({length:columnCount},(_,cellIndex)=><div key={cellIndex} style={cellStyle}>{row[cellIndex]??''}</div>)}</div>;})}</div></Frame>;
}

function StatementPage({cfg,props}){
  const count=Number(props.mediaCount)||0;const media=props.media||[];const offset=modeOf(props)==='offset';
  const statement=props.statement||props.title;const base=densityOf(props)==='compact'?70:82;
  return <Frame cfg={cfg} props={props}><div style={{height:'100%',display:'grid',gridTemplateColumns:count?'1.12fr .88fr':offset?'1.25fr .75fr':'1fr .42fr',alignItems:'stretch',gap:34}}><Surface cfg={cfg} active={offset} style={{display:'flex',flexDirection:'column',justifyContent:'center',padding:'52px 58px',minWidth:0}}><div style={{fontSize:20,fontWeight:900,color:offset?undefined:accentInk(cfg),letterSpacing:'.14em'}}>{props.kicker||'CORE STATEMENT'}</div><h1 style={{fontFamily:cfg.heading,fontSize:fittedFontSize(statement,base,46,28),lineHeight:1.06,letterSpacing:'-.045em',margin:'32px 0',overflowWrap:'anywhere'}}>{statement}</h1><p style={{fontSize:23,lineHeight:1.52,margin:0,opacity:.82,overflowWrap:'anywhere'}}>{props.support||props.subtitle}</p></Surface>{count?<div style={{display:'grid',gridTemplateRows:`repeat(${count},minmax(0,1fr))`,gap:16,minWidth:0}}>{Array.from({length:count},(_,index)=><MediaTile key={index} cfg={cfg} item={media[index]} label={`STORY 0${index+1}`}/>)}</div>:<div style={{display:'grid',gridTemplateRows:'repeat(4,minmax(0,1fr))',gap:14,minWidth:0}}>{props.pillars.slice(0,4).map((item,index)=><Surface cfg={cfg} key={item} active={!offset&&index===0} style={{display:'flex',alignItems:'center',gap:18,padding:'20px 24px',minWidth:0}}><b style={{fontSize:20}}>0{index+1}</b><span style={{fontSize:19,fontWeight:800,overflowWrap:'anywhere'}}>{item}</span></Surface>)}</div>}</div></Frame>;
}

function DistributionPage({cfg,props}){
  const segments=visibleItems(props.segments,4);const offset=modeOf(props)==='offset';
  return <Frame cfg={cfg} props={props}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><div style={{display:offset?'grid':'flex',gridTemplateColumns:offset?'repeat(2,1fr)':undefined,height:offset?360:300,marginTop:32,alignItems:'stretch',gap:offset?14:0}}>{segments.map((item,index)=>{const bg=index%2?cfg.tokens.secondary:cfg.tokens.accent;return <div key={index} style={{flex:item.value,background:bg,color:textOn(bg,cfg),padding:24,display:'flex',flexDirection:'column',justifyContent:'space-between',border:offset?`2px solid ${cfg.tokens.foreground}`:undefined}}><b style={{fontSize:19}}>0{index+1} / {item.label}</b><strong style={{fontFamily:cfg.heading,fontSize:54}}>{item.value}%</strong></div>;})}</div><div style={{display:'grid',gridTemplateColumns:'1fr auto',alignItems:'center',gap:30,marginTop:22}}><p style={{fontSize:21,lineHeight:1.45,maxWidth:1250,margin:0}}>{props.summary}</p><b style={{padding:'13px 19px',background:cfg.tokens.foreground,color:textOn(cfg.tokens.foreground,cfg)}}>TOTAL / 100%</b></div><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginTop:26}}>{props.pillars.slice(0,4).map((item,index)=><Surface key={item} cfg={cfg} active={offset&&index===0} style={{minHeight:128,padding:'20px 22px',display:'flex',flexDirection:'column',justifyContent:'space-between'}}><b style={{fontSize:16}}>LENS 0{index+1}</b><span style={{fontSize:21,fontWeight:900}}>{item}</span></Surface>)}</div></Frame>;
}

function RelationshipPage({cfg,props}){
  const nodes=visibleItems(props.nodes,6);const offset=modeOf(props)==='offset';const centerBg=cfg.tokens.accent;
  return <Frame cfg={cfg} props={props}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><div style={{position:'relative',height:590,marginTop:14,transform:offset?'translateX(54px) scale(.94)':'none'}}><svg aria-hidden="true" viewBox="0 0 1500 560" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>{nodes.map((_,index)=><path key={index} d={`M750 280 L${230+(index%3)*520} ${100+Math.floor(index/3)*360}`} stroke={cfg.tokens.secondary} strokeWidth="6" fill="none"/>)}</svg><div style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:240,height:240,borderRadius:'50%',background:centerBg,color:textOn(centerBg,cfg),display:'grid',placeItems:'center',fontFamily:cfg.heading,fontSize:34,textAlign:'center',padding:20,border:`5px solid ${cfg.tokens.foreground}`}}>{props.center||'核心系统'}</div>{nodes.map((node,index)=><Surface key={index} cfg={cfg} active={offset&&index===0} style={{position:'absolute',left:`${5+(index%3)*35}%`,top:index<3?'4%':'72%',width:280,minHeight:112,padding:'22px 24px',textAlign:'center',fontSize:20,fontWeight:800}}>{node.title||node}</Surface>)}</div></Frame>;
}

function ProportionPage({cfg,props}){
  const offset=modeOf(props)==='offset';
  return <Frame cfg={cfg} props={props}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><div style={{display:'grid',gridTemplateColumns:offset?'1.3fr .85fr .85fr':'repeat(3,1fr)',gap:30,marginTop:50}}>{props.values.map((value,index)=><Surface cfg={cfg} active={offset&&index===0} key={index} style={{textAlign:'center',minHeight:490,display:'grid',alignContent:'center'}}><div style={{width:offset&&index===0?300:250,height:offset&&index===0?300:250,borderRadius:'50%',margin:'0 auto',display:'grid',placeItems:'center',background:`conic-gradient(${cfg.tokens.accent} 0 ${value}%,${cfg.tokens.secondary} ${value}% 100%)`}}><div style={{width:170,height:170,borderRadius:'50%',background:cfg.surface,color:textOn(cfg.surface,cfg),display:'grid',placeItems:'center',fontFamily:cfg.heading,fontSize:48}}>{value}%</div></div><h3 style={{fontSize:24,margin:'22px 0 0'}}>{props.labels[index]}</h3></Surface>)}</div></Frame>;
}

function RankingPage({cfg,props}){
  const offset=modeOf(props)==='offset';
  return <Frame cfg={cfg} props={props}><Header cfg={cfg} title={props.title} compact={densityOf(props)==='compact'}/><div style={{marginTop:34,display:'grid',gridTemplateRows:`repeat(${props.items.length},1fr)`,gap:14,height:540}}>{props.items.map((item,index)=>{const active=index===props.highlight;return <div key={index} style={{display:'grid',gridTemplateColumns:offset?'100px 290px 1fr 100px':'80px 250px 1fr 90px',alignItems:'center',gap:22,padding:'17px 22px',background:active?cfg.tokens.accent:cfg.surface,color:textOn(active?cfg.tokens.accent:cfg.surface,cfg),border:`2px solid ${cfg.tokens.foreground}`}}><b style={{fontFamily:cfg.heading,fontSize:32}}>0{index+1}</b><span style={{fontSize:22,fontWeight:800}}>{item.label}</span><div style={{height:30,background:cfg.tokens.secondary}}><div style={{width:`${item.value}%`,height:'100%',background:active?cfg.tokens.foreground:cfg.tokens.accent}}/></div><strong style={{fontSize:24}}>{item.value}</strong></div>;})}</div></Frame>;
}

function TransitionPage({cfg,props}){
  const offset=modeOf(props)==='offset';
  const inverse=false;
  const frameBackground=cfg.tokens.background;
  const ink=accentInk(cfg,frameBackground);
  return <Frame cfg={cfg} props={props} inverse={inverse}><div style={{height:'100%',display:'grid',gridTemplateRows:'auto 1fr auto'}}><div style={{fontSize:16,fontWeight:900,letterSpacing:'.16em',color:ink}}>CHAPTER MAP / 01 — 04</div><div style={{display:'grid',gridTemplateColumns:offset?'minmax(0,1fr) 480px':'420px minmax(0,1fr)',alignItems:'center',gap:70}}><div style={{fontFamily:cfg.heading,fontSize:220,lineHeight:.8,color:ink,order:offset?2:0,border:`4px solid ${cfg.tokens.accent}`,padding:'50px 28px',textAlign:'center'}}>{props.sectionNumber}</div><div style={{minWidth:0}}><div style={{fontSize:23,letterSpacing:'.16em',color:ink,fontWeight:900}}>{props.kicker}</div><h1 style={{fontFamily:cfg.heading,fontSize:fittedFontSize(props.title,90,50,24),lineHeight:1.04,letterSpacing:'-.05em',margin:'32px 0',overflowWrap:'anywhere'}}>{props.title}</h1><p style={{fontSize:23,lineHeight:1.5,maxWidth:820,opacity:.8,overflowWrap:'anywhere'}}>{props.summary}</p></div></div><div style={{display:'flex',justifyContent:'space-between',fontSize:16,fontWeight:900,letterSpacing:'.12em',color:ink}}><span>PREVIOUS / 成果</span><span>NEXT / 行动</span></div></div></Frame>;
}

function ClosingPage({cfg,props}){
  const offset=modeOf(props)==='offset';const actionBg=cfg.tokens.accent;
  return <Frame cfg={cfg} props={props}><div style={{height:'100%',display:'grid',gridTemplateColumns:offset?'1.25fr .75fr':'1fr .32fr',gap:32,alignItems:'stretch'}}><Surface cfg={cfg} active={offset} style={{display:'flex',flexDirection:'column',justifyContent:'center',padding:'58px',minWidth:0}}><div style={{fontSize:19,fontWeight:900,letterSpacing:'.16em'}}>FINAL / {cfg.dialect.toUpperCase()}</div><div style={{fontFamily:cfg.heading,fontSize:fittedFontSize(props.title,102,56,20),lineHeight:1,letterSpacing:'-.055em',marginTop:44,overflowWrap:'anywhere'}}>{props.title}</div><p style={{fontSize:26,opacity:.82,margin:'30px 0',maxWidth:940,overflowWrap:'anywhere'}}>{props.subtitle}</p><span style={{display:'inline-block',alignSelf:'flex-start',padding:'15px 26px',background:actionBg,color:textOn(actionBg,cfg),fontSize:19,fontWeight:900}}>{props.action}</span></Surface><div style={{display:'grid',gridTemplateRows:'repeat(4,minmax(0,1fr))',gap:14,minWidth:0}}>{props.pillars.slice(0,4).map((item,index)=><Surface cfg={cfg} key={item} active={!offset&&index===3} style={{display:'grid',placeItems:'center',textAlign:'center',fontSize:19,fontWeight:800,minWidth:0,overflowWrap:'anywhere'}}>{item}</Surface>)}</div></div></Frame>;
}

function renderPage(module,cfg,props){
  const id=module.archetypeId;
  if(id.includes('closing')) return <ClosingPage cfg={cfg} props={props}/>;
  if(id.includes('composition-breakdown')) return <DistributionPage cfg={cfg} props={props}/>;
  if(id.includes('ecosystem-relationship')) return <RelationshipPage cfg={cfg} props={props}/>;
  if(id.includes('proportion-scorecard')) return <ProportionPage cfg={cfg} props={props}/>;
  if(id.includes('ranked-signals')) return <RankingPage cfg={cfg} props={props}/>;
  if(id.includes('section-transition')) return <TransitionPage cfg={cfg} props={props}/>;
  if(module.family==='cover') return <CoverPage cfg={cfg} props={props}/>;
  if(module.family==='general') return <GeneralPage cfg={cfg} props={props}/>;
  if(module.family==='metrics') return <MetricsPage cfg={cfg} props={props}/>;
  if(module.family==='media') return <MediaPage cfg={cfg} props={props}/>;
  if(module.family==='comparison') return <ComparisonPage cfg={cfg} props={props}/>;
  if(module.family==='timeline') return <TimelinePage cfg={cfg} props={props}/>;
  if(module.family==='table') return <TablePage cfg={cfg} props={props}/>;
  return <StatementPage cfg={cfg} props={props}/>;
}

function defaultsFor(module,cfg){
  const layoutKey=LAYOUT_KEYS[module.family]||'statementLayout';
  const base={showSignatureSystem:true,density:'balanced',[layoutKey]:'structured',pillars:cfg.content.pillars,summary:cfg.content.summary};
  const topic=cfg.content.topic;
  if(module.archetypeId.includes('closing')) return {...base,title:'谢谢观看',subtitle:cfg.content.closing,action:'继续讨论'};
  if(module.archetypeId.includes('composition-breakdown')) return {...base,title:`${topic}的构成拆解`,segments:cfg.content.segments};
  if(module.archetypeId.includes('ecosystem-relationship')) return {...base,title:`${topic}的协作关系`,center:cfg.content.center,nodes:cfg.content.nodes,links:[0,1,2,3,4,5]};
  if(module.archetypeId.includes('proportion-scorecard')) return {...base,title:`${topic}的比例评分`,values:[82,68,54],labels:cfg.content.labels};
  if(module.archetypeId.includes('ranked-signals')) return {...base,title:`${topic}的优先信号`,items:cfg.content.ranking,highlight:0};
  if(module.archetypeId.includes('section-transition')) return {...base,kicker:'NEXT CHAPTER',title:cfg.content.transition,sectionNumber:'02'};
  if(module.archetypeId.includes('agenda-overview')) return {...base,title:'今天讨论四个关键问题',lead:cfg.content.summary,sections:cfg.content.pillars,numbers:['01','02','03','04']};
  if(module.archetypeId.includes('alternate-cover')) return {...base,kicker:'SPECIAL EDITION / 2026',title:cfg.displayName,subtitle:cfg.content.subtitle,media:[],mediaCount:2};
  if(module.family==='cover') return {...base,kicker:'REPORT / 2026',title:cfg.content.coverTitle,subtitle:cfg.content.subtitle,...(module.requiredCapabilities?.writableMedia?{media:[],mediaCount:2}:{})};
  if(module.family==='general') return {...base,title:`${topic}的四个关键支点`,lead:cfg.content.summary,items:cfg.content.pillars.map((title,index)=>({title,body:cfg.content.details[index]}))};
  if(module.family==='metrics') return {...base,title:`用三个数字理解${topic}`,metrics:cfg.content.metrics};
  if(module.family==='media') return {...base,title:`${topic}的场景证据`,caption:cfg.content.summary,facts:cfg.content.details.slice(0,3),media:[],mediaCount:3};
  if(module.family==='comparison') return {...base,title:`${topic}的两条路径`,options:cfg.content.options,criteria:cfg.content.labels};
  if(module.family==='timeline') return {...base,title:`${topic}的四阶段路径`,stages:cfg.content.stages,dates:['Q1','Q2','Q3','Q4']};
  if(module.family==='table') return {...base,title:`${topic}行动清单`,columns:['模块','当前状态','下一步','负责人'],rows:cfg.content.rows};
  return {...base,kicker:'KEY STATEMENT',statement:cfg.content.statement,support:cfg.content.summary,...(module.requiredCapabilities?.writableMedia?{media:[],mediaCount:2}:{})};
}

function controlsFor(module){
  const layoutKey=LAYOUT_KEYS[module.family]||'statementLayout';
  const controls=[
    {key:'showSignatureSystem',label:'显示主题签名系统',type:'toggle',default:true,effect:EFFECTS.signature},
    {key:'density',label:'信息密度',type:'select',default:'balanced',options:[{label:'紧凑',value:'compact'},{label:'平衡',value:'balanced'}],effect:EFFECTS.density},
    {key:layoutKey,label:LAYOUT_LABELS[module.family]||'页面结构',type:'select',default:'structured',options:[{label:'结构化',value:'structured'},{label:'偏移强调',value:'offset'}],effect:EFFECTS.layout},
  ];
  if(module.requiredCapabilities?.writableMedia) controls.push({key:'mediaCount',label:'媒体数量',type:'range',min:1,max:3,default:2,effect:EFFECTS.media,mediaSlots:[{field:'media',fieldPath:'props.media',countKey:'mediaCount',maxCount:3,initialSrcSupported:true,canPresetMedia:true,acceptedKinds:['image']}]});
  return controls;
}

export function createTemplateSignaturePages(cfg,modules){
  return modules.map(module=>{
    const defaultProps=defaultsFor(module,cfg);
    const Component=props=>renderPage(module,cfg,{...defaultProps,...props});
    Object.defineProperty(Component,'name',{value:module.componentName||'TemplateSignaturePage'});
    return {key:module.id,slot:`signature-${module.archetypeId}`,label:`${cfg.displayName} · ${module.archetypeId}`,roles:[module.family],moduleFamily:module.family,archetypeId:module.archetypeId,moduleStrategy:module.strategy,evidenceMode:module.evidenceMode,evidenceRefs:module.evidenceRefs||[],derivedFromRules:module.derivedFromRules||[],anchorModuleRefs:module.anchorModuleRefs||[],stylePrimitiveRefs:module.stylePrimitiveRefs||[],derivationReason:module.derivationReason||null,styleSignals:module.styleSignals||[],sourceContract:module.sourceContract||null,canvasContract:{designWidth:1920,designHeight:1080,rootMode:'fill-parent',backgroundMode:'opaque'},defaultProps,controls:controlsFor(module),Component};
  });
}
