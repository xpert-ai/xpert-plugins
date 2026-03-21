#!/usr/bin/env python3

import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile


DEFAULT_API_BASE = "https://mineru.net/api/v4"
DEFAULT_POLL_INTERVAL = 5
DEFAULT_TIMEOUT = 900
SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".png",
    ".jpg",
    ".jpeg",
    ".html",
}


def parse_args():
    parser = argparse.ArgumentParser(description="Managed MinerU CLI runner")
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument("--file", help="Single input file to parse")
    target_group.add_argument("--dir", help="Directory containing supported input files")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--workers", type=int, default=4, help="Concurrent upload workers")
    parser.add_argument("--resume", action="store_true", help="Skip files with existing full.md")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="MinerU API base URL")
    parser.add_argument("--model-version", default="pipeline", help="MinerU model version")
    parser.add_argument("--language", help="Language hint")
    parser.add_argument("--ocr", action="store_true", help="Enable OCR")
    parser.add_argument("--enable-formula", dest="enable_formula", action="store_true", default=True)
    parser.add_argument("--disable-formula", dest="enable_formula", action="store_false")
    parser.add_argument("--enable-table", dest="enable_table", action="store_true", default=True)
    parser.add_argument("--disable-table", dest="enable_table", action="store_false")
    parser.add_argument("--poll-interval", type=int, default=DEFAULT_POLL_INTERVAL, help="Polling interval in seconds")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Overall polling timeout in seconds")
    return parser.parse_args()


def ensure_token():
    token = os.environ.get("MINERU_TOKEN", "").strip()
    if not token:
      raise SystemExit("MINERU_TOKEN is not configured. Check the MinerU middleware apiKey setting.")
    return token


def list_input_files(args):
    if args.file:
        file_path = Path(args.file).expanduser().resolve()
        if not file_path.is_file():
            raise SystemExit(f"Input file does not exist: {file_path}")
        return [build_file_entry(file_path)]

    root = Path(args.dir).expanduser().resolve()
    if not root.is_dir():
        raise SystemExit(f"Input directory does not exist: {root}")

    files = [
        build_file_entry(path, root)
        for path in sorted(root.rglob("*"))
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    if not files:
        raise SystemExit(f"No supported files found under: {root}")
    return files


def build_file_entry(file_path, input_root=None):
    relative_path = file_path.name if input_root is None else file_path.relative_to(input_root).as_posix()
    stable_id = hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:12]
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", file_path.stem).strip(".-") or "document"
    return {
        "id": stable_id,
        "file_path": file_path,
        "file_name": file_path.name,
        "relative_path": relative_path,
        "output_name": f"{safe_name}-{stable_id}",
    }


def output_dir_for(file_entry, output_root):
    return output_root / file_entry["output_name"]


def should_skip(file_entry, output_root, resume):
    if not resume:
        return False
    return (output_dir_for(file_entry, output_root) / "full.md").exists()


def build_headers(token, content_type="application/json"):
    headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def request_json(method, url, *, headers, payload=None):
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with status {exc.code}: {detail}") from exc


def request_bytes(method, url, *, headers=None, data=None):
    request = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with status {exc.code}: {detail}") from exc


def apply_upload_urls(api_base, token, files, args):
    payload = {
        "files": [{"name": file_entry["file_name"], "data_id": file_entry["id"]} for file_entry in files],
        "model_version": args.model_version,
        "enable_formula": args.enable_formula,
        "enable_table": args.enable_table,
    }
    if args.language:
        payload["language"] = args.language
    if args.ocr:
        for file_entry in payload["files"]:
            file_entry["is_ocr"] = True

    response = request_json(
        "POST",
        f"{api_base.rstrip('/')}/file-urls/batch",
        headers=build_headers(token),
        payload=payload,
    )
    if response.get("code") != 0:
        raise RuntimeError(f"MinerU upload URL request failed: {response.get('msg', 'unknown error')}")

    data = response.get("data", {})
    batch_id = data.get("batch_id")
    file_urls = data.get("file_urls") or data.get("files")
    if not batch_id or not isinstance(file_urls, list) or len(file_urls) != len(files):
        raise RuntimeError("MinerU upload URL response is incomplete.")
    return batch_id, file_urls


def upload_file(file_path, upload_url):
    with file_path["file_path"].open("rb") as handle:
        data = handle.read()
    request_bytes("PUT", upload_url, headers={}, data=data)
    return file_path["id"]


def upload_files(files, upload_urls, workers):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = [
            executor.submit(upload_file, file_path, upload_url)
            for file_path, upload_url in zip(files, upload_urls)
        ]
        for future in concurrent.futures.as_completed(futures):
            future.result()


