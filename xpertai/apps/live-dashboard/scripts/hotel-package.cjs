const { hotelSeed } = require("../dist/lib/hotel-template.js");
const { hotelDocument } = require("../dist/lib/hotel-document.js");
const { resourceV2Schema } = require("../dist/lib/library/resource-contract.js");
const { reference, validatePackage } = require("../dist/lib/library/archive.js");
const { sha256 } = require("../dist/lib/library/resource-json.js");
/** Offline content authoring only: no runtime seed, automatic installation or public publication. */
function buildHotelPackage() {
    const legacy = hotelSeed(), source = legacy.find(document => document.kind === 'public-dataset');
    if (source.kind !== 'public-dataset')
        throw new Error('HOTEL_DATASET_REQUIRED');
    const license = { identifier: 'AGPL-3.0-only', attribution: 'Xpert authored hotel template; see the repository LICENSE' };
    const dataLicense = { identifier: 'CC0-1.0', attribution: 'Xpert generated synthetic demonstration data' };
    const data = Buffer.from(JSON.stringify(source.content.rows)), html = Buffer.from(hotelDocument('酒店经营分析', {}, 'EUR', true, 'bookings'));
    const file = (id, bytes, mimeType, fileName, purpose) => ({ id, sha256: sha256(bytes), size: bytes.length, mimeType, fileName, purpose, license });
    const dataFile = { ...file('bookings', data, 'application/json', 'hotel-bookings.json', 'data'), license: dataLicense }, documentFile = file('document', html, 'text/html', 'hotel.html', 'document');
    const type = { string: 'string', number: 'float64', date: 'date', boolean: 'boolean' };
    // Explicit authored Analytics roles; never inferred by runtime from display names or sample values.
    const roles = { booking_id: 'identifier', arrival_date: 'time', is_cancelled: 'dimension', adr: 'measure', nights: 'measure',
        hotel: 'dimension', channel: 'dimension', lead_time: 'measure', deposit_type: 'dimension', country: 'dimension', reserved_room: 'dimension', assigned_room: 'dimension' };
    const columns = source.content.columns.map(column => ({ key: column.key, label: column.label, logicalType: type[column.type], nullable: column.nullable, role: roles[column.key] }));
    const header = { schema: 'xpert.library.resource', formatVersion: 2, version: '2.0.0', locale: 'zh-CN', categories: ['hospitality'], tags: ['酒店', '经营分析'],
        license, provenance: { kind: 'synthetic', description: '720 条确定性合成预订，用于演示和迁移验证，不代表真实经营。' }, dependencies: [], assets: [] };
    const dataset = resourceV2Schema.parse({ ...header, logicalId: source.logicalId, kind: 'public-dataset', title: source.title,
        description: source.description, license: dataLicense, assets: [dataFile], content: { dataAssetId: dataFile.id, format: 'json', readerOptions: { encoding: 'utf-8', rowsPath: [] },
            columns, statistics: { rowCount: source.content.rows.length } } });
    const template = resourceV2Schema.parse({ ...header, logicalId: legacy.find(item => item.kind === 'analysis-template').logicalId,
        kind: 'analysis-template', title: '酒店经营分析', description: '预订趋势、取消风险、渠道结构与房费估算。房费估算并非实际收入。', assets: [documentFile],
        content: { inputSlots: [{ key: 'bookings', grain: ['booking_id'], fields: columns.map(column => ({ role: column.key, label: column.label,
                        logicalType: column.logicalType, nullable: false, required: ['booking_id', 'arrival_date', 'is_cancelled'].includes(column.key) })) }], parameters: [],
            metrics: [{ key: 'cancellationRate', label: '取消率', unit: '%', definition: '取消预订数 / 取消状态已知的预订数；未知状态不进入分母。' },
                { key: 'roomValue', label: '未取消预订房费估算', unit: 'EUR', definition: '未取消预订 ADR × 预订晚数之和；缺少有效 ADR/晚数时不计算，不代表实际收入。' }],
            presentation: { type: 'html', documentAssetId: documentFile.id }, requirements: { skills: [{ name: 'live-dashboard', required: true }], plugins: [], capabilities: ['platform.analytics'] } } });
    const theme = resourceV2Schema.parse({ ...header, logicalId: legacy.find(item => item.kind === 'visual-theme').logicalId,
        kind: 'visual-theme', title: '清晰商务', description: '跟随系统外观', content: { renderer: 'live-dashboard.standard', theme: 'system' } });
    const task = resourceV2Schema.parse({ ...header, logicalId: legacy.find(item => item.kind === 'example-task').logicalId,
        kind: 'example-task', catalogKey: 'hotel-operations', title: '酒店经营分析', description: '从预订与取消记录识别渠道、提前预订和押金差异。',
        dependencies: [dataset, template, theme].map((item, index) => ({ ...reference(item), kind: item.kind, alias: ['data', 'analysis', 'theme'][index] })),
        content: { prompt: '请根据附带的任务配方生成酒店经营分析看板，展示预订趋势、取消率、渠道、提前预订、押金、国家与房型变更。数据为合成示例，仅用于演示。房费估算不等于实际收入，不将相关性解释为因果。只创建草稿。',
            execution: { mode: 'template', templateAlias: 'analysis' }, dataAliases: ['data'], themeAlias: 'theme',
            inputBindings: [{ slot: 'bookings', dataAlias: 'data', mapping: Object.fromEntries(columns.map(column => [column.key, column.key])) }],
            requirements: { skills: [{ name: 'live-dashboard', required: true }], plugins: [], capabilities: ['platform.analytics'] } } });
    const resources = [dataset, template, theme, task];
    const result = { roots: [reference(task)], resources, blobs: new Map([[dataFile.sha256, data], [documentFile.sha256, html]]) };
    validatePackage(result);
    return result;
}
module.exports = { buildHotelPackage };
