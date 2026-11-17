import { z } from 'zod/v3'
import { hotelRoles, fieldKey, resourceSchema, type LibraryResourceDocument } from './resource.schema'

export const hotelMappingSchema = z.object(Object.fromEntries(hotelRoles.map(role=>[role,fieldKey.optional()]))).catchall(z.never())
export type HotelMapping = Partial<Record<typeof hotelRoles[number],string>>
export type HotelRow = Record<string,string|number|boolean|null>

/** Shared by preview and authored HTML. No network, inferred fields or hidden row truncation. */
export function hotelSummary(rows:HotelRow[],mapping:HotelMapping) {
  for(const field of ['booking_id','arrival_date','is_cancelled'] as const)if(!mapping[field])throw Error('HOTEL_REQUIRED_FIELD')
  const seen=new Set<string>(),groups={month:new Map<string,{total:number;known:number;cancelled:number}>(),channel:new Map<string,{total:number;known:number;cancelled:number}>(),
    country:new Map<string,{total:number;known:number;cancelled:number}>(),deposit:new Map<string,{total:number;known:number;cancelled:number}>(),lead:new Map<string,{total:number;known:number;cancelled:number}>(),room:new Map<string,{total:number;known:number;cancelled:number}>()}
  let known=0,cancelled=0,moneyRows=0,cents=0,retainedNights=0,unknown=0
  const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)?Number(v):NaN
  for(const row of rows){
    const id=row[mapping.booking_id!],date=row[mapping.arrival_date!],status=row[mapping.is_cancelled!]
    if(id===null||id===undefined||String(id)===''||seen.has(String(id)))throw Error('HOTEL_BOOKING_GRAIN_REQUIRED')
    seen.add(String(id))
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date.slice(0,10))throw Error('HOTEL_DATE_INVALID')
    const cancel=status===true||status===1||status==='1',retain=status===false||status===0||status==='0',valid=cancel||retain
    if(valid)known++;else unknown++;if(cancel)cancelled++
    if(retain&&mapping.adr&&mapping.nights){const adr=finite(row[mapping.adr]),nights=finite(row[mapping.nights]),price=Math.round(adr*100)
      if(Number.isFinite(adr)&&adr>=0&&adr<=1e9&&Number.isSafeInteger(nights)&&nights>0&&nights<=3650&&Math.abs(price/100-adr)<1e-7){moneyRows++;cents+=price*nights;retainedNights+=nights;if(!Number.isSafeInteger(cents))throw Error('HOTEL_AMOUNT_RANGE')}}
    const dim=(role:keyof HotelMapping)=>mapping[role]?String(row[mapping[role]!]??'∅'):'∅'
    const lead=mapping.lead_time?finite(row[mapping.lead_time]):NaN
    const keys={month:date.slice(0,7),channel:dim('channel'),country:dim('country'),deposit:dim('deposit_type'),lead:!Number.isFinite(lead)||lead<0?'∅':lead<=7?'0–7':lead<=30?'8–30':lead<=90?'31–90':'>90',
      room:mapping.reserved_room&&mapping.assigned_room?`${dim('reserved_room')} → ${dim('assigned_room')}`:'∅'}
    for(const key of Object.keys(groups) as (keyof typeof groups)[]){const g=groups[key].get(keys[key])??{total:0,known:0,cancelled:0};g.total++;if(valid)g.known++;if(cancel)g.cancelled++;groups[key].set(keys[key],g)}
  }
  const series=(key:keyof typeof groups)=>[...groups[key]].map(([label,g])=>({label,...g,rate:g.known?g.cancelled/g.known:null})).sort((a,b)=>key==='month'?a.label.localeCompare(b.label):b.total-a.total||a.label.localeCompare(b.label))
  const retained=known-cancelled,moneyAvailable=retained>0&&moneyRows===retained
  return {total:rows.length,known,unknown,cancelled,retained,cancelRate:known?cancelled/known:null,roomValue:moneyAvailable?cents/100:null,
    weightedAdr:moneyAvailable&&retainedNights?cents/100/retainedNights:null,moneyRows,
    month:series('month'),channel:series('channel'),country:series('country'),deposit:series('deposit'),lead:series('lead'),room:series('room')}
}

const ids={template:'0b7ed312-337b-45a7-9e83-d2295ed6e001',dataset:'0b7ed312-337b-45a7-9e83-d2295ed6e002',theme:'0b7ed312-337b-45a7-9e83-d2295ed6e003',example:'0b7ed312-337b-45a7-9e83-d2295ed6e004'}
export function hotelSeed():LibraryResourceDocument[] {
  const header={schema:'xpert.library.resource',formatVersion:1,version:'1.1.0',tags:['酒店','经营分析'],license:{identifier:'CC0-1.0',attribution:'Xpert generated demonstration fixture'},provenance:'synthetic',dependencies:[]}
  const type=(role:string)=>role==='is_cancelled'?'boolean':['adr','nights','lead_time'].includes(role)?'number':role==='arrival_date'?'date':'string'
  const rows=Array.from({length:720},(_,i)=>({booking_id:`DEMO-${i+1}`,arrival_date:new Date(Date.UTC(2024,Math.floor(i/60),i%28+1)).toISOString().slice(0,10),
    is_cancelled:i%7===0||i%11===0,adr:70+(i*17%130),nights:1+i%7,hotel:i%2?'City Hotel':'Resort Hotel',channel:['Direct','Online TA','Corporate'][i%3],
    lead_time:i*13%180,deposit_type:i%5?'No Deposit':'Non Refund',country:['PRT','GBR','FRA','DEU'][i%4],reserved_room:['A','B','C'][i%3],assigned_room:i%9?['A','B','C'][i%3]:'D'}))
  return [
    {...header,logicalId:ids.template,kind:'analysis-template',title:'酒店经营分析',description:'预订与取消、渠道结构、提前预订和房型变更。未取消预订房费为估算，不等于实际收入。',content:{recipe:'hotel-operations',currency:'EUR',roles:hotelRoles.map(role=>({role,type:type(role),required:['booking_id','arrival_date','is_cancelled'].includes(role)}))}},
    {...header,logicalId:ids.dataset,kind:'public-dataset',title:'酒店预订演示数据 · 2024',description:'720 条确定性生成的合成预订，仅用于功能演示与迁移校验。',content:{columns:hotelRoles.map(key=>({key,label:key,type:type(key),nullable:false})),rows}},
    {...header,logicalId:ids.theme,kind:'visual-theme',title:'清晰商务',description:'适配系统明暗主题的经营分析样式。',content:{theme:'system'}},
    {...header,logicalId:ids.example,kind:'example-task',presentation:{cover:'hotel-operations',category:'酒店经营分析'},title:'酒店经营分析',description:'基于酒店预订示例数据的洞察型看板，量化提前预订与取消风险、渠道结构与房费估算，并从押金政策、客源和房型调整三个层面给出有数据依据的建议。',
      dependencies:[{role:'template',logicalId:ids.template,version:'1.1.0'},{role:'dataset',logicalId:ids.dataset,version:'1.1.0'},{role:'theme',logicalId:ids.theme,version:'1.1.0'}],
      content:{skills:['live-dashboard'],question:'分析酒店预订趋势、取消率与渠道差异，检查提前预订、押金政策、国家和房型变更，并注明每个结论的样本数。不要将相关性解释为因果或把预订房费估算当作实际收入。'}}
  ].map(r=>resourceSchema.parse(r))
}
