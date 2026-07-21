import { createComposedThemeRuntime } from '../generated-theme-baseline-adapter.jsx';
import { signaturePages } from './signature-pages.jsx';
import { runtimePages as sourcePages0 } from '../../../../dist/theme-runtime/theme09.module.mjs';
import { runtimePages as sourcePages1 } from '../../../../dist/theme-runtime/theme07.module.mjs';
import { runtimePages as sourcePages2 } from '../../../../dist/theme-runtime/theme05.module.mjs';
import { runtimePages as sourcePages3 } from '../../../../dist/theme-runtime/theme01.module.mjs';
import { definition } from './theme.js';
import { ThemeProvider } from './context.jsx';
import { themeDefaults } from './defaults.js';
import { themeControls } from './controls.js';
import { chartPreset } from './charts.jsx';
import { mediaPreset } from './media.jsx';
import { visualPreset } from './visuals.js';
import { ThemeDecor, themeHelpers } from './helpers.jsx';

export const baselineTheme = 'theme09';
export const sourceThemes = ["theme09","theme07","theme05","theme01"];
export const layoutPreset = {
  "coverMode": "feature",
  "cardMode": "editorial",
  "chartScale": 1,
  "sectionRule": "short-rule-node"
};

export function createThemePages() {
  return createComposedThemeRuntime(definition, [{themeKey:definition.key,pages:signaturePages,kind:'owned'}, {themeKey:'theme09',pages:sourcePages0}, {themeKey:'theme07',pages:sourcePages1}, {themeKey:'theme05',pages:sourcePages2}, {themeKey:'theme01',pages:sourcePages3}], { ThemeProvider, ThemeDecor, themeDefaults, themeControls, chartPreset, mediaPreset, visualPreset, themeHelpers, layoutPreset });
}
