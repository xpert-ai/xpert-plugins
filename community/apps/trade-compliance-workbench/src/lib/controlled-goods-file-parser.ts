// @ts-nocheck
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
const HS_CODE_PATTERN = /\b\d{8,10}\b/g;
const CONTROL_CODE_PATTERN = /\b[0-9][A-Z][0-9]{3}(?:\.[a-z0-9]+)*\b/i;
export async function parseControlledGoodsFile(input) {
    const buffer = input.buffer;
    if (!buffer?.length)
        return { candidates: [], textLength: 0 };
    const fileName = input.fileName.toLowerCase();
    const mimeType = input.mimeType?.toLowerCase() ?? '';
    if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
        return parseControlledGoodsText(await extractPdfText(buffer));
    }
    if (mimeType.includes('spreadsheet') ||
        mimeType.includes('excel') ||
        fileName.endsWith('.xls') ||
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.csv')) {
        return parseControlledGoodsText(extractWorkbookText(buffer));
    }
    return parseControlledGoodsText(buffer.toString('utf8'));
}
export function parseControlledGoodsText(text) {
    const lines = text
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    const candidates = [];
    let current = null;
    let category;
    let currentPage;
    const pushCurrent = () => {
        if (!current)
            return;
        const hsCodes = uniqueMatches(current.rawText, HS_CODE_PATTERN);
        const parsed = parseControlledGoodsRow(current.rawText, hsCodes, current.sourcePage, current.crossPage);
        candidates.push({
            sequence: current.sequence,
            category: current.category,
            rawText: current.rawText.trim(),
            controlCode: parsed.controlCode,
            productName: parsed.productName,
            referenceNameCandidate: parsed.referenceNameCandidate,
            parseWarnings: parsed.parseWarnings,
            description: parsed.description,
            unit: parsed.unit,
            hsCodes,
            confidence: parsed.confidence,
            sourceLocation: current.sourceLocation
        });
        current = null;
    };
    for (const line of lines) {
        const page = readPageMarker(line);
        if (page != null) {
            if (current) {
                current.crossPage = true;
                current.rawText += ` -- ${page} of --`;
            }
            else {
                pushCurrent();
            }
            currentPage = page + 1;
            continue;
        }
        if (isNoiseLine(line))
            continue;
        if (/^序号\s+/.test(line)) {
            pushCurrent();
            continue;
        }
        if (isCategoryLine(line)) {
            pushCurrent();
            category = line;
            continue;
        }
        const row = line.match(/^(\d{1,4})([、]|\s+|[.．](?!\d))(.+)/);
        if (row) {
            const delimiter = row[2];
            const rest = row[3];
            if (current && /^[.．]/.test(delimiter) && !CONTROL_CODE_PATTERN.test(rest) && !HS_CODE_PATTERN.test(rest)) {
                current.rawText += ` ${line}`;
                continue;
            }
            if (isLikelyRowStart(rest)) {
                pushCurrent();
                current = {
                    sequence: row[1],
                    category,
                    rawText: rest,
                    sourcePage: currentPage,
                    crossPage: false,
                    sourceLocation: currentPage ? `第 ${currentPage} 页` : undefined
                };
                continue;
            }
        }
        if (current) {
            current.rawText += ` ${line}`;
        }
    }
    pushCurrent();
    return {
        candidates: dedupeCandidates(candidates),
        textLength: text.length
    };
}
async function extractPdfText(buffer) {
    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getText();
        return result.text;
    }
    finally {
        await parser.destroy();
    }
}
function extractWorkbookText(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    const lines = [];
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet)
            continue;
        lines.push(`工作表：${sheetName}`);
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        for (const row of rows) {
            const line = row.map((cell) => String(cell ?? '').trim()).filter(Boolean).join(' ');
            if (line)
                lines.push(line);
        }
    }
    return lines.join('\n');
}
function readPageMarker(line) {
    const match = line.match(/^--\s*(\d+)\s+of\s+\d+\s*--$/i);
    return match ? Number(match[1]) : undefined;
}
function isLikelyRowStart(rest) {
    const text = rest.trim();
    if (!text)
        return false;
    if (/^(of\s+\d+|年|月|日|位以上|位以下|种|个|项|类|级|米|mm|cm|kg|g|Gbps|Mbps|MHz|GHz|℃|%)/i.test(text))
        return false;
    if (/^(对于涉及调整|《|上述|以下|以上|其中|或者|以及|和|或)\b/.test(text))
        return false;
    if (/^\d{8,10}(?:\s+\d{8,10})*\s*$/.test(text))
        return false;
    if (CONTROL_CODE_PATTERN.test(text))
        return true;
    if (HS_CODE_PATTERN.test(text) && /[\u4e00-\u9fa5A-Za-z]/.test(text.replace(HS_CODE_PATTERN, '')))
        return true;
    return /^[\u4e00-\u9fa5A-Za-z（(]/.test(text) || /^\d+-/.test(text);
}
function parseControlledGoodsRow(rawText, hsCodes, sourcePage, crossPage) {
    let text = normalizeWrappedText(rawText.trim());
    const parseWarnings = [];
    const controlCode = text.match(CONTROL_CODE_PATTERN)?.[0];
    if (controlCode && text.startsWith(controlCode)) {
        text = text.slice(controlCode.length).trim();
    }
    const unit = extractUnit(text);
    if (unit)
        text = text.replace(new RegExp(`${escapeRegExp(unit)}\\s*$`), '').trim();
    for (const hsCode of hsCodes) {
        text = text.replace(new RegExp(`\\b${hsCode}\\b`, 'g'), ' ').replace(/\s+/g, ' ').trim();
    }
    if (hsCodes.length === 0)
        parseWarnings.push('no_hs_code');
    if (crossPage)
        parseWarnings.push('cross_page_record');
    const nameResult = extractProductName(text, controlCode);
    parseWarnings.push(...nameResult.warnings);
    const productName = nameResult.reliable && !parseWarnings.includes('cross_page_record') ? nameResult.value : undefined;
    const referenceNameCandidate = nameResult.value;
    const warnings = uniqueValues(parseWarnings);
    const confidence = productName && warnings.length === 0 ? 0.9 : productName ? 0.78 : referenceNameCandidate ? 0.62 : 0.5;
    return {
        controlCode,
        productName,
        referenceNameCandidate,
        parseWarnings: warnings,
        description: text || rawText.trim(),
        unit,
        confidence
    };
}
function extractProductName(text, controlCode) {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (!compact)
        return validateReferenceName(controlCode);
    if (!controlCode) {
        const beforeColon = compact.split(/[：:]/)[0]?.trim();
        if (beforeColon && beforeColon.length <= 40)
            return validateReferenceName(beforeColon.replace(/\s+[A-Z0-9][A-Z0-9（）()、\-·./]*$/i, '').trim() || beforeColon);
        const beforeDescription = compact.split(/\s+(?:第一类|第二类|第三类|第四类|第五类|可用于|采用|含有|用于|属于)\b/)[0]?.trim();
        if (beforeDescription && beforeDescription.length <= 40)
            return validateReferenceName(beforeDescription);
    }
    const referenceName = extractReferenceProductName(compact);
    if (referenceName)
        return validateReferenceName(referenceName);
    const tail = compact.match(/([\u4e00-\u9fa5A-Za-z0-9（）()、\-·]+)(?:\s*)$/)?.[1];
    if (tail && tail.length <= 40 && !/[：:；;]/.test(tail))
        return validateReferenceName(tail);
    const beforePunctuation = compact.split(/[：:；;，,。]/)[0]?.trim();
    return validateReferenceName(beforePunctuation?.slice(0, 80) || controlCode || compact.slice(0, 80));
}
function extractUnit(text) {
    const match = text.match(/((?:件[，,]\s*)?台\/千克|件[，,]\s*个\/千克|台\/套|台\/间|套\/间|台\/千克|升\/千克|个\/千克|套\/千克|条\/千克|平方米|立方米|千克|公斤|克|升|台|套|个|条|件|只|吨)\s*$/);
    return match?.[1]?.replace(/\s+/g, '');
}
function normalizeWrappedText(text) {
    return text
        .replace(/--\s*\d+\s+of\s*(?:\d+)?\s*--/gi, ' ')
        .replace(/--\s*\d+\s+of\s*--/gi, ' ')
        .replace(/\s*\/\s*/g, '/')
        .replace(/件\s*，\s*个\/千\s+克/g, '件，个/千克')
        .replace(/件\s*，\s*台\/千\s+克/g, '件，台/千克')
        .replace(/台\/千\s+克/g, '台/千克')
        .replace(/个\/千\s+克/g, '个/千克')
        .replace(/套\/千\s+克/g, '套/千克')
        .replace(/\s+/g, ' ')
        .trim();
}
function extractReferenceProductName(text) {
    const withoutHs = text.replace(HS_CODE_PATTERN, ' ');
    const beforeUnit = withoutHs
        .replace(/((?:件，)?台\/千克|件，个\/千克|台\/套|台\/间|套\/间|台\/千克|升\/千克|个\/千克|套\/千克|条\/千克|平方米|立方米|千克|公斤|克|升|台|套|个|条|件|只|吨)\s*$/, '')
        .replace(/[，,]\s*$/, '')
        .replace(/(件|台|套|个|条|只)\s*[，,]\s*$/, '')
        .replace(/(件|台|套|个|条|只)\s*$/, '')
        .trim();
    const segments = beforeUnit
        .split(/[。；;]/)
        .map((item) => item.replace(/\s+/g, '').trim())
        .filter((item) => item && !/^技术说明[:：]/.test(item) && !/^说明[:：]/.test(item));
    const tail = segments.at(-1);
    if (tail && tail.length >= 2 && tail.length <= 40 && /[\u4e00-\u9fa5]/.test(tail))
        return tail;
    return undefined;
}
function validateReferenceName(value) {
    const normalized = value?.replace(/\s+/g, '').trim();
    const warnings = [];
    if (!normalized)
        return { value: undefined, reliable: false, warnings: ['reference_name_missing'] };
    if (/^-+$/.test(normalized))
        return { value: undefined, reliable: false, warnings: ['reference_name_missing'] };
    if (/^[a-z][．.]/i.test(normalized) || /\d[．.]/.test(normalized) || /技术说明[:：]/.test(normalized))
        warnings.push('reference_name_uncertain');
    if (normalized.length > 30)
        warnings.push('reference_name_uncertain');
    if (/^(说明|注释|其中|以下|以上|这些|并且|以及|或者|或|和)/.test(normalized))
        warnings.push('reference_name_uncertain');
    return {
        value: normalized,
        reliable: warnings.length === 0,
        warnings
    };
}
function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))];
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function isNoiseLine(line) {
    return /^-?\s*\d{1,3}\s*-?$/.test(line) ||
        /^\d{1,2}[.．]\s*《/.test(line) ||
        /^\d{1,2}[.．]\s*对于涉及调整/.test(line) ||
        /^备注[:：]/.test(line) ||
        /^说明[:：]/.test(line) ||
        /^编号\s+单位$/.test(line) ||
        /^工作表[:：]/.test(line);
}
function isCategoryLine(line) {
    return (/^[一二三四五六七八九十]+[、.]/.test(line) || /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX]+[、.]/.test(line)) &&
        !/^\d+\s/.test(line) ||
        /^[(（][一二三四五六七八九十]+[)）]/.test(line) ||
        /^[0-9][A-Z]\s+/.test(line) ||
        /^[0-9][A-Z][0-9]\s+/.test(line);
}
function uniqueMatches(text, pattern) {
    return [...new Set(text.match(pattern) ?? [])];
}
function dedupeCandidates(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
        const key = `${candidate.sourceLocation}|${candidate.sequence}|${candidate.controlCode ?? ''}|${candidate.hsCodes.join(',')}|${candidate.rawText.slice(0, 80)}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
