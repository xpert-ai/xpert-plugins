/** An explicit release:prepare script owns all preparation for a non-Nx package. */
export function planReleasePreparation(packages, selectedNames) {
  const byName = new Map(packages.map((pkg) => [pkg.packageJson.name, pkg]));
  const scriptPackages = [];
  const nxPackages = [];
  for (const name of selectedNames) {
    const pkg = byName.get(name);
    if (!pkg) throw new Error(`Unknown release package: ${name}`);
    const script = pkg.packageJson.scripts?.['release:prepare'];
    if (script !== undefined) {
      if (typeof script !== 'string' || !script.trim()) {
        throw new Error(`Invalid release:prepare script for ${name}`);
      }
      scriptPackages.push({ name, dir: pkg.dir });
    } else {
      nxPackages.push(name);
    }
  }
  return { scriptPackages, nxPackages };
}
