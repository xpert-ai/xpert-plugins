import {
  baiduOcrServerType,
  paddleOcrBaseUrl,
  resolveBaiduParseOptions,
  validateBaiduIntegration
} from './parse-options.js'

describe('Baidu OCR integration compatibility', () => {
  it('keeps legacy credentials on the official service with the original defaults', () => {
    const options = { apiKey: 'key', secretKey: 'secret' }
    expect(baiduOcrServerType(options)).toBe('official')
    expect(() => validateBaiduIntegration(options)).not.toThrow()
    expect(resolveBaiduParseOptions({}, options)).toEqual({
      analysisChart: false,
      mergeTables: true,
      relevelTitles: true,
      recognizeSeal: false,
      returnSpanBoxes: true,
      preserveRawOutput: true,
      preserveImages: true
    })
  })

  it('uses integration options for new documents while retaining explicit legacy false overrides', () => {
    expect(
      resolveBaiduParseOptions(
        { recognizeSeal: false, mergeTables: false },
        {
          recognizeSeal: true,
          mergeTables: true,
          analysisChart: true,
          preserveRawOutput: false
        }
      )
    ).toMatchObject({ recognizeSeal: false, mergeTables: false, analysisChart: true, preserveRawOutput: false })
  })

  it('requires official credentials and a self-hosted URL only in their respective modes', () => {
    expect(() => validateBaiduIntegration({})).toThrow('API Key and Secret Key')
    expect(() => validateBaiduIntegration({ serverType: 'self-hosted' })).toThrow('service URL is required')
    expect(() => validateBaiduIntegration({ serverType: 'self-hosted', apiUrl: 'http://paddleocr:8080' })).not.toThrow()
  })

  it.each(['ftp://paddleocr', 'http://user:secret@paddleocr', 'http://paddleocr?token=secret', 'invalid'])(
    'rejects an invalid endpoint: %s',
    (apiUrl) => {
      expect(() => paddleOcrBaseUrl({ apiUrl })).toThrow('HTTP')
    }
  )

  it('keeps Unlimited-OCR official-only', () => {
    expect(() =>
      validateBaiduIntegration({ serverType: 'self-hosted', apiUrl: 'http://paddleocr:8080' }, 'unlimited-ocr')
    ).toThrow('only supports the official')
  })
})
