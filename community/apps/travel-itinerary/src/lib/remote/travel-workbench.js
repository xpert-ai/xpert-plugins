(function () {
  'use strict'
  var channel = 'xpertai.remote_component'
  var version = 1
  var instanceId = null
  var sequence = 0
  var pending = {}
  var state = { data: null, selectedId: null, loading: true, error: '' }

  function post(type, body) { window.parent.postMessage(Object.assign({ channel: channel, protocolVersion: version, instanceId: instanceId, type: type }, body || {}), '*') }
  function request(type, body) {
    var requestId = String(++sequence)
    return new Promise(function (resolve, reject) { pending[requestId] = { resolve: resolve, reject: reject }; post(type, Object.assign({ requestId: requestId }, body || {})) })
  }
  function formatStatus(status) { return ({ draft: '草稿', generating: '生成中', ready_for_review: '待审核', confirmed: '已确认', failed: '生成失败' })[status] || status }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>\"]/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' })[char] }) }
  function render() {
    var root = document.getElementById('root'); if (!root) return
    if (state.loading) { root.innerHTML = '<main class="travel-shell"><p class="travel-muted">正在加载旅行方案...</p></main>'; return }
    if (state.error) { root.innerHTML = '<main class="travel-shell"><p class="travel-error">' + esc(state.error) + '</p><button id="travel-retry">重新加载</button></main>'; document.getElementById('travel-retry').onclick = load; return }
    var data = state.data || { plans: [], summary: {} }, plans = data.plans || []
    var selected = plans.find(function (plan) { return plan.id === state.selectedId }) || data.selectedPlan || plans[0]
    state.selectedId = selected && selected.id
    var rows = plans.length ? plans.map(function (plan) { return '<button class="travel-plan-row ' + (selected && selected.id === plan.id ? 'is-selected' : '') + '" data-plan-id="' + esc(plan.id) + '"><span>' + esc(plan.title) + '</span><em>' + esc(formatStatus(plan.status)) + '</em><small>' + esc(plan.requirements.startDate) + ' - ' + esc(plan.requirements.endDate) + '</small></button>' }).join('') : '<p class="travel-muted">还没有旅行方案，请让助手创建一条需求。</p>'
    var itinerary = selected && selected.itinerary
    var days = itinerary && itinerary.days ? itinerary.days.map(function (day) { return '<section class="travel-day"><h3>' + esc(day.date) + '</h3>' + day.activities.map(function (activity) { return '<div class="travel-activity"><strong>' + esc(activity.startTime) + ' - ' + esc(activity.endTime) + '</strong><span>' + esc(activity.title) + '</span><small>' + esc(activity.location) + (activity.estimatedCost != null ? ' · ¥' + esc(activity.estimatedCost) : '') + '</small></div>' }).join('') + '</section>' }).join('') : '<p class="travel-muted">选择一条方案查看 AI 行程。</p>'
    root.innerHTML = '<main class="travel-shell"><header class="travel-header"><div><p class="travel-kicker">TRAVEL WORKBENCH</p><h1>旅行方案</h1><p class="travel-muted">AI 生成，人工确认，随时恢复。</p></div><button id="travel-refresh" class="travel-button">刷新</button></header><div class="travel-summary"><div><strong>' + esc(data.summary.totalPlans || 0) + '</strong><span>全部方案</span></div><div><strong>' + esc(data.summary.confirmedPlans || 0) + '</strong><span>已确认</span></div><div><strong>' + esc(data.summary.failedPlans || 0) + '</strong><span>待重试</span></div></div><div class="travel-grid"><aside class="travel-list"><h2>方案记录</h2>' + rows + '</aside><article class="travel-detail">' + (selected ? '<div class="travel-detail-head"><div><h2>' + esc(selected.title) + '</h2><span class="travel-status">' + esc(formatStatus(selected.status)) + '</span></div>' + (selected.status === 'ready_for_review' ? '<button id="travel-confirm" class="travel-button travel-primary">确认方案</button>' : '') + (selected.status === 'failed' ? '<button id="travel-retry-plan" class="travel-button travel-primary">重试生成</button>' : '') + '</div><div class="travel-requirements"><span>' + esc(selected.requirements.destination) + '</span><span>' + esc(selected.requirements.startDate) + ' - ' + esc(selected.requirements.endDate) + '</span><span>' + esc(selected.requirements.travelers) + ' 人</span><span>预算 ¥' + esc(selected.requirements.budget || '未设置') + '</span></div>' + (selected.errorMessage ? '<p class="travel-error">' + esc(selected.errorMessage) + '</p>' : '') + '<div class="travel-days">' + days + '</div>' : '<div class="travel-empty"><h2>开始一条旅行方案</h2><p>在助手中描述目的地、日期、人数和偏好，生成结果会显示在这里。</p></div>') + '</article></div></main>'
    Array.prototype.forEach.call(document.querySelectorAll('[data-plan-id]'), function (button) { button.onclick = function () { state.selectedId = button.getAttribute('data-plan-id'); render() } })
    document.getElementById('travel-refresh').onclick = load
    var confirm = document.getElementById('travel-confirm'); if (confirm) confirm.onclick = function () { execute('confirm_plan', state.selectedId, { planId: state.selectedId }) }
    var retry = document.getElementById('travel-retry-plan'); if (retry) retry.onclick = function () { execute('retry_plan', state.selectedId, { planId: state.selectedId }) }
  }
  function load() { state.loading = true; state.error = ''; render(); request('requestData', { query: { page: 1, pageSize: 50, parameters: {} } }).then(function (message) { state.data = message.data || message.result || {}; state.loading = false; render() }).catch(function (error) { state.loading = false; state.error = error.message || '加载失败'; render() }) }
  function execute(actionKey, targetId, input) { request('executeAction', { actionKey: actionKey, targetId: targetId, input: input, parameters: {} }).then(function () { post('notify', { message: '旅行方案已确认。', level: 'success' }); load() }).catch(function (error) { post('notify', { message: error.message || '操作失败', level: 'error' }) }) }
  window.addEventListener('message', function (event) {
    var message = event.data; if (!message || message.channel !== channel || message.protocolVersion !== version) return
    if (message.type === 'init') { instanceId = message.instanceId || null; post('ready'); load(); return }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') { load(); return }
    if (message.requestId && pending[message.requestId]) { var item = pending[message.requestId]; delete pending[message.requestId]; message.type === 'error' ? item.reject(new Error(message.message || '请求失败')) : item.resolve(message) }
  })
  document.addEventListener('DOMContentLoaded', function () { document.getElementById('root').innerHTML = '<main class="travel-shell"><p class="travel-muted">正在连接 Xpert...</p></main>' })
}())
