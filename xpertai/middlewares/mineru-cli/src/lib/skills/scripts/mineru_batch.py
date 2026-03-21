#!/usr/bin/env python3
"""
MinerU PDF Parser - Robust batch processing with retry logic

Usage:
    python mineru_batch.py --dir ./pdfs/ --output ./parsed/ --batch-size 5
"""

import argparse
import json
import os
import sys
import time
import zipfile
from pathlib import Path
from typing import Optional

import requests

API_BASE = "https://mineru.net/api/v4"
DEFAULT_TIMEOUT = 1200
DEFAULT_POLL_INTERVAL = 10


def get_token() -> str:
    """Get API token from the middleware-injected environment."""
    token = os.environ.get("MINERU_TOKEN")
    if not token:
        raise ValueError(
            "MINERU_TOKEN is not configured. Use the middleware-managed mineru wrapper "
            "or check the MinerU middleware apiKey setting."
        )
    return token


def headers(token: str) -> dict:
    """Return authorization headers."""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "Accept": "*/*",
    }


def create_batch_upload_urls(token: str, file_paths: list) -> tuple:
    """Get upload URLs for files. Returns (batch_id, [(file_path, upload_url), ...])."""
    files = [{"name": Path(f).name, "data_id": Path(f).stem} for f in file_paths]
    data = {"files": files, "model_version": "vlm", "enable_formula": True, "enable_table": True}

    response = requests.post(
        f"{API_BASE}/file-urls/batch",
        headers=headers(token),
        json=data,
        timeout=60,
    )
    result = response.json()

    if result.get("code") != 0:
        raise Exception(f"Failed to get upload URLs: {result.get('msg', result)}")

    batch_id = result["data"]["batch_id"]
    upload_urls = result["data"]["file_urls"]

    return batch_id, list(zip(file_paths, upload_urls))


def upload_file_with_retry(upload_url: str, file_path: str, max_retries: int = 3) -> bool:
    """Upload a file with retry logic."""
    for attempt in range(max_retries):
        try:
            with open(file_path, "rb") as f:
                response = requests.put(upload_url, data=f, timeout=600)
            if response.status_code == 200:
                return True
            print(f"    上传失败 (状态码 {response.status_code}), 重试 {attempt+1}/{max_retries}")
        except Exception as e:
            print(f"    上传异常: {e}, 重试 {attempt+1}/{max_retries}")
        time.sleep(5)
    return False


def get_batch_status(token: str, batch_id: str) -> list:
    """Get batch task status."""
    response = requests.get(
        f"{API_BASE}/extract-results/batch/{batch_id}",
        headers=headers(token),
        timeout=30,
    )
    result = response.json()

    if result.get("code") != 0:
        raise Exception(f"Failed to get batch status: {result.get('msg', result)}")

    return result["data"]["extract_result"]


def wait_for_batch(token: str, batch_id: str, total_files: int, poll_interval: int = 10, timeout: int = 1200, verbose: bool = True) -> list:
    """Wait for batch to complete."""
    start_time = time.time()

    while True:
        elapsed = time.time() - start_time
        if elapsed > timeout:
            raise TimeoutError(f"Batch timed out after {timeout} seconds")

        results = get_batch_status(token, batch_id)

        completed = sum(1 for r in results if r.get("state") == "done")
        failed = sum(1 for r in results if r.get("state") == "failed")
        running = sum(1 for r in results if r.get("state") == "running")
        pending = total_files - completed - failed - running

        if verbose:
            print(f"    状态: ✅{completed} 🔄{running} ⏳{pending} ❌{failed}")

        if completed + failed == total_files:
            return results

        time.sleep(poll_interval)


