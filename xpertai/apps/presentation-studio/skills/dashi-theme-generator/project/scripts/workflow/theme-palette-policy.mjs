export function resolveThemePaletteValidation(definitions, requested = '') {
  const requestedDefinition = requested ? definitions.find(theme => theme.key === requested) : null;
  if (requested && !requestedDefinition) throw new Error(`${requested} is not a registered generated theme`);
  if (requestedDefinition?.profile?.paletteMode === 'adaptive') {
    return {
      mode: 'skip',
      definitions: [],
      message: `${requested}: adaptive palette keeps source-module color hierarchy; strict opposite-canvas audit is not applicable.`
    };
  }
  const strictDefinitions = definitions.filter(theme =>
    theme.profile?.paletteMode === 'strict' && (!requested || theme.key === requested)
  );
  if (!strictDefinitions.length) {
    return {
      mode: 'skip',
      definitions: [],
      message: 'No strict-palette generated themes are registered; strict opposite-canvas audit is not applicable.'
    };
  }
  return { mode: 'strict', definitions: strictDefinitions, message: '' };
}
