"""Copy pinned pure-Python distributions and license metadata into the installable package."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import shutil
import tempfile

root = Path(__file__).resolve().parents[1]
modules = {"openpyxl": "openpyxl", "defusedxml": "defusedxml", "et-xmlfile": "et_xmlfile"}
requirements = dict(line.strip().split("==") for line in (root / "python/requirements.txt").read_text().splitlines() if line.strip())
assert set(requirements) == set(modules)
temporary = Path(tempfile.mkdtemp(prefix="vendor-build-", dir=root / "python"))
packages = []
try:
    for name, module in modules.items():
        distribution = importlib.metadata.distribution(name)
        assert distribution.version == requirements[name], f"Install pinned Python dependency {name}"
        wheel = distribution.read_text("WHEEL") or ""
        assert "Root-Is-Purelib: true" in wheel, f"Expected portable pure Python wheel for {name}"
        source = Path(distribution.locate_file(module))
        shutil.copytree(source, temporary / module, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        metadata = next(item.parts[0] for item in distribution.files if item.parts[0].endswith(".dist-info"))
        shutil.copytree(distribution.locate_file(metadata), temporary / metadata)
        packages.append({"name": name, "version": distribution.version})
    hashes = {}
    for path in sorted(temporary.rglob("*")):
        if path.is_file():
            assert path.suffix not in {".so", ".dylib", ".pyd", ".pyc"}, path
            hashes[path.relative_to(temporary).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    (temporary / "manifest.json").write_text(json.dumps({"packages": packages, "files": hashes}, indent=2) + "\n")
    target = root / "python/vendor"
    previous = root / "python/vendor-previous"
    assert not previous.exists(), "An unfinished vendor build needs inspection"
    if target.exists():
        target.rename(previous)
    try:
        temporary.rename(target)
    except Exception:
        if previous.exists():
            previous.rename(target)
        raise
    if previous.exists():
        shutil.rmtree(previous)
    print("Bundled 3 pinned pure-Python dependencies with license metadata.")
finally:
    if temporary.exists():
        shutil.rmtree(temporary)
