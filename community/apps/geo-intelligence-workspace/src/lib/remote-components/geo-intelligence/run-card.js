;(function () {
  const h = React.createElement
  const { action } = window.GeoBridge
  const requestKey = window.GeoRequestKey
  function RunCard({ run, refresh }) {
    const [draft, setDraft] = React.useState(run.suggestion || '')
    const [previousVersionId, setPreviousVersionId] = React.useState(null)
    const [versions, setVersions] = React.useState([])
    const [notice, setNotice] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    async function execute(key, input) {
      setBusy(true)
      setNotice('')
      try {
        const data = await action(key, input)
        if (key === 'list_content') setVersions(Array.isArray(data) ? data : [])
        else if (key === 'save_content' || key === 'approve_content') {
          setVersions(await action('list_content', { runId: run.run_id }) || [])
          setNotice(key === 'save_content' ? '草稿已保存，请由另一位审核人确认。' : '审核已通过。内容尚未对外发布。')
        } else { window.GeoClearRequest(); await refresh() }
      } catch (e) { setNotice(String(e.message || e)) }
      finally { setBusy(false) }
    }
    return h('article', null,
      h('div', { className: 'row' }, h('strong', null, run.query), h('span', { className: run.status === 'failed' ? 'pill danger' : 'pill' }, ({needs_review:'待人工审核', failed:'执行失败', insufficient_evidence:'证据不足', ok:'已完成'})[run.status] || run.status)),
      run.retry_of && h('p', null, '复测来源：', run.retry_of, '；请结合原始回答对照，单次变化不代表因果效果。'),
      h('p', null, '品牌提及：', run.metrics && run.metrics.brand_mentioned ? '是' : '否', '　｜　引用：', run.metrics && run.metrics.citations_available ? 'API 可验证' : '不可验证'),
      run.raw_answer && h('details', null, h('summary', null, '查看原始回答'), h('pre', null, run.raw_answer)),
      run.error_code && h('p', { className: 'error' }, '错误代码：', run.error_code),
      h('div', { className: 'actions' }, h('button', { disabled: busy, onClick: () => execute('retry', { runId: run.run_id, requestId: requestKey('retry', run.run_id) }) }, run.status === 'failed' ? '重试' : '用同一问题复测'), h('button', { disabled: busy, onClick: () => execute('list_content', { runId: run.run_id }) }, '读取已保存草稿')),
      run.evidence_ids && run.evidence_ids.length > 0 && h('details', null,
        h('summary', null, '编辑优化草稿'),
        h('p', null, '依据：', run.evidence_ids.join('、')),
        h('textarea', { rows: 5, maxLength: 20000, value: draft, onChange: e => setDraft(e.target.value) }),
        h('button', { disabled: busy || !draft.trim(), onClick: () => execute('save_content', { runId: run.run_id, text: draft, evidenceIds: run.evidence_ids, previousVersionId }) }, '保存待审核草稿')),
      versions.map(version => h('div', { className: 'version', key: version.id },
        h('button', { disabled: busy, onClick: () => { setDraft(version.text); setPreviousVersionId(version.id); setNotice('已恢复到编辑区；保存后生成新版本。') } }, '恢复到编辑区'),
        h('strong', null, version.status === 'approved' ? '已审核' : '待审核'), h('pre', null, version.text),
        version.status === 'draft' && h('button', { disabled: busy, onClick: () => execute('approve_content', { contentId: version.id }) }, '审核通过'))),
      notice && h('p', { role: 'status' }, notice))
  }

  window.GeoRunCard = RunCard
})()
