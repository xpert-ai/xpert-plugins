export async function validateDocument(input, browser, hostPath) {
const errors = [], addError = value => { const message = String(value).slice(0, 300); if (errors.length < 16 && !errors.includes(message)) errors.push(message) }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', route => route.abort('blockedbyclient'))
  page.on('pageerror', error => addError(error.message))
  page.on('console', message => { if (message.type() === 'error') addError(message.text()) })
  await page.setContent('<!doctype html><html><head></head><body><iframe style="width:100%;height:850px"></iframe></body></html>')
  await page.addScriptTag({ path: hostPath })
  await page.evaluate(input => {
    window.validation = { errors: [], requestedBindings: [] }
    DocumentHost.installArtifactDocumentFramePolicy(document)
    window.documentHost = DocumentHost.mountArtifactDocument(document.querySelector('iframe'), {
      html: input.html, context: input.context, dependencies: input.dependencies ?? [],
      query: async request => {
        window.validation.requestedBindings.push(request.bindingId)
        if (!input.datasets[request.bindingId]) throw Error('DOCUMENT_BINDING_DENIED')
        if (Object.keys(request.controls).length !== Object.keys(input.context.defaults).length || Object.entries(input.context.defaults).some(([key, value]) => request.controls[key] !== value)) throw Error('DOCUMENT_INITIAL_CONTROLS_MISMATCH')
        return input.datasets[request.bindingId]
      }, onError: code => window.validation.errors.push(code)
    })
  }, input)
  await page.waitForFunction(() => window.validation.requestedBindings.length || window.validation.errors.length, null, { timeout: 8000 }).catch(() => addError('DOCUMENT_INITIAL_QUERY_MISSING'))
  await page.waitForTimeout(500)
  const state = await page.evaluate(() => window.validation)
  state.errors.forEach(addError)
  const frame = page.frames().find(frame => frame !== page.mainFrame())
  const renderedTextLength = frame ? (await frame.locator('body').innerText()).trim().length : 0
  if (!renderedTextLength) addError('DOCUMENT_EMPTY_PAGE')
  if (!state.requestedBindings.length) addError('DOCUMENT_INITIAL_QUERY_MISSING')
  await context.close()
  return { ok: !errors.length, errors, requestedBindings: [...new Set(state.requestedBindings)], renderedTextLength }
}
