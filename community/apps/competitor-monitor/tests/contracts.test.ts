// 自动化验证：使用隔离测试数据验证业务结果，不连接真实店铺或操作平台记录。
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {NAMESPACE,TOOL_NAMES} from '../src/lib/constants.js'
// 验证目标：校验稳定命名空间与完整工具集合。
test('stable namespace and complete tool set',()=>{assert.equal(NAMESPACE,'competitor_monitor');assert.deepEqual(TOOL_NAMES,['monitor_finish_analysis','monitor_get_round_changes','monitor_record_change','monitor_create_advice','monitor_report_analysis_issue'])})
// 验证目标：校验模板先读证据再创建建议。
test('assistant reads evidence before mutations',async()=>{const y=await readFile(new URL('../src/competitor-monitor-assistant.yaml',import.meta.url),'utf8');assert.ok(y.indexOf('monitor_get_round_changes')<y.indexOf('monitor_record_change'));assert.ok(y.indexOf('monitor_get_round_changes')<y.indexOf('monitor_create_advice'));assert.match(y,/adviceStatus=missing/);assert.match(y,/monitor_report_analysis_issue/)})
// 验证目标：校验界面使用宿主桥接且不使用浏览器持久化。
test('remote bridges collection into explicit Assistant analysis',async()=>{const h=await readFile(new URL('../src/remote/bridge.ts',import.meta.url),'utf8');assert.match(h,/requestData/);assert.match(h,/executeAction/);assert.match(h,/invokeClientCommand/);assert.match(h,/assistant\.chat\.send_message/);assert.doesNotMatch(h,/localStorage|sessionStorage/)})
// 验证目标：校验助手消息命令进入视图白名单。
test('view allowlists the Assistant client command',async()=>{const source=await readFile(new URL('../src/lib/view.provider.ts',import.meta.url),'utf8');assert.match(source,/clientCommands/);assert.match(source,/assistant\.chat\.send_message/);assert.match(source,/analysisMessage/)})
// 验证目标：校验已有审核结果不会被新增建议逻辑重置。
test('advice persistence never resets an existing review',async()=>{const source=await readFile(new URL('../src/lib/service.ts',import.meta.url),'utf8');assert.match(source,/if \(existing\) return/);assert.doesNotMatch(source,/upsert\([^\n]+status: 'pending'/)})
