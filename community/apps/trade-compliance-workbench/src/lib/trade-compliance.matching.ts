// @ts-nocheck
export function matchControlledGoods(product, candidates) {
    const enabledCandidates = candidates.filter((candidate) => candidate.enabled !== false);
    const matches = [];
    for (const candidate of enabledCandidates) {
        const match = matchCandidate(product, candidate);
        if (match) {
            matches.push(match);
        }
    }
    if (!matches.length) {
        return {
            status: 'not_controlled',
            matches: []
        };
    }
    const status = matches.some((match) => match.reason === 'hs_code' || match.reason === 'product_name')
        ? 'controlled'
        : 'suspected';
    return {
        status,
        matches,
        controlNote: matches.map((match) => match.controlNote).filter(Boolean).join('; ') || undefined
    };
}
function matchCandidate(product, candidate) {
    const productHsCode = normalizeCode(product.hsCode);
    const candidateHsCode = normalizeCode(candidate.hsCode);
    if (productHsCode && candidateHsCode && productHsCode === candidateHsCode) {
        return toMatch(candidate, 'hs_code', candidateHsCode);
    }
    const productName = normalizeText(product.productName);
    const candidateName = normalizeText(candidate.productName);
    if (productName && candidateName && productName === candidateName) {
        return toMatch(candidate, 'product_name', candidate.productName ?? candidateName);
    }
    const searchableText = normalizeText([product.productName, product.model, product.description, product.hsCode].join(' '));
    const keyword = (candidate.keywords ?? []).find((item) => {
        const normalized = normalizeText(item);
        return normalized && searchableText.includes(normalized);
    });
    if (keyword) {
        return toMatch(candidate, 'keyword', keyword);
    }
    return null;
}
function toMatch(candidate, reason, matchedValue) {
    return {
        controlledGoodsId: candidate.id,
        productName: candidate.productName,
        hsCode: candidate.hsCode,
        controlNote: candidate.controlNote,
        reason,
        matchedValue
    };
}
function normalizeCode(value) {
    return value?.replace(/\D/g, '').trim();
}
function normalizeText(value) {
    return value?.trim().toLowerCase() ?? '';
}