def poll_results(api_base, token, batch_id, *, timeout_sec, interval_sec):
    deadline = time.time() + max(1, timeout_sec)
    last_states = None
    while True:
        response = request_json(
            "GET",
            f"{api_base.rstrip('/')}/extract-results/batch/{urllib.parse.quote(batch_id)}",
            headers=build_headers(token, content_type=None),
        )
        if response.get("code") != 0:
            raise RuntimeError(f"MinerU batch result request failed: {response.get('msg', 'unknown error')}")

        items = response.get("data", {}).get("extract_result", [])
        states = [item.get("state", "unknown") for item in items]
        if states != last_states:
            print(f"Batch {batch_id} states: {', '.join(states)}", file=sys.stderr)
            last_states = states

        if items and all(state in {"done", "failed"} for state in states):
            return items

        if time.time() >= deadline:
            raise RuntimeError(f"Timed out waiting for MinerU batch {batch_id}")

        time.sleep(max(1, interval_sec))


def write_result_archive(file_path, output_root, item):
    target_dir = output_dir_for(file_path, output_root)
    target_dir.mkdir(parents=True, exist_ok=True)

    zip_url = item.get("full_zip_url")
    if not zip_url:
        raise RuntimeError(f"Missing full_zip_url for {file_path['relative_path']}")

    archive_bytes = request_bytes("GET", zip_url)
    archive_path = target_dir / "result.zip"
    archive_path.write_bytes(archive_bytes)

    extracted_dir = target_dir / "extracted"
    if extracted_dir.exists():
        shutil.rmtree(extracted_dir)
    extracted_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_zip = Path(tmp_dir) / "result.zip"
        tmp_zip.write_bytes(archive_bytes)
        with zipfile.ZipFile(tmp_zip, "r") as zip_handle:
            zip_handle.extractall(extracted_dir)

    full_md_candidates = list(extracted_dir.rglob("full.md"))
    if not full_md_candidates:
        raise RuntimeError(f"MinerU archive for {file_path['relative_path']} does not contain full.md")
    shutil.copyfile(full_md_candidates[0], target_dir / "full.md")


def build_manifest(files, result_items, output_root, skipped_ids):
    indexed_results = {}
    for item in result_items:
        result_key = item.get("data_id") or item.get("file_name")
        if result_key:
            indexed_results[result_key] = item
    manifest = []
    for file_entry in files:
        item = indexed_results.get(file_entry["id"], {})
        manifest.append(
            {
                "id": file_entry["id"],
                "file": str(file_entry["file_path"]),
                "relative_path": file_entry["relative_path"],
                "file_name": file_entry["file_name"],
                "output_dir": str(output_dir_for(file_entry, output_root)),
                "state": item.get("state", "skipped" if file_entry["id"] in skipped_ids else "missing"),
                "err_msg": item.get("err_msg", ""),
                "full_zip_url": item.get("full_zip_url"),
            }
        )
    return manifest


def main():
    args = parse_args()
    token = ensure_token()
    output_root = Path(args.output).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    input_files = list_input_files(args)
    pending_files = [file_entry for file_entry in input_files if not should_skip(file_entry, output_root, args.resume)]
    skipped_ids = {file_entry["id"] for file_entry in input_files if file_entry not in pending_files}

    if not pending_files:
        manifest = build_manifest(input_files, [], output_root, skipped_ids)
        (output_root / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("All files already have extracted output. Nothing to do.")
        return 0

    batch_id, upload_urls = apply_upload_urls(args.api_base, token, pending_files, args)
    upload_files(pending_files, upload_urls, args.workers)
    result_items = poll_results(
        args.api_base,
        token,
        batch_id,
        timeout_sec=args.timeout,
        interval_sec=args.poll_interval,
    )

    failures = []
    indexed_results = {}
    for item in result_items:
        result_key = item.get("data_id") or item.get("file_name")
        if result_key:
            indexed_results[result_key] = item
    for file_path in pending_files:
        item = indexed_results.get(file_path["id"])
        if not item:
            failures.append({"file_name": file_path["relative_path"], "err_msg": "missing batch result"})
            continue
        if item.get("state") != "done":
            failures.append({"file_name": file_path["relative_path"], "err_msg": item.get("err_msg", "unknown error")})
            continue
        write_result_archive(file_path, output_root, item)

    manifest = build_manifest(input_files, result_items, output_root, skipped_ids)
    (output_root / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if failures:
        for item in failures:
            print(f"{item['file_name']}: {item['err_msg']}", file=sys.stderr)
        return 1

    print(f"MinerU extraction finished for {len(pending_files)} file(s). Output: {output_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
