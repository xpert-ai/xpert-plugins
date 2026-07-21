export function isSymbolOnlyText(value) {
  const text=String(value||'').trim();
  return Boolean(text)&&!/[\p{L}\p{N}]/u.test(text);
}
