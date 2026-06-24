// @ts-nocheck
import * as cheerio from 'cheerio';
const DEFAULT_HSBIANMA_BASE_URL = 'https://hsbianma.com';
const DEFAULT_TIMEOUT_MS = 8000;
const HS_CODE_PATTERN = /\b\d{8,10}\b/;
export async function enrichProductWithFallback(input, options = {}) {
    try {
        return await enrichProductWithHsBianma(input, options.hsbianma);
    }
    catch (error) {
        return {
            source: 'api',
            hsCode: input.hsCode,
            productName: input.productName,
            error: summarizeError(error)
        };
    }
}
async function enrichProductWithHsBianma(input, config) {
    const keyword = [input.hsCode, input.productName, input.model, input.description].filter(Boolean).join(' ').trim();
    if (!keyword) {
        throw new Error('商品名称、型号、描述或海关编码至少需要一个用于查询');
    }
    const html = await fetchHsBianmaSearchHtml(keyword, config);
    const results = parseHsBianmaSearchResults(html);
    const match = pickHsBianmaResult(results, input);
    if (!match) {
        throw new Error(`HS编码网没有返回可用的查询结果：${keyword}`);
    }
    return {
        source: 'api',
        hsCode: input.hsCode ?? match.code,
        productName: match.name,
        taxRefundRate: match.taxRefundRate,
        englishName: match.englishName,
        unit: match.unit,
        regulatoryConditions: match.regulatoryConditions,
        inspectionQuarantine: match.inspectionQuarantine,
        detailUrl: match.detailUrl
    };
}
async function fetchHsBianmaSearchHtml(keyword, config) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const url = new URL('/search', normalizeHsBianmaBaseUrl(config?.baseUrl));
    url.searchParams.set('keywords', keyword);
    url.searchParams.set('filterFailureCode', 'true');
    url.searchParams.set('displayenname', 'true');
    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: {
                accept: 'text/html,application/xhtml+xml',
                'user-agent': 'TradeComplianceWorkbench/1.0'
            },
            signal: controller.signal
        });
    }
    finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HS编码网查询失败 HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }
    return response.text();
}
export function parseHsBianmaSearchResults(html, baseUrl = DEFAULT_HSBIANMA_BASE_URL) {
    const $ = cheerio.load(html);
    const results = [];
    $('table.result tr.result-grid').each((_, row) => {
        const cells = $(row).find('td');
        const code = cleanText(cells.eq(0).text()).match(HS_CODE_PATTERN)?.[0];
        const nameCell = cells.eq(1).clone();
        const englishName = cleanText(nameCell.find('span[name^="insenname-"]').first().text());
        nameCell.find('span[name^="insenname-"]').remove();
        const href = cells.eq(0).find('a[href]').first().attr('href') || cells.eq(6).find('a[href]').first().attr('href');
        if (!code)
            return;
        results.push({
            code,
            name: cleanText(nameCell.text()),
            englishName,
            unit: cleanText(cells.eq(2).text()),
            taxRefundRate: cleanText(cells.eq(3).text()),
            regulatoryConditions: cleanText(cells.eq(4).text()),
            inspectionQuarantine: cleanText(cells.eq(5).text()),
            detailUrl: href ? new URL(href, baseUrl).toString() : undefined
        });
    });
    const seen = new Set();
    return results.filter((item) => {
        const key = [item.code, item.name, item.englishName].map((value) => value ?? '').join('|');
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function pickHsBianmaResult(results, input) {
    const explicitCode = input.hsCode?.match(HS_CODE_PATTERN)?.[0];
    if (explicitCode) {
        return results.find((item) => item.code === explicitCode) ?? results[0];
    }
    return results[0];
}
function normalizeHsBianmaBaseUrl(value) {
    return (value?.trim() || DEFAULT_HSBIANMA_BASE_URL).replace(/\/+$/, '');
}
function cleanText(value) {
    return value?.replace(/\s+/g, ' ').trim() || undefined;
}
function summarizeError(error) {
    if (error instanceof Error) {
        return error.message.slice(0, 300);
    }
    return String(error).slice(0, 300);
}
