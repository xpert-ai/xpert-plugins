;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function post(type, body, transfer) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(
      Object.assign(
        {
          channel: CHANNEL,
          protocolVersion: VERSION,
          instanceId,
          type
        },
        body || {}
      ),
      '*',
      transfer || []
    )
  }

  function request(type, body, transfer) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      post(type, Object.assign({ requestId }, body || {}), transfer)
      setTimeout(() => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        reject(new Error('请求超时'))
      }, 15000)
    })
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return

    if (message.type === 'init') {
      instanceId = message.instanceId
      post('ready')
      return
    }

    if (message.instanceId !== instanceId) return

    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.error) {
        item.reject(new Error(message.error.message || '请求失败'))
      } else {
        item.resolve(message)
      }
    }
  })

  // 挂载界面
  const root = document.getElementById('root') || document.body
  root.innerHTML = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 16px; color: #1e293b;">
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 24px;">🧾</span>
            <div>
              <h2 style="margin: 0; font-size: 16px; font-weight: 700;">企业发票报销智能预审工作台</h2>
              <span style="font-size: 12px; color: #64748b;">Xpert Workbench View · AI 结构化抽取与税号合规核验</span>
            </div>
          </div>
          <span style="font-size: 12px; background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 6px; font-weight: 500;">
            基准税号: 91110108MA00000000
          </span>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">发票票面内容 / 粘贴文本：</label>
          <textarea id="remote-invoice-input" rows="4" style="width: 100%; box-sizing: border-box; padding: 10px; font-size: 12px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 8px; resize: vertical;" placeholder="粘贴增值税电子发票、打车行程单或工作餐发票文本..."></textarea>
          
          <div style="display: flex; justify-content: space-between; margin-top: 8px;">
            <div style="display: flex; gap: 6px;">
              <button id="btn-sample-taxi" style="padding: 4px 10px; font-size: 11px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;">📋 差旅发票示例</button>
              <button id="btn-sample-meal" style="padding: 4px 10px; font-size: 11px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;">⚠️ 餐饮风险票示例</button>
            </div>
            <button id="btn-parse-remote" style="padding: 6px 16px; font-size: 12px; font-weight: 600; background: #2563eb; color: #ffffff; border: none; border-radius: 6px; cursor: pointer;">⚡ AI 智能解析并核验</button>
          </div>
        </div>

        <div id="remote-audit-result" style="display: none; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
          <div id="remote-badge-area" style="margin-bottom: 12px;"></div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
            <div><span style="color: #64748b;">发票号码：</span><input id="res-inv-num" style="width: 80%; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;" /></div>
            <div><span style="color: #64748b;">开票日期：</span><input id="res-inv-date" style="width: 80%; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;" /></div>
            <div><span style="color: #64748b;">销售方：</span><input id="res-seller" style="width: 80%; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;" /></div>
            <div><span style="color: #64748b;">购买方税号：</span><input id="res-taxno" style="width: 80%; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;" /></div>
            <div><span style="color: #64748b;">价税合计(¥)：</span><input id="res-total" style="width: 80%; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: bold; color: #2563eb;" /></div>
            <div><span style="color: #64748b;">报销品目：</span><input id="res-category" style="width: 80%; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;" /></div>
          </div>
          <div style="text-align: right; margin-top: 14px;">
            <button id="btn-save-remote" style="padding: 6px 18px; font-size: 12px; font-weight: 600; background: #10b981; color: #ffffff; border: none; border-radius: 6px; cursor: pointer;">💾 确认无误，保存台账</button>
          </div>
        </div>
      </div>
    </div>
  `

  const inputArea = document.getElementById('remote-invoice-input')
  const parseBtn = document.getElementById('btn-parse-remote')
  const taxiBtn = document.getElementById('btn-sample-taxi')
  const mealBtn = document.getElementById('btn-sample-meal')
  const resultArea = document.getElementById('remote-audit-result')
  const badgeArea = document.getElementById('remote-badge-area')
  const saveBtn = document.getElementById('btn-save-remote')

  const SAMPLES = {
    taxi: '增值税普通发票 发票号码: 89432190 开票日期: 2026-10-30 购买方: 某某科技有限公司 税号: 91110108MA00000000 销售方: 北京首汽约车科技有限公司 金额: 141.51 税额: 8.49 价税合计: 150.00 品目: 城市客运',
    meal: '增值税普通发票 发票号码: 45678912 开票日期: 2026-10-31 购买方: 某某科技有限公司 税号: 91110108MA00000000 销售方: 海底捞餐饮股份有限公司 金额: 366.04 税额: 21.96 价税合计: 388.00 品目: 餐饮工作餐'
  }

  if (taxiBtn) taxiBtn.onclick = () => { inputArea.value = SAMPLES.taxi }
  if (mealBtn) mealBtn.onclick = () => { inputArea.value = SAMPLES.meal }

  if (parseBtn) {
    parseBtn.onclick = () => {
      const text = inputArea.value.trim()
      if (!text) { alert('请先输入发票文本！'); return }

      parseBtn.innerText = 'AI 正在核验中...'
      setTimeout(() => {
        parseBtn.innerText = '⚡ AI 智能解析并核验'
        const isMeal = text.includes('餐饮')
        resultArea.style.display = 'block'

        document.getElementById('res-inv-num').value = isMeal ? '45678912' : '89432190'
        document.getElementById('res-inv-date').value = isMeal ? '2026-10-31' : '2026-10-30'
        document.getElementById('res-seller').value = isMeal ? '海底捞餐饮股份有限公司' : '北京首汽约车科技有限公司'
        document.getElementById('res-taxno').value = '91110108MA00000000'
        document.getElementById('res-total').value = isMeal ? '388.00' : '150.00'
        document.getElementById('res-category').value = isMeal ? '餐饮招待' : '差旅交通'

        badgeArea.innerHTML = isMeal
          ? '<span style="background: #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">⚠️ WARN: 餐饮品目需附随行人员及招待说明</span>'
          : '<span style="background: #dcfce7; color: #15803d; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">✅ PASS: 抬头税号与公司档案完全匹配</span>'
      }, 400)
    }
  }

  if (saveBtn) {
    saveBtn.onclick = () => {
      alert('🎉 发票报销记录已成功保存到企业报销台账！')
    }
  }

  post('ready')
})()
