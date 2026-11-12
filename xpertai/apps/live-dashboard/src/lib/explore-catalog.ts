import definitions from './explore-catalog.json'
import { exploreCatalogSchema, type exploreKeySchema } from './explore.schema'
import { hotelSeed } from './hotel-template'
import { resourceSchema, type LibraryResourceDocument } from './resource.schema'
import type { z } from 'zod/v3'

export const exploreCatalog = exploreCatalogSchema.parse(definitions)
const demoId = (id:number) => `73aca0be-536d-4f4a-8e66-${String(id).padStart(12,'0')}`
const header = {schema:'xpert.library.resource',formatVersion:1,version:'1.0.0',tags:['分析与洞察'],license:{identifier:'AGPL-3.0',attribution:'Xpert demonstration tasks adapted from user-supplied task references; generated fixtures are synthetic.'},provenance:'synthetic',dependencies:[]}
function dataset(key:'orders'|'weather'):LibraryResourceDocument {
  const orderRows=Array.from({length:1080},(_,i)=>{
    const quantity=1+i%5,price=25+i*13%600,discount=i%4?0:Math.round(price*quantity*0.15*100)/100
    return {order_id:`ORDER-${i+1}`,order_date:new Date(Date.UTC(2026,Math.floor(i/180),i%28+1)).toISOString().slice(0,10),user_id:`USER-${i%390+1}`,
      category_l1:['家居','数码','服装','食品','个护','运动'][Math.floor(Math.sqrt(i%36))],category_l2:['日常用品','精选商品','季节商品'][i%3],category_l3:`品类-${i%24+1}`,
      quantity,currency:i%9?'CNY':'USD',original_amount:price*quantity,discount_amount:discount,paid_amount:Math.round((price*quantity-discount)*100)/100,
      discount_type:i%4?'无优惠':'优惠券',payment_method:['支付宝','微信支付','银行卡'][i%3]}
  })
  const cities=[['广东','广州市',23.13,113.26],['浙江','杭州市',30.27,120.15],['福建','福州市',26.08,119.3],['四川','成都市',30.57,104.07],['河南','郑州市',34.75,113.62],['湖北','武汉市',30.59,114.31]] as const
  const weatherRows=Array.from({length:360},(_,i)=>{const city=cities[i%cities.length];return {alert_id:`ALERT-${i+1}`,issued_date:`2026-10-${String(i%30+1).padStart(2,'0')}`,province:city[0],city:city[1],latitude:city[2],longitude:city[3],hazard:['暴雨','台风','高温','雷电'][i%4],level:['蓝色','黄色','橙色','红色'][Math.floor(i/7)%4],issuing_authority:`${city[1]}气象台（演示）`}})
  const rows=key==='orders'?orderRows:weatherRows
  const numeric=new Set(key==='orders'?['quantity','original_amount','discount_amount','paid_amount']:['latitude','longitude'])
  const date=key==='orders'?'order_date':'issued_date'
  return resourceSchema.parse({...header,logicalId:demoId(key==='orders'?101:102),kind:'public-dataset',title:key==='orders'?'电商订单演示数据 · 2026 H1':'极端天气预警演示数据 · 2026-10',
    description:'确定性生成的合成数据，仅供演示，不代表真实经营或气象预警。',
    content:{columns:Object.keys(rows[0]).map(key=>({key,label:key,type:numeric.has(key)?'number':key===date?'date':'string',nullable:false})),rows}})
}
/** Offline authoring adapter for V2 ZIP generation; browsing and task preparation never call this function. */
export function exploreResources(key:z.infer<typeof exploreKeySchema>):LibraryResourceDocument[] {
  const index=exploreCatalog.findIndex(item=>item.key===key),entry=exploreCatalog[index]
  if(!entry)throw Error('EXPLORE_TASK_NOT_FOUND')
  const hotel=hotelSeed(),dependencies:LibraryResourceDocument[]=[]
  if(key==='hotel-operations')dependencies.push(...hotel.filter(r=>r.kind!=='example-task'))
  else if(key==='hotel-cancellation')dependencies.push(hotel.find(r=>r.kind==='public-dataset')!)
  else if(['category-contribution','ecommerce-operations','order-promotion'].includes(key))dependencies.push(dataset('orders'))
  else if(key==='weather-alerts')dependencies.push(dataset('weather'))
  const task=resourceSchema.parse({...header,version:'1.0.1',logicalId:demoId(index+1),kind:'example-task',title:entry.title,description:entry.description,
    presentation:{cover:entry.key,category:'分析与洞察'},provenance:entry.dataMode==='demo'?'synthetic':'open-data',
    dependencies:dependencies.map(resource=>({logicalId:resource.logicalId,version:resource.version,role:resource.kind==='public-dataset'?'dataset':resource.kind==='analysis-template'?'template':'theme'})),
    content:{execution:key==='hotel-operations'?'managed-template':'agent-task',question:entry.question,skills:entry.skills}})
  return [...dependencies,task]
}
