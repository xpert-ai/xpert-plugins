const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildHotelPackage } = require('./hotel-package.cjs')
const { exploreCatalog, exploreResources } = require('../dist/lib/explore-catalog.js')
const { resourceV2Schema } = require('../dist/lib/library/resource-contract.js')
const { reference, validatePackage } = require('../dist/lib/library/archive.js')
const { sha256 } = require('../dist/lib/library/resource-json.js')

// Offline authoring only. The plugin never imports this module or seeds a database on view/use.
const authoredRoles = {
  orders: { order_id: 'identifier', order_date: 'time', user_id: 'dimension', category_l1: 'dimension', category_l2: 'dimension', category_l3: 'dimension', quantity: 'measure', currency: 'dimension', original_amount: 'measure', discount_amount: 'measure', paid_amount: 'measure', discount_type: 'dimension', payment_method: 'dimension' },
  weather: { alert_id: 'identifier', issued_date: 'time', province: 'dimension', city: 'dimension', latitude: 'measure', longitude: 'measure', hazard: 'dimension', level: 'dimension', issuing_authority: 'dimension' }
}
const datasetKind = { 'category-contribution': 'orders', 'ecommerce-operations': 'orders', 'order-promotion': 'orders', 'weather-alerts': 'weather' }
function buildExplorePackage() {
  const hotel = buildHotelPackage(), blobs = new Map(hotel.blobs), resources = hotel.resources.filter(r => r.kind !== 'example-task'), roots = []
  const dataLicense = { identifier: 'CC0-1.0', attribution: 'Xpert generated synthetic demonstration data' }
  const license = { identifier: 'AGPL-3.0-only', attribution: 'Xpert authored demonstration tasks and locally redesigned covers; see repository LICENSE' }
  for (const entry of exploreCatalog) {
    const old = exploreResources(entry.key), oldTask = old.at(-1)
    let task
    if (entry.key === 'hotel-operations') {
      // Add portable artwork/requirements as a new version; never alter the earlier 2.0.0 hash.
      task = { ...hotel.resources.find(r => r.kind === 'example-task'), version: '2.1.0' }
    } else {
      let dataset = entry.key === 'hotel-cancellation' ? resources.find(r => r.kind === 'public-dataset') : undefined
      if (datasetKind[entry.key]) {
        const source = old.find(r => r.kind === 'public-dataset')
        dataset = resources.find(r => r.logicalId === source.logicalId)
        if (!dataset) {
          const bytes = Buffer.from(JSON.stringify(source.content.rows))
          const asset = { id: 'data', sha256: sha256(bytes), size: bytes.length, mimeType: 'application/json', fileName: `${datasetKind[entry.key]}.json`, purpose: 'data', license: dataLicense }
          dataset = resourceV2Schema.parse({ schema: 'xpert.library.resource', formatVersion: 2, logicalId: source.logicalId, version: '2.0.0', kind: 'public-dataset',
            title: source.title, description: source.description, locale: 'zh-Hans', categories: ['demo'], tags: [], license: dataLicense,
            provenance: { kind: 'synthetic', description: source.description }, dependencies: [], assets: [asset],
            content: { dataAssetId: asset.id, format: 'json', readerOptions: { encoding: 'utf-8', rowsPath: [] }, statistics: { rowCount: source.content.rows.length },
              columns: source.content.columns.map(column => ({ key: column.key, label: column.label, logicalType: { string: 'string', number: 'float64', date: 'date', boolean: 'boolean' }[column.type], nullable: column.nullable, role: authoredRoles[datasetKind[entry.key]][column.key] })) } })
          if (dataset.content.columns.some(column => !column.role)) throw Error('AUTHORED_FIELD_ROLE_REQUIRED')
          resources.push(dataset); blobs.set(asset.sha256, bytes)
        }
      }
      task = { schema: 'xpert.library.resource', formatVersion: 2, logicalId: oldTask.logicalId, version: '2.0.0', kind: 'example-task',
        title: entry.title, description: entry.description, locale: 'zh-Hans', categories: ['insights'], tags: [], license,
        provenance: { kind: 'user-provided', description: 'Xpert demonstration task. External data/tools must be obtained and verified at execution time.' }, assets: [],
        dependencies: dataset ? [{ ...reference(dataset), kind: dataset.kind, alias: 'data' }] : [],
        content: { prompt: `${entry.question}\n\n${dataset ? '附带数据为确定性合成示例，仅供演示，不代表真实经营或气象预警。' : '先核实所需外部数据和工具是否可用；不可用时明确说明，不编造数据。'}\n只创建草稿。`,
          execution: { mode: 'agent' }, dataAliases: dataset ? ['data'] : [], requirements: { skills: entry.skills.map(name => ({ name, required: true })), plugins: [], capabilities: [] } } }
    }
    const bytes = readFileSync(join(__dirname, '../assets/explore', `${entry.key}.webp`))
    const cover = { id: 'cover', sha256: sha256(bytes), size: bytes.length, mimeType: 'image/webp', fileName: `${entry.key}.webp`, purpose: 'cover', license }
    task = resourceV2Schema.parse({ ...task, catalogKey: entry.key, presentation: { coverAssetId: cover.id }, assets: [...task.assets, cover],
      content: { ...task.content, dataRequirement: { mode: entry.dataMode, tools: entry.requirements } } })
    blobs.set(cover.sha256, bytes); resources.push(task); roots.push(reference(task))
  }
  const result = { roots, resources, blobs }; validatePackage(result); return result
}
module.exports = { buildExplorePackage }
