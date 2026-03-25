#!/usr/bin/env python3
"""
MinerU Document Converter CLI
Converts documents (PDF, Doc, Docx, PPT, PPTx, images, HTML) to Markdown
using MinerU APIs.

Primary: Precise Parsing API (uses MINERU_TOKEN or a managed token file)
Fallback: Agent Lightweight Parsing API (no token, but limited to 10MB/20 pages)

Usage:
    # Parse a URL
    python mineru.py --url https://example.com/doc.pdf

    # Parse a local file
    python mineru.py --file /path/to/document.pdf

    # Use VLM model for better results
    python mineru.py --url https://example.com/doc.pdf --model vlm

    # Enable OCR
    python mineru.py --file /path/to/scan.pdf --ocr

    # Specify page range
    python mineru.py --file /path/to/doc.pdf --pages 1-10

    # Force agent lightweight API
    python mineru.py --file /path/to/doc.pdf --agent

    # Extra output formats
    python mineru.py --url https://example.com/doc.pdf --formats docx html
"""

import argparse
import http.client
import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

BASE_URL_PRECISE = "https://mineru.net/api/v4"
BASE_URL_AGENT = "https://mineru.net/api/v1/agent"
POLL_INTERVAL = 5  # seconds
MAX_POLL_TIME = 600  # 10 minutes
DEFAULT_MANAGED_TOKEN_PATH = "/workspace/.xpert/secrets/mineru_token"
INVALID_OUTPUT_CHARS = set('/\\:*?"<>|')

def read_token_file(path, warn=False):
    try:
        with open(path, "r", encoding="utf-8") as token_file:
            return token_file.read().strip()
    except OSError:
        if warn:
            print(f"Warning: unable to read MINERU_TOKEN_FILE: {path}", file=sys.stderr)
        return ""


def get_token():
    token = os.environ.get("MINERU_TOKEN", "").strip()
    if token:
        return token

    token_file = os.environ.get("MINERU_TOKEN_FILE", "").strip()
    if token_file:
        return read_token_file(token_file, warn=True)

    return read_token_file(DEFAULT_MANAGED_TOKEN_PATH)


def api_request(url, data=None, method="GET", headers=None, binary_data=None):
    """Make an HTTP request and return parsed JSON (or raw response for PUT)."""
    if headers is None:
        headers = {}

    if data is not None and binary_data is None:
        body = json.dumps(data).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")
    elif binary_data is not None:
        body = binary_data
    else:
        body = None

    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read()
            if "application/json" in content_type:
                return json.loads(raw)
            return raw
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP Error {e.code}: {error_body}", file=sys.stderr)
        return None
    except urllib.error.URLError as e:
        print(f"URL Error: {e.reason}", file=sys.stderr)
        return None


def sanitize_output_name(name):
    """Sanitize a user-derived file name for use as an output directory."""
    cleaned = []
    for char in name.strip():
        if char in INVALID_OUTPUT_CHARS or ord(char) < 32 or ord(char) == 127:
            cleaned.append("_")
        else:
            cleaned.append(char)

    value = "".join(cleaned).strip()
    return value or "output"


def extract_url_source_name(url):
    parsed = urllib.parse.urlsplit(url)
    basename = os.path.basename(urllib.parse.unquote(parsed.path))
    if not basename:
        return ""

    return Path(basename).stem


def resolve_output_stem(args, task_id=None):
    if args.file:
        return sanitize_output_name(Path(args.file).stem)

    if args.url:
        url_source_name = extract_url_source_name(args.url)
        if url_source_name:
            return sanitize_output_name(url_source_name)

    if task_id:
        return sanitize_output_name(str(task_id))

    return "output"


def build_output_dir_name(args, task_id=None):
    return f"mineru_{resolve_output_stem(args, task_id)}"


def create_unique_output_dir(base_dir_name):
    candidate = base_dir_name
    suffix = 2

    while True:
        try:
            Path(candidate).mkdir(parents=True, exist_ok=False)
            return candidate
        except FileExistsError:
            candidate = f"{base_dir_name}_{suffix}"
            suffix += 1


def download_file(url, save_path):
    """Download a file from URL to save_path."""
    try:
        urllib.request.urlretrieve(url, save_path)
        return True
    except Exception as e:
        print(f"Download failed: {e}", file=sys.stderr)
        return False


