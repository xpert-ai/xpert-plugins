// @ts-nocheck
import { enrichProductWithFallback, getHsBianmaCodeDetail, parseHsBianmaSearchResults } from './trade-compliance.enrichment.js'

describe('enrichProductWithFallback', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('uses HS编码网 HTML search results for product enrichment', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = (async (url, init) => {
      requests.push({ url: String(url), init })
      return new Response(
        `<table class="result"><tr class="result-grid">
          <td><a href="/Code/6104620090.html">6104620090</a></td>
          <td>裤子<span name="insenname-1">Trousers</span></td>
          <td>条/千克</td><td>13%</td><td>A</td><td>M</td><td><a href="/Code/6104620090.html">详情</a></td>
        </tr></table>`,
        { status: 200, headers: { 'content-type': 'text/html' } }
      )
    }) as typeof fetch

    const result = await enrichProductWithFallback(
      {
        productName: '裤子'
      },
      {
        hsbianma: {
          baseUrl: 'https://example.test',
          timeoutMs: 1000
        }
      }
    )

    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('https://example.test/search?keywords=%E8%A3%A4%E5%AD%90&filterFailureCode=true&displayenname=true')
    expect(requests[0].init?.method).toBe('GET')
    expect(result.source).toBe('api')
    expect(result.hsCode).toBe('6104620090')
    expect(result.taxRefundRate).toBe('13%')
    expect(result.englishName).toBe('Trousers')
    expect(result.regulatoryConditions).toBe('A')
    expect(result.inspectionQuarantine).toBe('M')
    expect(result.detailUrl).toBe('https://hsbianma.com/Code/6104620090.html')
  })

  it('returns a real-flow error when HTML search fails', async () => {
    globalThis.fetch = (async () => new Response('method not allowed', { status: 405 })) as typeof fetch

    const result = await enrichProductWithFallback({
      productName: '服务器',
      model: 'HPC-8208'
    })

    expect(result.source).toBe('api')
    expect(result.hsCode).toBeUndefined()
    expect(result.error).toContain('HTTP 405')
  })

  it('parses HS编码网 result table rows', () => {
    const result = parseHsBianmaSearchResults(`
      <table class="result">
        <tr class="result-grid">
          <td><a href="/Code/6209200000.html">6209200000</a></td>
          <td><font>裤子</font><span name="insenname-1">Trousers</span></td>
          <td>千克</td><td>13%</td><td>A</td><td>M</td><td><a href="/Code/6209200000.html">详情</a></td>
        </tr>
      </table>
    `)

    expect(result).toEqual([{
      code: '6209200000',
      name: '裤子',
      englishName: 'Trousers',
      unit: '千克',
      taxRefundRate: '13%',
      regulatoryConditions: 'A',
      inspectionQuarantine: 'M',
      detailUrl: 'https://hsbianma.com/Code/6209200000.html'
    }])
  })

  it('normalizes formatted HS codes from exact-code search rows', () => {
    const result = parseHsBianmaSearchResults(`
      <table class="result">
        <tr class="result-grid">
          <td><font color="red">8471 4120.00</font></td>
          <td>小型自动数据处理设备</td>
          <td>台/千克</td><td>13%</td><td></td><td>L</td><td><a href="/Code/8471412000.html">详情</a></td>
        </tr>
      </table>
    `)

    expect(result).toEqual([{
      code: '8471412000',
      name: '小型自动数据处理设备',
      englishName: undefined,
      unit: '台/千克',
      taxRefundRate: '13%',
      regulatoryConditions: undefined,
      inspectionQuarantine: 'L',
      detailUrl: 'https://hsbianma.com/Code/8471412000.html'
    }])
  })

  it('fetches and parses HS编码网 code detail sections', async () => {
    const requests: string[] = []
    globalThis.fetch = (async (url) => {
      requests.push(String(url))
      return new Response(
        `<html><head><title>4304002000详情</title></head><body>
          <div id="code-info">
            <h3 class="ch3">基本信息</h3>
            <div class="cbox"><table>
              <tr><td class="td-label">商品编码</td><td class="td-txt">4304002000</td></tr>
              <tr><td class="td-label">商品名称</td><td class="td-txt">人造毛皮制品</td></tr>
            </table></div>
            <h3 class="ch3">税率信息</h3>
            <div class="cbox"><table>
              <tr><td class="td-label">出口退税率</td><td class="td-txt">13%</td></tr>
            </table></div>
          </div>
        </body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } }
      )
    }) as typeof fetch

    const detail = await getHsBianmaCodeDetail({ code: '4304002000' }, { baseUrl: 'https://example.test' })

    expect(requests).toEqual(['https://example.test/Code/4304002000.html'])
    expect(detail.code).toBe('4304002000')
    expect(detail.name).toBe('人造毛皮制品')
    expect(detail.sourceUrl).toBe('https://example.test/Code/4304002000.html')
    expect(detail.sections).toEqual([
      {
        title: '基本信息',
        rows: [
          { label: '商品编码', value: '4304002000' },
          { label: '商品名称', value: '人造毛皮制品' }
        ]
      },
      {
        title: '税率信息',
        rows: [
          { label: '出口退税率', value: '13%' }
        ]
      }
    ])
  })
})
