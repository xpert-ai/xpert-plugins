// Use Univer's CJS entry on Node: its ESM renderer imports a CJS-only opentype named export.
const { Univer } = require('@univerjs/core')
const { FUniver } = require('@univerjs/core/facade')
const { UniverFormulaEnginePlugin } = require('@univerjs/engine-formula')
const { UniverSheetsPlugin } = require('@univerjs/sheets')
const { UniverSheetsFormulaPlugin } = require('@univerjs/sheets-formula')
require('@univerjs/engine-formula/facade')
require('@univerjs/sheets/facade')
require('@univerjs/sheets-formula/facade')

exports.calculate = async function (snapshot) {
  const univer = new Univer()
  try {
    univer.registerPlugin(UniverFormulaEnginePlugin)
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsFormulaPlugin, { initialFormulaComputing: 0 })
    const api = FUniver.newAPI(univer)
    const workbook = api.createWorkbook(snapshot)
    const formula = api.getFormula()
    const applied = formula.onCalculationResultApplied(20000)
    formula.executeCalculation()
    await applied
    return workbook.save()
  } finally { univer.dispose() }
}
