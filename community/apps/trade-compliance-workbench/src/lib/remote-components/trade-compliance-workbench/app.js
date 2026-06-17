(function () {
  const root = document.getElementById('root')
  const h = React.createElement

  function App() {
    const tabs = ['管控商品管理', '商品管理', '报关资料生成']
    return h('div', { style: styles.shell },
      h('header', { style: styles.header },
        h('div', null,
          h('h1', { style: styles.title }, 'Trade Compliance Workbench'),
          h('p', { style: styles.subtitle }, '外贸合规工作台：管控商品、供应商商品和报关资料生成')
        )
      ),
      h('nav', { style: styles.tabs }, tabs.map((tab, index) =>
        h('button', { key: tab, style: index === 0 ? styles.activeTab : styles.tab }, tab)
      )),
      h('main', { style: styles.grid },
        h('section', { style: styles.panel },
          h('h2', { style: styles.panelTitle }, '待审核列表'),
          h('div', { style: styles.row }, '数字计算机 | 8471501010 | 明确命中 | 待确认'),
          h('div', { style: styles.row }, '服务器 | HPC-8208 | 疑似管控 | 待确认'),
          h('div', { style: styles.row }, 'INV-2026-001 | 报关资料 | 待生成')
        ),
        h('aside', { style: styles.panel },
          h('h2', { style: styles.panelTitle }, '详情抽屉'),
          h('p', null, '展示原始证据、识别值、默认值、人工确认值和管控命中依据。'),
          h('button', { style: styles.primary }, '确认当前记录')
        )
      )
    )
  }

  const styles = {
    shell: { fontFamily: 'Inter, system-ui, sans-serif', padding: 24, color: '#172033', background: '#f7f8fb', minHeight: '100vh' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
    title: { margin: 0, fontSize: 24 },
    subtitle: { margin: '6px 0 0', color: '#64748b' },
    tabs: { display: 'flex', gap: 8, marginBottom: 18 },
    tab: { border: '1px solid #d7dde8', background: '#fff', padding: '8px 12px', borderRadius: 6 },
    activeTab: { border: '1px solid #0f766e', background: '#e6fffb', color: '#0f766e', padding: '8px 12px', borderRadius: 6 },
    grid: { display: 'grid', gridTemplateColumns: '1.4fr .8fr', gap: 16 },
    panel: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 },
    panelTitle: { margin: '0 0 12px', fontSize: 16 },
    row: { padding: 12, border: '1px solid #edf2f7', borderRadius: 6, marginBottom: 8 },
    primary: { background: '#0f766e', color: '#fff', border: 0, borderRadius: 6, padding: '8px 12px' }
  }

  ReactDOM.render(h(App), root)
})()
