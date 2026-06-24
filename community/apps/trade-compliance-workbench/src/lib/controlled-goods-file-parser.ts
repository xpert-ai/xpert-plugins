// @ts-nocheck
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
const HS_CODE_PATTERN = /\b\d{8,10}\b/g;
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
        if (hsCodes.length > 0) {
            candidates.push({
                sequence: current.sequence,
                category: current.category,
                rawText: current.rawText.trim(),
                hsCodes,
                sourceLocation: current.sourceLocation
            });
        }
        current = null;
    };
    for (const line of lines) {
        const page = readPageMarker(line);
        if (page != null) {
            pushCurrent();
            currentPage = page;
            continue;
        }
        if (isNoiseLine(line))
            continue;
        if (isCategoryLine(line)) {
            pushCurrent();
            category = line;
            continue;
        }
        const row = line.match(/^(\d{1,4})[\.、\s]+(.+)/);
        if (row) {
            pushCurrent();
            current = {
                sequence: row[1],
                category,
                rawText: row[2],
                sourceLocation: currentPage ? `第 ${currentPage} 页` : undefined
            };
            continue;
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
function isNoiseLine(line) {
    return /^-?\s*\d{1,3}\s*-?$/.test(line) ||
        /^备注[:：]/.test(line) ||
        /^说明[:：]/.test(line) ||
        /^序号\s+商品名称/.test(line) ||
        /^编号\s+单位$/.test(line) ||
        /^工作表[:：]/.test(line);
}
function isCategoryLine(line) {
    return (/^[一二三四五六七八九十]+[、.]/.test(line) || /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX]+[、.]/.test(line)) &&
        !/^\d+\s/.test(line);
}
function uniqueMatches(text, pattern) {
    return [...new Set(text.match(pattern) ?? [])];
}
function dedupeCandidates(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
        const key = `${candidate.sequence}|${candidate.hsCodes.join(',')}|${candidate.rawText.slice(0, 80)}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
