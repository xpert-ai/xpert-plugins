import { EventSignal, CancelEventArgs, getSchema, GridLength } from './events.js';
import { LayoutTypes, LayoutRoot, LayoutPanel, LayoutContent, LayoutAnchorSide, LayoutAnchorGroup, LayoutFloatingWindow, LayoutDocumentFloatingWindow, LayoutDocument, LayoutDocumentPane, contents, validateLayout } from './model.js';

const ALLOWED_TYPES = new Set(['LayoutRoot','LayoutPanel','LayoutDocument','LayoutAnchorable','LayoutDocumentPane','LayoutAnchorablePane','LayoutDocumentPaneGroup','LayoutAnchorablePaneGroup','LayoutAnchorSide','LayoutAnchorGroup','LayoutAnchorableFloatingWindow','LayoutDocumentFloatingWindow']);
const SIDES = ['Top','Right','Left','Bottom'];
const EXTRA_KEYS = new Set(['Id', 'IsSelected', 'PreviousContainerId', 'PreviousContainerIndex', 'ReturnLocation']);
const MAX_BYTES = 4 * 1024 * 1024;

export function snapshot(root) {
  function encode(node) {
    const props = { Id: node.Id };
    for (const [key, descriptor] of Object.entries(getSchema(node.constructor))) {
      if (descriptor.serialize === false) continue;
      let value = node[key];
      if (value instanceof GridLength) value = value.toString();
      if (value instanceof Date) value = value.toISOString();
      if (value === undefined || typeof value === 'function' || (value && typeof value === 'object' && key !== 'UserData')) continue;
      if (key === 'UserData' && value != null) {
        try { value = JSON.parse(JSON.stringify(value)); } catch { throw new TypeError('UserData must be JSON-serializable'); }
      }
      props[key] = value;
    }
    if (node instanceof LayoutContent) {
      props.IsSelected = node.IsSelected;
      props.PreviousContainerId = node.PreviousContainerId;
      props.PreviousContainerIndex = node.PreviousContainerIndex;
      if (node._return) props.ReturnLocation = { ...node._return };
    }
    if (node instanceof LayoutAnchorGroup) props.PreviousContainerId = node.PreviousContainer?.Id || node.PreviousContainerId;
    const result = { type: node.constructor.name, props };
    if (node instanceof LayoutRoot) {
      result.rootPanel = encode(node.RootPanel);
      result.sides = Object.fromEntries(SIDES.map(side => [side, encode(node[`${side}Side`])]));
      result.floatingWindows = node.FloatingWindows.map(encode);
      result.hidden = node.Hidden.map(encode);
      result.activeContentId = node.ActiveContent?.ContentId || null;
      result.lastFocusedDocumentId = node.LastFocusedDocument?.ContentId || null;
    } else if (node.ChildrenCount) result.children = [...node.Children].map(encode);
    return result;
  }
  return { format: 'avalondock-web', version: 1, layout: encode(root) };
}

