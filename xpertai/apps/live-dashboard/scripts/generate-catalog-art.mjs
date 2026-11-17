// Original, deterministic SVG artwork for non-executable catalog previews.
// All geometry is authored here; no screenshots, remote images or external fonts.
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const root = new URL('../', import.meta.url)
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const entries = await read('scripts/content/library-catalog.json')
const labels = await read('src/remote/locales/zh-Hans.json')
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
const rect = (x,y,w,h,fill,rx=8,stroke='none') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`
const text = (x,y,value,size=14,color='#263747',weight=400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(value)}</text>`
const path = (d,stroke,width=3,fill='none',extra='') => `<path d="${d}" stroke="${stroke}" stroke-width="${width}" fill="${fill}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`
const circle = (x,y,r,fill,stroke='none',width=1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`
const group = (x,y,markup,scale=1) => `<g transform="translate(${x} ${y}) scale(${scale})">${markup}</g>`
const points = (radius, cx=180,cy=100) => Array.from({length:6},(_,i)=>[cx+Math.cos(i*Math.PI/3-Math.PI/2)*radius,cy+Math.sin(i*Math.PI/3-Math.PI/2)*radius])
const polygon = (coords,fill,stroke='none')=>`<polygon points="${coords.map(p=>p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}"/>`
const palette = (bg,panel,ink,a,b,rule='#dfe6eb',radius=8) => ({bg,panel,ink,a,b,rule,radius})
const standard = palette('#f5f8fa','#ffffff','#233847','#167d8b','#df875d')
// Explicit visual specs keyed by stable catalog IDs, never inferred from display text.
const themeSpecs = {
 'clarity-blue': palette('#f1f7fb','#fff','#173c50','#1688ab','#66c7ce'),
 'tdesign-enterprise': palette('#f5f7f8','#fff','#233d4c','#25766c','#90b9ae'),
 'minimal-modern': palette('#fff','#fff','#252b30','#39434c','#a3adb6','#e7ebee',0),
 'dark-tech': palette('#111e2b','#192b3e','#dcecf7','#36b9d2','#8a9af0','#2a4259'),
 cyberpunk: palette('#161023','#251a37','#fbf5ff','#dc67ee','#80efbe','#583c70',0),
 'frosted-tech': palette('#f1effc','#fafaff','#48466c','#9c7ce8','#67c9d1','#e3ddf4',16),
 bauhaus: palette('#f4efdc','#fffdf3','#232d39','#db583b','#207ba0','#ddd5bb',0),
 'financial-trading': palette('#101e24','#172c32','#d8eee9','#48c29a','#e3897b','#29484e',2),
 'premium-business': palette('#f7f4ed','#fff','#263746','#917947','#b4c6d1','#e6dfd0',2),
 'terminal-green': palette('#0e1913','#12241a','#a7d7b4','#67d78d','#b8e175','#2d5039',0),
 'art-deco': palette('#1e262c','#2a3339','#e9daba','#c5a35e','#699b96','#6c614c',0),
 material: palette('#f3f6f8','#fff','#344b60','#4e8cb9','#a1bdbb','#d8e3ea',12),
 newsprint: palette('#f5f2e8','#fcfaf3','#39372e','#655e4a','#b6a27e','#c5bfae',0),
 industrial: palette('#e9edef','#f5f7f7','#324149','#d48d39','#69909f','#b9c4c9',2),
 flat: palette('#f6f9fc','#fff','#263e57','#5795cd','#76c4ad','#e5edf3',4),
 clay: palette('#f7eee8','#fff8f2','#72574b','#cb927e','#a4b6cf','#ead9cd',24),
 'hand-drawn': palette('#fffdf5','#fffdf5','#42423c','#638d9e','#d59a61','#cfcbbd',3),
 'neo-brutalism': palette('#f8efbe','#fffdf0','#202d38','#218d9c','#ec996c','#293945',0),
 maximalism: palette('#24102e','#3a1744','#ffefee','#ef6a9d','#e5b454','#74376c',16),
 'golden-eye': palette('#faf6e9','#fffdf5','#5c4d28','#b39132','#79a4a1','#e5dbb8'),
 'deep-sea-mist': palette('#edf7f6','#fafffe','#305657','#278f90','#a0b9a1','#d2e6e2'),
 sage: palette('#f3f5ed','#fbfcf7','#485647','#899c75','#d0ad89','#dce2d3'),
 'deep-sea-blue': palette('#0f2334','#163448','#d8eef5','#57bcd3','#7a90c7','#2b4c60'),
 'crimson-black': palette('#fbf2f1','#fff','#412c32','#ae4e61','#444b57','#ebd8dc'),
 'redline-brief': palette('#fffaf8','#fff','#3b3540','#d35e5e','#94a8bd','#ecdcd8',0),
 'coral-cream': palette('#fff2e8','#fffaf5','#704c43','#e88e7e','#97bcb5','#f0d8cc',16),
 'amber-sunset': palette('#fff5e6','#fffcf5','#73502b','#db9a45','#e5b98c','#efdfc1'),
 'midnight-emerald': palette('#122923','#1c3b31','#dcf0e6','#60bd92','#ceba78','#315747'),
 'misty-rose': palette('#faf0f3','#fff9fb','#6e4c5c','#ba839b','#a9b0c9','#ecdbe2',16),
 'cobalt-diagonal': palette('#eff3fd','#fff','#293c64','#517acb','#89bacb','#d6dff0',0),
 'olive-terracotta': palette('#f6f3e8','#fffcf4','#575746','#919967','#be8060','#e4dfca'),
 'burgundy-night': palette('#2c1a28','#422636','#f5dce7','#bc7897','#cfb184','#684052'),
 'warm-sand': palette('#f7efe4','#fffcf6','#65533f','#b2946c','#93aca5','#e6d8c6',12),
 'paper-journal': palette('#f7f0e4','#fff9f0','#625348','#9c8ab9','#ceac70','#e1d6c2',3),
 'soft-porcelain': palette('#f6f8f7','#fff','#4d6868','#84adaa','#b3b7c9','#e2e9e7',18),
 'misty-green': palette('#eef5f1','#fbfffc','#3f6153','#75a88b','#c1ba8e','#d8e5dd'),
 'dark-olive': palette('#24291b','#353d28','#e6ebce','#a4b375','#cbad72','#4f593d'),
 cinematic: palette('#171c27','#252c3a','#e0e4ed','#b39773','#669cac','#3e4757',0),
 'natural-terrain': palette('#192c29','#273e34','#d5e7ce','#91b173','#d3ae76','#475b42',12),
 'pastel-matrix': palette('#f8f2fa','#fffbff','#655578','#bba2d6','#87bfb7','#e5daed',14),
 'layered-paper': palette('#f0eee7','#fcfbf6','#5e5b4e','#83a5a6','#c4ae7a','#dedbd0',2),
 'swiss-grid': palette('#fafaf6','#fff','#242b30','#bd5f46','#547784','#d9ddd8',0),
 'pixel-dashboard': palette('#171c32','#252c47','#e0e8fc','#86adf3','#c69be0','#465275',0),
}
const chart = (type,p=standard) => {
 const {a,b,ink,rule,panel}=p
 const axis=path('M20 12V181H352',rule,1)
 const grid=[50,100,150].map(y=>path(`M20 ${y}H352`,rule,1,'none','stroke-dasharray="3 5"')).join('')
 const bars=(values,stack=false)=>values.map((v,i)=>rect(32+i*45,180-v,28,v,a,2)+(stack?rect(32+i*45,180-v-28,28,28,b,2):'')).join('')
 const line=path('M32 153L78 118L123 134L168 88L213 105L258 51L303 65L347 24',a,3)
 const table=(pivot=false)=>Array.from({length:5},(_,i)=>rect(20,20+i*32,326,30,i===0?`${a}20`:panel,2)+[0,1,2].map(j=>text(30+j*108,40+i*32,i===0?['分组','指标 A','指标 B'][j]:j===0?['华东','华南','华北','西南'][i-1]:(pivot?['低','中','高'][(i+j)%3]:['—','••','•••'][(i+j)%3]),12,ink)).join('')).join('')
 switch(type){
 case 'line':return axis+grid+line
 case 'bars':return axis+grid+bars([70,114,90,149,126,162,143])
 case 'combo':return axis+grid+bars([70,114,90,149,126,162,143])+path('M46 135L91 109L136 120L181 70L226 92L271 42L316 55',b,3)
 case 'stack':return axis+bars([75,105,63,135,84,125,112],true)
 case 'percent':return axis+Array.from({length:7},(_,i)=>rect(32+i*45,35,28,145,a,1)+rect(32+i*45,180-[50,80,30,90,65,100,40][i],28,[50,80,30,90,65,100,40][i],b,1)).join('')
 case 'waterfall':return axis+[80,40,30,60,25,125].map((v,i)=>rect(36+i*53,[100,60,60,30,30,55][i],30,v,i===2||i===4?b:a,1)).join('')
 case 'pareto':return axis+bars([153,115,81,56,37,25,15])+path('M46 124L91 84L136 55L181 39L226 28L271 20L316 16',b,3)
 case 'histogram':return axis+[18,42,80,121,151,137,104,68,30,12].map((v,i)=>rect(29+i*31,180-v,28,v,a,0)).join('')
 case 'box':return axis+[0,1,2,3,4].map((v,i)=>path(`M${60+i*61} 30V161`,a,2)+rect(44+i*61,60+i*8,32,55-i*3,`${a}35`,2,a)+path(`M${44+i*61} ${87+i*7}h32`,b,2)).join('')
 case 'small':return [0,1,2,3].map(i=>group(10+(i%2)*175,4+Math.floor(i/2)*96,axis+line,.46)).join('')
 case 'treemap':return rect(20,14,185,166,a,4)+rect(211,14,139,77,b,4)+rect(211,97,65,83,`${a}88`,4)+rect(282,97,68,38,`${b}88`,4)+rect(282,141,68,39,`${a}50`,4)
 case 'donut':case 'sunburst':return circle(175,98,67,'none',rule,29)+`<circle cx="175" cy="98" r="67" fill="none" stroke="${a}" stroke-width="29" stroke-dasharray="224 421" transform="rotate(-90 175 98)"/>`+`<circle cx="175" cy="98" r="67" fill="none" stroke="${b}" stroke-width="29" stroke-dasharray="100 421" stroke-dashoffset="-230" transform="rotate(-90 175 98)"/>`+(type==='sunburst'?circle(175,98,39,'none',b,17):text(150,104,'占比',18,ink))
 case 'sankey':return path('M40 45C160 45 180 130 320 130',`${a}60`,35)+path('M40 130C180 130 170 50 320 50',`${b}80`,25)+rect(25,20,20,145,a,2)+rect(315,20,20,60,b,2)+rect(315,100,20,65,a,2)
 case 'calendar':return Array.from({length:84},(_,i)=>rect(30+(i%14)*22,22+Math.floor(i/14)*25,18,20,i%6===0?b:[`${a}20`,`${a}55`,`${a}90`,a][(i*7+Math.floor(i/14))%4],2)).join('')
 case 'heatmap':return Array.from({length:35},(_,i)=>rect(30+(i%7)*44,20+Math.floor(i/7)*31,39,26,[`${a}20`,`${a}55`,`${a}90`,a,b][(i*3+Math.floor(i/7))%5],2)).join('')
 case 'bullet':return [0,1,2,3].map((v,i)=>rect(35,25+i*42,290,26,rule,2)+rect(35,30+i*42,[195,237,165,257][i],16,a,2)+path(`M${[249,279,240,290][i]} ${21+i*42}v34`,b,3)).join('')
 case 'dumbbell':return [0,1,2,3].map((v,i)=>path(`M${70+i*19} ${30+i*43}H${250+i*17}`,rule,6)+circle(70+i*19,30+i*43,7,a)+circle(250+i*17,30+i*43,7,b)).join('')
 case 'scatter':return axis+Array.from({length:24},(_,i)=>circle(40+(i*71)%293,20+(i*41)%148,4+(i%4)*2,i%3===0?b:`${a}aa`)).join('')
 case 'funnel':return [0,1,2,3].map((v,i)=>polygon([[35+i*32,18+i*41],[335-i*32,18+i*41],[305-i*32,52+i*41],[65+i*32,52+i*41]],i%2?a:b)).join('')
 case 'radar':return [30,60,90].map(r=>polygon(points(r),'none',rule)).join('')+polygon(points(85).map(([x,y],i)=>[180+(x-180)*[.85,.7,1,.55,.75,.8][i],100+(y-100)*[.85,.7,1,.55,.75,.8][i]]),`${a}40`,a)
 case 'table':return table()
 case 'pivot':return table(true)
 case 'rank':return ['直营','线上','合作','自然'].map((label,i)=>text(20,39+i*43,label,13,ink)+rect(75,23+i*43,260-i*51,24,i===0?a:`${a}80`,3)).join('')
 case 'progress':return text(25,42,'目标完成情况',16,ink,600)+rect(25,65,310,18,rule,9)+rect(25,65,222,18,a,9)+text(25,125,'当前进度',13,ink)+rect(25,144,310,12,rule,6)+rect(25,144,165,12,b,6)
 case 'timeline':return path('M55 20V176',rule,3)+['数据准备','分析完成','生成洞察','持续追踪'].map((v,i)=>circle(55,29+i*44,7,i===3?b:a)+text(80,34+i*44,v,14,ink)).join('')
 case 'metric':return text(35,45,'本期指标',16,ink)+text(35,113,'128,640',48,ink,600)+path('M237 140L259 112L280 123L302 84L326 91',a,3)+text(35,156,'演示数值',12,b)
 case 'metrics':return [0,1,2].map(i=>rect(16+i*118,30,108,135,`${a}12`,8)+text(28+i*118,62,['销售额','订单数','转化率'][i],12,ink)+text(28+i*118,108,['128K','6.2K','8.6%'][i],22,a,600)+text(28+i*118,143,'演示数值',10,ink)).join('')
 case 'date':return text(25,32,'选择时间范围',17,ink,600)+['近 7 天','近 30 天','本月'].map((v,i)=>rect(25+i*109,52,99,30,i===1?a:rule,5)+text(37+i*109,72,v,12,i===1?panel:ink)).join('')+rect(25,103,143,36,panel,5,rule)+rect(192,103,143,36,panel,5,rule)+text(38,127,'开始日期',12,ink)+text(205,127,'结束日期',12,ink)+rect(256,158,79,28,a,5)+text(282,177,'应用',12,panel)
 case 'options':return text(25,32,'渠道筛选',16,ink,600)+['全部渠道','线上渠道','线下门店','合作伙伴'].map((v,i)=>rect(28,49+i*34,18,18,i===1?a:panel,4,rule)+text(60,64+i*34,v,14,ink)).join('')
 case 'keyword':return text(25,45,'搜索业务记录',17,ink,600)+rect(25,72,310,44,panel,6,rule)+circle(49,92,7,'none',a,2)+path('M54 97l7 7',a,2)+text(78,100,'输入名称或关键词',14,ink)+text(25,155,'按名称、编号或标签查找',12,ink)
 case 'range':return text(25,40,'选择数值区间',17,ink,600)+path('M40 85H320',rule,8)+path('M100 85H260',a,8)+circle(100,85,9,panel,a,3)+circle(260,85,9,panel,a,3)+rect(25,125,140,38,panel,5,rule)+rect(195,125,140,38,panel,5,rule)+text(40,149,'最小值',13,ink)+text(210,149,'最大值',13,ink)
 case 'segment':return text(25,45,'统计粒度',17,ink,600)+rect(25,76,310,43,rule,7)+rect(128,80,99,35,panel,5)+['日','周','月'].map((v,i)=>text(71+i*103,104,v,14,ink)).join('')+text(25,165,'按时间粒度比较变化',13,ink)
 case 'toggle':return ['显示同比','显示目标线','仅看异常'].map((v,i)=>text(30,43+i*58,v,15,ink)+rect(270,24+i*58,60,29,i===1?rule:a,15)+circle(i===1?285:315,38+i*58,11,panel)).join('')
 case 'tabs':return ['总览','趋势','明细'].map((v,i)=>text(30+i*96,30,v,15,i===0?a:ink,600)).join('')+path('M25 43H87',a,3)+group(10,57,line,.6)+rect(260,74,74,18,rule,3)+rect(260,107,58,18,rule,3)+rect(260,140,68,18,rule,3)
 case 'collapse':return rect(20,15,330,166,panel,6,rule)+text(35,43,'经营概览',16,ink,600)+text(322,43,'−',17,a)+path('M30 58H340',rule,1)+rect(35,77,287,9,rule,2)+rect(35,98,242,9,rule,2)+path('M30 128H340',rule,1)+text(35,157,'渠道详情',16,ink)+text(322,157,'+',17,a)
 case 'note':return rect(20,23,330,150,`${a}10`,8)+circle(47,51,11,a)+text(44,56,'i',15,panel,600)+text(72,57,'分析说明',17,ink,600)+text(40,98,'关注关键变化与数据口径',14,ink)+text(40,127,'结论应结合完整数据验证',14,ink)+path('M40 149H192',a,2)
 case 'panel':return rect(20,15,330,166,panel,6,rule)+text(38,44,'业务分析',17,ink,600)+path('M36 59H333',rule,1)+rect(37,80,140,75,`${a}16`,6)+path('M53 139L80 119L108 128L138 95L160 110',a,3)+rect(198,83,124,10,rule,3)+rect(198,108,99,10,rule,3)+rect(198,133,115,10,rule,3)
 default:throw new Error(`Missing chart type: ${type}`)
 }
}
const componentSpecs={
 'detail-table':'table','date-range':'date','metric-card':'metric','option-filter':'options','trend-comparison':'line','content-panel':'panel','combo-chart':'combo','percent-stacked':'percent','waterfall':'waterfall','pareto':'pareto','histogram':'histogram','box-plot':'box','small-multiples':'small','treemap':'treemap','sunburst':'sunburst','sankey':'sankey','calendar-heatmap':'calendar','bullet':'bullet','dumbbell':'dumbbell','multi-series':'stack','donut':'donut','scatter-bubble':'scatter','matrix-heatmap':'heatmap','funnel':'funnel','radar':'radar','metric-group':'metrics','pivot-table':'pivot','ranking':'rank','target-progress':'progress','event-timeline':'timeline','keyword-filter':'keyword','number-range':'range','segmented-filter':'segment','toggle-filter':'toggle','tabbed-panel':'tabs','collapsible-panel':'collapse','analysis-note':'note',
}
const analysisSpecs={
 'growth-attribution':['waterfall','rank'], 'conversion-diagnosis':['funnel','heatmap'], 'risk-monitoring':['scatter','timeline'], 'customer-lifecycle':['scatter','rank'], 'regional-flow':['heatmap','sankey'], 'multi-criteria':['radar','heatmap'],
}
const specs=new Map([
 ...Object.entries(themeSpecs).map(([id,p])=>[`visual-theme-${id}`,{p,charts:['line','donut']}]),
 ...Object.entries(componentSpecs).map(([id,kind])=>[`component-${id}`,{p:standard,charts:[kind]}]),
 ...Object.entries(analysisSpecs).map(([id,charts])=>[`analysis-template-${id}`,{p:standard,charts}]),
])
function artwork(entry,spec){
 const {p,charts}=spec;const title=labels[entry.titleKey]
 let body=rect(0,0,800,450,p.bg,0)
 if(entry.kind==='component'){
  body+=rect(116,48,568,348,p.panel,p.radius,p.rule)+text(145,86,title,20,p.ink,600)+text(586,86,'形态示意',12,p.ink)+group(142,117,chart(charts[0],p),1.43)
 }else{
  body+=text(30,42,title,22,p.ink,600)+text(30,65,'LIVE DASHBOARD  /  演示数据',10,p.ink)+rect(573,25,195,27,p.panel,4,p.rule)+text(586,43,'最近 30 天   ·   全部渠道',11,p.ink)
  const metrics=['业务规模','订单数量','平均价值','变化趋势'],values=['128.6K','6,240','20.6','+8.6%']
  for(let i=0;i<4;i++)body+=rect(30+i*188,87,176,73,p.panel,p.radius,p.rule)+rect(30+i*188,87,3,73,i===3?p.b:p.a,0)+text(43+i*188,109,metrics[i],11,p.ink)+text(43+i*188,140,values[i],24,p.ink,600)
  for(let i=0;i<2;i++)body+=rect(30+i*380,177,366,222,p.panel,p.radius,p.rule)+text(45+i*380,201,i===0?'核心趋势':'结构与对比',13,p.ink,600)+group(42+i*380,216,chart(charts[i],p),.93)
  body+=text(30,427,'仅用于外观与组件形态预览，内容待实现。',11,p.ink)+text(669,427,'示意 · PREVIEW',10,p.ink)
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img"><title>${esc(title)} · 原创形态预览</title><g font-family="system-ui, sans-serif">${body}</g></svg>\n`
}
const provenance={origin:'original-code-authored',createdAt:'2026-11-07',generator:'scripts/generate-catalog-art.mjs',purpose:'Illustrative catalog shells; synthetic chart shapes and values, no executable templates or third-party screenshots.',entries:[]}
const imports=[],map=[]
for(const [i,entry] of entries.entries()){
 const spec=specs.get(entry.id);if(!spec)throw new Error(`Missing explicit artwork spec: ${entry.id}`)
 entry.preview=`${entry.id}.svg`
 const source=artwork(entry,spec)
 await writeFile(new URL(`assets/library/catalog/${entry.preview}`,root),source)
 provenance.entries.push({id:entry.id,file:entry.preview,origin:'original-code-authored',sha256:createHash('sha256').update(source).digest('hex')})
 imports.push(`import preview${i} from '../../assets/library/catalog/${entry.preview}'`)
 map.push(`  '${entry.preview}': preview${i},`)
}
await writeFile(new URL('scripts/content/library-catalog.json',root),JSON.stringify(entries,null,2)+'\n')
await writeFile(new URL('src/remote/library-catalog-images.ts',root),imports.join('\n')+'\n\nexport const catalogImages: Record<string, string> = {\n'+map.join('\n')+'\n}\n')
await writeFile(new URL('assets/library/catalog/provenance.json',root),JSON.stringify(provenance,null,2)+'\n')
for(const file of await readdir(new URL('assets/library/catalog/',root)))if(file.endsWith('.webp'))await unlink(new URL(`assets/library/catalog/${file}`,root))
console.log(`Generated ${entries.length} original SVG previews in ${fileURLToPath(new URL('assets/library/catalog/',root))}`)
