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
export async function searchHsBianmaCodes(input, config) {
    const keyword = String(input?.keywords ?? '').trim();
    if (!keyword) {
        throw new Error('请输入商品名称或海关编码');
    }
    const page = Math.max(1, Number(input?.page) || 1);
    const html = await fetchHsBianmaSearchHtml(keyword, {
        ...config,
        page,
        filterFailureCode: input?.filterFailureCode !== false,
        displayChapter: input?.displayChapter === true,
        displayEnName: input?.displayEnName !== false
    });
    const baseUrl = normalizeHsBianmaBaseUrl(config?.baseUrl);
    const results = parseHsBianmaSearchResults(html, baseUrl).map((item) => ({
        ...item,
        sourcePage: page
    }));
    return {
        keywords: keyword,
        page,
        filterFailureCode: input?.filterFailureCode !== false,
        displayChapter: input?.displayChapter === true,
        displayEnName: input?.displayEnName !== false,
        sourceUrl: buildHsBianmaSearchUrl(keyword, {
            ...config,
            page,
            filterFailureCode: input?.filterFailureCode !== false,
            displayChapter: input?.displayChapter === true,
            displayEnName: input?.displayEnName !== false
        }).toString(),
        results,
        pagination: parseHsBianmaPagination(html, keyword, page)
    };
}
export async function getHsBianmaCodeDetail(input, config) {
    const code = resolveHsBianmaDetailCode(input);
    if (!code) {
        throw new Error('请输入有效的海关编码');
    }
    const url = buildHsBianmaCodeDetailUrl(code, config);
    const html = await fetchHsBianmaDetailHtml(url, config);
    const detail = parseHsBianmaCodeDetail(html, url.toString());
    return {
        code: detail.code ?? code,
        name: detail.name,
        title: detail.title,
        sourceUrl: url.toString(),
        sections: detail.sections
    };
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
    const url = buildHsBianmaSearchUrl(keyword, config);
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
async function fetchHsBianmaDetailHtml(url, config) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
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
        throw new Error(`HS编码网详情查询失败 HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }
    return response.text();
}
function buildHsBianmaSearchUrl(keyword, config) {
    const page = Math.max(1, Number(config?.page) || 1);
    const path = page > 1 ? `/Search/${page}` : '/search';
    const url = new URL(path, normalizeHsBianmaBaseUrl(config?.baseUrl));
    url.searchParams.set('keywords', keyword);
    if (config?.filterFailureCode !== false) {
        url.searchParams.set('filterFailureCode', 'true');
    }
    if (config?.displayChapter === true) {
        url.searchParams.set('displaychapter', 'true');
    }
    if (config?.displayEnName !== false) {
        url.searchParams.set('displayenname', 'true');
    }
    return url;
}
function buildHsBianmaCodeDetailUrl(code, config) {
    return new URL(`/Code/${code}.html`, normalizeHsBianmaBaseUrl(config?.baseUrl));
}
export function parseHsBianmaSearchResults(html, baseUrl = DEFAULT_HSBIANMA_BASE_URL) {
    const $ = cheerio.load(html);
    const results = [];
    $('table.result tr.result-grid').each((_, row) => {
        const cells = $(row).find('td');
        const href = cells.eq(0).find('a[href]').first().attr('href') || cells.eq(6).find('a[href]').first().attr('href');
        const code = extractHsCode(cells.eq(0).text()) ?? extractHsCode(href);
        const nameCell = cells.eq(1).clone();
        const englishName = cleanText(nameCell.find('span[name^="insenname-"]').first().text());
        nameCell.find('span[name^="insenname-"]').remove();
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
export function parseHsBianmaPagination(html, keywords, currentPage = 1) {
    const $ = cheerio.load(html);
    const pages = [];
    $('#pagination a, #pagination span.pageindex').each((_, node) => {
        const label = cleanText($(node).text());
        if (!label)
            return;
        const numeric = Number(label);
        const href = $(node).attr('href');
        const page = Number.isFinite(numeric) && numeric > 0
            ? numeric
            : href
                ? parseHsBianmaPageFromHref(href)
                : undefined;
        pages.push({
            label,
            page,
            current: $(node).is('span.pageindex') || page === currentPage && label === String(currentPage),
            href: href ? new URL(href, DEFAULT_HSBIANMA_BASE_URL).toString() : undefined
        });
    });
    const numericPages = pages.map((item) => item.page).filter((page) => Number.isFinite(page));
    const maxPage = numericPages.length ? Math.max(...numericPages) : currentPage;
    return {
        currentPage,
        maxVisiblePage: maxPage,
        hasPrevious: currentPage > 1,
        hasNext: pages.some((item) => item.label === '下一页') || maxPage > currentPage,
        pages
    };
}
export function parseHsBianmaCodeDetail(html, sourceUrl) {
    const $ = cheerio.load(html);
    const sections = [];
    $('#code-info h3.ch3').each((_, heading) => {
        const title = cleanText($(heading).text());
        const box = $(heading).nextAll('.cbox').first();
        const rows = [];
        box.find('table tr').each((__, row) => {
            const label = cleanText($(row).find('.td-label').first().text());
            const valueText = cleanText($(row).find('.td-txt').first().text());
            if (!label)
                return;
            rows.push({ label, value: valueText ?? '' });
        });
        if (title && rows.length > 0) {
            sections.push({ title, rows });
        }
    });
    const basicRows = sections.find((section) => section.title === '基本信息')?.rows ?? [];
    return {
        code: findDetailRowValue(basicRows, '商品编码')?.match(HS_CODE_PATTERN)?.[0],
        name: findDetailRowValue(basicRows, '商品名称'),
        title: cleanText($('title').first().text()),
        sourceUrl,
        sections
    };
}
function resolveHsBianmaDetailCode(input) {
    const directCode = extractHsCode(input?.code);
    if (directCode)
        return directCode;
    const detailUrl = String(input?.detailUrl ?? '');
    const pathCode = detailUrl.match(/\/Code\/(\d{8,10})\.html/i)?.[1];
    if (pathCode)
        return pathCode;
    return undefined;
}
function findDetailRowValue(rows, label) {
    return rows.find((row) => row.label === label)?.value;
}
function parseHsBianmaPageFromHref(href) {
    const match = href.match(/\/Search\/(\d+)/i);
    if (match)
        return Number(match[1]);
    return href.includes('/Search?') || href.includes('/search?') ? 1 : undefined;
}
function pickHsBianmaResult(results, input) {
    const explicitCode = extractHsCode(input.hsCode);
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
function extractHsCode(value) {
    const text = String(value ?? '');
    const direct = text.match(HS_CODE_PATTERN)?.[0];
    if (direct)
        return direct;
    const codePath = text.match(/\/Code\/(\d{8,10})\.html/i)?.[1];
    if (codePath)
        return codePath;
    const compact = text.replace(/\D/g, '');
    return compact.length >= 8 && compact.length <= 10 ? compact : undefined;
}
function summarizeError(error) {
    if (error instanceof Error) {
        return error.message.slice(0, 300);
    }
    return String(error).slice(0, 300);
}
