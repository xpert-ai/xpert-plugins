/** Small observable primitives. No framework or browser globals are required. */
export class EventSignal {
  constructor() { this._listeners = new Set(); }
  add(listener) {
    if (typeof listener !== 'function') throw new TypeError('Event handler must be a function');
    this._listeners.add(listener);
    return () => this.remove(listener);
  }
  remove(listener) { this._listeners.delete(listener); }
  Add(listener) { return this.add(listener); }
  Remove(listener) { this.remove(listener); }
  subscribe(listener) { return this.add(listener); }
  emit(sender, args = {}) { for (const fn of [...this._listeners]) fn(sender, args); }
  clear() { this._listeners.clear(); }
  get Count() { return this._listeners.size; }
}

export class CancelEventArgs {
  constructor(values = {}) { this.Cancel = false; Object.assign(this, values); }
  preventDefault() { this.Cancel = true; }
}
export class PropertyChangedEventArgs {
  constructor(PropertyName, OldValue, NewValue) { Object.assign(this, { PropertyName, OldValue, NewValue }); }
}
export class ObservableObject {
  constructor() {
    this._values = Object.create(null);
    this.PropertyChanging = new EventSignal();
    this.PropertyChanged = new EventSignal();
  }
  on(name, handler) {
    const signal = this[name];
    if (!(signal instanceof EventSignal)) throw new TypeError(`Unknown event: ${name}`);
    return signal.add(handler);
  }
  off(name, handler) { this[name]?.remove(handler); }
  GetValue(property) { return this[typeof property === 'string' ? property : property.Name]; }
  SetValue(property, value) { this[typeof property === 'string' ? property : property.Name] = value; }
  SetCurrentValue(property, value) { this.SetValue(property, value); }
  ClearValue(property) {
    const key = typeof property === 'string' ? property : property.Name;
    const descriptor = getSchema(this.constructor)[key];
    if (!descriptor) throw new TypeError(`Unknown property: ${key}`);
    this[key] = descriptor.default;
  }
  _set(key, value, descriptor = {}) {
    if (descriptor.coerce) value = descriptor.coerce(value);
    if (descriptor.validate && !descriptor.validate(value)) throw new TypeError(`Invalid ${key}: ${value}`);
    this._validateProperty?.(key, value);
    const old = this[key];
    if (Object.is(old, value) || (old instanceof GridLength && value instanceof GridLength && old.Equals(value))) return;
    this._willChange?.(key);
    const args = new PropertyChangedEventArgs(key, old, value);
    this.PropertyChanging.emit(this, args);
    this._values[key] = value;
    descriptor.changed?.call(this, value, old);
    this.PropertyChanged.emit(this, args);
    this._didChange?.(key, args);
  }
}

export function getSchema(ctor) {
  const chain = [];
  for (let c = ctor; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    if (Object.hasOwn(c, 'schema')) chain.unshift(c.schema);
  }
  return Object.assign({}, ...chain);
}
export function properties(ctor, schema) {
  Object.defineProperty(ctor, 'schema', { value: schema });
  for (const [name, descriptor] of Object.entries(schema)) {
    Object.defineProperty(ctor.prototype, name, {
      configurable: true, enumerable: true,
      get() {
        if (Object.hasOwn(this._values, name)) return this._values[name];
        return descriptor.coerce ? descriptor.coerce(descriptor.default) : descriptor.default;
      },
      set(value) { this._set(name, value, descriptor); }
    });
    Object.defineProperty(ctor, `${name}Property`, { value: Object.freeze({ Name: name, OwnerType: ctor.name }) });
  }
}

