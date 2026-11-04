"""Run the packaged engine with isolated Python and bundled pure-Python dependencies."""
import json
from pathlib import Path
import runpy
import sys

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parent
sys.path[:0] = [str(root / "vendor"), str(root)]


def check_runtime():
    if sys.version_info < (3, 11):
        return {"ok": False, "code": "python_version"}
    try:
        import sqlite3
        import importlib.metadata
        import openpyxl
        import defusedxml
        import et_xmlfile
        packages = json.loads((root / "vendor" / "manifest.json").read_text())["packages"]
        for package in packages:
            if importlib.metadata.version(package["name"]) != package["version"]:
                return {"ok": False, "code": "runtime_dependencies"}
        for module in (openpyxl, defusedxml, et_xmlfile):
            if not Path(module.__file__).resolve().is_relative_to(root / "vendor"):
                return {"ok": False, "code": "runtime_dependencies"}
        return {"ok": True, "version": ".".join(map(str, sys.version_info[:3]))}
    except (ImportError, OSError, ValueError, KeyError):
        return {"ok": False, "code": "runtime_dependencies"}


if __name__ == "__main__":
    result = check_runtime()
    if "--check" in sys.argv:
        print(json.dumps(result))
    elif result["ok"]:
        runpy.run_module("funds_engine.worker", run_name="__main__")
    else:
        print(json.dumps({"ok": False, "error": {"code": result["code"], "message": "Python 运行环境检查失败，请检查插件安装包及解释器版本。"}}))