def download_result(url: str, output_dir: Path, filename: str) -> Optional[Path]:
    """Download and extract result ZIP."""
    try:
        zip_path = output_dir / f"{filename}.zip"

        response = requests.get(url, stream=True, timeout=300)
        response.raise_for_status()

        with open(zip_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        extract_dir = output_dir / filename
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        zip_path.unlink()

        # Rename full.md
        md_file = extract_dir / "full.md"
        if md_file.exists():
            md_file.rename(extract_dir / f"{filename}.md")

        return extract_dir
    except Exception as e:
        print(f"    下载失败: {e}")
        return None


def process_batch(token: str, file_paths: list, output_dir: Path, batch_num: int, total_batches: int, poll_interval: int = 10, timeout: int = 1200) -> tuple:
    """Process a batch of files. Returns (success_count, failed_count, failed_files)."""
    print(f"\n📦 批次 {batch_num}/{total_batches} ({len(file_paths)} 个文件)")

    # Get upload URLs
    print("  获取上传链接...")
    batch_id, upload_pairs = create_batch_upload_urls(token, file_paths)
    print(f"  Batch ID: {batch_id}")

    # Upload files one by one
    print("  上传文件...")
    failed_uploads = []
    for i, (file_path, upload_url) in enumerate(upload_pairs):
        filename = Path(file_path).name
        print(f"    [{i+1}/{len(file_paths)}] {filename}", end="")
        if upload_file_with_retry(upload_url, file_path):
            print(" ✅")
        else:
            print(" ❌")
            failed_uploads.append(file_path)

    if len(failed_uploads) == len(file_paths):
        print("  所有文件上传失败，跳过此批次")
        return 0, len(file_paths), file_paths

    # Wait for parsing
    print("  等待解析...")
    valid_files = len(file_paths) - len(failed_uploads)
    results = wait_for_batch(token, batch_id, valid_files, poll_interval, timeout)

    # Download results
    print("  下载结果...")
    success_count = 0
    failed_count = 0
    failed_files = []

    for result in results:
        filename = result.get("data_id") or Path(result.get("file_name", "unknown")).stem
        state = result.get("state")

        if state == "done":
            zip_url = result.get("full_zip_url")
            extract_dir = download_result(zip_url, output_dir, filename)
            if extract_dir:
                print(f"    ✅ {filename}")
                success_count += 1
            else:
                print(f"    ❌ {filename} (下载失败)")
                failed_count += 1
                failed_files.append(filename)
        else:
            err_msg = result.get("err_msg", "unknown error")
            print(f"    ❌ {filename}: {err_msg}")
            failed_count += 1
            failed_files.append(filename)

    # Add upload failures
    failed_count += len(failed_uploads)
    failed_files.extend([Path(f).name for f in failed_uploads])

    return success_count, failed_count, failed_files


def main():
    parser = argparse.ArgumentParser(description="MinerU Batch PDF Parser")
    parser.add_argument("--dir", required=True, help="Directory of PDF files")
    parser.add_argument("--output", default="./mineru_output/", help="Output directory (default: ./mineru_output/)")
    parser.add_argument("--batch-size", type=int, default=5, help="Files per batch (default: 5)")
    parser.add_argument("--poll-interval", type=int, default=10)
    parser.add_argument("--timeout", type=int, default=1200)
    parser.add_argument("--resume", action="store_true", help="Skip already processed files")

    args = parser.parse_args()

    # Get token
    try:
        token = get_token()
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Find PDF files
    input_dir = Path(args.dir)
    pdf_files = sorted(list(input_dir.glob("*.pdf")) + list(input_dir.glob("*.PDF")))

    if not pdf_files:
        print(f"No PDF files found in {args.dir}")
        sys.exit(1)

    print(f"📚 发现 {len(pdf_files)} 个 PDF 文件")
    print(f"📦 批次大小: {args.batch_size}")
    print(f"📁 输出目录: {output_dir}")

    # Resume support: skip already processed files
    if args.resume:
        processed = set()
        for d in output_dir.iterdir():
            if d.is_dir():
                processed.add(d.name)
        pdf_files = [f for f in pdf_files if f.stem not in processed]
        print(f"🔄 跳过已处理: {len(processed)} 个")
        print(f"📝 待处理: {len(pdf_files)} 个")

    if not pdf_files:
        print("✅ 所有文件已处理完成!")
        return

    # Calculate batches
    batch_size = args.batch_size
    total_batches = (len(pdf_files) + batch_size - 1) // batch_size

    # Process batches
    total_success = 0
    total_failed = 0
    all_failed_files = []

    start_time = time.time()

    for batch_num in range(total_batches):
        start_idx = batch_num * batch_size
        end_idx = min((batch_num + 1) * batch_size, len(pdf_files))
        batch_files = pdf_files[start_idx:end_idx]

        try:
            success, failed, failed_names = process_batch(
                token, [str(f) for f in batch_files],
                output_dir, batch_num + 1, total_batches,
                args.poll_interval, args.timeout
            )
            total_success += success
            total_failed += failed
            all_failed_files.extend(failed_names)
        except Exception as e:
            print(f"  ❌ 批次处理失败: {e}")
            total_failed += len(batch_files)
            all_failed_files.extend([f.name for f in batch_files])

    # Summary
    elapsed = time.time() - start_time
    print(f"\n{'='*50}")
    print(f"📊 处理完成!")
    print(f"  ✅ 成功: {total_success}")
    print(f"  ❌ 失败: {total_failed}")
    print(f"  ⏱️  耗时: {elapsed/60:.1f} 分钟")

    if all_failed_files:
        print(f"\n❌ 失败文件列表:")
        for f in all_failed_files:
            print(f"  - {f}")

    print(f"\n📁 结果保存在: {output_dir}")


if __name__ == "__main__":
    main()