export class GridLength {
  constructor(value = 1, unit = 'Star') {
    if (!['Star', 'Pixel', 'Auto'].includes(unit)) throw new TypeError('Grid unit must be Star, Pixel, or Auto');
    value = Number(value);
    if (!Number.isFinite(value) || value < 0) throw new RangeError('GridLength must be finite and nonnegative');
    this.Value = value; this.GridUnitType = unit;
    Object.freeze(this);
  }
  get IsStar() { return this.GridUnitType === 'Star'; }
  get IsAbsolute() { return this.GridUnitType === 'Pixel'; }
  get IsAuto() { return this.GridUnitType === 'Auto'; }
  Equals(other) { return other instanceof GridLength && this.Value === other.Value && this.GridUnitType === other.GridUnitType; }
  toString() { return this.IsAuto ? 'Auto' : `${this.Value}${this.IsStar ? '*' : ''}`; }
  toJSON() { return this.toString(); }
  static Parse(value) {
    if (value instanceof GridLength) return value;
    if (typeof value === 'number') return new GridLength(value, 'Pixel');
    if (typeof value !== 'string') throw new TypeError('GridLength expects a number or a string such as "2*"');
    const text = value.trim();
    if (/^auto$/i.test(text)) return new GridLength(1, 'Auto');
    if (/^(?:\d+(?:\.\d+)?|\.\d+)?\*$/.test(text)) return new GridLength(text === '*' ? 1 : Number(text.slice(0, -1)), 'Star');
    if (/^(?:\d+(?:\.\d+)?|\.\d+)(px)?$/i.test(text)) return new GridLength(parseFloat(text), 'Pixel');
    throw new TypeError(`Invalid GridLength: ${value}`);
  }
  static get Auto() { return new GridLength(1, 'Auto'); }
}
export const GridUnitType = Object.freeze({ Auto: 'Auto', Pixel: 'Pixel', Star: 'Star' });
export const Orientation = Object.freeze({ Horizontal: 'Horizontal', Vertical: 'Vertical' });