def collect_precise_downloads(data):
    """Collect precise parsing download URLs and output file names."""
    downloads = []
    primary_task_id = None
    results = data.get("extract_result", [data])

    for result in results:
        if not isinstance(result, dict):
            continue

        task_id = str(result.get("task_id", "output"))
        if primary_task_id is None and task_id:
            primary_task_id = task_id

        md_url = result.get("full_zip_url") or result.get("markdown_url")
        if md_url:
            ext = ".zip" if "zip" in md_url else ".md"
            downloads.append((md_url, f"result_{task_id}{ext}"))

        for fmt_key in ["content_url", "docx_url", "html_url", "latex_url"]:
            fmt_url = result.get(fmt_key)
            if fmt_url:
                ext = fmt_key.replace("_url", "")
                downloads.append((fmt_url, f"result_{task_id}.{ext}"))

    return downloads, primary_task_id


def collect_agent_downloads(data):
    """Collect agent parsing download URLs and output file names."""
    md_url = data.get("markdown_url")
    if not md_url:
        return [], None

    task_id = str(data.get("task_id", "output"))
    return [(md_url, f"result_{task_id}.md")], task_id


def save_downloads(downloads, output_dir_name, label):
    """Download result files into a unique output directory."""
    if not downloads:
        return None

    output_dir = create_unique_output_dir(output_dir_name)
    saved = []

    for url, file_name in downloads:
        save_path = os.path.join(output_dir, file_name)
        if download_file(url, save_path):
            saved.append(save_path)
            print(f"[{label}] Saved: {save_path}")

    if not saved:
        return None

    return {
        "saved": saved,
        "output_dir": output_dir
    }


def extract_upload_url(file_url_entry):
    """Accept either the documented string form or a legacy object wrapper."""
    if isinstance(file_url_entry, str):
        return file_url_entry

    if isinstance(file_url_entry, dict):
        return file_url_entry.get("url")

    return None


def extract_upload_headers(file_url_entry):
    """Preserve any upload headers returned alongside the signed URL."""
    if not isinstance(file_url_entry, dict):
        return {}

    headers = file_url_entry.get("headers")
    if not isinstance(headers, dict):
        return {}

    normalized = {}
    for key, value in headers.items():
        if isinstance(key, str) and value is not None:
            normalized[key] = str(value)

    return normalized


def put_signed_file(upload_url, binary_data, headers=None):
    """Upload bytes to a signed URL without auto-injecting Content-Type."""
    parsed = urllib.parse.urlsplit(upload_url)
    if not parsed.scheme or not parsed.netloc:
        print(f"Invalid upload URL: {upload_url}", file=sys.stderr)
        return None

    connection_cls = (
        http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    )
    request_path = parsed.path or "/"
    if parsed.query:
        request_path = f"{request_path}?{parsed.query}"

    upload_headers = {}
    if isinstance(headers, dict):
        for key, value in headers.items():
            if isinstance(key, str) and value is not None:
                upload_headers[key] = str(value)

    conn = None
    try:
        conn = connection_cls(parsed.hostname, parsed.port, timeout=60)
        conn.request("PUT", request_path, body=binary_data, headers=upload_headers)
        resp = conn.getresponse()
        raw = resp.read()
        if 200 <= resp.status < 300:
            return raw

        error_body = raw.decode("utf-8", errors="replace")
        print(f"HTTP Error {resp.status}: {error_body}", file=sys.stderr)
        return None
    except OSError as e:
        print(f"URL Error: {e}", file=sys.stderr)
        return None
    finally:
        if conn is not None:
            conn.close()


