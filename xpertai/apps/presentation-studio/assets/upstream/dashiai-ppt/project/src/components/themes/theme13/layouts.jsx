import { createComposedThemeRuntime } from '../generated-theme-baseline-adapter.jsx';
import { signaturePages } from './signature-pages.jsx';
import { runtimePages as sourcePages0 } from '../../../../dist/theme-runtime/theme02.module.mjs';
import { runtimePages as sourcePages1 } from '../../../../dist/theme-runtime/theme03.module.mjs';
import { runtimePages as sourcePages2 } from '../../../../dist/theme-runtime/theme05.module.mjs';
import { definition } from './theme.js';
import { ThemeProvider } from './context.jsx';
import { themeDefaults } from './defaults.js';
import { themeControls } from './controls.js';
import { chartPreset } from './charts.jsx';
import { mediaPreset } from './media.jsx';
import { visualPreset } from './visuals.js';
import { ThemeDecor, themeHelpers } from './helpers.jsx';

export const baselineTheme = 'theme02';
export const sourceThemes = ["theme02","theme03","theme05"];
export const layoutPreset = {
  "coverMode": "centered",
  "cardMode": "soft",
  "chartScale": 1,
  "sectionRule": "node-arrow"
};

export function createThemePages() {
  return createComposedThemeRuntime(definition, [{themeKey:definition.key,pages:signaturePages,kind:'owned'}, {themeKey:'theme02',pages:sourcePages0}, {themeKey:'theme03',pages:sourcePages1}, {themeKey:'theme05',pages:sourcePages2}], { ThemeProvider, ThemeDecor, themeDefaults, themeControls, chartPreset, mediaPreset, visualPreset, themeHelpers, layoutPreset });
}