export function hydrate(data, registry = new Map(), { maxNodes = 10000, maxDepth = 64, onContent = null, strict = true } = {}) {
  if (typeof data === 'string') {
    if (data.length > MAX_BYTES) throw new RangeError('Layout exceeds the 4 MiB input limit');
    data = JSON.parse(data);
  }
  if (!data || typeof data !== 'object' || data.format !== 'avalondock-web' || data.version !== 1) throw new TypeError('Unsupported layout format or version');
  let count = 0;
  const pendingSelection = [], pendingPrevious = [], cancelled = [], unique = new Set();
  function decode(record, depth) {
    if (++count > maxNodes || depth > maxDepth) throw new RangeError('Layout exceeds the node/depth limit');
    if (!record || typeof record !== 'object' || !ALLOWED_TYPES.has(record.type)) throw new TypeError(`Unknown layout type: ${record?.type}`);
    const Type = LayoutTypes[record.type], node = new Type(), schema = getSchema(Type);
    const props = record.props || {};
    if (!props || typeof props !== 'object' || Array.isArray(props)) throw new TypeError('Layout props must be an object');
    for (const [key, value] of Object.entries(props)) {
      if (['__proto__','constructor','prototype','Content','Parent','Manager','Root'].includes(key) || key.startsWith('_')) throw new TypeError(`Unsafe layout property: ${key}`);
      if (!Object.hasOwn(schema, key) && !EXTRA_KEYS.has(key)) {
        if (strict) throw new TypeError(`Unknown property ${record.type}.${key}`);
        continue;
      }
      if (key === 'IsSelected') { if (typeof value !== 'boolean') throw new TypeError('Invalid IsSelected'); if (value) pendingSelection.push(node); }
      else if (key === 'PreviousContainerId') { if (value != null) pendingPrevious.push([node, String(value)]); }
      else if (key === 'ReturnLocation') {
        if (value && typeof value === 'object') node._return = { paneId: String(value.paneId || ''), side: SIDES.includes(value.side) ? value.side : 'Right', index: Math.max(0, Number(value.index) || 0), kind: value.kind === 'document' ? 'document' : 'anchorable' };
      } else if (key === 'Id') {
        if (typeof value !== 'string' || !value || value.length > 512) throw new TypeError('Invalid layout Id');
        node.Id = value;
      } else node[key] = value;
    }
    if (node instanceof LayoutContent) {
      if (!node.ContentId) node.ContentId = node.Id;
      if (unique.has(node.ContentId)) throw new Error(`Duplicate ContentId: ${node.ContentId}`);
      unique.add(node.ContentId);
      const entry = registry.get(node.ContentId);
      if (entry) node.Content = entry instanceof LayoutContent ? entry.Content : entry.Content ?? entry;
      const args = new LayoutSerializationCallbackEventArgs(node, node.Content);
      onContent?.(args);
      if (args.Cancel) cancelled.push(node);
      else node.Content = args.Content;
    }
    if (node instanceof LayoutRoot) {
      if (!record.rootPanel) throw new TypeError('LayoutRoot requires rootPanel');
      node.RootPanel = decode(record.rootPanel, depth + 1);
      for (const side of SIDES) if (record.sides?.[side]) node[`${side}Side`] = decode(record.sides[side], depth + 1);
      for (const child of array(record.floatingWindows)) node.FloatingWindows.Add(decode(child, depth + 1));
      for (const child of array(record.hidden)) node.Hidden.Add(decode(child, depth + 1));
      node._restoreActiveId = record.activeContentId || null;
      node._restoreLastId = record.lastFocusedDocumentId || null;
    } else {
      if (node instanceof LayoutContent && record.children?.length) throw new TypeError('Content cannot contain layout children');
      for (const child of array(record.children)) node.Children.Add(decode(child, depth + 1));
    }
    return node;
  }
  const root = decode(data.layout, 0);
  if (!(root instanceof LayoutRoot)) throw new TypeError('Top-level layout must be LayoutRoot');
  const byId = new Map([root, ...root.Descendents()].map(n => [n.Id, n]));
  for (const [node, id] of pendingPrevious) { node.PreviousContainerId = id; if (byId.has(id)) node.PreviousContainer = byId.get(id); }
  for (const node of pendingSelection) node.IsSelected = true;
  for (const node of cancelled) node.Parent?.RemoveChild(node);
  root.CollectGarbage();
  validateLayout(root, { maxNodes, maxDepth });
  const all = contents(root);
  root._activeContent = all.find(x => x.ContentId === root._restoreActiveId && x.IsVisible) || null;
  root._activeContent?._setActive(true);
  root._lastFocusedDocument = all.find(x => x.ContentId === root._restoreLastId) || null;
  return root;
}
function array(value) { if (value == null) return []; if (!Array.isArray(value)) throw new TypeError('Expected a layout array'); return value; }

