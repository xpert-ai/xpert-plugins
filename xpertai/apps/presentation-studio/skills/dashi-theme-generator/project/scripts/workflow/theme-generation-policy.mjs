export const THEME_GENERATION_MODES = ['fidelity', 'reuse-first'];
export const THEME_GENERATION_POLICY_VERSION = 2;

const POLICIES = {
  fidelity: {
    generationMode: 'fidelity',
    minimumReferences: 8,
    minimumArchetypes: 8,
    minimumNotesPerArchetype: 3,
    minimumReuseJustifications: 3,
    requiredArchetypeFamilies: ['cover', 'general', 'metrics', 'media'],
    minimumComplexFamilies: 2,
    minimumArchetypeFamilies: 6,
    minimumObservedModules: 8,
    defaultObservedModules: 8,
    maximumObservedModules: 96,
    minimumInferredModules: 8,
    maximumInferredModules: 16,
    minimumOwnedModules: 16,
    minimumOwnedFamilies: 9,
    minimumStyleRules: 8,
    minimumSignaturePrimitives: 4,
    minimumObservedStyleSignals: 3,
    minimumAverageLeaves: 30,
    minimumAverageArrays: 2,
  },
  'reuse-first': {
    generationMode: 'reuse-first',
    minimumReferences: 4,
    minimumArchetypes: 4,
    minimumNotesPerArchetype: 1,
    minimumReuseJustifications: 1,
    requiredArchetypeFamilies: ['cover', 'general'],
    minimumComplexFamilies: 0,
    minimumArchetypeFamilies: 3,
    minimumObservedModules: 2,
    defaultObservedModules: 2,
    maximumObservedModules: 4,
    minimumInferredModules: 0,
    maximumInferredModules: 4,
    minimumOwnedModules: 2,
    minimumOwnedFamilies: 2,
    minimumStyleRules: 4,
    minimumSignaturePrimitives: 1,
    minimumObservedStyleSignals: 1,
    minimumAverageLeaves: 22,
    minimumAverageArrays: 1.25,
  },
};

export function normalizeThemeGenerationMode(value, fallback = 'fidelity') {
  const mode = String(value || fallback);
  if (!THEME_GENERATION_MODES.includes(mode)) {
    throw new Error(`generationMode must be one of ${THEME_GENERATION_MODES.join(', ')}`);
  }
  return mode;
}

export function resolveThemeGenerationPolicy(value, fallback = 'fidelity') {
  return POLICIES[normalizeThemeGenerationMode(value, fallback)];
}
