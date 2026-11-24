// 持久化模型：所有业务数据带租户和组织范围；唯一索引与 revision 支持去重和并发校验。
import {Column,Entity,Index,PrimaryColumn} from 'typeorm'
import {pluginArtifactTableName} from '@xpert-ai/plugin-sdk'
import {NAMESPACE} from './constants.js'
abstract class Scoped{@Column({type:'varchar'})tenantId!:string;@Column({type:'varchar',nullable:true})organizationId!:string|null}
@Entity(pluginArtifactTableName(NAMESPACE,'item')) @Index(['tenantId','organizationId','itemId'],{unique:true})
// 商品：监控状态与连续失败次数；同范围商品编号唯一。
export class MonitorItem extends Scoped{@PrimaryColumn('varchar')id!:string;@Column('varchar')itemId!:string;@Column('varchar')title!:string;@Column('varchar')shopName!:string;@Column('varchar')url!:string;@Column('varchar')status!:'active'|'paused';@Column('int',{default:0})consecutiveFailures!:number;@Column('int',{default:1})revision!:number}
@Entity(pluginArtifactTableName(NAMESPACE,'round')) @Index(['tenantId','organizationId','idempotencyKey'],{unique:true})
// 轮次：幂等键、采集状态、失败原因及分析在途标记。
export class CollectionRound extends Scoped{@Column('varchar',{nullable:true})analysisStartedAt!:string|null;@Column('varchar',{nullable:true})failedItemId!:string|null;@PrimaryColumn('varchar')id!:string;@Column('varchar')idempotencyKey!:string;@Column('varchar')status!:'running'|'success'|'failed'|'partial'|'paused';@Column('text',{nullable:true})errorReason!:string|null;@Column('int',{default:0})retryCount!:number;@Column('varchar')startedAt!:string;@Column('varchar',{nullable:true})finishedAt!:string|null;@Column('int',{default:1})revision!:number}
@Entity(pluginArtifactTableName(NAMESPACE,'snapshot')) @Index(['tenantId','organizationId','roundId','itemId'],{unique:true})
// 快照：原始证据与采集字段；同一轮次同一商品只有一份。
export class Snapshot extends Scoped{@PrimaryColumn('varchar')id!:string;@Column('varchar')roundId!:string;@Column('varchar')itemId!:string;@Column('float')price!:number;@Column('text')titleSnapshot!:string;@Column('text')promoText!:string;@Column('text')rawJson!:string;@Column('varchar')sourceAdapter!:string;@Column('varchar')createdAt!:string}
@Entity(pluginArtifactTableName(NAMESPACE,'change')) @Index(['tenantId','organizationId','roundId','itemId','dimension'],{unique:true})
// 变化：服务端保存的前后值、维度、证据和严重程度。
export class MonitorChange extends Scoped{@PrimaryColumn('varchar')id!:string;@Column('varchar')roundId!:string;@Column('varchar')itemId!:string;@Column('varchar')dimension!:'price'|'title'|'promo';@Column('text')beforeValue!:string;@Column('text')afterValue!:string;@Column('varchar')severity!:'low'|'medium'|'high';@Column('text')evidence!:string}
@Entity(pluginArtifactTableName(NAMESPACE,'advice')) @Index(['tenantId','organizationId','changeId','category'],{unique:true})
// 建议：关联事实、操作幂等键、人工审核状态与乐观锁版本。
export class Advice extends Scoped{@PrimaryColumn('varchar')id!:string;@Column('varchar',{nullable:true})operationId!:string|null;@Column('varchar')changeId!:string;@Column('varchar')category!:'title_optimization'|'promotion_adjustment'|'creative_request';@Column('text')content!:string;@Column('text')reason!:string;@Column('varchar')status!:'pending'|'approved'|'rejected';@Column('varchar',{nullable:true})reviewedAt!:string|null;@Column('int',{default:1})revision!:number}
export const ENTITIES=[MonitorItem,CollectionRound,Snapshot,MonitorChange,Advice]