/** Numeric indexing, .NET-style methods, and familiar iterable/array helpers. */
export class ObservableCollection {
  constructor(items = [], owner = null, role = 'Children') {
    this._items = []; this._owner = owner; this._role = role;
    this.CollectionChanged = new EventSignal();
    const proxy = new Proxy(this, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) return target._items[Number(key)];
        return Reflect.get(target, key, receiver);
      },
      set(target, key, value, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) { receiver.Set(Number(key), value); return true; }
        return Reflect.set(target, key, value, receiver);
      }
    });
    for (const item of items) proxy.Add(item);
    return proxy;
  }
  get Count() { return this._items.length; }
  get length() { return this._items.length; }
  [Symbol.iterator]() { return this._items[Symbol.iterator](); }
  at(index) { return this._items.at(index); }
  get(index) { return this._items[index]; }
  IndexOf(item) { return this._items.indexOf(item); }
  indexOf(item) { return this.IndexOf(item); }
  Contains(item) { return this._items.includes(item); }
  includes(item) { return this.Contains(item); }
  find(fn) { return this._items.find(fn); }
  findIndex(fn) { return this._items.findIndex(fn); }
  filter(fn) { return this._items.filter(fn); }
  map(fn) { return this._items.map(fn); }
  forEach(fn) { return this._items.forEach(fn); }
  every(fn) { return this._items.every(fn); }
  some(fn) { return this._items.some(fn); }
  reduce(fn, initial) { return this._items.reduce(fn, initial); }
  slice(...args) { return this._items.slice(...args); }
  ToArray() { return [...this._items]; }
  Add(item) { this.Insert(this.Count, item); return item; }
  AddRange(items) { for (const item of [...items]) this.Add(item); }
  push(...items) { this.AddRange(items); return this.Count; }
  Insert(index, item) {
    if (!Number.isInteger(index) || index < 0 || index > this.Count) throw new RangeError('Collection insertion index out of range');
    this._owner?._validateChild(item, this._role);
    const oldIndex = this.IndexOf(item);
    if (oldIndex !== -1 && this._owner) {
      this.Move(oldIndex, Math.min(index, this.Count - 1)); return;
    }
    this._owner?._willChange(this._role);
    if (this._owner && item?.Parent) item.Parent.RemoveChild(item);
    this._items.splice(index, 0, item);
    if (this._owner) item._parent = this._owner;
    this._notify({ Action: 'Add', NewItems: [item], OldItems: [], NewStartingIndex: index, OldStartingIndex: -1 });
  }
  Set(index, item) {
    if (index === this.Count) { this.Add(item); return; }
    if (!Number.isInteger(index) || index < 0 || index >= this.Count) throw new RangeError('Collection index out of range');
    if (this._items[index] === item) return;
    this._owner?._validateChild(item, this._role, true);
    if (this._owner && this.Contains(item)) throw new Error('A layout node cannot appear twice in a collection');
    const old = this._items[index];
    this._owner?._willChange(this._role);
    if (this._owner && item?.Parent) item.Parent.RemoveChild(item);
    if (this._owner) { old._parent = null; item._parent = this._owner; }
    this._items[index] = item;
    this._notify({ Action: 'Replace', NewItems: [item], OldItems: [old], NewStartingIndex: index, OldStartingIndex: index });
  }
  Remove(item) { const index = this.IndexOf(item); if (index < 0) return false; this.RemoveAt(index); return true; }
  RemoveAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.Count) throw new RangeError('Collection removal index out of range');
    this._owner?._willChange(this._role);
    const [item] = this._items.splice(index, 1);
    if (this._owner) item._parent = null;
    this._notify({ Action: 'Remove', NewItems: [], OldItems: [item], NewStartingIndex: -1, OldStartingIndex: index });
    return item;
  }
  Move(oldIndex, newIndex) {
    if (![oldIndex, newIndex].every(i => Number.isInteger(i) && i >= 0 && i < this.Count)) throw new RangeError('Move index out of range');
    if (oldIndex === newIndex) return;
    this._owner?._willChange(this._role);
    const [item] = this._items.splice(oldIndex, 1);
    this._items.splice(newIndex, 0, item);
    this._notify({ Action: 'Move', NewItems: [item], OldItems: [item], NewStartingIndex: newIndex, OldStartingIndex: oldIndex });
  }
  Clear() {
    if (!this.Count) return;
    this._owner?._willChange(this._role);
    const old = this._items.splice(0);
    if (this._owner) for (const item of old) item._parent = null;
    this._notify({ Action: 'Reset', NewItems: [], OldItems: old, NewStartingIndex: -1, OldStartingIndex: 0 });
  }
  pop() { return this.Count ? this.RemoveAt(this.Count - 1) : undefined; }
  shift() { return this.Count ? this.RemoveAt(0) : undefined; }
  unshift(...items) { items.forEach((x, i) => this.Insert(i, x)); return this.Count; }
  splice(start, deleteCount = this.Count, ...items) {
    start = start < 0 ? Math.max(0, this.Count + start) : Math.min(this.Count, start);
    const removed = [];
    for (let n = Math.min(deleteCount, this.Count - start); n > 0; n--) removed.push(this.RemoveAt(start));
    items.forEach((item, i) => this.Insert(start + i, item));
    return removed;
  }
  _notify(args) {
    this._owner?._collectionChanged(this._role, args);
    this.CollectionChanged.emit(this, args);
  }
}
export class RelayCommand {
  constructor(execute, canExecute = () => true) {
    this._execute = execute; this._canExecute = canExecute; this.CanExecuteChanged = new EventSignal();
  }
  CanExecute(parameter) { return !!this._canExecute(parameter); }
  Execute(parameter) { return this.CanExecute(parameter) ? this._execute(parameter) : false; }
  RaiseCanExecuteChanged() { this.CanExecuteChanged.emit(this, {}); }
}
export const finite = value => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError('Expected a finite number');
  return number;
};
export const positive = value => {
  const number = finite(value);
  if (number < 0) throw new RangeError('Expected a nonnegative number');
  return number;
};
export const boolean = value => {
  if (typeof value !== 'boolean') throw new TypeError('Expected a boolean');
  return value;
};
let serial = 0;
export function uid(prefix = 'layout') { return `${prefix}-${(++serial).toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
