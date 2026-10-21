const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  // Transform the ESM dependencies used by published Contracts and plugin code,
  // including pnpm's nested paths, with each project's SWC configuration.
  transformIgnorePatterns: [
    'node_modules/(?!\\.pnpm(?:/|$)|@xpert-ai/chatkit-types(?:/|$)|lodash-es(?:/|$))',
    'node_modules/\\.pnpm/(?!@xpert-ai\\+chatkit-types@|lodash-es@)',
  ],
};