export class LayoutSerializationCallbackEventArgs extends CancelEventArgs {
  constructor(Model, Content = null) { super({ Model, Content }); }
}
export class LayoutSerializer {
  constructor(manager) {
    if (!manager?.Layout) throw new TypeError('A DockingManager is required');
    this.Manager = manager; this.LayoutSerializationCallback = new EventSignal();
  }
  _registry() { this.Manager._registerContents(); return this.Manager._registry; }
  _apply(data, options = {}) {
    const root = hydrate(data, this._registry(), {
      ...options,
      onContent: args => this.LayoutSerializationCallback.emit(this, args)
    });
    this.Manager.Layout = root;
    return root;
  }
}
export class JsonLayoutSerializer extends LayoutSerializer {
  Serialize(writer = null) { return writeResult(writer, JSON.stringify(snapshot(this.Manager.Layout), null, 2)); }
  Deserialize(value, options) { return this._apply(value, options); }
}
export class XmlLayoutSerializer extends LayoutSerializer {
  Serialize(writer = null) { return writeResult(writer, toXml(this.Manager.Layout)); }
  Deserialize(value, options) {
    if (typeof value !== 'string') {
      if (value?.documentElement && typeof XMLSerializer !== 'undefined') value = new XMLSerializer().serializeToString(value);
      else throw new TypeError('Deserialize expects XML text (read File.text() first), not a filesystem path');
    }
    return this._apply(xmlToSnapshot(value), options);
  }
}
function writeResult(writer, text) {
  if (writer == null) return text;
  if (typeof writer.Write === 'function') writer.Write(text);
  else if (typeof writer.write === 'function') writer.write(text);
  else throw new TypeError('Serialize accepts a writer with Write/write, or no argument to return text');
  return text;
}
function escapeXml(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '\uFFFD').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
}
export function toXml(root) {
  const data = snapshot(root).layout;
  function encode(node, tag = node.type, depth = 1) {
    const pad = '  '.repeat(depth);
    const attrs = [];
    for (const [key, value] of Object.entries(node.props || {})) {
      if (value == null || typeof value === 'object' || key === 'UserData') continue;
      attrs.push(`${key}="${escapeXml(value)}"`);
    }
    let children = node.children || [];
    // Native AvalonDock document floating windows contain one LayoutDocument directly.
    if (node.type === 'LayoutDocumentFloatingWindow' && children[0]?.type === 'LayoutDocumentPane') {
      if (children[0].children?.length !== 1 || children[0].children[0].type !== 'LayoutDocument') throw new Error('Native XML cannot represent a multi-document floating pane. Use JSON for this web extension.');
      children = children[0].children;
    }
    const head = `${pad}<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
    return children.length ? `${head}>\n${children.map(c => encode(c, c.type, depth + 1)).join('\n')}\n${pad}</${tag}>` : `${head} />`;
  }
  const parts = ['<?xml version="1.0" encoding="utf-8"?>', '<LayoutRoot>'];
  parts.push(encode(data.rootPanel, 'RootPanel'));
  for (const side of SIDES) parts.push(encode(data.sides[side], `${side}Side`));
  for (const [tag, children] of [['FloatingWindows', data.floatingWindows], ['Hidden', data.hidden]]) {
    parts.push(children.length ? `  <${tag}>\n${children.map(c => encode(c, c.type, 2)).join('\n')}\n  </${tag}>` : `  <${tag} />`);
  }
  parts.push('</LayoutRoot>'); return parts.join('\n');
}

/** Strict, bounded layout-only XML reader. No DTDs, entities, code or content markup. */
function parseLayoutXml(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) throw new RangeError('XML must be text under 4 MiB');
  text = text.replace(/^\uFEFF/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new TypeError('DTDs and entity declarations are not allowed');
  const stack = [], roots = [];
  let pos = 0, count = 0;
  while (pos < text.length) {
    if (/\s/.test(text[pos])) { pos++; continue; }
    if (text.startsWith('<!--', pos)) { const end = text.indexOf('-->', pos + 4); if (end < 0) throw new Error('Unclosed XML comment'); pos = end + 3; continue; }
    if (text.startsWith('<?xml', pos) && roots.length === 0 && stack.length === 0) {
      const end = text.indexOf('?>', pos + 5); if (end < 0) throw new Error('Unclosed XML declaration'); pos = end + 2; continue;
    }
    if (text[pos] !== '<') throw new TypeError('Layout XML cannot contain text content');
    const match = /^<\s*(\/?)\s*([A-Za-z_][\w.:-]*)/.exec(text.slice(pos));
    if (!match) throw new Error(`Invalid XML near position ${pos}`);
    const closing = !!match[1], fullName = match[2], name = fullName.split(':').pop();
    pos += match[0].length;
    if (closing) {
      const end = /^\s*>/.exec(text.slice(pos));
      if (!end || !stack.length || stack.at(-1).fullName !== fullName) throw new Error('Mismatched XML closing tag');
      pos += end[0].length; stack.pop(); continue;
    }
    const attrs = Object.create(null); let selfClosing = false;
    for (;;) {
      const spaces = /^\s*/.exec(text.slice(pos))[0].length; pos += spaces;
      if (text.startsWith('/>', pos)) { selfClosing = true; pos += 2; break; }
      if (text[pos] === '>') { pos++; break; }
      const attr = /^([A-Za-z_][\w.:-]*)\s*=\s*(["'])([^]*?)\2/.exec(text.slice(pos));
      if (!attr || !spaces) throw new Error(`Malformed XML attribute at ${pos}`);
      if (Object.hasOwn(attrs, attr[1])) throw new Error('Duplicate XML attribute');
      if (attr[3].includes('<')) throw new Error('Unescaped XML attribute');
      attrs[attr[1]] = unescapeXml(attr[3]); pos += attr[0].length;
    }
    if (++count > 10000 || stack.length > 64) throw new RangeError('XML exceeds the node/depth limit');
    const element = { name, fullName, attrs, children: [] };
    if (stack.length) stack.at(-1).children.push(element); else roots.push(element);
    if (!selfClosing) stack.push(element);
  }
  if (stack.length || roots.length !== 1 || roots[0].name !== 'LayoutRoot') throw new Error('XML requires one complete LayoutRoot');
  return roots[0];
}
function unescapeXml(text) {
  return text.replace(/&([^;\s]*);?/g, (whole, entity) => {
    if (!whole.endsWith(';')) throw new Error('Malformed XML entity');
    const predefined = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(predefined, entity)) return predefined[entity];
    const match = /^#(x[0-9a-f]+|\d+)$/i.exec(entity);
    if (!match) throw new Error(`Unsupported XML entity: ${entity}`);
    const point = match[1][0].toLowerCase() === 'x' ? parseInt(match[1].slice(1), 16) : Number(match[1]);
    if (point < 0x20 && ![9,10,13].includes(point) || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) throw new Error('Invalid XML character');
    return String.fromCodePoint(point);
  });
}
export function xmlToSnapshot(text) {
  const xml = parseLayoutXml(text);
  function decode(element, forcedType) {
    const type = forcedType || element.name;
    if (!ALLOWED_TYPES.has(type)) throw new TypeError(`Unsupported XML layout element: ${element.name}`);
    const schema = getSchema(LayoutTypes[type]), props = {};
    for (const [key, raw] of Object.entries(element.attrs)) {
      if (key === 'xmlns' || key.startsWith('xmlns:') || key.startsWith('xsi:')) continue;
      if (key === 'Id' || key === 'PreviousContainerId') props[key] = raw;
      else if (key === 'IsSelected') { if (!/^(true|false)$/i.test(raw)) throw new TypeError('Invalid XML boolean'); props[key] = raw.toLowerCase() === 'true'; }
      else if (Object.hasOwn(schema, key) && schema[key].serialize !== false && key !== 'UserData') {
        const defaultValue = schema[key].default;
        if (typeof defaultValue === 'boolean') {
          if (!/^(true|false)$/i.test(raw)) throw new TypeError(`Invalid boolean ${key}`);
          props[key] = raw.toLowerCase() === 'true';
        } else if (typeof defaultValue === 'number') { if (raw.trim() === '' || !Number.isFinite(Number(raw))) throw new TypeError(`Invalid numeric ${key}`); props[key] = Number(raw); }
        else props[key] = raw;
      } else throw new TypeError(`Unsupported XML attribute ${type}.${key}`);
    }
    if (type === 'LayoutRoot') {
      const result = { type, props, sides: {}, floatingWindows: [], hidden: [] }, seen = new Set();
      for (const child of element.children) {
        if (seen.has(child.name)) throw new Error(`Duplicate ${child.name}`); seen.add(child.name);
        if (child.name === 'RootPanel' || child.name === 'LayoutPanel') result.rootPanel = decode(child, 'LayoutPanel');
        else if (SIDES.some(s => `${s}Side` === child.name)) {
          const side = child.name.replace('Side', '');
          const sideNode = child.children.length === 1 && child.children[0].name === 'LayoutAnchorSide' ? child.children[0] : child;
          result.sides[side] = decode(sideNode, 'LayoutAnchorSide'); result.sides[side].props.Side = side;
        } else if (child.name === 'FloatingWindows') result.floatingWindows = child.children.map(x => decode(x));
        else if (child.name === 'Hidden') result.hidden = child.children.map(x => decode(x));
        else throw new TypeError(`Unsupported root section: ${child.name}`);
      }
      if (!result.rootPanel) result.rootPanel = { type: 'LayoutPanel', props: {}, children: [] };
      return result;
    }
    return { type, props, children: element.children.map(x => decode(x)) };
  }
  return { format: 'avalondock-web', version: 1, layout: decode(xml) };
}
