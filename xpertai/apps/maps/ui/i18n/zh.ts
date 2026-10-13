import type { Catalog } from './en'
export const zh: Catalog = {
  'search.label': '搜索地点', 'search.placeholder': '搜索地点、咖啡馆、公园…', 'search.submit': '搜索',
  'search.city': '城市或搜索范围', 'search.cityPlaceholder': '城市', 'search.area': '搜索这片区域', 'search.cityRequired': '请填写城市，或在当前地图范围内搜索。', 'search.queryRequired': '请输入地点或关键词。',
  'category.coffee': '咖啡', 'category.walk': '散步', 'category.sunset': '日落',
  'category.coffeeQuery': '咖啡馆', 'category.walkQuery': '公园', 'category.sunsetQuery': '观景台',
  'map.label': '交互地图', 'map.help': '方向键平移，加减键缩放，0 键显示全部地点。结果列表提供相同地点。',
  'map.zoomIn': '放大', 'map.zoomOut': '缩小', 'map.fit': '显示全部地点', 'map.loading': '正在更新地图…', 'map.empty': '搜索地点，开始探索',
  'map.failed': '暂时无法显示地图', 'map.retry': '重试地图', 'map.demo': '模拟地图 · 非真实导航',
  'result.title': '搜索结果', 'result.count': { one: '{{count}} 个地点', other: '{{count}} 个地点' }, 'result.more': '加载更多',
  'result.empty': '这片区域还没有找到结果', 'result.emptyHint': '试试其他关键词，或移动地图后搜索新的范围。',
  'result.initial': '想去哪里探索？', 'result.initialHint': '在上方搜索，或让左侧助手帮你寻找地点。',
  'result.loading': '正在寻找附近的地点…', 'result.failed': '暂时无法获取地点', 'result.failureHint': '你的搜索和地图位置已保留。',
  'detail.title': '地点详情', 'detail.back': '返回结果', 'detail.route': '规划路线', 'detail.reference': '引用到对话', 'detail.referenced': '地点已添加到对话输入框，请补充问题后发送。', 'detail.referenceFailed': '暂时无法将地点引用到对话。', 'detail.referenceUnavailable': '请在工作台地图视图中引用地点。', 'detail.copy': '复制地址', 'detail.copied': '地址已复制', 'detail.copyFailed': '暂时无法复制地址', 'detail.failed': '暂时无法更新地点详情',
  'route.title': '规划路线', 'route.back': '返回地点详情', 'route.origin': '出发地', 'route.destination': '目的地', 'route.choose': '选择地点', 'route.swap': '交换起终点', 'route.driving': '驾车', 'route.walking': '步行', 'route.plan': '规划路线', 'route.loading': '正在更新路线…', 'route.failed': '暂时没有可用路线', 'route.invalid': '请从搜索结果中选择两个不同的地点。', 'route.initial': '选择出发地', 'route.initialHint': '选择起点和终点后规划路线。', 'route.demo': '距离、耗时和路线均为模拟数据，请勿用于导航。', 'route.clear': '清除路线',
  'tray.collapse': '收起结果', 'tray.expand': '展开结果', 'action.retry': '重试', 'action.close': '关闭',
  'provider.amap': '高德地图', 'provider.tencent': '腾讯地图', 'mode.demo': '演示数据', 'mode.live': '地图数据',
  'status.connecting': '正在连接…', 'status.failed': '地图服务暂时不可用，请重试。',
  'distance.meters': '{{value}} 米', 'distance.km': '{{value}} 公里', 'duration.minutes': '{{value}} 分钟', 'duration.hours': '{{hours}} 小时 {{minutes}} 分钟',
  'a11y.place': '{{number}}. {{name}}', 'a11y.category': '建议搜索分类', 'a11y.results': '地点结果', 'a11y.routeMode': '出行方式', 'a11y.mapControls': '地图控件'
}
