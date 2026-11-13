"""Build separate upload and source ZIPs, excluding all machine-specific runtime state."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--output-dir", type=Path, default=root / "release")
args = parser.parse_args()
args.output_dir.mkdir(parents=True, exist_ok=True)
package = json.loads((root / "package.json").read_text())
version = package["version"]
excluded = {"node_modules", ".venv", ".runtime", "test-results", "__pycache__", "release"}


def collect(paths):
    files = {}
    for relative in paths:
        path = root / relative
        candidates = sorted(path.rglob("*")) if path.is_dir() else [path]
        for candidate in candidates:
            key = candidate.relative_to(root)
            if not candidate.is_file() or any(part in excluded for part in key.parts):
                continue
            if candidate.suffix in {".pyc", ".log", ".tsbuildinfo"}:
                continue
            assert not candidate.is_symlink(), candidate
            files[key.as_posix()] = candidate.read_bytes()
    return files


def write_archive(name, files, kind):
    manifest = {"name": package["name"], "version": version, "kind": kind,
                "files": {key: hashlib.sha256(data).hexdigest() for key, data in sorted(files.items())}}
    files["release-manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    target = args.output_dir / name
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for key, data in sorted(files.items()):
            archive.writestr(key, data)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        for key, digest in manifest["files"].items():
            assert hashlib.sha256(archive.read(key)).hexdigest() == digest, key
    print(f"Created {target.name} ({len(files)} files)")


install = collect(["dist", "python/funds_engine", "python/launch.py", "python/vendor", "python/requirements.txt", "docs", "examples", "README.md", "LICENSE", "env.example"])
assert "python/vendor/manifest.json" in install and "dist/index.js" in install
vendor = json.loads(install["python/vendor/manifest.json"])
requirements = dict(line.strip().split("==") for line in (root / "python/requirements.txt").read_text().splitlines() if line.strip())
assert {item["name"]: item["version"] for item in vendor["packages"]} == requirements
for name, digest in vendor["files"].items():
    assert hashlib.sha256(install["python/vendor/" + name]).hexdigest() == digest, f"Rebuild Python dependency {name}"
# Vue is bundled into the remote JS. Native imports are platform peers or Node builtins.
runtime_package = {key: value for key, value in package.items() if key not in {"scripts", "devDependencies", "dependencies", "files"}}
runtime_package["peerDependencies"] = {**package["peerDependencies"], "reflect-metadata": "^0.2.2"}
for key, data in install.items():
    if not key.startswith("dist/") or not key.endswith(".js") or key.startswith("dist/remote/"):
        continue
    for specifier in re.findall(r"^(?:import[^\n]*?from\s*|import\s*)['\"]([^'\"]+)['\"]", data.decode(), re.MULTILINE):
        if specifier.startswith((".", "node:")):
            continue
        dependency = "/".join(specifier.split("/")[:2]) if specifier.startswith("@") else specifier.split("/")[0]
        assert dependency in runtime_package["peerDependencies"], f"Declare native peer {dependency}"
install["package.json"] = (json.dumps(runtime_package, ensure_ascii=False, indent=2) + "\n").encode()
write_archive(f"funds-query-{version}.zip", install, "xpert-upload-plugin")
source = collect(["src", "scripts", "tests", "python/funds_engine", "python/tests", "python/launch.py", "python/requirements.txt", "docs", "examples", "README.md", "package.json", "tsconfig.lib.json", "tsconfig.remote.json", ".gitignore", "LICENSE", "env.example"])
write_archive(f"funds-query-source-{version}.zip", source, "development-source")
