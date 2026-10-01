/** Theme names retained as API adapters; these are original CSS themes, not WPF resources. */
export class Theme {
  constructor(name = 'dark', variables = {}) { this.Name = name; this.Variables = { ...variables }; }
  GetResourceUri() { return new URL('./avalondock.css', import.meta.url).href; }
  toString() { return this.Name; }
}
export class GenericTheme extends Theme { constructor() { super('light'); } }
export class AeroTheme extends Theme { constructor() { super('aero'); } }
export class VS2010Theme extends Theme { constructor() { super('vs2010'); } }
export class MetroTheme extends Theme { constructor() { super('metro'); } }
export class DarkTheme extends Theme { constructor() { super('dark'); } }
export class LightTheme extends Theme { constructor() { super('light'); } }
export class HighContrastTheme extends Theme { constructor() { super('contrast'); } }
