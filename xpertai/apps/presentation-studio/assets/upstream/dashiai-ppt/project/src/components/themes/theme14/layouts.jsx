import { createComposedThemeRuntime } from '../generated-theme-baseline-adapter.jsx';
import { signaturePages } from './signature-pages.jsx';
import { runtimePages as sourcePages0 } from '../../../../dist/theme-runtime/theme12.module.mjs';
import { runtimePages as sourcePages1 } from '../../../../dist/theme-runtime/theme09.module.mjs';
import { runtimePages as sourcePages2 } from '../../../../dist/theme-runtime/theme04.module.mjs';
import { definition } from './theme.js';
import { ThemeProvider } from './context.jsx';
import { themeDefaults } from './defaults.js';
import { themeControls } from './controls.js';
import { chartPreset } from './charts.jsx';
import { mediaPreset } from './media.jsx';
import { visualPreset } from './visuals.js';
import { ThemeDecor, themeHelpers } from './helpers.jsx';

export const baselineTheme = 'theme12';
export const sourceThemes = ["theme12","theme09","theme04"];
export const layoutPreset = {
  "coverMode": "playful",
  "cardMode": "soft",
  "chartScale": 1,
  "sectionRule": "candy-node"
};

export function createThemePages() {
  return createComposedThemeRuntime(definition, [{themeKey:definition.key,pages:signaturePages,kind:'owned'}, {themeKey:'theme12',pages:sourcePages0}, {themeKey:'theme09',pages:sourcePages1}, {themeKey:'theme04',pages:sourcePages2}], { ThemeProvider, ThemeDecor, themeDefaults, themeControls, chartPreset, mediaPreset, visualPreset, themeHelpers, layoutPreset });
}
