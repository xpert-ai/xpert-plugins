export async function validateDocument(input, browser, hostPath) {
const errors = [], addError = value => { const message = String(value).slice(0, 300); if (errors.length < 16 && !errors.includes(message)) errors.push(message) }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  try {
  const page = await context.newPage()
  await page.route('**/*', route => route.abort('blockedbyclient'))
  page.on('pageerror', error => addError(error.message))
  page.on('console', message => { if (message.type() === 'error') addError(message.text()) })
  await page.setContent('<!doctype html><html><head></head><body><iframe style="width:100%;height:850px"></iframe></body></html>')
  await page.addScriptTag({ path: hostPath })
  await page.evaluate(input => {
    window.validation = { errors: [], requestedBindings: [] }
    const initialized = new Set()
    DocumentHost.installArtifactDocumentFramePolicy(document)
    window.documentHost = DocumentHost.mountArtifactDocument(document.querySelector('iframe'), {
      html: input.html, context: input.context, dependencies: input.dependencies ?? [],
      query: async request => {
        window.validation.requestedBindings.push(request.bindingId)
        if (!input.datasets[request.bindingId]) {
          window.validation.errors.push('DOCUMENT_BINDING_DENIED')
          throw Error('DOCUMENT_BINDING_DENIED')
        }
        // The document SDK sends page-wide controls; the backend selects parameters per Binding.
        const allParameters = input.parameters ? Object.values(input.parameters).flat() : undefined
        const parameters = input.parameters?.[request.bindingId]
        const defaults = input.context.defaults
        if (!initialized.has(request.bindingId) && (Object.keys(request.controls).length !== Object.keys(defaults).length || Object.entries(defaults).some(([key, value]) => request.controls[key] !== value))) {
          window.validation.errors.push('DOCUMENT_INITIAL_CONTROLS_MISMATCH: initial query controls must match saved controls.defaultValue, including null')
          throw Error('DOCUMENT_INITIAL_CONTROLS_MISMATCH')
        }
        if (allParameters && (!parameters || Object.keys(request.controls).some(key => !allParameters.some(parameter => parameter.controlId === key)) || parameters.some(parameter => {
          // Match platform resolveAnalyticsParameters: missing values use the Binding default,
          // optional null bypasses the scalar allowlist, and only this Binding is evaluated.
          const value = Object.hasOwn(request.controls, parameter.controlId) ? request.controls[parameter.controlId] : parameter.defaultValue
          if (value == null) return parameter.required
          const valid = parameter.type === 'date'
            ? typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
            : typeof value === parameter.type && (typeof value !== 'number' || Number.isFinite(value))
          return !valid || parameter.allowedValues && !parameter.allowedValues.includes(value)
        }))) {
          window.validation.errors.push('DOCUMENT_CONTROL_VALUE_INVALID: select values must match Binding parameter types and allowedValues; fixed enums must not use Dataset fields as options')
          throw Error('DOCUMENT_CONTROL_VALUE_INVALID')
        }
        initialized.add(request.bindingId)
        return input.datasets[request.bindingId]
      }, onError: code => window.validation.errors.push(code)
    })
  }, input)
  await page.waitForFunction(() => window.validation.requestedBindings.length || window.validation.errors.length, null, { timeout: 8000 }).catch(() => addError('DOCUMENT_INITIAL_QUERY_MISSING'))
  await page.waitForTimeout(500)
  const frame = page.frames().find(frame => frame !== page.mainFrame())
  // Exercise bounded native selects against the saved parameter contract; data remains the real default preview.
  // This detects invalid filter wiring, not the upstream effect of a filter or arbitrary custom controls.
  if (frame && input.parameters) {
    const selects = frame.locator('select')
    for (let index = 0; index < Math.min(await selects.count(), 24); index++) {
      const select = selects.nth(index)
      if (!(await select.isVisible()) || !(await select.isEnabled())) continue
      const original = await select.inputValue()
      const values = await select.locator('option').evaluateAll(options => options.filter(option => !option.matches(':disabled')).map(option => option.value))
      const alternatives = [...new Set(values)].filter(value => value !== original).slice(0, 3)
      if (!alternatives.length) continue
      for (const value of alternatives) {
        await select.selectOption(value, { timeout: 1000 }).catch(() => addError('DOCUMENT_SELECT_INTERACTION_FAILED'))
        await page.waitForTimeout(75)
      }
      await select.selectOption(original, { timeout: 1000 }).catch(() => addError('DOCUMENT_SELECT_RESTORE_FAILED'))
    }
    await page.waitForTimeout(150)
  }
  const state = await page.evaluate(() => window.validation)
  state.errors.forEach(addError)
  const renderedTextLength = frame ? (await frame.locator('body').innerText()).trim().length : 0
  if (!renderedTextLength) addError('DOCUMENT_EMPTY_PAGE')
  if (!state.requestedBindings.length) addError('DOCUMENT_INITIAL_QUERY_MISSING')
  return { ok: !errors.length, errors, requestedBindings: [...new Set(state.requestedBindings)], renderedTextLength }
  } finally { await context.close() }
}
