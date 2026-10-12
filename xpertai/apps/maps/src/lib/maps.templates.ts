import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { MAPS_ICON, MAPS_MIDDLEWARE } from './constants.js'

function template(mode: 'live' | 'demo'): XpertTemplateContribution {
  const demo = mode === 'demo'
  const key = demo ? 'maps-demo-assistant' : 'maps-assistant'
  const title = demo ? '地图助手 · 模拟演示' : '地图助手'
  const description = demo ? '使用固定的虚构街区验证地图交互，不需要地图 Key。' : '搜索地点、查询详情和规划路线，默认使用高德地图。'
  const agentKey = 'Agent_Maps'
  const middlewareKey = 'Middleware_Maps'
  const dsl = {
    team: {
      name: key, type: 'agent', title, description, version: '1',
      avatar: { emoji: { id: 'world_map' }, background: '#DCFCE7' },
      options: { templateKey: key }, agent: { key: agentKey },
      agentConfig: { recursionLimit: 30 }, knowledgebases: [], toolsets: [], tags: []
    },
    nodes: [{
      type: 'agent', key: agentKey, position: { x: 100, y: 100 },
      entity: {
        key: agentKey, name: key, title, description,
        prompt: [
          '你是地图助手。使用 maps_search、maps_detail、maps_route 工具查询地点与路线。',
          '缺少城市或位置时先澄清，不能猜测用户当前位置。仅使用搜索返回的地点 ID 和 GCJ-02 坐标。',
          '先搜索地点，再根据用户选择查询详情或规划步行/驾车路线。不得虚构评分、图片、营业时间或交通状况。',
          '工具失败时解释原因，不得把失败的真实请求替换为模拟结果。地点引用只添加到输入框，由用户决定发送。',
          demo ? '当前是显式模拟演示。每次回答必须说明地点、底图、距离、时长为模拟值，不可用于导航。' : '真实地图需要连接当前 Assistant 已授权的地图连接器；凭据只在服务端使用。'
        ].join('\n'),
        collaboratorNames: [], toolsetIds: [], knowledgebaseIds: []
      }
    }, {
      type: 'workflow', key: middlewareKey, position: { x: 420, y: 280 },
      entity: { type: 'middleware', key: middlewareKey, title: '地图', provider: MAPS_MIDDLEWARE, required: true, options: { provider: 'amap', mode } }
    }],
    connections: [{ type: 'workflow', key: `${agentKey}/${middlewareKey}`, from: agentKey, to: middlewareKey }]
  }
  // JSON is a YAML subset; this keeps the packaged DSL typed and avoids a missing asset fallback.
  return {
    key, name: demo ? 'Maps Demo Assistant' : 'Maps Assistant', title, description,
    type: XpertTypeEnum.Agent, icon: MAPS_ICON, category: 'Maps', targetApps: ['xpert'],
    dependencies: { plugins: ['@xpert-ai/plugin-maps'] },
    targetAppMeta: { xpert: { types: ['assistant-template'], capabilities: [MAPS_MIDDLEWARE], requiredPlugins: ['@xpert-ai/plugin-maps'] } },
    dslContent: JSON.stringify(dsl), order: demo ? 41 : 40, default: false,
    startPrompts: ['在杭州找几家咖啡馆并显示在地图上', '查看选中地点的详细信息', '规划这两个地点之间的步行路线'],
    releaseNotes: '地图 Workbench：地点搜索、详情、路线与对话引用。', xpertName: title
  }
}

export const mapsTemplates: XpertTemplateContribution[] = [template('live'), template('demo')]
