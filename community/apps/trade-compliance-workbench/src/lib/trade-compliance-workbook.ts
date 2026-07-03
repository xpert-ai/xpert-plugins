// @ts-nocheck
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
const SHEET_NAMES = ['报关单', 'CI', 'Contract', 'PL'];
export const CUSTOMS_WORKBOOK_XLS_MIME_TYPE = 'application/vnd.ms-excel';
export const CUSTOMS_WORKBOOK_XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function buildCustomsWorkbookModel(source, defaults) {
    return {
        ...source,
        invoiceNo: source.invoiceNo ?? buildInvoiceNo(),
        sellerEnglishName: source.sellerEnglishName ?? defaults.sellerEnglishName,
        sellerEnglishAddress: source.sellerEnglishAddress ?? defaults.sellerEnglishAddress,
        paymentTerm: source.paymentTerm ?? defaults.paymentTerm,
        tradeTerm: source.tradeTerm ?? defaults.tradeTerm,
        origin: source.origin ?? defaults.origin,
        destination: source.destination ?? defaults.destination,
        packageType: source.packageType ?? defaults.packageType,
        supervisionMode: source.supervisionMode ?? defaults.supervisionMode,
        taxExemptionNature: source.taxExemptionNature ?? defaults.taxExemptionNature,
        domesticSourceLocation: source.domesticSourceLocation ?? defaults.domesticSourceLocation,
        bankBeneficiary: source.bankBeneficiary ?? defaults.bankBeneficiary,
        bankName: source.bankName ?? defaults.bankName,
        bankAddress: source.bankAddress ?? defaults.bankAddress,
        bankAccountNo: source.bankAccountNo ?? defaults.bankAccountNo,
        cnapsCode: source.cnapsCode ?? defaults.cnapsCode,
        swiftCode: source.swiftCode ?? defaults.swiftCode,
        exchangeRate: source.exchangeRate ?? defaults.exchangeRate,
        items: source.items ?? []
    };
}
export function createCustomsWorkbookBuffer(model) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildDeclarationRows(model)), SHEET_NAMES[0]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildCommercialInvoiceRows(model)), SHEET_NAMES[1]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildSalesContractRows(model)), SHEET_NAMES[2]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildPackingListRows(model)), SHEET_NAMES[3]);
    return {
        fileName: `${sanitizeFilePart(model.invoiceNo)}-customs-workbook.xlsx`,
        sheetNames: [...SHEET_NAMES],
        mimeType: CUSTOMS_WORKBOOK_XLSX_MIME_TYPE,
        bookType: 'xlsx',
        buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    };
}
export function createCustomsWorkbookFromTemplateBuffer(model, _templateBuffer) {
    return createStyledCustomsWorkbook(model);
}
export async function createStyledCustomsWorkbook(model) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Trade Compliance Workbench';
    workbook.created = new Date();
    workbook.modified = new Date();
    buildDeclarationWorksheet(workbook.addWorksheet('报关单'), model);
    buildInvoiceWorksheet(workbook.addWorksheet('CI'), model, 'Commercial Invoice');
    buildInvoiceWorksheet(workbook.addWorksheet('Contract'), model, 'Sales Contract');
    buildPackingListWorksheet(workbook.addWorksheet('PL'), model);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
        fileName: buildCustomsWorkbookTemplateFileName(model.invoiceNo),
        sheetNames: [...SHEET_NAMES],
        mimeType: CUSTOMS_WORKBOOK_XLSX_MIME_TYPE,
        bookType: 'xlsx',
        buffer
    };
}
export function buildCustomsWorkbookTemplateFileName(invoiceNo) {
    return `${sanitizeFilePart(invoiceNo)}-销售发票.xlsx`;
}
export function readCustomsWorkbookTemplateSheetNames(templateBuffer) {
    return XLSX.read(templateBuffer, { type: 'buffer', bookSheets: true }).SheetNames;
}
const thinBorder = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
};
const baseFont = { name: 'Arial', size: 12, color: { argb: 'FF000000' } };
const boldFont = { ...baseFont, bold: true };
const titleFont = { name: 'Arial', size: 22, bold: true, color: { argb: 'FF000000' } };
const logoFont = { name: 'Arial', size: 18, bold: true, italic: true, color: { argb: 'FF00A8E8' } };
const centerMiddle = { vertical: 'middle', horizontal: 'center', wrapText: true };
const leftMiddle = { vertical: 'middle', horizontal: 'left', wrapText: true };
const rightMiddle = { vertical: 'middle', horizontal: 'right', wrapText: true };
const tableHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF808080' } };
const whiteBoldFont = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
function setColumns(sheet, widths) {
    sheet.columns = widths.map((width) => ({ width }));
}
function mergeRanges(sheet, ranges) {
    for (const range of ranges)
        sheet.mergeCells(range);
}
function put(sheet, address, value, options = {}) {
    const cell = sheet.getCell(address);
    if (value !== undefined && value !== null && value !== '') {
        cell.value = typeof value === 'object' ? JSON.stringify(value) : value;
    }
    cell.font = options.font ?? cell.font ?? baseFont;
    cell.alignment = options.alignment ?? cell.alignment ?? leftMiddle;
    if (options.numFmt)
        cell.numFmt = options.numFmt;
    if (options.fill)
        cell.fill = options.fill;
    if (options.border)
        cell.border = options.border;
}
function applyGrid(sheet, range) {
    const [start, end] = range.split(':');
    const startCell = decodeAddress(start);
    const endCell = decodeAddress(end);
    for (let row = startCell.row; row <= endCell.row; row += 1) {
        for (let col = startCell.col; col <= endCell.col; col += 1) {
            const cell = sheet.getCell(row, col);
            cell.border = thinBorder;
            cell.font = cell.font && Object.keys(cell.font).length ? cell.font : baseFont;
            cell.alignment = cell.alignment && Object.keys(cell.alignment).length ? cell.alignment : leftMiddle;
        }
    }
}
function decodeAddress(address) {
    const match = /^([A-Z]+)(\d+)$/.exec(address);
    if (!match)
        throw new Error(`Invalid cell address: ${address}`);
    return { col: columnIndex(match[1]), row: Number(match[2]) };
}
function columnIndex(name) {
    return name.split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}