def precise_submit_url(url, model="pipeline", ocr=False, pages=None, formats=None, language="ch"):
    """Submit a URL for precise parsing. Returns task_id or None."""
    token = get_token()
    if not token:
        return None

    payload = {
        "url": url,
        "model_version": model,
        "is_ocr": ocr,
        "enable_formula": True,
        "enable_table": True,
        "language": language,
    }
    if pages:
        payload["page_ranges"] = pages
    if formats:
        payload["extra_formats"] = formats

    resp = api_request(
        f"{BASE_URL_PRECISE}/extract/task",
        data=payload,
        method="POST",
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp and resp.get("code") == 0:
        task_id = resp["data"]["task_id"]
        print(f"[Precise] Task submitted: {task_id}")
        return task_id

    print(f"[Precise] Submit failed: {resp}", file=sys.stderr)
    return None


def precise_submit_file(file_path, model="pipeline", ocr=False, pages=None, formats=None, language="ch"):
    """Upload a local file via signed URL for precise parsing. Returns task_id or None."""
    token = get_token()
    if not token:
        return None

    file_name = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    payload = {
        "files": [{"name": file_name, "is_ocr": ocr}],
        "model_version": model,
        "enable_formula": True,
        "enable_table": True,
        "language": language,
    }
    if pages:
        payload["files"][0]["page_ranges"] = pages
    if formats:
        payload["extra_formats"] = formats

    resp = api_request(
        f"{BASE_URL_PRECISE}/file-urls/batch",
        data=payload,
        method="POST",
        headers={"Authorization": f"Bearer {token}"},
    )
    if not resp or resp.get("code") != 0:
        print(f"[Precise] Failed to get upload URL: {resp}", file=sys.stderr)
        return None

    batch_id = resp["data"]["batch_id"]
    file_urls = resp["data"].get("file_urls") or []
    if not file_urls:
        print(f"[Precise] Upload URL list missing: {resp}", file=sys.stderr)
        return None

    upload_url = extract_upload_url(file_urls[0])
    if not upload_url:
        print(f"[Precise] Upload URL entry has unexpected shape: {file_urls[0]}", file=sys.stderr)
        return None
    upload_headers = extract_upload_headers(file_urls[0])

    print(f"[Precise] Uploading {file_name} ({file_size} bytes)...")
    with open(file_path, "rb") as f:
        file_data = f.read()

    upload_resp = put_signed_file(upload_url, file_data, headers=upload_headers)
    if upload_resp is None:
        print("[Precise] Upload failed.", file=sys.stderr)
        return None

    print(f"[Precise] Upload complete, waiting for batch task: {batch_id}")
    return ("batch", batch_id)


def precise_poll(task_id):
    """Poll precise parsing task until completion. Returns result data or None."""
    token = get_token()
    is_batch = False

    if isinstance(task_id, tuple):
        is_batch = True
        _, task_id = task_id

    start = time.time()
    while time.time() - start < MAX_POLL_TIME:
        if is_batch:
            url = f"{BASE_URL_PRECISE}/extract-results/batch/{task_id}"
        else:
            url = f"{BASE_URL_PRECISE}/extract/task/{task_id}"

        resp = api_request(
            url,
            method="GET",
            headers={"Authorization": f"Bearer {token}"},
        )
        if not resp or resp.get("code") != 0:
            print(f"[Precise] Poll error: {resp}", file=sys.stderr)
            return None

        data = resp.get("data", {})

        if is_batch:
            results = data.get("extract_result", [])
            if results:
                state = results[0].get("state", "pending")
            else:
                state = "pending"
        else:
            state = data.get("state", "pending")

        print(f"[Precise] Status: {state}")

        if state == "done":
            return data
        elif state == "failed":
            print("[Precise] Task failed.", file=sys.stderr)
            return None

        time.sleep(POLL_INTERVAL)

    print("[Precise] Timeout waiting for result.", file=sys.stderr)
    return None


def precise_save_results(data, args):
    """Download and save precise parsing results."""
    downloads, task_id = collect_precise_downloads(data)
    output_dir_name = build_output_dir_name(args, task_id)
    return save_downloads(downloads, output_dir_name, "Precise")


def agent_submit_url(url, file_name=None, language="ch", pages=None):
    """Submit a URL for agent lightweight parsing. Returns task_id or None."""
    payload = {"url": url, "language": language}
    if file_name:
        payload["file_name"] = file_name
    if pages:
        payload["page_range"] = pages

    resp = api_request(
        f"{BASE_URL_AGENT}/parse/url",
        data=payload,
        method="POST",
    )
    if resp and resp.get("code") == 0:
        task_id = resp["data"]["task_id"]
        print(f"[Agent] Task submitted: {task_id}")
        return task_id

    print(f"[Agent] Submit failed: {resp}", file=sys.stderr)
    return None


def agent_submit_file(file_path, language="ch", pages=None):
    """Upload a local file for agent lightweight parsing. Returns task_id or None."""
    file_name = os.path.basename(file_path)

    payload = {"file_name": file_name, "language": language}
    if pages:
        payload["page_range"] = pages

    resp = api_request(
        f"{BASE_URL_AGENT}/parse/file",
        data=payload,
        method="POST",
    )
    if not resp or resp.get("code") != 0:
        print(f"[Agent] Failed to get upload URL: {resp}", file=sys.stderr)
        return None

    task_id = resp["data"]["task_id"]
    upload_url = resp["data"]["file_url"]

    print(f"[Agent] Uploading {file_name}...")
    with open(file_path, "rb") as f:
        file_data = f.read()

    upload_resp = put_signed_file(upload_url, file_data)
    if upload_resp is None:
        print("[Agent] Upload failed.", file=sys.stderr)
        return None

    print(f"[Agent] Task submitted: {task_id}")
    return task_id


def agent_poll(task_id):
    """Poll agent parsing task until completion. Returns result data or None."""
    start = time.time()
    while time.time() - start < MAX_POLL_TIME:
        resp = api_request(
            f"{BASE_URL_AGENT}/parse/{task_id}",
            method="GET",
        )
        if not resp or resp.get("code") != 0:
            print(f"[Agent] Poll error: {resp}", file=sys.stderr)
            return None

        data = resp.get("data", {})
        state = data.get("state", "pending")
        print(f"[Agent] Status: {state}")

        if state == "done":
            return data
        elif state == "failed":
            print("[Agent] Task failed.", file=sys.stderr)
            return None

        time.sleep(POLL_INTERVAL)

    print("[Agent] Timeout waiting for result.", file=sys.stderr)
    return None


def agent_save_results(data, args):
    """Download and save agent parsing results."""
    downloads, task_id = collect_agent_downloads(data)
    output_dir_name = build_output_dir_name(args, task_id)
    return save_downloads(downloads, output_dir_name, "Agent")


def run_precise(args):
    """Run precise parsing pipeline. Returns saved file paths or None."""
    formats = args.formats if args.formats else None

    if args.url:
        task_id = precise_submit_url(
            args.url, model=args.model, ocr=args.ocr,
            pages=args.pages, formats=formats, language=args.language,
        )
    else:
        task_id = precise_submit_file(
            args.file, model=args.model, ocr=args.ocr,
            pages=args.pages, formats=formats, language=args.language,
        )

    if not task_id:
        return None

    data = precise_poll(task_id)
    if not data:
        return None

    return precise_save_results(data, args)


def run_agent(args):
    """Run agent lightweight parsing pipeline. Returns saved file paths or None."""
    if args.url:
        task_id = agent_submit_url(args.url, language=args.language, pages=args.pages)
    else:
        task_id = agent_submit_file(args.file, language=args.language, pages=args.pages)

    if not task_id:
        return None

    data = agent_poll(task_id)
    if not data:
        return None

    return agent_save_results(data, args)


def main():
    parser = argparse.ArgumentParser(
        description="MinerU Document Converter - Convert documents to Markdown"
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--url", help="URL of the document to parse")
    source.add_argument("--file", help="Path to local file to parse")

    parser.add_argument(
        "--model", default="pipeline",
        choices=["pipeline", "vlm", "MinerU-HTML"],
        help="Model version for precise API (default: pipeline, recommended: vlm)",
    )
    parser.add_argument("--ocr", action="store_true", help="Enable OCR")
    parser.add_argument("--pages", help="Page range, e.g. '1-10' or '2,4-6'")
    parser.add_argument("--language", default="ch", help="Document language (default: ch)")
    parser.add_argument(
        "--formats", nargs="+", choices=["docx", "html", "latex"],
        help="Extra output formats (precise API only)",
    )
    parser.add_argument(
        "--agent", action="store_true",
        help="Force using Agent lightweight API instead of precise API",
    )

    args = parser.parse_args()

    if args.file and not os.path.isfile(args.file):
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    result = None

    if args.agent:
        print("Using Agent lightweight API (forced)...")
        result = run_agent(args)
    else:
        token = get_token()
        if token:
            print("Using Precise parsing API...")
            try:
                result = run_precise(args)
            except Exception as e:
                print(f"[Precise] Unexpected error: {e}", file=sys.stderr)
                result = None
        else:
            print("MINERU_TOKEN not set, skipping Precise API.", file=sys.stderr)

        if not result:
            print("Falling back to Agent lightweight API...")
            result = run_agent(args)

    if result:
        saved = result["saved"]
        output_dir = result["output_dir"]
        print(f"\nDone! {len(saved)} file(s) saved to {output_dir}/:")
        for f in saved:
            print(f"  - {f}")
    else:
        print("\nFailed to convert document.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
