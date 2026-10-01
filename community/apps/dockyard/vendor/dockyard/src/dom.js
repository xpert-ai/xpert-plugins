const paths = {
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pin: '<path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6"/>',
  unpin: '<path d="m5 5 14 14M10 3h5l-1 6 4 4v2h-4M6 15h3l3 6v-6M7 10l-1 3"/>',
  float: '<path d="M13 4h7v7M20 4l-9 9M10 5H4v15h15v-6"/>',
  dock: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9h16M14 9v11"/>',
  maximize: '<rect x="4" y="4" width="16" height="16" rx="1"/>',
  restore: '<path d="M8 8V4h12v12h-4"/><rect x="4" y="8" width="12" height="12" rx="1"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  document: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  tool: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 9v11"/>',
  left: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M10 4v16"/>',
  right: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M14 4v16"/>',
  top: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18"/>',
  bottom: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 14h18"/>',
  center: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 4v5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 16h10"/>'
};
export function element(doc, tag, className = '', text = null) {
  const node = doc.createElement(tag); if (className) node.className = className;
  if (text != null) node.textContent = text; return node;
}
export function icon(doc, name, size = 16) {
  const holder = element(doc, 'span', 'ad-icon');
  holder.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.tool}</svg>`;
  return holder;
}
export function button(doc, glyph, title, callback, className = '') {
  const node = element(doc, 'button', `ad-button ${className}`); node.type = 'button';
  node.title = title; node.setAttribute('aria-label', title); if (glyph) node.append(icon(doc, glyph));
  node.addEventListener('click', event => { event.stopPropagation(); callback?.(event); }); return node;
}
/** Preserve live subtrees where the platform supports state-preserving moves. */
export function moveNode(parent, node, before = null) {
  if (node === before) return;
  if (parent.moveBefore && node.isConnected && parent.isConnected && parent.ownerDocument === node.ownerDocument) {
    try { parent.moveBefore(node, before); return; } catch { /* Old browsers use ordinary DOM adoption. */ }
  }
  parent.insertBefore(node, before);
}
export function syncChildren(parent, desired) {
  for (let index = 0; index < desired.length; index++) if (parent.children[index] !== desired[index]) moveNode(parent, desired[index], parent.children[index] || null);
  const keep = new Set(desired);
  for (const child of [...parent.children]) if (!keep.has(child)) child.remove();
}
export function clamp(value, min, max) { return Math.min(Math.max(value, min), Math.max(min, max)); }
export function rectRelative(rect, origin) { return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height }; }
export function applyStyle(node, style, model, manager) {
  if (typeof style === 'function') style = style(model, manager);
  if (typeof style === 'string') node.classList.add(...style.split(/\s+/).filter(Boolean));
  else if (style && typeof style === 'object') for (const [key, value] of Object.entries(style)) {
    if (key.startsWith('--') || key.includes('-')) node.style.setProperty(key, String(value));
    else if (key in node.style) node.style[key] = value;
  }
}
export function selectTemplate(manager, property, model, content = model) {
  const selector = manager[`${property}Selector`];
  return (typeof selector === 'function' ? selector(content, model, manager) : selector?.SelectTemplate?.(content, model)) || manager[property];
}