function columnName(index) {
    let name = '';
    let value = index;
    while (value > 0) {
        const remainder = (value - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        value = Math.floor((value - 1) / 26);
    }
    return name;
}
function applyTableStyle(sheet, range, headerRow) {
    const [start, end] = range.split(':');
    const startCell = decodeAddress(start);
    const endCell = decodeAddress(end);
    for (let row = startCell.row; row <= endCell.row; row += 1) {
        for (let col = startCell.col; col <= endCell.col; col += 1) {
            const cell = sheet.getCell(row, col);
            cell.border = thinBorder;
            cell.font = cell.font && Object.keys(cell.font).length ? cell.font : baseFont;
            cell.alignment = cell.alignment && Object.keys(cell.alignment).length ? cell.alignment : centerMiddle;
            if (headerRow && row === headerRow) {
                cell.fill = tableHeaderFill;
                cell.font = whiteBoldFont;
                cell.alignment = centerMiddle;
            }
        }
    }
}
function templateSellerAddress(model) {
    return cleanPlaceholder(model.sellerEnglishAddress) ??
        'Room602,Building16,No.A3,4thIndustrial Zone,Heshuikou Community,Matian Street,Guangming District,Shenzhen,Guangdong';
}
function templateSellerName(model) {
    return cleanPlaceholder(model.sellerEnglishName) ?? cleanPlaceholder(model.sellerName) ?? 'Yuneec Technology(Shenzhen)Co.,Ltd';
}
function cleanPlaceholder(value) {
    const text = stringValue(value)?.trim();
    return text && text !== '未识别' ? text : undefined;
}
function descriptionRowHeight(item) {
    const text = [item.description, item.model].filter(Boolean).join('\n');
    const lineCount = text.split(/\r?\n|\/\s*/).filter(Boolean).length;
    return Math.max(54, Math.min(190, lineCount * 18));
}
function declarationDetailText(item) {
    const productName = normalizeComparableText(item.productName);
    const englishName = normalizeComparableText(item.englishName);
    return [item.description, item.model]
        .map((value) => stringValue(value)?.trim())
        .filter((value) => {
        const normalized = normalizeComparableText(value);
        return normalized && normalized !== productName && normalized !== englishName;
    })
        .join('\n');
}
function normalizeComparableText(value) {
    return stringValue(value)?.replace(/\s+/g, '').toLowerCase();
}
function formatQuantityUnit(item) {
    const quantity = item.quantity ?? '';
    const unit = item.unit ?? '';
    return [quantity, unit].filter((value) => value !== undefined && value !== null && value !== '').join(' ');
}
function buildDeclarationWorksheet(sheet, model) {
    sheet.views = [{ showGridLines: false }];
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    setColumns(sheet, [15, 16, 54, 14, 14, 14, 18, 12, 14, 14, 13, 10]);
    for (let row = 1; row <= 24; row += 1)
        sheet.getRow(row).height = 22;
    sheet.getRow(14).height = 28;
    sheet.getRow(15).height = 42;
    sheet.getRow(16).height = 28;
    sheet.getRow(17).height = 42;
    mergeRanges(sheet, ['B3:C3', 'I3:J3', 'B4:E4', 'G4:H4', 'I4:J4', 'B5:E5', 'G5:H5', 'I5:J5', 'B6:E6', 'G6:H6', 'I6:J6', 'B7:C7', 'E7:F7', 'H7:I7', 'K7:L7', 'A9:C9', 'F20:J20', 'H21:J21']);
    put(sheet, 'A3', '预录入编号：', { font: boldFont });
    put(sheet, 'C3', '海关编号：', { font: boldFont });
    put(sheet, 'K3', '页码/页数：', { font: boldFont });
    put(sheet, 'A4', '境内发货人', { font: boldFont });
    put(sheet, 'B4', model.sellerName ?? model.sellerEnglishName);
    put(sheet, 'F4', '出境关别', { font: boldFont });
    put(sheet, 'H4', '出口日期', { font: boldFont });
    put(sheet, 'J4', '申报日期', { font: boldFont });
    put(sheet, 'K4', '备案号', { font: boldFont });
    put(sheet, 'A5', '境外收货人', { font: boldFont });
    put(sheet, 'B5', model.buyerName);
    put(sheet, 'F5', '运输方式', { font: boldFont });
    put(sheet, 'H5', '运输工具名称及航次号', { font: boldFont });
    put(sheet, 'J5', '提运单号', { font: boldFont });
    put(sheet, 'A6', '生产销售单位', { font: boldFont });
    put(sheet, 'B6', model.sellerName ?? model.sellerEnglishName);
    put(sheet, 'F6', '监管方式', { font: boldFont });
    put(sheet, 'G6', model.supervisionMode);
    put(sheet, 'H6', '征免性质', { font: boldFont });
    put(sheet, 'I6', model.taxExemptionNature);
    put(sheet, 'J6', '许可证号', { font: boldFont });
    put(sheet, 'A7', '合同协议号', { font: boldFont });
    put(sheet, 'B7', model.contractNo);
    put(sheet, 'D7', '贸易国（地区）', { font: boldFont });
    put(sheet, 'F7', '运抵国（地区）', { font: boldFont });
    put(sheet, 'G7', model.destination);
    put(sheet, 'H7', '指运港', { font: boldFont });
    put(sheet, 'J7', '离境口岸', { font: boldFont });
    put(sheet, 'A8', '包装种类', { font: boldFont });
    put(sheet, 'B8', '件数', { font: boldFont });
    put(sheet, 'D8', '毛重（千克）', { font: boldFont });
    put(sheet, 'E8', '净重（千克）', { font: boldFont });
    put(sheet, 'F8', '成交方式', { font: boldFont });
    put(sheet, 'G8', '运费', { font: boldFont });
    put(sheet, 'H8', '保费', { font: boldFont });
    put(sheet, 'I8', '杂费', { font: boldFont });
    put(sheet, 'A9', model.packageType);
    put(sheet, 'D9', sum(model.items, 'grossWeight') || readNumber(model, 'grossWeight'));
    put(sheet, 'E9', sum(model.items, 'netWeight') || readNumber(model, 'netWeight'));
    put(sheet, 'F9', model.tradeTerm);
    put(sheet, 'K9', readNumber(model, 'freight'));
    put(sheet, 'A10', '随附单证及编号', { font: boldFont });
    put(sheet, 'A11', '标记唛码及备注', { font: boldFont });
    put(sheet, 'A12', 'N/M', { font: boldFont });
    const headers = ['项号', '商品编号', '商品名称及规格型号', '数量及单位', '单价', '总价', '币制', '原产国（地区）', '最终目的国', '境内货源地', '征免'];
    headers.forEach((header, index) => put(sheet, `${columnName(index + 1)}13`, header, { font: boldFont, alignment: centerMiddle }));
    model.items.slice(0, 2).forEach((item, index) => {
        const row = 14 + index * 2;
        put(sheet, `A${row}`, index + 1, { alignment: rightMiddle });
        put(sheet, `B${row}`, item.hsCode);
        put(sheet, `C${row}`, item.productName || item.englishName);
        put(sheet, `D${row}`, formatQuantityUnit(item));
        put(sheet, `E${row}`, item.unitPrice, { numFmt: '#,##0.00' });
        put(sheet, `F${row}`, item.amount, { numFmt: '#,##0.00' });
        put(sheet, `G${row}`, model.currency || 'RMB');
        put(sheet, `H${row}`, model.origin);
        put(sheet, `I${row}`, model.destination);
        put(sheet, `J${row}`, model.domesticSourceLocation);
        put(sheet, `K${row}`, '照章征免');
        put(sheet, `C${row + 1}`, declarationDetailText(item));
        put(sheet, `D${row + 1}`, formatQuantityUnit({ quantity: item.netWeight, unit: item.netWeight ? '千克' : undefined }));
    });
    put(sheet, 'A18', '特殊关系确认：否', { font: boldFont });
    put(sheet, 'C18', '价格影响确认：否', { font: boldFont });
    put(sheet, 'E18', '支付特许权使用费确认：否', { font: boldFont });
    put(sheet, 'H18', '自报自缴：是', { font: boldFont });
    put(sheet, 'A19', '报关人员', { font: boldFont });
    put(sheet, 'C19', '报关人员证号', { font: boldFont });
    put(sheet, 'F19', '电话', { font: boldFont });
    put(sheet, 'F20', '兹申明对以上内容承担如实申报、依法纳税之法律责任', { alignment: centerMiddle });
    put(sheet, 'J20', '海关批注及签章', { font: boldFont });
    put(sheet, 'A21', '申报单位', { font: boldFont });
    put(sheet, 'H21', '申报单位（签章）', { alignment: centerMiddle });
    applyGrid(sheet, 'A3:L21');
}
function buildInvoiceWorksheet(sheet, model, title) {
    sheet.views = [{ showGridLines: false }];
    sheet.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    setColumns(sheet, [11, 22, 48, 8, 14, 8, 12, 12, 16, 14]);
    for (let row = 1; row <= 24; row += 1)
        sheet.getRow(row).height = 22;
    sheet.getRow(1).height = 24;
    sheet.getRow(12).height = 48;
    sheet.getRow(13).height = 48;
    mergeRanges(sheet, ['A1:B2', 'C1:J1', 'C2:E2', 'F2:J2', 'A3:J3', 'B4:D4', 'F4:J4', 'B5:D5', 'F5:J5', 'B8:D8', 'F8:J8', 'B9:D9', 'F9:J9', 'C15:J15', 'C16:J16', 'C18:J18', 'C19:J19', 'C20:J20', 'C21:J21', 'C22:J22']);
    put(sheet, 'A1', 'YUNEEC', { font: logoFont, alignment: centerMiddle });
    put(sheet, 'C1', templateSellerAddress(model), { font: boldFont, alignment: centerMiddle });
    put(sheet, 'C2', `Tel:${stringValue(readModelValue(model, 'phone')) ?? '+86 15112619120'}`, { alignment: centerMiddle });
    put(sheet, 'F2', `Email: ${stringValue(readModelValue(model, 'email')) ?? 'sales03@yuneectech.com'}`, { alignment: centerMiddle });
    put(sheet, 'A3', title, { font: titleFont, alignment: centerMiddle });
    put(sheet, 'A4', 'Buyer', { font: boldFont });
    put(sheet, 'B4', model.buyerName);
    put(sheet, 'E4', 'Seller', { font: boldFont });
    put(sheet, 'F4', templateSellerName(model));
    put(sheet, 'A5', 'Address:', { font: boldFont });
    put(sheet, 'B5', model.buyerAddress || '未识别');
    put(sheet, 'E5', 'Invoice No.:', { font: boldFont });
    put(sheet, 'F5', model.invoiceNo);
    put(sheet, 'A6', 'Attn:', { font: boldFont });
    put(sheet, 'E6', 'Date:', { font: boldFont });
    put(sheet, 'F6', model.date);
    put(sheet, 'A7', 'Tel:', { font: boldFont });
    put(sheet, 'E7', 'Contract No.:', { font: boldFont });
    put(sheet, 'F7', model.contractNo);
    put(sheet, 'A8', 'From:', { font: boldFont });
    put(sheet, 'B8', model.origin);
    put(sheet, 'E8', 'Payment Term:', { font: boldFont });
    put(sheet, 'F8', model.paymentTerm);
    put(sheet, 'A9', 'To:', { font: boldFont });
    put(sheet, 'B9', model.destination);
    put(sheet, 'E9', 'Remark:', { font: boldFont });
    put(sheet, 'F9', 'The quotation is valid for one week');
    const headers = ['Item No.', 'Item', 'Description', 'QTY', 'UNITPRICE', 'UNIT', 'RATE(USD to RMB)', 'AMOUNT', 'PRICE', 'HS CODE'];
    headers.forEach((header, index) => put(sheet, `${columnName(index + 1)}11`, header, { font: whiteBoldFont, alignment: centerMiddle, fill: tableHeaderFill }));
    model.items.slice(0, 2).forEach((item, index) => {
        const row = 12 + index;
        sheet.getRow(row).height = descriptionRowHeight(item);
        put(sheet, `A${row}`, index + 1, { alignment: rightMiddle });
        put(sheet, `B${row}`, item.model || item.englishName || item.productName);
        put(sheet, `C${row}`, item.description);
        put(sheet, `D${row}`, item.quantity);
        put(sheet, `E${row}`, item.unitPrice, { numFmt: '"¥"#,##0.00' });
        put(sheet, `F${row}`, item.unit);
        put(sheet, `G${row}`, model.exchangeRate);
        put(sheet, `I${row}`, item.amount, { numFmt: '"¥"#,##0.00' });
        put(sheet, `J${row}`, item.hsCode);
    });
    put(sheet, 'A14', 'Total Amount(RMB)', { font: boldFont });
    put(sheet, 'I14', totalAmount(model.items), { numFmt: '"¥"#,##0.00', font: boldFont });
    put(sheet, 'A15', 'Price/Цена:', { font: boldFont });
    put(sheet, 'C15', 'Remark:All price are in RMB');
    put(sheet, 'A16', 'Delivery term/Условия Поставки:', { font: boldFont });
    put(sheet, 'C16', model.tradeTerm ? `${model.tradeTerm} in Shenzhen, Guangdong, China` : '');
    put(sheet, 'A17', 'Bank details/Банковские реквизиты:', { font: boldFont });
    put(sheet, 'A18', '1. Beneficiary/Бенифициар:', { font: boldFont });
    put(sheet, 'C18', model.bankBeneficiary);
    put(sheet, 'A19', '2. Bank Name/Банк:', { font: boldFont });
    put(sheet, 'C19', model.bankName);
    put(sheet, 'A20', '3. Bank Address/Адрес', { font: boldFont });
    put(sheet, 'C20', model.bankAddress);
    put(sheet, 'A21', '4.CNAPS CODE:', { font: boldFont });
    put(sheet, 'C21', model.cnapsCode);
    put(sheet, 'A22', '5. Account No.:', { font: boldFont });
    put(sheet, 'C22', model.bankAccountNo);
    put(sheet, 'A23', '6. Swift Code:', { font: boldFont });
    put(sheet, 'C23', model.swiftCode);
    put(sheet, 'C24', 'Seller Confirm:', { font: boldFont, alignment: centerMiddle });
    applyTableStyle(sheet, 'A11:J14', 11);
}
function buildPackingListWorksheet(sheet, model) {
    sheet.views = [{ showGridLines: false }];
    sheet.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    setColumns(sheet, [18, 14, 34, 10, 10, 12, 18, 12, 12]);
    for (let row = 1; row <= 24; row += 1)
        sheet.getRow(row).height = 22;
    sheet.getRow(3).height = 34;
    mergeRanges(sheet, ['A1:A2', 'B1:I1', 'C2:E2', 'F2:I2', 'A3:I3', 'B4:D4', 'F4:I4', 'B5:D5', 'F5:I5', 'B6:D6', 'F6:I6', 'B7:D7', 'F7:I7', 'B8:D8', 'F8:I8', 'B9:D9', 'F9:I9']);
    put(sheet, 'A1', 'YUNEEC', { font: logoFont, alignment: centerMiddle });
    put(sheet, 'B1', templateSellerAddress(model), { font: boldFont, alignment: centerMiddle });
    put(sheet, 'C2', `Tel:${stringValue(readModelValue(model, 'phone')) ?? '+86 15112619120'}`, { alignment: centerMiddle });
    put(sheet, 'F2', `Email: ${stringValue(readModelValue(model, 'email')) ?? 'sales03@yuneectech.com'}`, { alignment: centerMiddle });
    put(sheet, 'A3', 'PACKING LIST', { font: titleFont, alignment: centerMiddle });
    put(sheet, 'A4', 'Ship to:', { font: boldFont });
    put(sheet, 'B4', model.buyerName);
    put(sheet, 'E4', 'Seller', { font: boldFont });
    put(sheet, 'F4', templateSellerName(model));
    put(sheet, 'A5', 'Address:', { font: boldFont });
    put(sheet, 'E5', 'Date:', { font: boldFont });
    put(sheet, 'F5', model.date);
    put(sheet, 'A6', 'Country:', { font: boldFont });
    put(sheet, 'B6', model.destination);
    put(sheet, 'E6', 'Attn:', { font: boldFont });
    put(sheet, 'F6', 'Lulu');
    put(sheet, 'A7', 'Attn:', { font: boldFont });
    put(sheet, 'E7', 'Email:', { font: boldFont });
    put(sheet, 'F7', stringValue(readModelValue(model, 'email')) ?? 'sales03@yuneectech.com');
    put(sheet, 'A8', 'Tel:', { font: boldFont });
    put(sheet, 'E8', 'Tel:', { font: boldFont });
    put(sheet, 'F8', '15112619120');
    put(sheet, 'E9', 'Date:', { font: boldFont });
    const headers = ['Items', 'Model', 'Description', 'Qty', 'Unit', 'Ctn No', 'Dimension(mm)', 'NW(kg)', 'GW(kg)'];
    headers.forEach((header, index) => put(sheet, `${columnName(index + 1)}11`, header, { font: whiteBoldFont, alignment: centerMiddle, fill: tableHeaderFill }));
    model.items.slice(0, 2).forEach((item, index) => {
        const row = 12 + index;
        sheet.getRow(row).height = descriptionRowHeight(item);
        put(sheet, `A${row}`, item.englishName || item.productName, { alignment: centerMiddle });
        put(sheet, `B${row}`, item.model, { alignment: centerMiddle });
        put(sheet, `C${row}`, item.description);
        put(sheet, `D${row}`, item.quantity, { alignment: centerMiddle });
        put(sheet, `E${row}`, item.unit, { alignment: centerMiddle });
        put(sheet, `F${row}`, item.cartonNo, { alignment: centerMiddle });
        put(sheet, `G${row}`, item.dimension, { alignment: centerMiddle });
        put(sheet, `H${row}`, item.netWeight, { alignment: centerMiddle });
        put(sheet, `I${row}`, item.grossWeight, { alignment: centerMiddle });
    });
    put(sheet, 'A14', 'Total weight (KG)', { font: boldFont });
    put(sheet, 'H14', sum(model.items, 'netWeight') || readNumber(model, 'netWeight'));
    put(sheet, 'I14', sum(model.items, 'grossWeight') || readNumber(model, 'grossWeight'));
    put(sheet, 'A15', 'Volume (CBM)', { font: boldFont });
    put(sheet, 'I15', readNumber(model, 'volumeCbm'));
    put(sheet, 'A16', 'Total Carton (CTN)', { font: boldFont });
    put(sheet, 'I16', readNumber(model, 'cartonCount'));
    put(sheet, 'A17', 'Bank details/Банковские реквизиты:', { font: boldFont });
    put(sheet, 'A18', '1. Beneficiary/Бенифициар:', { font: boldFont });
    put(sheet, 'B18', model.bankBeneficiary);
    put(sheet, 'A19', '2. Bank Name/Банк:', { font: boldFont });
    put(sheet, 'B19', model.bankName);
    put(sheet, 'A20', '3. Bank Address/Адрес', { font: boldFont });
    put(sheet, 'B20', model.bankAddress);
    put(sheet, 'A21', '4. CNY account:', { font: boldFont });
    put(sheet, 'H21', model.bankAccountNo);
    put(sheet, 'A22', '5. Swift Code:', { font: boldFont });
    put(sheet, 'A23', '6.CNAPS CODE', { font: boldFont });
    put(sheet, 'A24', 'SIGNATURE:', { font: boldFont });
    applyTableStyle(sheet, 'A11:I24', 11);
}
function buildDeclarationRows(model) {
    return [
        ['境内发货人', model.sellerName ?? model.sellerEnglishName ?? ''],
        ['境外收货人', model.buyerName ?? ''],
        ['合同协议号', model.contractNo ?? ''],
        ['监管方式', model.supervisionMode ?? ''],
        ['征免性质', model.taxExemptionNature ?? ''],
        ['包装种类', model.packageType ?? ''],
        ['项号', '商品编号', '商品名称及规格型号', '数量及单位', '单价', '总价', '境内货源地'],
        ...model.items.map((item, index) => [
            index + 1,
            item.hsCode ?? '',
            item.productName ?? item.englishName ?? '',
            formatQuantity(item),
            item.unitPrice ?? '',
            item.amount ?? '',
            model.domesticSourceLocation ?? ''
        ])
    ];
}
function buildCommercialInvoiceRows(model) {
    return [
        [model.sellerEnglishName ?? ''],
        [model.sellerEnglishAddress ?? ''],
        ['Commercial Invoice'],
        ['Buyer', model.buyerName ?? '', '', 'Seller', model.sellerEnglishName ?? ''],
        ['Address', model.buyerAddress ?? '', '', 'Invoice No.', model.invoiceNo],
        ['From', model.origin ?? '', '', 'Payment Term', model.paymentTerm ?? ''],
        ['To', model.destination ?? '', '', 'Contract No.', model.contractNo ?? ''],
        ['Item No.', 'Item', 'Description', 'QTY', 'UNIT PRICE', 'UNIT', 'RATE', 'AMOUNT', 'HS CODE'],
        ...model.items.map((item, index) => [
            index + 1,
            item.model ?? item.englishName ?? item.productName ?? '',
            item.description ?? '',
            item.quantity ?? '',
            item.unitPrice ?? '',
            item.unit ?? '',
            model.exchangeRate ?? '',
            item.amount ?? '',
            item.hsCode ?? ''
        ]),
        ['Total Amount(RMB)', '', '', '', '', '', totalAmount(model.items)]
    ];
}
function buildSalesContractRows(model) {
    return [
        [model.sellerEnglishName ?? ''],
        [model.sellerEnglishAddress ?? ''],
        ['Sales Contract'],
        ['Buyer', model.buyerName ?? '', '', 'Seller', model.sellerEnglishName ?? ''],
        ['Address', model.buyerAddress ?? '', '', 'Invoice No.', model.invoiceNo],
        ['From', model.origin ?? '', '', 'Payment Term', model.paymentTerm ?? ''],
        ['To', model.destination ?? '', '', 'Contract No.', model.contractNo ?? ''],
        ['Item No.', 'Item', 'Description', 'QTY', 'UNIT PRICE', 'UNIT', 'RATE', 'AMOUNT', 'HS CODE'],
        ...model.items.map((item, index) => [
            index + 1,
            item.model ?? item.englishName ?? item.productName ?? '',
            item.description ?? '',
            item.quantity ?? '',
            item.unitPrice ?? '',
            item.unit ?? '',
            model.exchangeRate ?? '',
            item.amount ?? '',
            item.hsCode ?? ''
        ])
    ];
}
function buildPackingListRows(model) {
    return [
        [model.sellerEnglishAddress ?? ''],
        ['PACKING LIST'],
        ['Ship to', model.buyerName ?? '', '', 'Seller', model.sellerEnglishName ?? ''],
        ['Country', model.destination ?? ''],
        ['Items', 'Model', 'Description', 'Qty', 'Unit', 'Ctn No', 'Dimension(mm)', 'NW(kg)', 'GW(kg)'],
        ...model.items.map((item) => [
            item.englishName ?? item.productName ?? '',
            item.model ?? '',
            item.description ?? '',
            item.quantity ?? '',
            item.unit ?? '',
            item.cartonNo ?? '',
            item.dimension ?? '',
            item.netWeight ?? '',
            item.grossWeight ?? ''
        ]),
        ['Total weight (KG)', '', '', '', '', '', '', sum(model.items, 'netWeight'), sum(model.items, 'grossWeight')]
    ];
}
function formatQuantity(item) {
    return [item.quantity, item.unit].filter((value) => value !== undefined && value !== '').join(' ');
}
function totalAmount(items) {
    return sum(items, 'amount');
}
function sum(items, key) {
    return items.reduce((total, item) => {
        const value = item[key];
        return typeof value === 'number' ? total + value : total;
    }, 0);
}
function readNumber(input, key) {
    const value = typeof input === 'object' && input != null ? Reflect.get(input, key) : undefined;
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function stringValue(value) {
    return value === undefined || value === null || value === '' ? undefined : String(value);
}
function readModelValue(model, key) {
    return Reflect.get(model, key);
}
function buildInvoiceNo() {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `INV-${yyyy}${mm}${dd}`;
}
function sanitizeFilePart(value) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
