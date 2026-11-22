;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  const ASSISTANT_CHAT_COMMAND_KEY = 'assistant.chat.send_message'
  /**
   * Silent counterpart to ASSISTANT_CHAT_COMMAND_KEY: sets context the Assistant can read without
   * it ever rendering as a chat bubble. Used to hand the current record's *full* id to the model,
   * so the visible chat text (built server-side by `buildAnalysisMessage`) never has to spell out
   * the full `recordId` for a tool call to work — it shows only a short `#XXXXXXXX` badge instead.
   * Mirrors the `docxEditor` / `excalidraw` pattern — `key` here must match
   * `resolveCurrentRecord`'s lookup in `conversation-review.middleware.ts`.
   */
  const ASSISTANT_CONTEXT_COMMAND_KEY = 'assistant.context.set'
  const CONVERSATION_REVIEW_CONTEXT_KEY = 'conversationReview'

  /** A processing record older than this is treated as a stalled/failed AI run. */
  const PROCESSING_STALL_MS = 90 * 1000
  const CONVERSATION_MAX_LENGTH = 8000
  const CUSTOMER_NAME_MAX_LENGTH = 100

  /**
   * Batch analysis pacing. Mirrored from `src/lib/constants.ts`; this file is plain browser JS
   * served to the iframe and cannot import from the server build.
   *
   * Records are analysed strictly one at a time. There is no per-record completion event to
   * subscribe to, so each one is polled until it leaves `processing` before the next is sent —
   * firing them all at once would interleave several analyses in the same assistant thread and
   * spend every model call before the user could stop it.
   */
  const BATCH_ANALYSIS_MAX = 20
  const BATCH_POLL_INTERVAL_MS = 2500
  /** Give up waiting on one record and move on; it stays retryable from its row. */
  const BATCH_RECORD_TIMEOUT_MS = 120 * 1000

  const IMPORT_ACCEPT = '.json,.csv,.tsv,.txt,.xlsx,.xls'
  const IMPORT_BINARY_EXTENSIONS = ['.xlsx', '.xls']

  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  const STATUS_LABELS = {
    draft: '待分析',
    processing: 'AI 分析中',
    completed: '待确认',
    confirmed: '已确认',
    failed: '分析失败'
  }

  const INTENT_LABELS = {
    high: '高意向',
    medium: '中等意向',
    low: '低意向',
    unknown: '无法判断'
  }

  /** Free-text fields, still edited as one item per line. */
  const TEXT_FIELDS = [
    { key: 'requirements', label: '客户需求' },
    { key: 'carriedOver', label: '历史遗留事项' },
    { key: 'missingInformation', label: '待确认信息' },
    { key: 'nextActions', label: '下一步跟进建议' }
  ]

  /**
   * Controlled vocabulary, mirrored from `src/lib/constants.ts`. This file is served to the
   * iframe as plain browser JS and cannot import from the server build, so the keys are
   * duplicated on purpose — change one side and you must change the other.
   */
  const ISSUE_FIELDS = [
    {
      key: 'concerns',
      kind: 'concern',
      label: '客户顾虑',
      hint: '客户自己表达出的犹豫或反对',
      categories: {
        price: '价格与预算',
        delivery: '交付与上线时间',
        integration: '集成与技术对接',
        competitor: '竞品对比',
        decision_process: '内部决策流程',
        product_capability: '产品功能不满足',
        service_support: '服务与售后支持',
        trust: '厂商信任与案例',
        other: '其他'
      }
    },
    {
      key: 'risks',
      kind: 'risk',
      label: '话术风险提示',
      hint: '销售自己说法上的风险，仅作提示，不构成合规结论',
      categories: {
        over_promise: '过度承诺',
        vague_commitment: '含糊承诺',
        unconfirmed_delivery: '未经确认的交付承诺',
        unauthorized_discount: '越权价格让步',
        unverified_claim: '未经验证的能力宣称',
        missing_followup: '关键问题未跟进',
        other: '其他'
      }
    }
  ]

  const ISSUE_FIELD_BY_KIND = ISSUE_FIELDS.reduce((acc, field) => {
    acc[field.kind] = field
    return acc
  }, {})

  /**
   * Which risk categories are also backed by a deterministic keyword/phrase rule (see `RULES` in
   * `rule-check.ts`), disclosed so the salesperson knows which flags are "this exact wording always
   * gets caught, no matter which model is behind the assistant" versus "the model judged this from
   * context." `missing_followup` and `other` are intentionally absent — wording alone cannot decide
   * either, so they stay model-only. Mirrored by hand; keep in sync with `rule-check.ts`.
   */
  const RULE_CHECKED_RISK_CATEGORIES = [
    'over_promise',
    'vague_commitment',
    'unconfirmed_delivery',
    'unauthorized_discount',
    'unverified_claim'
  ]

  const SEVERITY_LABELS = { high: '高', medium: '中', low: '低' }

  /** Radar axes, in drawing order starting at the top. Mirrored from `src/lib/constants.ts`. */
  const SCORE_DIMENSIONS = [
    { key: 'needDiscovery', label: '需求挖掘' },
    { key: 'budgetHandling', label: '价格与预算' },
    { key: 'decisionMapping', label: '决策链把握' },
    { key: 'objectionHandling', label: '异议处理' },
    { key: 'nextStepClarity', label: '下一步推进' },
    { key: 'complianceRisk', label: '承诺合规' }
  ]

  /** Dashboard-only palette: tuned for contrast against the dark mission-control panel background. */
  const INTENT_COLORS = {
    high: '#34d399',
    medium: '#22d3ee',
    low: '#f59e0b',
    unknown: '#8ea3bd'
  }

  const ACCURACY_FIELD_LABELS = {
    intentLevel: '客户意向',
    summary: '沟通摘要',
    requirements: '客户需求',
    concerns: '客户顾虑',
    risks: '话术风险',
    missingInformation: '待确认信息',
    nextActions: '跟进建议',
    carriedOver: '历史遗留事项'
  }

  const SAMPLE_CONVERSATION = [
    '销售：王总您好，上次演示之后贵公司这边还有什么顾虑吗？',
    '客户：主要是价格，你们报的比另一家高不少。另外我们年底前必须上线，你们能保证吗？',
    '销售：价格我可以帮您申请折扣，年底上线肯定没问题，我们一周就能部署完。',
    '客户：那要对接我们现有的 ERP，这块复杂度不低，你们做过吗？',
    '销售：做过类似的，具体方案我回头发您。另外贵公司大概多少人用？',
    '客户：先上 50 个账号试试，效果好明年再扩。'
  ].join('\n')

  injectStyles()

  // ------------------------------------------------------------------- bridge

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function post(type, body, transfer) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(
      Object.assign({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type }, body || {}),
      '*',
      transfer || []
    )
  }

  function request(type, body) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      try {
        post(type, Object.assign({ requestId }, body || {}))
      } catch (error) {
        pending.delete(requestId)
        reject(error)
      }
    })
  }

  function requestData(query) {
    return request('requestData', { query: query || {} })
  }

  function executeAction(actionKey, targetId, input, parameters) {
    return request('executeAction', { actionKey, targetId, input, parameters })
  }

  function invokeClientCommand(commandKey, payload) {
    return request('invokeClientCommand', { commandKey, payload })
  }

  /** Builds the silent `assistant.context.set` payload for one record, or null if there is none. */
  function buildRecordContextPayload(record) {
    if (!record || !record.id) return null
    return {
      key: CONVERSATION_REVIEW_CONTEXT_KEY,
      env: { conversationReviewRecordId: record.id },
      context: {
        currentRecord: {
          recordId: record.id,
          customerName: record.customerName || '',
          status: record.status || ''
        }
      }
    }
  }

  /**
   * Silently hands the record to the Assistant before a chat message about it is sent, so the
   * middleware's tools can resolve `recordId` on their own — see ASSISTANT_CONTEXT_COMMAND_KEY.
   * Best-effort: a failure here must not block the (more important) visible chat message.
   */
  function syncAssistantContext(record) {
    const payload = buildRecordContextPayload(record)
    if (!payload) return Promise.resolve()
    return invokeClientCommand(ASSISTANT_CONTEXT_COMMAND_KEY, payload).catch(() => {})
  }

  function notify(message, level) {
    post('notify', { message, level: level || 'success' })
  }

  function reportResize() {
    const root = document.getElementById('root')
    const shell = root && root.firstElementChild
    const shellRectHeight = shell && shell.getBoundingClientRect ? shell.getBoundingClientRect().height : 0
    const contentHeight = Math.max(shell ? shell.scrollHeight : 0, shellRectHeight, 560)
    const viewportHeight = window.innerHeight || contentHeight
    post('resize', { height: Math.ceil(contentHeight), viewportBound: contentHeight > viewportHeight })
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return

    if (message.type === 'init') {
      instanceId = message.instanceId
      window.__conversationReviewSetContext &&
        window.__conversationReviewSetContext({
          manifest: message.manifest,
          payload: message.payload,
          initialQuery: message.initialQuery || {},
          locale: message.locale,
          theme: message.theme
        })
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) return

    if (message.type === 'hostEvent') {
      // The assistant finished one of our middleware tools -> reload so the saved
      // analysis shows up without polling.
      window.__conversationReviewReload && window.__conversationReviewReload()
      return
    }

    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.type === 'error') {
        item.reject(new Error(message.message || '远程请求失败'))
      } else {
        item.resolve(message)
      }
    }
  })

  /** `requestData` answers come back as `{ type: 'data', data: <view data> }`. */
  function unwrapResponse(response) {
    if (!response) return {}
    if (Object.prototype.hasOwnProperty.call(response, 'data')) return response.data
    if (Object.prototype.hasOwnProperty.call(response, 'result')) return response.result
    if (Object.prototype.hasOwnProperty.call(response, 'payload')) return response.payload
    return response
  }

  /**
   * Actions answer with two nested envelopes: the bridge wraps the host reply as
   * `{ type: 'actionResult', result: <XpertViewActionResult> }`, and the provider's own
   * payload sits one level further down under `result.data`. Unwrapping only the outer
   * one silently loses `data.payload`, which is where the Assistant message lives.
   */
  function unwrapActionResponse(response) {
    const actionResult = (response && response.result) || {}
    return {
      ok: actionResult.success !== false,
      message: actionResult.message,
      data: actionResult.data || {}
    }
  }

  function errorText(error, fallback) {
    const message = error && error.message ? String(error.message) : ''
    if (!message || message.indexOf('Unknown Error') >= 0) return fallback
    return message
  }

  function buildQuery(context, overrides) {
    const payload = (context && context.payload) || {}
    const initialQuery = (context && context.initialQuery) || {}
    const overrideParameters = (overrides && overrides.parameters) || {}
    return Object.assign({ page: 1, pageSize: 20 }, initialQuery, overrides || {}, {
      parameters: Object.assign({}, payload.parameters || {}, initialQuery.parameters || {}, overrideParameters)
    })
  }

  // ------------------------------------------------------------------ helpers

  function linesToArray(value) {
    return String(value || '')
      .split(/\n+/)
      .map((line) => line.replace(/^[-•·\s]+/, '').trim())
      .filter(Boolean)
  }

  function arrayToLines(value) {
    return Array.isArray(value) ? value.join('\n') : ''
  }

  function effectiveResult(record) {
    if (!record) return null
    return record.confirmedResult || record.aiResult || null
  }

  /**
   * Build the editable copy of one issue list. Records written before the taxonomy existed hold
   * plain strings; the server maps those onto `other` on read, but tolerate them here too so the
   * editor can never be handed a string where it expects an object.
   */
  function toIssueDrafts(value, field) {
    if (!Array.isArray(value)) return []
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return { category: 'other', severity: 'medium', detail: item, evidence: '' }
        }
        if (!item || typeof item !== 'object') return null
        return {
          category: field.categories[item.category] ? item.category : 'other',
          severity: SEVERITY_LABELS[item.severity] ? item.severity : 'medium',
          detail: item.detail || '',
          evidence: item.evidence || ''
        }
      })
      .filter(Boolean)
  }

  /** Drop rows the salesperson emptied out, so confirming does not save blank issues. */
  function issueDraftsToInput(value) {
    if (!Array.isArray(value)) return []
    return value
      .map((item) => ({
        category: item.category || 'other',
        severity: item.severity || 'medium',
        detail: (item.detail || '').trim(),
        evidence: (item.evidence || '').trim()
      }))
      .filter((item) => item.detail || item.evidence)
  }

  function categoryLabel(kind, category) {
    const field = ISSUE_FIELD_BY_KIND[kind]
    return (field && field.categories[category]) || category
  }

  function percentText(part, whole) {
    if (!whole) return '—'
    return Math.round((part / whole) * 100) + '%'
  }

  function scoresToDraft(scores) {
    const value = scores || {}
    return SCORE_DIMENSIONS.reduce((acc, dimension) => {
      const raw = Number(value[dimension.key])
      acc[dimension.key] = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : 0
      return acc
    }, {})
  }

  function averageScore(scores) {
    const values = SCORE_DIMENSIONS.map((dimension) => Number((scores || {})[dimension.key])).filter((value) =>
      Number.isFinite(value)
    )
    if (!values.length) return null
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  }

  // --------------------------------------------------------------------- svg
  //
  // Charts are hand-drawn SVG rather than a charting library on purpose: this component is served
  // into a sandboxed iframe as plain browser JS with no bundler, so a library would have to be
  // inlined whole (~1MB for ECharts) on every open, with no way to drop the chart types we never
  // use. Three chart shapes are cheaper to draw than to import.

  /** Vertex of a regular polygon, index 0 at the top, for a 0-100 value. */
  function radarVertex(cx, cy, radius, index, count, value) {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2
    const scaled = (radius * Math.max(0, Math.min(100, Number(value) || 0))) / 100
    return [cx + scaled * Math.cos(angle), cy + scaled * Math.sin(angle)]
  }

  function radarRing(cx, cy, radius, count, value) {
    const points = []
    for (let index = 0; index < count; index += 1) {
      points.push(radarVertex(cx, cy, radius, index, count, value).map((n) => n.toFixed(1)).join(','))
    }
    return points.join(' ')
  }

  /**
   * Six-axis radar. `values` is a map keyed by dimension; a missing axis is drawn at zero, which
   * reads as "not covered" rather than silently reshaping the polygon into a pentagon.
   */
  function renderRadar(options) {
    const size = options.size || 230
    // `dark` only applies inside the mission-control dashboard panel (see renderTeamRadar); the
    // per-record scorecard radar (cr-scorecard-chart) always renders the default light variant.
    const dark = !!options.dark
    const cx = size / 2
    const cy = size / 2 - 4
    const radius = size * 0.29
    const labelRadius = radius + (options.compactLabels ? 13 : 17)
    const count = SCORE_DIMENSIONS.length
    const values = options.values || {}
    const gridStroke = dark ? 'rgba(148, 197, 223, 0.2)' : '#dce4ef'
    const accent = dark ? '#22d3ee' : '#1d4ed8'
    const shape = SCORE_DIMENSIONS.map((dimension, index) =>
      radarVertex(cx, cy, radius, index, count, values[dimension.key]).map((n) => n.toFixed(1)).join(',')
    ).join(' ')

    return h(
      'svg',
      { className: 'cr-radar' + (dark ? ' cr-radar-dark' : ''), viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': '质检六维评分' },
      // grid rings
      [25, 50, 75, 100].map((level) =>
        h('polygon', {
          key: 'ring-' + level,
          points: radarRing(cx, cy, radius, count, level),
          fill: 'none',
          stroke: gridStroke,
          strokeWidth: 1
        })
      ),
      // spokes
      SCORE_DIMENSIONS.map((dimension, index) => {
        const [x, y] = radarVertex(cx, cy, radius, index, count, 100)
        return h('line', { key: 'spoke-' + dimension.key, x1: cx, y1: cy, x2: x, y2: y, stroke: gridStroke, strokeWidth: 1 })
      }),
      h('polygon', {
        points: shape,
        fill: accent,
        fillOpacity: dark ? 0.24 : 0.18,
        stroke: accent,
        strokeWidth: 2,
        strokeLinejoin: 'round',
        className: dark ? 'cr-radar-shape-glow' : undefined
      }),
      SCORE_DIMENSIONS.map((dimension, index) => {
        const [x, y] = radarVertex(cx, cy, radius, index, count, values[dimension.key])
        const score = Number(values[dimension.key])
        return h(
          React.Fragment,
          { key: 'dot-' + dimension.key },
          // Oversized transparent hit target: the visible dot (r=2.6) is too small to hover
          // reliably, and fill:transparent still needs pointer-events forced on to be hoverable.
          h(
            'circle',
            { cx: x, cy: y, r: 9, fill: 'transparent', style: { pointerEvents: 'all' } },
            h('title', null, `${dimension.label}：${Number.isFinite(score) ? score : 0} 分`)
          ),
          h('circle', { cx: x, cy: y, r: 2.6, fill: accent, className: dark ? 'cr-radar-dot-glow' : undefined })
        )
      }),
      SCORE_DIMENSIONS.map((dimension, index) => {
        const [x, y] = radarVertex(cx, cy, labelRadius, index, count, 100)
        const dx = x - cx
        const anchor = dx > 1 ? 'start' : dx < -1 ? 'end' : 'middle'
        const score = Number(values[dimension.key])
        // Compact mode (the per-record scorecard, where the exact number already sits in the
        // slider row right next to the chart) drops the trailing score digits — the axis label
        // alone is short enough to stay inside the viewBox instead of bleeding into whatever sits
        // next to the chart.
        const label = options.compactLabels ? dimension.label : dimension.label + ' ' + (Number.isFinite(score) ? score : 0)
        return h(
          'text',
          {
            key: 'label-' + dimension.key,
            x,
            y,
            textAnchor: anchor,
            dominantBaseline: 'middle',
            className: 'cr-radar-label' + (dark ? ' cr-radar-label-dark' : '') + (options.compactLabels ? ' cr-radar-label-compact' : '')
          },
          label
        )
      })
    )
  }

  /**
   * Donut. Slices are drawn as dashed arcs on one circle, which keeps every slice a single
   * element that can carry its own click handler for drill-down.
   */
  function renderDonut(options) {
    const slices = (options.slices || []).filter((slice) => slice.value > 0)
    const total = slices.reduce((sum, slice) => sum + slice.value, 0)
    const size = options.size || 132
    const radius = size * 0.34
    const stroke = size * 0.19
    const circumference = 2 * Math.PI * radius
    let offset = 0

    if (!total) {
      return h('div', { className: 'cr-empty' }, '暂无数据')
    }

    return h(
      'svg',
      { className: 'cr-donut', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': options.label || '分布' },
      h('circle', { cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: 'rgba(148, 163, 184, 0.18)', strokeWidth: stroke }),
      slices.map((slice) => {
        const length = (slice.value / total) * circumference
        const dash = `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`
        const node = h(
          'circle',
          {
            key: slice.key,
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: 'none',
            stroke: slice.color,
            strokeWidth: slice.active ? stroke + 4 : stroke,
            strokeDasharray: dash,
            strokeDashoffset: -offset,
            transform: `rotate(-90 ${size / 2} ${size / 2})`,
            className: slice.onClick ? 'cr-donut-slice' : undefined,
            onClick: slice.onClick
          },
          h('title', null, `${slice.label || slice.key}：${slice.value} 条（${percentText(slice.value, total)}）`)
        )
        offset += length
        return node
      }),
      h('text', { x: size / 2, y: size / 2 - 3, textAnchor: 'middle', className: 'cr-donut-value' }, total),
      h('text', { x: size / 2, y: size / 2 + 13, textAnchor: 'middle', className: 'cr-donut-label' }, options.centerLabel || '')
    )
  }

  /**
   * Daily trend: bars for volume, a line for the mean QC score.
   *
   * The line is split into segments at days with no score instead of interpolating across them —
   * joining Monday to Friday through an empty week would invent a trend that was never measured.
   */
  function renderTrend(points) {
    const width = 320
    const height = 116
    const left = 26
    const right = width - 8
    const top = 10
    const bottom = height - 22
    const span = Math.max(1, points.length - 1)
    const maxCount = points.reduce((acc, point) => Math.max(acc, point.count), 0)
    const x = (index) => left + ((right - left) * index) / span
    const y = (score) => bottom - ((bottom - top) * Math.max(0, Math.min(100, score))) / 100
    const barWidth = Math.max(3, (right - left) / points.length - 4)
    // Volume bars are capped at 45% of the plot height so they stay legible underneath the score
    // line instead of competing with it; the two series share an x-axis, not a y-axis.
    const barHeight = (count) => Math.max(2, ((bottom - top) * count * 0.45) / Math.max(1, maxCount))

    const segments = []
    let current = []
    points.forEach((point, index) => {
      if (point.avgScore === null || point.avgScore === undefined) {
        if (current.length) segments.push(current)
        current = []
        return
      }
      current.push([x(index), y(point.avgScore)])
    })
    if (current.length) segments.push(current)

    const ticks = [0, Math.floor(span / 2), span]

    return h(
      'svg',
      { className: 'cr-trend', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '近两周趋势' },
      [0, 50, 100].map((level) =>
        h(
          React.Fragment,
          { key: 'grid-' + level },
          h('line', { x1: left, y1: y(level), x2: right, y2: y(level), stroke: 'rgba(148, 163, 184, 0.14)', strokeWidth: 1 }),
          h('text', { x: left - 5, y: y(level) + 3, textAnchor: 'end', className: 'cr-trend-axis' }, level)
        )
      ),
      // Volume (bars, cyan) and average score (line, amber) are deliberately two different hues —
      // they share an x-axis but are unrelated units, and this is the dashboard's only two-series chart.
      points.map((point, index) =>
        point.count
          ? h('rect', {
              key: 'bar-' + point.date,
              x: x(index) - barWidth / 2,
              y: bottom - barHeight(point.count),
              width: barWidth,
              height: barHeight(point.count),
              fill: 'rgba(34, 211, 238, 0.45)',
              rx: 1.5
            })
          : null
      ),
      segments.map((segment, index) =>
        segment.length > 1
          ? h('polyline', {
              key: 'line-' + index,
              points: segment.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '),
              fill: 'none',
              stroke: '#f59e0b',
              strokeWidth: 2,
              strokeLinejoin: 'round',
              strokeLinecap: 'round',
              className: 'cr-trend-line-glow'
            })
          : null
      ),
      points.map((point, index) =>
        point.avgScore === null || point.avgScore === undefined
          ? null
          : h('circle', { key: 'dot-' + point.date, cx: x(index), cy: y(point.avgScore), r: 2.8, fill: '#f59e0b' })
      ),
      // One transparent hit column per day, drawn last so it always wins hover over the bar/line
      // underneath — covers days with no bar (count 0) too, which the bar alone cannot.
      points.map((point, index) => {
        const colWidth = (right - left) / span
        const scoreText = point.avgScore === null || point.avgScore === undefined ? '当日无评分' : `平均分 ${point.avgScore}`
        const detail = `${point.date}：${point.count} 条会话 · ${scoreText}` + (point.highIntent ? ` · 高意向 ${point.highIntent} 条` : '')
        return h(
          'rect',
          {
            key: 'hit-' + point.date,
            x: x(index) - colWidth / 2,
            y: top,
            width: colWidth,
            height: bottom - top,
            fill: 'transparent',
            style: { pointerEvents: 'all' }
          },
          h('title', null, detail)
        )
      }),
      ticks.map((index) =>
        h(
          'text',
          { key: 'tick-' + index, x: x(index), y: height - 6, textAnchor: index === 0 ? 'start' : index === span ? 'end' : 'middle', className: 'cr-trend-axis' },
          (points[index] && points[index].date ? points[index].date.slice(5) : '')
        )
      )
    )
  }

  function isStalled(record) {
    if (!record || record.status !== 'processing') return false
    const updatedAt = record.updatedAt ? new Date(record.updatedAt).getTime() : 0
    return updatedAt > 0 && Date.now() - updatedAt > PROCESSING_STALL_MS
  }

  function formatTime(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  // ---------------------------------------------------------------- component

  function App() {
    const [context, setContext] = React.useState(null)
    const [data, setData] = React.useState(null)
    const [loadError, setLoadError] = React.useState('')
    const [busy, setBusy] = React.useState('')
    const [selectedId, setSelectedId] = React.useState(null)
    const [statusFilter, setStatusFilter] = React.useState('')
    // Dashboard drill-down. `issueFilter` is `concern:price`; both are sent as view parameters.
    const [issueFilter, setIssueFilter] = React.useState('')
    const [intentFilter, setIntentFilter] = React.useState('')
    const [search, setSearch] = React.useState('')
    const [form, setForm] = React.useState({ customerName: '', conversation: '' })
    const [formError, setFormError] = React.useState('')
    const [showCreateDrawer, setShowCreateDrawer] = React.useState(false)
    const [draft, setDraft] = React.useState(null)
    const [draftDirty, setDraftDirty] = React.useState(false)
    const [tick, setTick] = React.useState(0)
    const [importResult, setImportResult] = React.useState(null)
    const [batch, setBatch] = React.useState(null)
    /** Which rule-version tag was clicked, or null when the rule-details modal is closed. */
    const [ruleModalVersion, setRuleModalVersion] = React.useState(null)
    const batchCancelRef = React.useRef(false)
    const fileInputRef = React.useRef(null)

    const contextRef = React.useRef(null)
    const selectedIdRef = React.useRef(null)
    const filtersRef = React.useRef({ statusFilter: '', search: '', issueFilter: '', intentFilter: '' })
    contextRef.current = context
    selectedIdRef.current = selectedId
    filtersRef.current = { statusFilter, search, issueFilter, intentFilter }

    const load = React.useCallback((overrides) => {
      const ctx = contextRef.current
      if (!ctx) return Promise.resolve()
      const filters = filtersRef.current
      const parameters = {}
      const targetId = (overrides && overrides.recordId) || selectedIdRef.current
      if (targetId) parameters.recordId = targetId
      if (filters.statusFilter) parameters.status = filters.statusFilter
      if (filters.issueFilter) parameters.issue = filters.issueFilter
      if (filters.intentFilter) parameters.intentLevel = filters.intentFilter

      return requestData(buildQuery(ctx, { search: filters.search || undefined, parameters }))
        .then((response) => {
          const next = unwrapResponse(response) || {}
          setData(next)
          setLoadError('')
          if (next.item && next.item.id) {
            setSelectedId(next.item.id)
          } else if (!next.items || next.items.length === 0) {
            setSelectedId(null)
          }
        })
        .catch((error) => setLoadError(errorText(error, '加载沟通质检数据失败，请刷新重试。')))
    }, [])

    React.useEffect(() => {
      window.__conversationReviewSetContext = setContext
      post('ready')
      return () => {
        delete window.__conversationReviewSetContext
        delete window.__conversationReviewReload
      }
    }, [])

    React.useEffect(() => {
      window.__conversationReviewReload = () => load()
    }, [load])

    React.useEffect(() => {
      if (context) load()
    }, [context, load])

    // Changing a filter drops the selection on purpose: after drilling into "价格与预算" the
    // record you were reading is usually not in the new list, and keeping it selected makes the
    // detail pane disagree with the list next to it.
    React.useEffect(() => {
      if (!context) return
      selectedIdRef.current = null
      setSelectedId(null)
      load()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, issueFilter, intentFilter])

    // Re-render periodically so a stalled "processing" record flips to the failure view.
    React.useEffect(() => {
      const timer = setInterval(() => setTick((value) => value + 1), 15000)
      return () => clearInterval(timer)
    }, [])

    React.useEffect(() => {
      const root = document.getElementById('root')
      if (!root || typeof ResizeObserver === 'undefined') return undefined
      const observer = new ResizeObserver(() => setTimeout(reportResize, 0))
      observer.observe(root)
      return () => observer.disconnect()
    }, [])

    React.useEffect(() => {
      setTimeout(reportResize, 0)
    })

    /**
     * Locks background scrolling while the rule-details modal is open. Needed because when
     * `reportResize` reports `viewportBound: true` the host keeps this iframe's own body
     * scrollable at a fixed height instead of growing it — without this, wheel/touch input over
     * the fixed backdrop falls through to that body scroll, since the backdrop itself has no
     * scrollable content of its own and the browser walks up to the nearest scrollable ancestor.
     */
    React.useEffect(() => {
      if (!ruleModalVersion && !showCreateDrawer) return undefined
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = previousOverflow
      }
    }, [ruleModalVersion, showCreateDrawer])

    const detail = data && data.item ? data.item : null

    // Keep an editable copy of the result, but never clobber unsaved edits on refresh.
    React.useEffect(() => {
      if (!detail) {
        setDraft(null)
        setDraftDirty(false)
        return
      }
      if (draftDirty && draft && draft.recordId === detail.id) return
      const result = effectiveResult(detail) || {}
      setDraft({
        recordId: detail.id,
        intentLevel: result.intentLevel || 'unknown',
        summary: result.summary || '',
        scores: scoresToDraft(result.scores),
        requirements: arrayToLines(result.requirements),
        carriedOver: arrayToLines(result.carriedOver),
        missingInformation: arrayToLines(result.missingInformation),
        nextActions: arrayToLines(result.nextActions),
        concerns: toIssueDrafts(result.concerns, ISSUE_FIELD_BY_KIND.concern),
        risks: toIssueDrafts(result.risks, ISSUE_FIELD_BY_KIND.risk)
      })
      setDraftDirty(false)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detail && detail.id, detail && detail.revision])

    function runAction(actionKey, targetId, input, options) {
      setBusy(actionKey)
      return executeAction(actionKey, targetId, input)
        .then((response) => {
          const { ok, message, data } = unwrapActionResponse(response)
          if (!ok) {
            notify(messageText(message) || '操作失败', 'error')
            return null
          }
          if (options && options.successMessage) notify(options.successMessage, 'success')
          return data
        })
        .catch((error) => {
          notify(errorText(error, '操作失败，请稍后重试。'), 'error')
          return null
        })
        .finally(() => setBusy(''))
    }

    function messageText(message) {
      if (!message) return ''
      if (typeof message === 'string') return message
      return message.zh_Hans || message.en_US || ''
    }

    /**
     * The action result carries the message the assistant should receive; forward it.
     * A missing payload means the record is already `processing` while nothing was ever
     * sent, so say so instead of failing silently.
     */
    function forwardToAssistant(result) {
      if (!result) return Promise.resolve()
      if (!result.payload || !result.payload.text) {
        notify('分析请求没有生成待发送的消息，记录已置为分析中但未真正提交，请重试。', 'error')
        return Promise.resolve()
      }
      return syncAssistantContext({ id: result.recordId, customerName: result.customerName, status: result.status })
        .then(() => invokeClientCommand(result.commandKey || ASSISTANT_CHAT_COMMAND_KEY, result.payload))
        .catch((error) => {
          notify(errorText(error, '无法把分析请求发送到 Assistant 对话，请确认助手已打开。'), 'error')
        })
    }

    function handleSubmit() {
      const customerName = form.customerName.trim()
      const conversation = form.conversation.trim()
      if (!customerName) return setFormError('请填写客户名称')
      if (customerName.length > CUSTOMER_NAME_MAX_LENGTH) return setFormError(`客户名称不能超过 ${CUSTOMER_NAME_MAX_LENGTH} 个字符`)
      if (!conversation) return setFormError('请粘贴客户沟通记录')
      if (conversation.length > CONVERSATION_MAX_LENGTH) return setFormError(`沟通记录不能超过 ${CONVERSATION_MAX_LENGTH} 个字符`)
      setFormError('')

      runAction('create_record', undefined, { customerName, conversation }).then((created) => {
        if (!created || !created.recordId) return
        setForm({ customerName: '', conversation: '' })
        setShowCreateDrawer(false)
        setSelectedId(created.recordId)
        return runAction('start_analysis', created.recordId, { recordId: created.recordId })
          .then((started) => forwardToAssistant(started))
          .then(() => load({ recordId: created.recordId }))
      })
    }

    function handleAnalyze(record, isRetry) {
      const actionKey = isRetry ? 'retry_analysis' : 'start_analysis'
      runAction(actionKey, record.id, { recordId: record.id })
        .then((result) => forwardToAssistant(result))
        .then(() => load({ recordId: record.id }))
    }

    /**
     * Batch ingestion. The browser only turns the file into text (or, for the binary Excel
     * format, base64) — detecting the format and parsing it happens on the server, where a real
     * WeCom/CRM connector would also live.
     */
    function handleImportFile(file) {
      if (!file) return
      setImportResult(null)
      const isBinary = IMPORT_BINARY_EXTENSIONS.some((extension) =>
        file.name.toLowerCase().endsWith(extension)
      )
      const reader = new FileReader()
      reader.onerror = () => notify('读取文件失败，请确认文件没有被占用。', 'error')
      reader.onload = () => {
        const content = isBinary
          ? String(reader.result || '').split(',').pop() || ''
          : String(reader.result || '')
        runAction('import_conversations', undefined, {
          fileName: file.name,
          content
        }).then((result) => {
          if (!result) return undefined
          setImportResult(result)
          return load()
        })
      }
      if (isBinary) {
        reader.readAsDataURL(file)
      } else {
        reader.readAsText(file, 'utf-8')
      }
    }

    /**
     * The "auto" counterpart to `handleImportFile`: no file dialog, the server reads the same
     * bundled fixtures a person could otherwise pick by hand. Same action family, same result
     * panel — this button exists to demo the ingestion port without depending on a manual click
     * sequence for every take.
     */
    function handleSimulateFetch() {
      setImportResult(null)
      runAction('simulate_fetch_conversations', undefined, {}).then((result) => {
        if (!result) return undefined
        setImportResult(result)
        return load()
      })
    }

    function fetchRecordStatus(recordId) {
      const ctx = contextRef.current
      if (!ctx) return Promise.resolve(null)
      return requestData(buildQuery(ctx, { parameters: { recordId } }))
        .then((response) => {
          const payload = unwrapResponse(response) || {}
          return payload.item ? payload.item.status : null
        })
        .catch(() => null)
    }

    /** Resolves once the record leaves `processing`, or with `timeout` if it never does. */
    function waitForAnalysis(recordId, deadline) {
      return new Promise((resolve) => {
        const step = () => {
          if (batchCancelRef.current) return resolve('cancelled')
          if (Date.now() > deadline) return resolve('timeout')
          return fetchRecordStatus(recordId).then((status) => {
            if (status && status !== 'processing') return resolve(status)
            return setTimeout(step, BATCH_POLL_INTERVAL_MS)
          })
        }
        setTimeout(step, BATCH_POLL_INTERVAL_MS)
      })
    }

    function analyzeOne(record) {
      const actionKey = record.status === 'failed' ? 'retry_analysis' : 'start_analysis'
      return executeAction(actionKey, record.id, { recordId: record.id })
        .then((response) => {
          const { ok, data, message } = unwrapActionResponse(response)
          if (!ok || !data || !data.payload || !data.payload.text) {
            notify(`${record.customerName}：${messageText(message) || '未能提交分析'}`, 'error')
            return 'failed'
          }
          return syncAssistantContext({
            id: data.recordId || record.id,
            customerName: data.customerName || record.customerName,
            status: data.status
          })
            .then(() => invokeClientCommand(data.commandKey || ASSISTANT_CHAT_COMMAND_KEY, data.payload))
            .then(() => waitForAnalysis(record.id, Date.now() + BATCH_RECORD_TIMEOUT_MS))
        })
        .catch(() => 'failed')
    }

    /**
     * Walk the queue one record at a time, updating progress as it goes.
     *
     * Confirmation is deliberately NOT batched — analysis can be bulk because it produces a draft,
     * but a result only becomes the business record when a person signs it off one by one.
     */
    function runBatch(queue) {
      let index = 0
      let failed = 0
      return new Promise((resolve) => {
        const step = () => {
          if (batchCancelRef.current || index >= queue.length) {
            return resolve({ done: index, failed, cancelled: batchCancelRef.current })
          }
          const record = queue[index]
          setBatch({ total: queue.length, done: index, current: record.customerName, failed })
          return analyzeOne(record).then((outcome) => {
            if (outcome === 'cancelled') {
              return resolve({ done: index, failed, cancelled: true })
            }
            if (outcome === 'failed' || outcome === 'timeout') failed += 1
            index += 1
            setBatch({ total: queue.length, done: index, current: '', failed })
            return load().then(step)
          })
        }
        step()
      })
    }

    function handleBatchAnalyze() {
      batchCancelRef.current = false
      setImportResult(null)
      setBusy('batch')
      executeAction('list_pending_analysis', undefined, { limit: BATCH_ANALYSIS_MAX })
        .then((response) => {
          const { ok, data, message } = unwrapActionResponse(response)
          if (!ok) {
            notify(messageText(message) || '无法获取待分析队列', 'error')
            return null
          }
          return (data && data.pending) || []
        })
        .then((queue) => {
          if (!queue) return undefined
          if (!queue.length) {
            notify('没有待分析的记录。', 'success')
            return undefined
          }
          return runBatch(queue).then((summary) => {
            const parts = [`已处理 ${summary.done} / ${queue.length} 条`]
            if (summary.failed) parts.push(`${summary.failed} 条未成功，可在列表里单独重试`)
            if (summary.cancelled) parts.push('已中止')
            notify(parts.join('，'), summary.failed || summary.cancelled ? 'error' : 'success')
          })
        })
        .catch((error) => notify(errorText(error, '批量分析失败'), 'error'))
        .finally(() => {
          setBatch(null)
          setBusy('')
          load()
        })
    }

    function handleMarkFailed(record) {
      runAction(
        'mark_analysis_failed',
        record.id,
        { recordId: record.id, reason: 'AI 分析长时间没有返回结果，可能是模型调用失败或额度不足。' },
        { successMessage: '已标记为分析失败，可以重试。' }
      ).then(() => load({ recordId: record.id }))
    }

    function handleConfirm() {
      if (!draft || !detail) return
      if (!draft.summary.trim()) {
        notify('确认前请填写沟通摘要', 'error')
        return
      }
      runAction(
        'confirm_result',
        detail.id,
        {
          recordId: detail.id,
          expectedRevision: detail.revision,
          intentLevel: draft.intentLevel,
          summary: draft.summary.trim(),
          scores: draft.scores,
          requirements: linesToArray(draft.requirements),
          carriedOver: linesToArray(draft.carriedOver),
          missingInformation: linesToArray(draft.missingInformation),
          nextActions: linesToArray(draft.nextActions),
          concerns: issueDraftsToInput(draft.concerns),
          risks: issueDraftsToInput(draft.risks)
        },
        { successMessage: '结果已确认并保存' }
      ).then((result) => {
        if (!result) return
        setDraftDirty(false)
        return load({ recordId: detail.id })
      })
    }

    function updateDraft(key, value) {
      setDraft((current) => Object.assign({}, current, { [key]: value }))
      setDraftDirty(true)
    }

    function updateScore(dimension, value) {
      const parsed = Math.min(100, Math.max(0, Math.round(Number(value) || 0)))
      setDraft((current) =>
        Object.assign({}, current, { scores: Object.assign({}, (current && current.scores) || {}, { [dimension]: parsed }) })
      )
      setDraftDirty(true)
    }

    function updateIssue(key, index, patch) {
      setDraft((current) => {
        const list = (current && current[key]) || []
        const next = list.map((item, i) => (i === index ? Object.assign({}, item, patch) : item))
        return Object.assign({}, current, { [key]: next })
      })
      setDraftDirty(true)
    }

    function addIssue(key) {
      setDraft((current) => {
        const list = (current && current[key]) || []
        return Object.assign({}, current, {
          [key]: list.concat([{ category: 'other', severity: 'medium', detail: '', evidence: '' }])
        })
      })
      setDraftDirty(true)
    }

    function removeIssue(key, index) {
      setDraft((current) => {
        const list = (current && current[key]) || []
        return Object.assign({}, current, { [key]: list.filter((_, i) => i !== index) })
      })
      setDraftDirty(true)
    }

    function toggleIssueFilter(kind, category) {
      const value = kind + ':' + category
      setIssueFilter((current) => (current === value ? '' : value))
    }

    if (!context) {
      return h('main', { className: 'cr-shell' }, h('div', { className: 'cr-empty' }, '正在初始化客户沟通质检工作台…'))
    }

    const items = (data && data.items) || []
    const summary = (data && data.summary) || {}
    const stats = summary.stats || {}
    const insights = summary.insights || null
    const hasFilter = Boolean(statusFilter || issueFilter || intentFilter || search)

    return h(
      'main',
      { className: 'cr-shell' },
      h(
        'header',
        { className: 'cr-header' },
        h(
          'div',
          null,
          h('h1', null, '客户沟通质检与跟进决策工作台'),
          h('p', { className: 'cr-sub' }, 'AI 生成结构化质检与跟进建议，最终结果由销售人工确认后保存。'),
          summary.currentRuleVersion
            ? h(
                'span',
                {
                  className: 'cr-badge cr-badge-rule cr-badge-rule-current cr-badge-clickable',
                  title: '点击查看质检规则详情；新提交的分析会使用这个版本的确定性风险规则',
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => setRuleModalVersion(summary.currentRuleVersion),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setRuleModalVersion(summary.currentRuleVersion)
                    }
                  }
                },
                `当前规则版本 ${summary.currentRuleVersion}`
              )
            : null
        ),
        h(
          'div',
          { className: 'cr-stats' },
          statChip('全部', stats.total || 0),
          statChip('待确认', stats.completed || 0, 'warn'),
          statChip('已确认', stats.confirmed || 0, 'ok'),
          statChip('失败', stats.failed || 0, 'bad')
        )
      ),

      loadError ? h('div', { className: 'cr-banner cr-banner-error' }, loadError) : null,

      renderInsights(insights),

      h(
        'div',
        { className: 'cr-create-trigger' },
        h(
          'button',
          { type: 'button', className: 'cr-btn cr-btn-primary cr-btn-add', onClick: () => setShowCreateDrawer(true) },
          '+ 添加沟通记录'
        )
      ),

      renderImportCard(stats),

      h(
        'section',
        { className: 'cr-columns' },
        h(
          'div',
          { className: 'cr-card cr-list-card' },
          h(
            'div',
            { className: 'cr-list-toolbar' },
            h('h2', null, '历史记录'),
            h(
              'select',
              {
                value: statusFilter,
                onChange: (event) => setStatusFilter(event.target.value)
              },
              h('option', { value: '' }, '全部状态'),
              Object.keys(STATUS_LABELS).map((key) => h('option', { key, value: key }, STATUS_LABELS[key]))
            )
          ),
          h(
            'div',
            { className: 'cr-search' },
            h('input', {
              type: 'search',
              value: search,
              placeholder: '搜索客户名称或沟通内容',
              onChange: (event) => setSearch(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') load()
              }
            }),
            h('button', { className: 'cr-btn cr-btn-sm', onClick: () => load() }, '搜索')
          ),
          issueFilter || intentFilter
            ? h(
                'div',
                { className: 'cr-filter-chips' },
                issueFilter
                  ? h(
                      'button',
                      { className: 'cr-chip', onClick: () => setIssueFilter('') },
                      categoryLabel(issueFilter.split(':')[0], issueFilter.split(':')[1]),
                      h('span', { className: 'cr-chip-x' }, '×')
                    )
                  : null,
                intentFilter
                  ? h(
                      'button',
                      { className: 'cr-chip', onClick: () => setIntentFilter('') },
                      INTENT_LABELS[intentFilter] || intentFilter,
                      h('span', { className: 'cr-chip-x' }, '×')
                    )
                  : null
              )
            : null,
          items.length === 0
            ? h(
                'div',
                { className: 'cr-empty' },
                hasFilter ? '没有符合条件的记录。' : '还没有归档任何沟通记录，先在上方提交一条。'
              )
            : h(
                'ul',
                { className: 'cr-list' },
                items.map((item) =>
                  h(
                    'li',
                    {
                      key: item.id,
                      className: 'cr-list-item' + (item.id === selectedId ? ' is-active' : ''),
                      onClick: () => {
                        setSelectedId(item.id)
                        setDraftDirty(false)
                        load({ recordId: item.id })
                      }
                    },
                    h(
                      'div',
                      { className: 'cr-list-row' },
                      h(
                        'div',
                        { className: 'cr-customer-group' },
                        h('span', { className: 'cr-customer' }, item.customerName || '未命名客户'),
                        item.id
                          ? h(
                              'span',
                              {
                                className: 'cr-record-id',
                                title: `记录标识：${item.id}${item.customerId ? ` ・ 客户标识：${item.customerId}` : ''}`
                              },
                              `#${item.id.slice(0, 8).toUpperCase()}`
                            )
                          : null
                      ),
                      statusBadge(isStalled(item) ? 'failed' : item.status)
                    ),
                    h('p', { className: 'cr-preview' }, item.summary || item.conversationPreview || ''),
                    h(
                      'div',
                      { className: 'cr-list-meta' },
                      h('span', null, formatTime(item.updatedAt)),
                      item.retryCount > 0 ? h('span', null, `已重试 ${item.retryCount} 次`) : null,
                      ruleVersionBadge(item.ruleVersion, (event) => {
                        event.stopPropagation()
                        setRuleModalVersion(item.ruleVersion)
                      })
                    )
                  )
                )
              )
        ),

        h('div', { className: 'cr-card cr-detail-card' }, renderDetail())
      ),

      renderCreateDrawer(),
      renderRuleModal()
    )

    /**
     * The dashboard. Every bar is a filter, because a distribution nobody can open is just
     * decoration — the point is to go from "价格顾虑占 60%" to the six conversations behind it.
     */
    /**
     * Ingestion panel.
     *
     * Typing conversations into the form above is a way to file one record, not a way to run this
     * workbench: nobody retypes a week of customer calls. This is where the conversations actually
     * arrive, and the file picker stands in for the connector that would read them from WeCom or
     * the CRM in production.
     */
    function renderImportCard(stats) {
      const pendingCount = (stats.draft || 0) + (stats.failed || 0)
      const running = Boolean(batch)

      return h(
        'section',
        { className: 'cr-card' },
        h('h2', null, '批量导入会话'),
        h(
          'p',
          { className: 'cr-hint' },
          '生产环境的会话来自企业微信会话存档或 CRM。此处用文件适配器代替连接器：JSON 按接口返回的结构解析，CSV / Excel 对应运营导出的表格。导入的记录一律落为「待分析」，不会自动消耗模型调用。「选择文件导入」是手动挡，自己挑文件；「获取聊天会话记录」是自动挡，一键模拟连接器把两个示例来源一起拉回来——两条路径走的是同一套解析与导入逻辑，在 Assistant 对话里用自然语言说出同样的意图也能触发。'
        ),
        h('input', {
          type: 'file',
          accept: IMPORT_ACCEPT,
          ref: fileInputRef,
          style: { display: 'none' },
          onChange: (event) => {
            const file = event.target.files && event.target.files[0]
            event.target.value = ''
            handleImportFile(file)
          }
        }),
        h(
          'div',
          { className: 'cr-actions' },
          h(
            'button',
            {
              className: 'cr-btn',
              disabled: Boolean(busy) || running,
              onClick: () => fileInputRef.current && fileInputRef.current.click()
            },
            busy === 'import_conversations' ? '导入中…' : '选择文件导入'
          ),
          h(
            'button',
            {
              className: 'cr-btn',
              disabled: Boolean(busy) || running,
              onClick: handleSimulateFetch
            },
            busy === 'simulate_fetch_conversations' ? '拉取中…' : '获取聊天会话记录'
          ),
          h(
            'button',
            {
              className: 'cr-btn cr-btn-primary',
              disabled: Boolean(busy) || running || !pendingCount,
              onClick: handleBatchAnalyze
            },
            pendingCount ? `分析全部待处理（${Math.min(pendingCount, BATCH_ANALYSIS_MAX)} 条）` : '没有待分析记录'
          ),
          running
            ? h(
                'button',
                {
                  className: 'cr-btn cr-btn-danger',
                  onClick: () => {
                    batchCancelRef.current = true
                    notify('已请求中止，当前这条分析完成后停止。', 'success')
                  }
                },
                '中止'
              )
            : null
        ),
        h(
          'p',
          { className: 'cr-hint' },
          `支持 .json / .csv / .tsv / .xlsx / .xls。必需字段：客户名称（customerName / 客户名称）与沟通内容（conversation / 沟通记录，JSON 也可用 messages 数组）。可选字段：externalId 用于会话去重，customerId（客户id / 客户编号）用于区分同名客户，occurredAt 用于还原真实沟通时间。单次最多 ${BATCH_ANALYSIS_MAX} 条参与批量分析。同样的三种格式也能直接在 Assistant 对话里说"帮我导入这份会话"来触发。`
        ),
        running ? renderBatchProgress() : null,
        importResult ? renderImportResult(importResult) : null
      )
    }

    function renderBatchProgress() {
      const percent = batch.total ? Math.round((batch.done / batch.total) * 100) : 0
      return h(
        'div',
        { className: 'cr-banner' },
        h(
          'div',
          { className: 'cr-progress-head' },
          h('strong', null, `正在分析 ${batch.done + (batch.current ? 1 : 0)} / ${batch.total}`),
          batch.current ? h('span', null, batch.current) : null
        ),
        h('div', { className: 'cr-progress' }, h('div', { className: 'cr-progress-fill', style: { width: `${percent}%` } })),
        h(
          'p',
          { className: 'cr-hint' },
          batch.failed
            ? `${batch.failed} 条未成功，可在列表里单独重试。逐条分析，不并发。`
            : '逐条提交给助手，等上一条出结果再发下一条，不并发。'
        )
      )
    }

    function renderImportResult(result) {
      const skipped = result.skipped || []
      return h(
        'div',
        { className: skipped.length ? 'cr-banner cr-banner-error' : 'cr-banner' },
        h(
          'p',
          null,
          h('strong', null, `导入 ${result.imported} 条`),
          result.duplicates ? `，跳过 ${result.duplicates} 条重复（externalId 已存在）` : '',
          skipped.length ? `，${skipped.length} 条未能导入` : ''
        ),
        skipped.length
          ? h(
              'ul',
              { className: 'cr-skip-list' },
              skipped
                .slice(0, 8)
                .map((item, index) =>
                  h('li', { key: index }, `第 ${item.row} 条${item.customerName ? `（${item.customerName}）` : ''}：${item.reason}`)
                ),
              skipped.length > 8 ? h('li', { key: 'more' }, `……其余 ${skipped.length - 8} 条同类问题`) : null
            )
          : null,
        result.imported
          ? h('p', { className: 'cr-hint' }, '导入的记录处于「待分析」状态，点上方「分析全部待处理」开始质检。')
          : null
      )
    }

    function renderInsights(value) {
      if (!value || !value.analyzed) {
        return h(
          'section',
          { className: 'cr-card cr-dashboard' },
          h('h2', null, '质检看板'),
          h(
            'div',
            { className: 'cr-empty' },
            '还没有任何已分析的记录。完成一次 AI 质检后，这里会显示客户意向分布、问题点分布和准确率。'
          )
        )
      }

      return h(
        'section',
        { className: 'cr-card cr-dashboard' },
        h(
          'div',
          { className: 'cr-list-toolbar' },
          h(
            'h2',
            null,
            '质检看板',
            h('span', { className: 'cr-live-dot' }, 'LIVE')
          ),
          h('span', { className: 'cr-counter' }, `基于 ${value.analyzed} 条已分析记录`)
        ),
        h(
          'div',
          { className: 'cr-board-overview' },
          h(
            'div',
            { className: 'cr-board-panel' },
            h('h3', null, '客户意向分布'),
            h(
              'div',
              { className: 'cr-donut-wrap' },
              renderDonut({
                label: '客户意向分布',
                centerLabel: '条会话',
                slices: value.intentDistribution.map((bucket) => ({
                  key: bucket.level,
                  label: INTENT_LABELS[bucket.level] || bucket.level,
                  value: bucket.count,
                  color: INTENT_COLORS[bucket.level] || '#94a3b8',
                  active: intentFilter === bucket.level,
                  onClick: () => setIntentFilter(intentFilter === bucket.level ? '' : bucket.level)
                }))
              }),
              h(
                'ul',
                { className: 'cr-legend' },
                value.intentDistribution.map((bucket) =>
                  h(
                    'li',
                    { key: bucket.level },
                    h(
                      'button',
                      {
                        className: 'cr-legend-item' + (intentFilter === bucket.level ? ' is-active' : ''),
                        onClick: () => setIntentFilter(intentFilter === bucket.level ? '' : bucket.level)
                      },
                      h('span', { className: 'cr-legend-dot', style: { background: INTENT_COLORS[bucket.level] } }),
                      h('span', { className: 'cr-legend-label' }, INTENT_LABELS[bucket.level] || bucket.level),
                      h('span', { className: 'cr-legend-count' }, bucket.count + ' · ' + percentText(bucket.count, value.analyzed))
                    )
                  )
                )
              )
            ),
            // Folded into the same card as the donut instead of a separate panel: the donut
            // + legend alone left this card much shorter than the six-dimension radar next to
            // it, stretching it (align-items:stretch) produced dead space, and align-items:start
            // just left a visibly uneven row. Giving it a second chart is the actual fix.
            h('div', { className: 'cr-board-divider' }),
            renderTrendBlock(value.trend)
          ),
          renderTeamRadar(value.scoreAverages)
        ),

        h('h4', { className: 'cr-board-group-title' }, '问题点分布'),
        h(
          'div',
          { className: 'cr-board' },
          ISSUE_FIELDS.map((field) => {
            const buckets = value[field.key] || []
            const max = buckets.reduce((acc, bucket) => Math.max(acc, bucket.count), 0)
            return h(
              'div',
              { className: 'cr-board-panel', key: field.key },
              h('h3', null, field.label + '分布'),
              buckets.length === 0
                ? h('p', { className: 'cr-hint' }, '暂未识别到' + field.label + '。')
                : h(
                    'div',
                    { className: 'cr-bars' },
                    buckets.map((bucket) =>
                      renderBar({
                        key: field.kind + '-' + bucket.category,
                        label: categoryLabel(field.kind, bucket.category),
                        count: bucket.count,
                        total: max,
                        // Occurrences drive the bar length, but the number a salesperson acts on
                        // is how many conversations it shows up in, so both are labelled.
                        note: `${bucket.recordCount} 条会话` + (bucket.highCount ? ` · ${bucket.highCount} 条高严重度` : ''),
                        tone: bucket.highCount ? 'bad' : undefined,
                        active: issueFilter === field.kind + ':' + bucket.category,
                        onClick: () => toggleIssueFilter(field.kind, bucket.category)
                      })
                    )
                  )
            )
          })
        ),

        // Accuracy is full-width, kept outside the auto-fit bars grid above — sharing one grid
        // track definition with a spanning item leaves auto-fit unable to collapse the columns
        // the bars don't use, which is what produced the dead whitespace to the right of a
        // narrow bars row.
        h(
          'div',
          { className: 'cr-board-stack' },
          renderAccuracy(value.accuracy)
        )
      )
    }

    /** Team-level radar: where this seller is consistently weak across all scored conversations. */
    function renderTeamRadar(averages) {
      const rows = averages || []
      const scored = rows.reduce((acc, row) => Math.max(acc, row.sampleSize), 0)
      if (!scored) {
        return h(
          'div',
          { className: 'cr-board-panel cr-board-panel-center', key: 'team-radar' },
          h('h3', null, '六维质检均分'),
          h('div', { className: 'cr-board-panel-center-body' }, h('p', { className: 'cr-hint' }, '还没有带评分的分析结果。'))
        )
      }

      const values = rows.reduce((acc, row) => {
        acc[row.dimension] = row.average
        return acc
      }, {})
      const weakest = rows.slice().sort((a, b) => a.average - b.average)[0]

      return h(
        'div',
        { className: 'cr-board-panel cr-board-panel-center', key: 'team-radar' },
        h('h3', null, '六维质检均分'),
        h(
          'div',
          { className: 'cr-board-panel-center-body' },
          renderRadar({ values, dark: true }),
          h(
            'p',
            { className: 'cr-hint' },
            `基于 ${scored} 条评分记录，最弱维度：${(SCORE_DIMENSIONS.find((d) => d.key === weakest.dimension) || {}).label || weakest.dimension}（${weakest.average} 分）`
          )
        )
      )
    }

    /** Content only (no cr-board-panel wrapper) — folded into the intent-distribution card, see renderInsights. */
    function renderTrendBlock(trend) {
      const points = trend || []
      const active = points.filter((point) => point.count > 0)
      return h(
        React.Fragment,
        { key: 'trend' },
        h('h3', { className: 'cr-board-subhead' }, '近两周趋势'),
        active.length === 0
          ? h('p', { className: 'cr-hint' }, '近两周还没有归档记录。')
          : h(
              React.Fragment,
              null,
              renderTrend(points),
              h(
                'p',
                { className: 'cr-hint' },
                `柱=当日归档会话数，折线=当日平均质检分。共 ${active.length} 天有记录，无评分的日子折线断开而不是归零。`
              )
            )
      )
    }

    function renderBar(options) {
      const width = options.total ? Math.max(4, Math.round((options.count / options.total) * 100)) : 0
      return h(
        'button',
        {
          key: options.key,
          className: 'cr-bar' + (options.active ? ' is-active' : ''),
          onClick: options.onClick,
          title: '点击筛选相关会话'
        },
        h(
          'span',
          { className: 'cr-bar-head' },
          h('span', { className: 'cr-bar-label' }, options.label),
          h('span', { className: 'cr-bar-count' }, options.count)
        ),
        h(
          'span',
          { className: 'cr-bar-track' },
          h('span', { className: 'cr-bar-fill' + (options.tone ? ' cr-bar-' + options.tone : ''), style: { width: width + '%' } })
        ),
        options.note ? h('span', { className: 'cr-bar-note' }, options.note) : null
      )
    }

    /**
     * Accuracy here is the human-modification rate: how often the salesperson changed what the AI
     * wrote before signing it off. It is labelled as that rather than as "correctness", because an
     * untouched field may simply not have been checked.
     */
    function renderAccuracy(accuracy) {
      if (!accuracy) return null
      if (!accuracy.sampleSize) {
        return h(
          'div',
          { className: 'cr-board-panel', key: 'accuracy' },
          h('h3', null, 'AI 结果准确率'),
          h('p', { className: 'cr-hint' }, '还没有人工确认过的记录，暂时无法统计。确认一条结果后即可看到。')
        )
      }

      const edits = accuracy.fieldEdits || {}
      const ranked = Object.keys(ACCURACY_FIELD_LABELS)
        .map((key) => ({ key, count: edits[key] || 0 }))
        .sort((a, b) => b.count - a.count)

      return h(
        'div',
        { className: 'cr-board-panel', key: 'accuracy' },
        h('h3', null, 'AI 结果准确率'),
        h(
          'div',
          { className: 'cr-accuracy-grid' },
          h(
            'div',
            { className: 'cr-metrics cr-metrics-column' },
            metric('意向判断一致率', percentText(accuracy.intentAgreed, accuracy.sampleSize), `${accuracy.intentAgreed} / ${accuracy.sampleSize}`),
            metric('一字未改直接确认', percentText(accuracy.acceptedAsIs, accuracy.sampleSize), `${accuracy.acceptedAsIs} / ${accuracy.sampleSize}`)
          ),
          h(
            'div',
            { className: 'cr-bars cr-bars-compact' },
            ranked.map((field) =>
              h(
                'div',
                { className: 'cr-edit-row', key: field.key },
                h('span', { className: 'cr-bar-label' }, ACCURACY_FIELD_LABELS[field.key]),
                h(
                  'span',
                  { className: 'cr-bar-track' },
                  h('span', {
                    className: 'cr-bar-fill cr-bar-bad',
                    style: { width: (accuracy.sampleSize ? Math.round((field.count / accuracy.sampleSize) * 100) : 0) + '%' }
                  })
                ),
                h('span', { className: 'cr-bar-count' }, percentText(field.count, accuracy.sampleSize))
              )
            )
          )
        ),
        h(
          'p',
          { className: 'cr-hint' },
          '统计口径：已确认记录中，销售修改过该字段的比例（越低表示 AI 越贴近人工判断）。未被修改不等于已被核对。'
        )
      )
    }

    function renderDetail() {
      if (!detail) {
        return h('div', { className: 'cr-empty' }, '左侧选择一条记录，或先提交一次新的沟通。')
      }

      const stalled = isStalled(detail)
      const status = stalled ? 'failed' : detail.status

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'cr-detail-header' },
          h(
            'div',
            null,
            h('h2', null, detail.customerName || '未命名客户'),
            h(
              'div',
              { className: 'cr-detail-meta' },
              statusBadge(status),
              detail.analyzedAt ? h('span', null, `分析于 ${formatTime(detail.analyzedAt)}`) : null,
              detail.confirmedAt ? h('span', null, `确认于 ${formatTime(detail.confirmedAt)}`) : null,
              detail.retryCount > 0 ? h('span', null, `已重试 ${detail.retryCount} 次`) : null,
              ruleVersionBadge(detail.ruleVersion, () => setRuleModalVersion(detail.ruleVersion))
            )
          )
        ),

        h(
          'details',
          { className: 'cr-conversation' },
          h('summary', null, '原始沟通记录'),
          h('pre', null, detail.conversation || '')
        ),

        status === 'draft'
          ? h(
              'div',
              { className: 'cr-state-box' },
              h('p', null, '这条记录还没有做过 AI 质检。'),
              h(
                'button',
                { className: 'cr-btn cr-btn-primary', disabled: Boolean(busy), onClick: () => handleAnalyze(detail, false) },
                '开始 AI 质检与分析'
              )
            )
          : null,

        status === 'processing'
          ? h(
              'div',
              { className: 'cr-state-box' },
              h('p', null, 'AI 正在分析这条沟通记录…'),
              h('p', { className: 'cr-hint' }, '助手完成后本页会自动刷新。如果长时间没有反应，可以在右侧对话里查看助手的回复。')
            )
          : null,

        status === 'failed'
          ? h(
              'div',
              { className: 'cr-state-box cr-state-error' },
              h('p', { className: 'cr-error-title' }, '本次 AI 分析没有成功'),
              h('p', null, stalled && !detail.errorMessage ? 'AI 分析长时间没有返回结果，可能是模型调用失败或额度不足。' : detail.errorMessage || '原因未知。'),
              h(
                'div',
                { className: 'cr-actions' },
                h(
                  'button',
                  { className: 'cr-btn cr-btn-primary', disabled: Boolean(busy), onClick: () => handleAnalyze(detail, true) },
                  busy === 'retry_analysis' ? '重试中…' : '重试分析'
                ),
                stalled && detail.status === 'processing'
                  ? h(
                      'button',
                      { className: 'cr-btn', disabled: Boolean(busy), onClick: () => handleMarkFailed(detail) },
                      '标记为失败'
                    )
                  : null
              ),
              h('p', { className: 'cr-hint' }, '重试会在这条原记录上重新执行，不会新建一条重复记录。')
            )
          : null,

        status === 'completed' || status === 'confirmed' ? renderResultEditor(status) : null
      )
    }

    function renderResultEditor(status) {
      if (!draft) return null
      return h(
        'div',
        { className: 'cr-result' },
        h(
          'div',
          { className: 'cr-result-head' },
          h('h3', null, status === 'confirmed' ? '已确认结果' : 'AI 分析结果（待确认）'),
          h(
            'p',
            { className: 'cr-hint' },
            status === 'confirmed'
              ? '这是你确认过的结果，修改后可以再次确认保存。'
              : 'AI 结果只是草稿，请核对并按需修改后再确认保存。'
          )
        ),

        h(
          'div',
          { className: 'cr-field cr-field-inline' },
          h('label', null, '客户意向'),
          h(
            'select',
            { value: draft.intentLevel, onChange: (event) => updateDraft('intentLevel', event.target.value) },
            Object.keys(INTENT_LABELS).map((key) => h('option', { key, value: key }, INTENT_LABELS[key]))
          ),
          h('span', { className: 'cr-total-score' }, '综合得分 ', h('strong', null, averageScore(draft.scores) === null ? '—' : averageScore(draft.scores)))
        ),

        renderScorecard(),

        h(
          'div',
          { className: 'cr-field' },
          h('label', null, '沟通摘要'),
          h('textarea', {
            rows: 3,
            value: draft.summary,
            placeholder: '这次沟通的核心内容',
            onChange: (event) => updateDraft('summary', event.target.value)
          })
        ),

        ISSUE_FIELDS.map((field) => renderIssueEditor(field)),

        TEXT_FIELDS.map((field) =>
          h(
            'div',
            { className: 'cr-field', key: field.key },
            h('label', null, field.label, h('span', { className: 'cr-counter' }, '每行一条')),
            h('textarea', {
              rows: 3,
              value: draft[field.key],
              onChange: (event) => updateDraft(field.key, event.target.value)
            })
          )
        ),

        detail.aiResult && detail.confirmedResult
          ? h('p', { className: 'cr-hint' }, 'AI 原始结果已单独保存，确认结果不会覆盖它。')
          : null,

        h(
          'div',
          { className: 'cr-actions' },
          h(
            'button',
            { className: 'cr-btn cr-btn-primary', disabled: Boolean(busy), onClick: handleConfirm },
            busy === 'confirm_result' ? '保存中…' : status === 'confirmed' ? '再次确认并保存' : '确认并保存'
          ),
          h(
            'button',
            { className: 'cr-btn', disabled: Boolean(busy), onClick: () => handleAnalyze(detail, true) },
            '重新分析'
          ),
          draftDirty ? h('span', { className: 'cr-dirty' }, '有未保存的修改') : null
        )
      )
    }

    /**
     * The per-conversation radar, bound to the draft rather than to the saved result so dragging a
     * slider reshapes the hexagon immediately — the point of the chart is to make a disagreement
     * with the AI's scoring visible while you are still editing it.
     */
    function renderScorecard() {
      const scores = (draft && draft.scores) || {}
      return h(
        'div',
        { className: 'cr-scorecard' },
        h('div', { className: 'cr-scorecard-chart' }, renderRadar({ values: scores, size: 260, compactLabels: true })),
        h(
          'div',
          { className: 'cr-scorecard-sliders' },
          h('label', { className: 'cr-scorecard-title' }, '六维质检评分', h('span', { className: 'cr-counter' }, '0-100，分越高越好')),
          SCORE_DIMENSIONS.map((dimension) =>
            h(
              'div',
              { className: 'cr-score-row', key: dimension.key },
              h('span', { className: 'cr-score-label' }, dimension.label),
              h('input', {
                type: 'range',
                min: 0,
                max: 100,
                step: 5,
                value: scores[dimension.key] || 0,
                style: { '--cr-score-pct': (scores[dimension.key] || 0) + '%' },
                onChange: (event) => updateScore(dimension.key, event.target.value)
              }),
              h('input', {
                type: 'number',
                className: 'cr-score-number',
                min: 0,
                max: 100,
                value: scores[dimension.key] || 0,
                onChange: (event) => updateScore(dimension.key, event.target.value)
              })
            )
          ),
          h('p', { className: 'cr-hint' }, '评分由模型给出，未经校准，仅在同一套提示词下横向可比。改动会计入准确率统计。')
        )
      )
    }

    /**
     * Public disclosure of the deterministic risk rules: which wording categories are always
     * checked the same way regardless of model, so the salesperson is never guessing why a phrase
     * got flagged. Collapsed by default like `原始沟通记录` — informational, not something read on
     * every visit.
     */
    function renderRuleDisclosure(field) {
      return h(
        'details',
        { className: 'cr-rule-disclosure' },
        h('summary', null, '质检规则说明' + (detail && detail.ruleVersion ? `（当前规则版本 ${detail.ruleVersion}）` : '')),
        h(
          'p',
          { className: 'cr-hint' },
          '以下类别除了模型自己的判断，还会用固定的关键词/话术规则做兜底核对，命中规则的条目说明会标注“系统规则命中”：'
        ),
        h(
          'ul',
          { className: 'cr-rule-list' },
          RULE_CHECKED_RISK_CATEGORIES.map((key) => h('li', { key }, field.categories[key] || key))
        ),
        h(
          'p',
          { className: 'cr-hint' },
          `“${field.categories.missing_followup}”和“${field.categories.other}”无法仅凭字面判断，始终由模型结合上下文给出。规则内容变化时会更新规则版本号，历史记录上的版本号不会被重新解释。`
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'cr-link-btn',
            onClick: () => setRuleModalVersion((detail && detail.ruleVersion) || summary.currentRuleVersion)
          },
          '查看完整规则详情（含示例表述）→'
        )
      )
    }

    /**
     * Manual single-record creation, opened by the "+ 添加沟通记录" trigger. A right-side drawer
     * rather than an always-open card so the form stays one click away without permanently
     * occupying the top of the page — the bulk-import path below covers the higher-volume case.
     */
    function renderCreateDrawer() {
      if (!showCreateDrawer) return null
      return h(
        'div',
        { className: 'cr-drawer-backdrop', onClick: () => setShowCreateDrawer(false) },
        h(
          'div',
          { className: 'cr-drawer', role: 'dialog', 'aria-modal': 'true', onClick: (event) => event.stopPropagation() },
          h(
            'div',
            { className: 'cr-drawer-head' },
            h('h2', null, '归档一次客户沟通'),
            h(
              'button',
              { type: 'button', className: 'cr-modal-close', onClick: () => setShowCreateDrawer(false), 'aria-label': '关闭' },
              '×'
            )
          ),
          h(
            'div',
            { className: 'cr-drawer-body' },
            h(
              'div',
              { className: 'cr-field' },
              h('label', null, '客户名称'),
              h('input', {
                type: 'text',
                value: form.customerName,
                maxLength: CUSTOMER_NAME_MAX_LENGTH,
                placeholder: '例如：上海某某科技有限公司',
                onChange: (event) => {
                  setForm(Object.assign({}, form, { customerName: event.target.value }))
                  setFormError('')
                }
              }),
              h(
                'p',
                { className: 'cr-hint' },
                '同一客户请每次填写完全相同的名称（大小写不敏感，但不做模糊匹配）——名称写法不一致会被当成两个客户，历史遗留事项对不上。'
              )
            ),
            h(
              'div',
              { className: 'cr-field' },
              h(
                'label',
                null,
                '沟通记录',
                h('span', { className: 'cr-counter' }, `${form.conversation.length} / ${CONVERSATION_MAX_LENGTH}`)
              ),
              h('textarea', {
                rows: 10,
                value: form.conversation,
                maxLength: CONVERSATION_MAX_LENGTH,
                placeholder: '把这次和客户的沟通内容粘贴到这里，可以是聊天记录、电话纪要或会议记录。',
                onChange: (event) => {
                  setForm(Object.assign({}, form, { conversation: event.target.value }))
                  setFormError('')
                }
              })
            ),
            formError ? h('div', { className: 'cr-inline-error' }, formError) : null,
            h(
              'p',
              { className: 'cr-hint' },
              '提交后会把这条记录交给「客户沟通质检助手」分析。请保持右侧 Assistant 对话处于打开状态。'
            )
          ),
          h(
            'div',
            { className: 'cr-drawer-actions' },
            h(
              'button',
              {
                className: 'cr-btn',
                disabled: Boolean(busy),
                onClick: () => {
                  setForm({ customerName: '示例客户 · 王总', conversation: SAMPLE_CONVERSATION })
                  setFormError('')
                }
              },
              '填入示例'
            ),
            h(
              'button',
              {
                className: 'cr-btn cr-btn-primary',
                disabled: Boolean(busy),
                onClick: handleSubmit
              },
              busy === 'create_record' || busy === 'start_analysis' ? '提交中…' : 'AI 质检与分析'
            )
          )
        )
      )
    }

    /**
     * Rule-details modal, opened by clicking any rule-version tag (page header, a history-list
     * item, the detail header, or the link inside `renderRuleDisclosure`). Content always comes
     * from `summary.ruleCatalog` — the *current* rule set, since past rule text is not retained,
     * only the version string it was tagged with. When the clicked tag's version differs from
     * `summary.currentRuleVersion` a banner says so explicitly, rather than silently presenting
     * today's rules as if they were what actually ran on an older record.
     */
    function renderRuleModal() {
      if (!ruleModalVersion) return null
      const catalog = summary.ruleCatalog || []
      const current = summary.currentRuleVersion
      const stale = current && ruleModalVersion !== current
      const riskField = ISSUE_FIELD_BY_KIND.risk

      return h(
        'div',
        { className: 'cr-modal-backdrop', onClick: () => setRuleModalVersion(null) },
        h(
          'div',
          { className: 'cr-modal', role: 'dialog', 'aria-modal': 'true', onClick: (event) => event.stopPropagation() },
          h(
            'div',
            { className: 'cr-modal-head' },
            h('h3', null, '质检规则详情'),
            h(
              'button',
              { type: 'button', className: 'cr-modal-close', onClick: () => setRuleModalVersion(null), 'aria-label': '关闭' },
              '×'
            )
          ),
          h(
            'p',
            { className: 'cr-hint' },
            `查看版本：${ruleModalVersion}` + (current ? `　当前生效版本：${current}` : '')
          ),
          stale
            ? h(
                'p',
                { className: 'cr-banner cr-banner-error' },
                `规则已从 ${ruleModalVersion} 更新到 ${current}，历史规则文本未保留。下面展示的是当前规则内容，仅供参考，不代表该记录分析时实际命中的判断依据。`
              )
            : null,
          h(
            'ul',
            { className: 'cr-rule-modal-list' },
            catalog.map((rule) =>
              h(
                'li',
                { key: rule.category, className: 'cr-rule-modal-item' },
                h(
                  'div',
                  { className: 'cr-rule-modal-item-head' },
                  h('span', { className: 'cr-rule-modal-label' }, rule.label),
                  h('span', { className: 'cr-severity-chip cr-severity-' + rule.severity }, SEVERITY_LABELS[rule.severity] || rule.severity)
                ),
                h('p', { className: 'cr-hint' }, '示例表述：' + rule.examples.join('、'))
              )
            )
          ),
          riskField
            ? h(
                'p',
                { className: 'cr-hint' },
                `“${riskField.categories.missing_followup}”和“${riskField.categories.other}”不在这份表里——无法仅凭字面判断，始终由模型结合上下文给出，不是规则遗漏。`
              )
            : null
        )
      )
    }

    /**
     * Structured editor for one issue list. The category is a dropdown rather than free text on
     * purpose: correcting a wrong classification is what keeps the dashboard honest, and it only
     * works if the human is confined to the same vocabulary the AI was.
     */
    function renderIssueEditor(field) {
      const issues = (draft && draft[field.key]) || []
      return h(
        'div',
        { className: 'cr-field', key: field.key },
        h('label', null, field.label, h('span', { className: 'cr-counter' }, field.hint)),
        field.kind === 'risk' ? renderRuleDisclosure(field) : null,
        issues.length === 0 ? h('p', { className: 'cr-hint cr-issue-empty' }, '未识别到' + field.label + '。') : null,
        issues.map((issue, index) =>
          h(
            'div',
            { className: 'cr-issue cr-issue-' + (issue.severity || 'medium'), key: index },
            h(
              'div',
              { className: 'cr-issue-head' },
              h(
                'select',
                {
                  className: 'cr-issue-category',
                  value: issue.category,
                  onChange: (event) => updateIssue(field.key, index, { category: event.target.value })
                },
                Object.keys(field.categories).map((key) =>
                  h('option', { key, value: key }, field.categories[key])
                )
              ),
              h(
                'select',
                {
                  className: 'cr-severity-select cr-severity-' + (issue.severity || 'medium'),
                  value: issue.severity,
                  onChange: (event) => updateIssue(field.key, index, { severity: event.target.value })
                },
                Object.keys(SEVERITY_LABELS).map((key) =>
                  h('option', { key, value: key }, '严重度 ' + SEVERITY_LABELS[key])
                )
              ),
              h(
                'button',
                {
                  className: 'cr-issue-remove',
                  onClick: () => removeIssue(field.key, index),
                  title: '删除这一条',
                  'aria-label': '删除这一条'
                },
                '删除'
              )
            ),
            h('input', {
              type: 'text',
              value: issue.detail,
              placeholder: '一句话说明',
              onChange: (event) => updateIssue(field.key, index, { detail: event.target.value })
            }),
            h('input', {
              type: 'text',
              className: 'cr-issue-evidence',
              value: issue.evidence,
              placeholder: '原文引用（可核对的依据）',
              onChange: (event) => updateIssue(field.key, index, { evidence: event.target.value })
            })
          )
        ),
        h('button', { className: 'cr-btn cr-btn-sm', onClick: () => addIssue(field.key) }, '＋ 添加一条')
      )
    }
  }

  function metric(label, value, note) {
    return h(
      'div',
      { className: 'cr-metric', key: label },
      h('span', { className: 'cr-metric-value' }, value),
      h('span', { className: 'cr-metric-label' }, label),
      note ? h('span', { className: 'cr-metric-note' }, note) : null
    )
  }

  function statChip(label, value, tone) {
    return h(
      'div',
      { className: 'cr-stat' + (tone ? ' cr-stat-' + tone : ''), key: label },
      h('span', { className: 'cr-stat-value' }, value),
      h('span', { className: 'cr-stat-label' }, label)
    )
  }

  function statusBadge(status) {
    const key = status || 'draft'
    return h('span', { className: 'cr-badge cr-badge-' + key }, STATUS_LABELS[key] || key)
  }

  /**
   * Only rendered once a record has actually been analysed (`ruleVersion` is set on
   * `saveAiResult`, never on a bare draft). Tags every record and every history-list row with the
   * deterministic rule set that produced its rule-based risk hits, so a later rule change is
   * visible on old records instead of silently reinterpreting them. Clickable when `onClick` is
   * given, to open the rule-details modal without leaving the list/detail view.
   */
  function ruleVersionBadge(ruleVersion, onClick) {
    if (!ruleVersion) return null
    return h(
      'span',
      {
        className: 'cr-badge cr-badge-rule' + (onClick ? ' cr-badge-clickable' : ''),
        title: onClick ? '点击查看质检规则详情' : '产生本条记录风险提示时所用的规则版本',
        onClick,
        role: onClick ? 'button' : undefined,
        tabIndex: onClick ? 0 : undefined,
        onKeyDown: onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick(event)
              }
            }
          : undefined
      },
      `规则 ${ruleVersion}`
    )
  }

  // --------------------------------------------------------------------- css

  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = `
      :root {
        color-scheme: light;
        --cr-bg: #f5f7fb;
        --cr-card: #ffffff;
        --cr-text: #142033;
        --cr-muted: #64748b;
        --cr-border: #dce4ef;
        --cr-soft: #f8fafc;
        --cr-blue: #1d4ed8;
        --cr-blue-dark: #1739a8;
        --cr-blue-soft: #eaf1ff;
        --cr-green: #16834a;
        --cr-green-soft: #e8f7ee;
        --cr-amber: #b45309;
        --cr-amber-soft: #fef3c7;
        --cr-red: #d3382d;
        --cr-red-soft: #fff0ee;
        --cr-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 24px -14px rgba(15, 23, 42, 0.16);
        --cr-shadow-hover: 0 1px 2px rgba(15, 23, 42, 0.05), 0 16px 32px -14px rgba(15, 23, 42, 0.22);
        --cr-ring: 0 0 0 3px rgba(29, 78, 216, 0.14);
        --cr-radius: 14px;
        --cr-radius-sm: 10px;
      }
      * { box-sizing: border-box; }
      html, body, #root { width: 100%; min-height: 100%; margin: 0; }
      body {
        background: var(--cr-bg);
        color: var(--cr-text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        font-size: 14px;
        line-height: 1.6;
      }
      .cr-shell { display: flex; flex-direction: column; gap: 22px; padding: 24px 28px; min-width: 0; }
      .cr-header {
        display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; justify-content: space-between;
        padding-bottom: 18px; border-bottom: 1px solid var(--cr-border);
      }
      .cr-header h1 { margin: 0; font-size: 23px; font-weight: 720; letter-spacing: -0.01em; }
      .cr-sub { margin: 5px 0 0; color: var(--cr-muted); font-size: 13px; }
      .cr-badge-rule-current { margin-top: 9px; background: var(--cr-blue-soft); color: var(--cr-blue); border: 1px solid transparent; }
      .cr-stats { display: flex; gap: 12px; flex-wrap: wrap; }
      .cr-stat {
        background: var(--cr-card); border: 1px solid var(--cr-border); border-top: 3px solid var(--cr-blue);
        border-radius: var(--cr-radius-sm); padding: 10px 18px; text-align: center; min-width: 82px;
        box-shadow: var(--cr-shadow); transition: box-shadow 160ms ease, transform 160ms ease;
      }
      .cr-stat:hover { box-shadow: var(--cr-shadow-hover); transform: translateY(-1px); }
      .cr-stat-value { display: block; font-size: 23px; font-weight: 720; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
      .cr-stat-label { display: block; margin-top: 2px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; color: var(--cr-muted); }
      .cr-stat-ok { border-top-color: var(--cr-green); }
      .cr-stat-ok .cr-stat-value { color: var(--cr-green); }
      .cr-stat-warn { border-top-color: var(--cr-amber); }
      .cr-stat-warn .cr-stat-value { color: var(--cr-amber); }
      .cr-stat-bad { border-top-color: var(--cr-red); }
      .cr-stat-bad .cr-stat-value { color: var(--cr-red); }

      .cr-card { background: var(--cr-card); border: 1px solid var(--cr-border); border-radius: var(--cr-radius); padding: 24px; min-width: 0; box-shadow: var(--cr-shadow); }
      .cr-card h2 {
        display: flex; align-items: center; gap: 9px; margin: 0 0 16px; font-size: 16.5px; font-weight: 720; letter-spacing: -0.005em;
      }
      .cr-card h2::before { content: ''; width: 4px; height: 15px; border-radius: 2px; background: var(--cr-blue); flex: 0 0 auto; }
      .cr-card h3 { margin: 0; font-size: 14px; font-weight: 680; }

      .cr-columns { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: 20px; align-items: start; }
      .cr-list-card, .cr-detail-card { min-width: 0; }
      .cr-list-card { position: sticky; top: 20px; max-height: calc(100vh - 40px); overflow-y: auto; }

      .cr-field { margin-bottom: 16px; min-width: 0; }
      .cr-field label { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600; margin-bottom: 5px; }
      .cr-field-inline { display: flex; align-items: center; gap: 10px; }
      .cr-field-inline label { margin: 0; }
      .cr-counter { font-weight: 400; font-size: 12px; color: var(--cr-muted); }
      input[type=text], input[type=search], input[type=number], textarea, select {
        width: 100%; padding: 9px 11px; border: 1px solid var(--cr-border); border-radius: var(--cr-radius-sm);
        font: inherit; color: inherit; background: var(--cr-soft); outline: none;
        transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
      }
      textarea { resize: vertical; min-height: 64px; }
      input:focus, textarea:focus, select:focus { border-color: var(--cr-blue); background: #fff; box-shadow: var(--cr-ring); }
      .cr-field-inline select { width: auto; min-width: 140px; }

      .cr-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 16px; }
      .cr-btn {
        border: 1px solid var(--cr-border); background: #fff; color: var(--cr-text);
        border-radius: var(--cr-radius-sm); padding: 9px 18px; font: inherit; font-weight: 600; letter-spacing: 0.01em; cursor: pointer;
        white-space: nowrap; flex-shrink: 0;
        transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 120ms ease;
      }
      .cr-btn:hover:not(:disabled) { border-color: var(--cr-blue); color: var(--cr-blue); }
      .cr-btn:active:not(:disabled) { transform: translateY(1px); }
      .cr-btn:focus-visible { box-shadow: var(--cr-ring); }
      .cr-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .cr-btn-primary { background: var(--cr-blue); border-color: var(--cr-blue); color: #fff; box-shadow: 0 6px 16px -8px rgba(29, 78, 216, 0.55); }
      .cr-btn-primary:hover:not(:disabled) { background: var(--cr-blue-dark); border-color: var(--cr-blue-dark); color: #fff; }
      .cr-btn-sm { padding: 6px 12px; }
      .cr-btn-danger { color: var(--cr-red); border-color: #f6c8c3; background: var(--cr-red-soft); }

      .cr-hint { margin: 8px 0 0; color: var(--cr-muted); font-size: 12px; }
      .cr-dirty { color: var(--cr-amber); font-size: 12px; }
      .cr-inline-error { color: var(--cr-red); font-size: 13px; margin-top: 4px; }
      .cr-banner { border-radius: var(--cr-radius-sm); padding: 11px 15px; font-size: 13px; background: var(--cr-soft); border: 1px solid var(--cr-border); margin-top: 12px; }
      .cr-banner-error { background: var(--cr-red-soft); color: var(--cr-red); border: 1px solid #f6c8c3; }
      .cr-banner p { margin: 0; }

      .cr-progress-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 13px; }
      .cr-progress { height: 6px; border-radius: 999px; background: var(--cr-border); overflow: hidden; margin-top: 8px; }
      .cr-progress-fill { height: 100%; background: var(--cr-blue); transition: width 240ms ease; }
      .cr-skip-list { margin: 8px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
      .cr-empty { color: var(--cr-muted); text-align: center; padding: 28px 12px; font-size: 13px; }

      .cr-list-toolbar { display: flex; gap: 10px; align-items: center; justify-content: space-between; }
      .cr-list-toolbar h2 { margin: 0; }
      .cr-list-toolbar select { width: auto; min-width: 110px; }
      .cr-search { display: flex; gap: 8px; margin: 10px 0 12px; }
      .cr-search input { min-width: 0; flex: 1 1 auto; }
      .cr-search .cr-btn { flex: 0 0 auto; }
      .cr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 480px; overflow: auto; }
      .cr-list-item {
        border: 1px solid var(--cr-border); border-radius: var(--cr-radius-sm); padding: 11px 13px 11px 16px;
        cursor: pointer; background: var(--cr-soft); box-shadow: inset 3px 0 0 transparent;
        transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
      }
      .cr-list-item:hover { border-color: var(--cr-blue); background: #fff; box-shadow: inset 3px 0 0 transparent, var(--cr-shadow); }
      .cr-list-item.is-active { border-color: var(--cr-blue); background: var(--cr-blue-soft); box-shadow: inset 3px 0 0 var(--cr-blue); }
      .cr-list-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .cr-customer-group { display: flex; align-items: baseline; gap: 6px; min-width: 0; overflow: hidden; }
      .cr-customer { font-weight: 660; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
      .cr-record-id { flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--cr-muted); }
      .cr-preview { margin: 5px 0 0; color: var(--cr-muted); font-size: 12px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .cr-list-meta { display: flex; gap: 10px; margin-top: 8px; color: var(--cr-muted); font-size: 11px; letter-spacing: 0.01em; }

      .cr-badge {
        display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 3px 11px 3px 9px;
        font-size: 11px; font-weight: 680; letter-spacing: 0.02em; white-space: nowrap;
      }
      .cr-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
      .cr-badge-draft { background: var(--cr-soft); color: var(--cr-muted); border: 1px solid var(--cr-border); }
      .cr-badge-processing { background: var(--cr-blue-soft); color: var(--cr-blue); }
      .cr-badge-completed { background: var(--cr-amber-soft); color: var(--cr-amber); }
      .cr-badge-confirmed { background: var(--cr-green-soft); color: var(--cr-green); }
      .cr-badge-failed { background: var(--cr-red-soft); color: var(--cr-red); }
      .cr-badge-rule { background: var(--cr-soft); color: var(--cr-muted); border: 1px solid var(--cr-border); }
      .cr-badge-rule::before { display: none; }
      .cr-badge-clickable { cursor: pointer; }
      .cr-badge-clickable:hover { box-shadow: 0 0 0 2px var(--cr-blue-soft); }
      .cr-badge-clickable:focus-visible { outline: none; box-shadow: var(--cr-ring); }

      .cr-detail-header { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
      .cr-detail-header h2 { margin: 0; }
      .cr-detail-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 6px; color: var(--cr-muted); font-size: 12px; }

      .cr-conversation { border: 1px solid var(--cr-border); border-radius: var(--cr-radius-sm); padding: 11px 14px; background: var(--cr-soft); margin-bottom: 16px; }
      .cr-conversation summary { cursor: pointer; font-size: 13px; font-weight: 600; }
      .cr-conversation pre { margin: 10px 0 0; white-space: pre-wrap; word-break: break-word; font: inherit; color: var(--cr-muted); max-height: 220px; overflow: auto; }

      .cr-rule-disclosure { border: 1px dashed var(--cr-border); border-radius: var(--cr-radius-sm); padding: 8px 12px; margin: 6px 0 10px; background: var(--cr-soft); }
      .cr-rule-disclosure summary { cursor: pointer; font-size: 12px; font-weight: 600; color: var(--cr-muted); }
      .cr-rule-disclosure .cr-hint { margin-top: 6px; }
      .cr-rule-list { margin: 6px 0; padding-left: 18px; font-size: 12px; color: var(--cr-muted); display: flex; flex-direction: column; gap: 2px; }
      .cr-link-btn { border: none; background: none; padding: 4px 0 0; margin: 0; color: var(--cr-blue); font-size: 12px; font-weight: 620; cursor: pointer; }
      .cr-link-btn:hover { text-decoration: underline; }

      .cr-modal-backdrop {
        position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center;
        justify-content: center; padding: 24px; z-index: 50;
      }
      .cr-modal {
        background: var(--cr-card); border-radius: var(--cr-radius-sm); padding: 18px 20px; max-width: 480px;
        width: 100%; max-height: 80vh; overflow: auto; overscroll-behavior: contain; box-shadow: var(--cr-shadow-hover);
      }
      .cr-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .cr-modal-head h3 { margin: 0; font-size: 16px; }
      .cr-modal-close { border: none; background: none; font-size: 20px; line-height: 1; cursor: pointer; color: var(--cr-muted); padding: 2px 4px; }
      .cr-modal-close:hover { color: var(--cr-text); }

      .cr-create-trigger { display: flex; justify-content: flex-end; }
      .cr-btn-add { font-weight: 660; }

      .cr-drawer-backdrop {
        position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; justify-content: flex-end;
        z-index: 50;
      }
      .cr-drawer {
        background: var(--cr-card); width: 420px; max-width: 92vw; height: 100%; display: flex; flex-direction: column;
        box-shadow: var(--cr-shadow-hover); animation: cr-drawer-in 0.22s ease;
      }
      @keyframes cr-drawer-in {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }
      .cr-drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--cr-border); flex: 0 0 auto; }
      .cr-drawer-head h2 { margin: 0; font-size: 16px; }
      .cr-drawer-body { flex: 1 1 auto; overflow: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
      .cr-drawer-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--cr-border); flex: 0 0 auto; }
      .cr-rule-modal-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .cr-rule-modal-item { border: 1px solid var(--cr-border); border-radius: var(--cr-radius-sm); padding: 9px 12px; }
      .cr-rule-modal-item-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .cr-rule-modal-label { font-weight: 660; font-size: 13px; }
      .cr-rule-modal-item .cr-hint { margin-top: 4px; }
      .cr-severity-chip { flex: 0 0 auto; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }

      .cr-state-box { border: 1px dashed var(--cr-border); border-radius: var(--cr-radius-sm); padding: 20px 16px; text-align: center; }
      .cr-state-box p { margin: 0 0 6px; }
      .cr-state-box .cr-actions { justify-content: center; }
      .cr-state-error { border-color: #f6c8c3; background: var(--cr-red-soft); border-style: solid; text-align: left; }
      .cr-state-error .cr-actions { justify-content: flex-start; }
      .cr-error-title { font-weight: 640; color: var(--cr-red); }

      .cr-result-head { margin-bottom: 12px; }

      /* ---- dashboard ---- */
      .cr-board-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; align-items: stretch; margin-top: 4px; }
      /* Only for panels whose content should center in whatever height the row gives it (the radar
         card), not panels whose own content decides the row height (the intent-distribution card).
         Title stays pinned to the top; only the chart/hint below it centers in the leftover space. */
      .cr-board-panel-center { display: flex; flex-direction: column; }
      .cr-board-panel-center-body { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 0; }
      .cr-board-panel-center-body .cr-radar { margin-top: 0; }
      .cr-board-group-title { margin: 22px 0 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: var(--cr-muted); text-transform: uppercase; }
      .cr-board { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; align-items: start; margin-top: 4px; }
      /* Trend + accuracy render as their own full-width blocks (not grid items) so that an
         auto-fit track definition shared with the bars grid above can't force those columns to
         stay reserved-but-empty next to a narrow bars row. */
      .cr-board-stack { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }
      .cr-board-panel { border: 1px solid var(--cr-border); border-radius: var(--cr-radius-sm); padding: 16px 18px; background: var(--cr-card); box-shadow: var(--cr-shadow); min-width: 0; }
      .cr-board-panel h3 { margin: 0 0 12px; }
      .cr-board-divider { border-top: 1px dashed var(--cr-border); margin: 16px 0; }
      .cr-board-subhead { margin: 0 0 12px; font-size: 13px; font-weight: 600; }
      .cr-accuracy-grid { display: grid; grid-template-columns: minmax(200px, 260px) minmax(0, 1fr); gap: 24px; align-items: start; }
      .cr-metrics-column { flex-direction: column; }
      .cr-metrics-column .cr-metric { flex: 0 0 auto; }
      .cr-bars { display: flex; flex-direction: column; gap: 8px; }
      .cr-bar {
        display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left;
        background: transparent; border: 1px solid transparent; border-radius: 8px;
        padding: 5px 7px; font: inherit; color: inherit; cursor: pointer;
        transition: background-color 160ms ease, border-color 160ms ease;
      }
      .cr-bar:hover { background: var(--cr-soft); border-color: var(--cr-border); }
      .cr-bar.is-active { background: var(--cr-blue-soft); border-color: var(--cr-blue); }
      .cr-bar-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
      .cr-bar-label { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cr-bar-count { font-size: 12px; font-weight: 640; color: var(--cr-muted); white-space: nowrap; }
      .cr-bar-track { display: block; height: 6px; border-radius: 999px; background: #e6ecf5; overflow: hidden; }
      .cr-bar-fill { display: block; height: 100%; border-radius: 999px; background: var(--cr-blue); }
      .cr-bar-bad { background: var(--cr-red); }
      .cr-bar-note { font-size: 11px; color: var(--cr-muted); }
      .cr-bars-compact { gap: 6px; margin-top: 10px; }
      .cr-edit-row { display: grid; grid-template-columns: 84px minmax(0, 1fr) 42px; gap: 8px; align-items: center; }
      .cr-edit-row .cr-bar-count { text-align: right; }

      .cr-metrics { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
      .cr-metric { background: var(--cr-soft); border: 1px solid var(--cr-border); border-radius: var(--cr-radius-sm); padding: 9px 13px; flex: 1 1 110px; transition: box-shadow 160ms ease, background-color 160ms ease; }
      .cr-metric:hover { background: #fff; box-shadow: var(--cr-shadow); }
      .cr-metric-value { display: block; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; color: var(--cr-blue); }
      .cr-metric-label { display: block; margin-top: 2px; font-size: 12px; font-weight: 600; color: var(--cr-text); }
      .cr-metric-note { display: block; font-size: 11px; color: var(--cr-muted); }

      /* ---- charts ---- */
      .cr-radar { display: block; width: 100%; max-width: 270px; margin: 6px auto 0; overflow: visible; }
      .cr-radar-label { font-size: 10.5px; font-weight: 600; fill: var(--cr-muted); }
      .cr-radar-label-compact { font-size: 9.5px; }
      .cr-donut-wrap { display: flex; gap: 18px; align-items: center; justify-content: center; flex-wrap: wrap; width: 100%; flex: 1 1 auto; }
      .cr-donut { width: 140px; height: 140px; flex: 0 0 auto; }
      .cr-donut-slice { cursor: pointer; transition: opacity 160ms ease; }
      .cr-donut-slice:hover { opacity: 0.82; }
      .cr-donut-value { font-size: 21px; font-weight: 700; fill: var(--cr-text); }
      .cr-donut-label { font-size: 10px; fill: var(--cr-muted); }
      .cr-legend { list-style: none; margin: 0; padding: 0; flex: 1 1 150px; min-width: 140px; max-width: 220px; display: flex; flex-direction: column; gap: 2px; }
      .cr-legend-item {
        display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 7px;
        background: transparent; border: 1px solid transparent; border-radius: 7px;
        font: inherit; color: inherit; cursor: pointer; text-align: left;
        transition: background-color 160ms ease, border-color 160ms ease;
      }
      .cr-legend-item:hover { background: var(--cr-soft); border-color: var(--cr-border); }
      .cr-legend-item.is-active { background: var(--cr-blue-soft); border-color: var(--cr-blue); }
      .cr-legend-dot { width: 10px; height: 10px; border-radius: 3px; flex: 0 0 auto; }
      .cr-legend-label { font-size: 12.5px; font-weight: 500; flex: 1 1 auto; }
      .cr-legend-count { font-size: 11.5px; font-weight: 600; color: var(--cr-muted); white-space: nowrap; }
      .cr-trend { display: block; width: 100%; max-width: 640px; margin: 6px auto 0; }
      .cr-trend-axis { font-size: 9.5px; fill: var(--cr-muted); }

      /* ---- dashboard: mission-control dark theme (scoped to .cr-dashboard only) ---- */
      .cr-dashboard {
        --crd-bg: #0b1120;
        --crd-panel: #121b30;
        --crd-panel-soft: #0d1526;
        --crd-border: rgba(148, 197, 223, 0.16);
        --crd-border-strong: rgba(34, 211, 238, 0.45);
        --crd-text: #e7edf7;
        --crd-muted: #8ea3bd;
        --crd-cyan: #22d3ee;
        --crd-amber: #f59e0b;
        --crd-green: #34d399;
        --crd-red: #fb7185;
        --crd-mono: ui-monospace, "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        position: relative;
        overflow: hidden;
        background: var(--crd-bg);
        background-image:
          linear-gradient(rgba(34, 211, 238, 0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(34, 211, 238, 0.05) 1px, transparent 1px);
        background-size: 28px 28px;
        border-color: var(--crd-border);
        box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.06), 0 24px 48px -28px rgba(0, 0, 0, 0.75);
        color: var(--crd-text);
      }
      .cr-dashboard::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: repeating-linear-gradient(
          180deg, rgba(255, 255, 255, 0.025) 0px, rgba(255, 255, 255, 0.025) 1px, transparent 1px, transparent 3px
        );
        mix-blend-mode: overlay;
      }
      .cr-dashboard > * { position: relative; }
      .cr-dashboard h2::before { background: var(--crd-cyan); box-shadow: 0 0 8px var(--crd-cyan); }
      .cr-dashboard .cr-counter {
        font-family: var(--crd-mono); font-size: 11px; letter-spacing: 0.03em; color: var(--crd-cyan);
        background: rgba(34, 211, 238, 0.08); border: 1px solid var(--crd-border-strong); border-radius: 999px; padding: 3px 11px;
      }
      .cr-dashboard .cr-empty, .cr-dashboard .cr-hint { color: var(--crd-muted); }
      .cr-live-dot {
        display: inline-flex; align-items: center; gap: 6px; margin-left: 10px;
        font-family: var(--crd-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.1em; color: var(--crd-green); vertical-align: middle;
      }
      .cr-live-dot::before {
        content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--crd-green); box-shadow: 0 0 8px var(--crd-green);
        animation: cr-pulse 1.6s ease-in-out infinite;
      }
      @keyframes cr-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

      .cr-dashboard .cr-board-group-title { color: var(--crd-muted); border-top: 1px dashed var(--crd-border); padding-top: 16px; }
      .cr-dashboard .cr-board-group-title::before { content: '// '; color: var(--crd-cyan); }

      .cr-dashboard .cr-board-panel {
        background: linear-gradient(180deg, var(--crd-panel), var(--crd-panel-soft));
        border-color: var(--crd-border);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
        transition: border-color 200ms ease, box-shadow 200ms ease;
      }
      .cr-dashboard .cr-board-panel:hover {
        border-color: var(--crd-border-strong);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 0 24px -8px rgba(34, 211, 238, 0.45);
      }
      .cr-dashboard .cr-board-panel h3 {
        color: var(--crd-text); font-family: var(--crd-mono); font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
      }
      .cr-dashboard .cr-board-divider { border-top-color: var(--crd-border); }

      .cr-dashboard .cr-bar:hover { background: rgba(255, 255, 255, 0.04); border-color: var(--crd-border); }
      .cr-dashboard .cr-bar.is-active { background: rgba(34, 211, 238, 0.1); border-color: var(--crd-border-strong); box-shadow: 0 0 12px -3px rgba(34, 211, 238, 0.55); }
      .cr-dashboard .cr-bar-label { color: var(--crd-text); }
      .cr-dashboard .cr-bar-count { font-family: var(--crd-mono); color: var(--crd-cyan); }
      .cr-dashboard .cr-bar-track { background: rgba(148, 163, 184, 0.16); }
      .cr-dashboard .cr-bar-fill { background: var(--crd-cyan); box-shadow: 0 0 6px rgba(34, 211, 238, 0.6); }
      .cr-dashboard .cr-bar-bad { background: var(--crd-red); box-shadow: 0 0 6px rgba(251, 113, 133, 0.6); }
      .cr-dashboard .cr-bar-note { color: var(--crd-muted); }

      .cr-dashboard .cr-legend-item:hover { background: rgba(255, 255, 255, 0.05); border-color: var(--crd-border); }
      .cr-dashboard .cr-legend-item.is-active { background: rgba(34, 211, 238, 0.1); border-color: var(--crd-border-strong); }
      .cr-dashboard .cr-legend-label { color: var(--crd-text); }
      .cr-dashboard .cr-legend-count { font-family: var(--crd-mono); color: var(--crd-muted); }

      .cr-dashboard .cr-metric { background: rgba(255, 255, 255, 0.03); border-color: var(--crd-border); }
      .cr-dashboard .cr-metric:hover { background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 16px -6px rgba(34, 211, 238, 0.4); }
      .cr-dashboard .cr-metric-value { font-family: var(--crd-mono); color: var(--crd-cyan); }
      .cr-dashboard .cr-metric-label { color: var(--crd-text); }
      .cr-dashboard .cr-metric-note { color: var(--crd-muted); }

      .cr-dashboard .cr-donut-value { fill: var(--crd-text); font-family: var(--crd-mono); }
      .cr-dashboard .cr-donut-label { fill: var(--crd-muted); }
      .cr-dashboard .cr-trend-axis { fill: var(--crd-muted); font-family: var(--crd-mono); }
      .cr-trend-line-glow { filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.7)); }
      /* Bigger than the base .cr-radar cap — only the dashboard's team radar (dark variant) needs
         to fill the taller, now height-matched panel; the per-record scorecard radar stays as-is. */
      .cr-radar-dark { max-width: 340px; filter: drop-shadow(0 0 10px rgba(34, 211, 238, 0.12)); }
      .cr-radar-label-dark { fill: #93a8c2; font-family: var(--crd-mono); }
      .cr-radar-shape-glow { filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.55)); }
      .cr-radar-dot-glow { filter: drop-shadow(0 0 3px rgba(34, 211, 238, 0.9)); }

      /* ---- per-record scorecard ---- */
      .cr-scorecard { display: grid; grid-template-columns: minmax(210px, 270px) minmax(0, 1fr); gap: 16px; align-items: center; border: 1px solid var(--cr-border); border-radius: var(--cr-radius); padding: 16px; background: var(--cr-card); box-shadow: var(--cr-shadow); margin-bottom: 14px; overflow: hidden; }
      .cr-scorecard-chart { min-width: 0; }
      .cr-scorecard-sliders { min-width: 0; }
      .cr-scorecard-title { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
      .cr-score-row { display: grid; grid-template-columns: 76px minmax(120px, 320px) 58px; gap: 10px; align-items: center; margin-bottom: 7px; }
      .cr-score-label { font-size: 12px; color: var(--cr-muted); }

      .cr-score-row input[type=range] {
        -webkit-appearance: none; appearance: none; width: 100%; height: 20px; padding: 0;
        background: transparent; border: none; margin: 0; cursor: pointer;
      }
      .cr-score-row input[type=range]::-webkit-slider-runnable-track {
        height: 6px; border-radius: 999px;
        background: linear-gradient(to right, var(--cr-blue) 0%, var(--cr-blue) calc(var(--cr-score-pct, 50%)), #e6ecf5 calc(var(--cr-score-pct, 50%)), #e6ecf5 100%);
      }
      .cr-score-row input[type=range]::-moz-range-track { height: 6px; border-radius: 999px; background: #e6ecf5; }
      .cr-score-row input[type=range]::-moz-range-progress { height: 6px; border-radius: 999px; background: var(--cr-blue); }
      .cr-score-row input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none; width: 16px; height: 16px; margin-top: -5px;
        border-radius: 50%; background: #fff; border: 2px solid var(--cr-blue);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25); cursor: pointer;
        transition: box-shadow 160ms ease, transform 120ms ease;
      }
      .cr-score-row input[type=range]::-moz-range-thumb {
        width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid var(--cr-blue);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25); cursor: pointer;
      }
      .cr-score-row input[type=range]:hover::-webkit-slider-thumb,
      .cr-score-row input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: var(--cr-ring); transform: scale(1.08); }
      .cr-score-row input[type=range]:focus-visible { outline: none; }

      .cr-score-number {
        padding: 5px 6px; text-align: center; background: var(--cr-soft); color: var(--cr-blue);
        font-weight: 650; font-variant-numeric: tabular-nums;
      }
      .cr-score-number:focus { color: var(--cr-text); }
      .cr-total-score { margin-left: auto; font-size: 12px; color: var(--cr-muted); }
      .cr-total-score strong { font-size: 20px; font-weight: 720; letter-spacing: -0.01em; color: var(--cr-blue); }

      .cr-filter-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
      .cr-chip {
        display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--cr-blue);
        background: var(--cr-blue-soft); color: var(--cr-blue); border-radius: 999px;
        padding: 2px 10px; font: inherit; font-size: 12px; cursor: pointer;
      }
      .cr-chip-x { font-size: 14px; line-height: 1; }

      /* ---- structured issue editor ---- */
      .cr-issue {
        background: var(--cr-card); border: 1px solid var(--cr-border); border-left: 3px solid var(--cr-border);
        border-radius: var(--cr-radius-sm); padding: 14px 16px; margin-bottom: 12px; box-shadow: var(--cr-shadow);
        transition: border-left-color 160ms ease;
      }
      .cr-issue-high { border-left-color: var(--cr-red); }
      .cr-issue-medium { border-left-color: var(--cr-amber); }
      .cr-issue-low { border-left-color: var(--cr-border); }

      .cr-issue-head { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
      .cr-issue-category {
        width: auto; flex: 1 1 140px; min-width: 0; background: var(--cr-soft); font-weight: 620; font-size: 13px;
      }
      .cr-severity-select {
        width: auto; flex: 0 0 auto; min-width: 0; padding: 6px 10px; border: 1px solid transparent;
        border-radius: 999px; font-size: 12px; font-weight: 700; text-align: center; cursor: pointer;
      }
      .cr-severity-high { background: var(--cr-red-soft); color: var(--cr-red); }
      .cr-severity-medium { background: var(--cr-amber-soft); color: var(--cr-amber); }
      .cr-severity-low { background: var(--cr-soft); color: var(--cr-muted); border-color: var(--cr-border); }
      .cr-issue-remove {
        flex: 0 0 auto; border: 1px solid transparent; background: transparent; color: var(--cr-muted);
        border-radius: var(--cr-radius-sm); padding: 6px 12px; font: inherit; font-size: 13px; font-weight: 600;
        cursor: pointer; white-space: nowrap; transition: background-color 160ms ease, color 160ms ease;
      }
      .cr-issue-remove:hover:not(:disabled) { background: var(--cr-red-soft); color: var(--cr-red); }

      .cr-issue input { margin-bottom: 8px; background: var(--cr-soft); }
      .cr-issue input:last-child { margin-bottom: 0; }
      .cr-issue-evidence { font-size: 13px; font-style: italic; color: var(--cr-muted); }
      .cr-issue-empty { margin-top: 0; margin-bottom: 8px; }

      @media (max-width: 900px) {
        .cr-columns { grid-template-columns: 1fr; }
        .cr-list-card { position: static; max-height: none; }
        .cr-btn { width: 100%; text-align: center; }
        .cr-actions { flex-direction: column; align-items: stretch; }
        .cr-issue-head { flex-wrap: wrap; }
        .cr-issue-category, .cr-severity-select, .cr-issue-remove { width: auto; }
        .cr-scorecard { grid-template-columns: 1fr; }
        .cr-score-row { grid-template-columns: 76px minmax(0, 1fr) 58px; }
        .cr-score-row input[type=number] { width: 100%; }
        .cr-accuracy-grid { grid-template-columns: 1fr; }
      }
    `
    document.head.appendChild(style)
  }

  const rootElement = document.getElementById('root')
  if (ReactDOM.createRoot) {
    ReactDOM.createRoot(rootElement).render(h(App))
  } else {
    ReactDOM.render(h(App), rootElement)
  }
})()
