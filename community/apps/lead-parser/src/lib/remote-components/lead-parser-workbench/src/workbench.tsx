import React, { useCallback, useEffect, useState } from 'react'
import { executeAction, notify, reportResize, requestData } from './bridge'

interface ParsedLead {
  name: string | null
  company: string | null
  intent: string | null
  budget: number | null
}

interface SavedLead extends ParsedLead {
  id: string
  sourceText: string
  createdAt: string
}

interface ActionResult {
  success?: boolean
  message?: { zh_Hans?: string; en_US?: string } | string
  data?: unknown
}

function messageText(message: ActionResult['message']): string {
  if (!message) return ''
  if (typeof message === 'string') return message
  return message.zh_Hans ?? message.en_US ?? ''
}

const FIELDS: Array<{ key: keyof ParsedLead; label: string }> = [
  { key: 'name', label: '姓名' },
  { key: 'company', label: '公司' },
  { key: 'intent', label: '意向' },
  { key: 'budget', label: '预算（万元）' }
]

export function Workbench() {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedLead | null>(null)
  const [saved, setSaved] = useState<SavedLead[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadSaved = useCallback(async () => {
    try {
      const res = await requestData({})
      const list = (res as { data?: { items?: SavedLead[] } }).data?.items
      if (Array.isArray(list)) setSaved(list)
    } catch {
      // 初始数据加载失败不阻塞主流程
    }
  }, [])

  useEffect(() => {
    loadSaved()
  }, [loadSaved])

  useEffect(() => {
    reportResize()
  }, [parsed, saved, saveError])

  const handleParse = async () => {
    if (!text.trim() || parsing) return
    setParsing(true)
    setSaveError(null)
    try {
      const res = (await executeAction('parse', null, { text: text.trim() })) as ActionResult
      if (res.success === false) {
        notify(messageText(res.message) || '解析失败', 'error')
        return
      }
      setParsed((res.data ?? null) as ParsedLead | null)
      notify(messageText(res.message) || '解析完成', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '解析失败', 'error')
    } finally {
      setParsing(false)
    }
  }

  const handleSave = async () => {
    if (!parsed || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = (await executeAction('save', null, { text: text.trim(), lead: parsed })) as ActionResult
      if (res.success === false) {
        setSaveError(messageText(res.message) || '保存失败')
        return
      }
      notify(messageText(res.message) || '线索已保存', 'success')
      setParsed(null)
      setText('')
      await loadSaved()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lp-shell">
      <header className="lp-header">
        <h2>线索解析工作台</h2>
        <p>粘贴一段销售线索原文，AI 提取结构化字段，确认后保存。</p>
      </header>

      <textarea
        className="lp-input"
        placeholder="例如：XX汽车零部件公司的李总想做新能源产线方案，预算大概80万"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
      />

      <div className="lp-actions">
        <button className="lp-btn lp-btn-primary" disabled={!text.trim() || parsing} onClick={handleParse}>
          {parsing ? '解析中…' : 'AI 解析'}
        </button>
      </div>

      {parsed && (
        <section className="lp-result">
          <h3>解析结果</h3>
          <dl>
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="lp-field">
                <dt>{label}</dt>
                <dd>{parsed[key] ?? <span className="lp-empty">未识别</span>}</dd>
              </div>
            ))}
          </dl>
          <div className="lp-actions">
            <button className="lp-btn lp-btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? '保存中…' : '保存线索'}
            </button>
          </div>
        </section>
      )}

      {saveError && (
        <div className="lp-toast lp-toast-error" role="alert">
          <span>{saveError}</span>
          <button className="lp-btn lp-btn-retry" disabled={saving} onClick={handleSave}>
            重试
          </button>
        </div>
      )}

      {saved.length > 0 && (
        <section className="lp-saved">
          <h3>已保存线索（{saved.length}）</h3>
          <ul>
            {saved.map((item) => (
              <li key={item.id}>
                <strong>{item.company ?? item.name ?? item.id}</strong>
                <span>{item.intent ?? ''}</span>
                {item.budget != null && <em>{item.budget} 万</em>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
