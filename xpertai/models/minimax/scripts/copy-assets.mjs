import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const sourceAssets = path.join(packageRoot, 'src', '_assets');
const targetAssets = path.join(packageRoot, 'dist', '_assets');

// Copy src/_assets -> dist/_assets
if (existsSync(sourceAssets)) {
  rmSync(targetAssets, { recursive: true, force: true });
  mkdirSync(path.dirname(targetAssets), { recursive: true });
  cpSync(sourceAssets, targetAssets, { recursive: true });
}

// Copy all YAML/YML under src -> dist to expose manifests/model metadata
const srcRoot = path.join(packageRoot, 'src');
const distRoot = path.join(packageRoot, 'dist');

function copyYaml(srcDir, destDir) {
  const entries = readdirSync(srcDir);
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    const stats = statSync(srcPath);
    if (stats.isDirectory()) {
      copyYaml(srcPath, destPath);
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      mkdirSync(path.dirname(destPath), { recursive: true });
      cpSync(srcPath, destPath);
    }
  }
}

if (existsSync(srcRoot)) {
  copyYaml(srcRoot, distRoot);
}

