#!/usr/bin/env python3
"""
MinerU PDF Parser - 直接输出到 Obsidian Vault

Usage:
    python mineru_obsidian.py --dir ./pdfs/ --resume
"""

import argparse
import os
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

API_BASE = "https://mineru.net/api/v4"


def get_token(args):
    return os.environ.get("MINERU_TOKEN")


def headers(token):
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }


def create_single_task(token, file_path):
    """为单个文件创建上传任务"""
    filename = Path(file_path).name
    data_id = Path(file_path).stem
    
    resp = requests.post(
        f"{API_BASE}/file-urls/batch",
        headers=headers(token),
        json={
            "files": [{"name": filename, "data_id": data_id}],
            "model_version": "vlm",
            "enable_formula": True,
            "enable_table": True,
        },
        timeout=60,
    )
    result = resp.json()
    
    if result.get("code") != 0:
        return None, f"获取上传链接失败: {result.get('msg')}"
    
    batch_id = result["data"]["batch_id"]
    upload_url = result["data"]["file_urls"][0]
    
    # 上传文件
    with open(file_path, "rb") as f:
        upload_resp = requests.put(upload_url, data=f, timeout=600)
    
    if upload_resp.status_code != 200:
        return None, f"上传失败: {upload_resp.status_code}"
    
    return batch_id, data_id


def wait_and_download(token, batch_id, data_id, output_dir, timeout=600, poll=10):
    """等待解析完成并下载结果"""
    start = time.time()
    
    while time.time() - start < timeout:
        try:
            resp = requests.get(
                f"{API_BASE}/extract-results/batch/{batch_id}",
                headers=headers(token),
                timeout=30,
            )
            results = resp.json()["data"]["extract_result"]
            
            if not results:
                time.sleep(poll)
                continue
            
            state = results[0].get("state")
            
            if state == "done":
                zip_url = results[0].get("full_zip_url")
                return download_result(zip_url, output_dir, data_id)
            
            elif state == "failed":
                return None, results[0].get("err_msg", "解析失败")
            
            time.sleep(poll)
            
        except Exception:
            time.sleep(poll)
    
    return None, "超时"


def download_result(url, output_dir, filename):
    """下载并解压结果"""
    zip_path = output_dir / f"{filename}.zip"
    
    resp = requests.get(url, stream=True, timeout=300)
    
    with open(zip_path, "wb") as f:
        for chunk in resp.iter_content(8192):
            f.write(chunk)
    
    extract_dir = output_dir / filename
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract_dir)
    
    zip_path.unlink()
    
    # 重命名 full.md -> {filename}.md
    md = extract_dir / "full.md"
    if md.exists():
        md.rename(extract_dir / f"{filename}.md")
    
    return extract_dir, None


def process_file(token, file_path, output_dir, index, total):
    """处理单个文件"""
    filename = Path(file_path).name
    stem = Path(file_path).stem
    
    # 检查是否已存在
    if (output_dir / stem).exists():
        print(f"  [{index+1}/{total}] ⏭️  已存在: {filename}")
        return True, filename
    
    print(f"  [{index+1}/{total}] 开始: {filename}")
    
    try:
        batch_id, data_id = create_single_task(token, file_path)
        
        if not batch_id:
            print(f"  [{index+1}/{total}] ❌ {filename}: {data_id}")
            return False, filename
        
        result, error = wait_and_download(token, batch_id, data_id, output_dir)
        
        if result:
            print(f"  [{index+1}/{total}] ✅ {filename}")
            return True, filename
        else:
            print(f"  [{index+1}/{total}] ❌ {filename}: {error}")
            return False, filename
            
    except Exception as e:
        print(f"  [{index+1}/{total}] ❌ {filename}: {e}")
        return False, filename


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True, help="PDF 文件目录")
    parser.add_argument("--output", default="./mineru_output/", help="输出目录 (default: ./mineru_output/)")
    parser.add_argument("--workers", "-w", type=int, default=5, help="并发数")
    parser.add_argument("--resume", action="store_true", help="跳过已处理的文件")
    
    args = parser.parse_args()
    
    token = get_token(args)
    if not token:
        print("❌ MINERU_TOKEN 未注入，请通过中间件托管的 mineru 命令运行，或检查 middleware apiKey 配置")
        sys.exit(1)
    
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 收集文件
    input_dir = Path(args.dir)
    pdf_files = sorted(list(input_dir.glob("*.pdf")) + list(input_dir.glob("*.PDF")))
    
    if not pdf_files:
        print("❌ 未找到 PDF 文件")
        sys.exit(1)
    
    # 过滤已处理的文件
    if args.resume:
        original_count = len(pdf_files)
        pdf_files = [f for f in pdf_files if not (output_dir / f.stem).exists()]
        skipped = original_count - len(pdf_files)
        if skipped > 0:
            print(f"⏭️  跳过已处理: {skipped} 个")
    
    if not pdf_files:
        print("✅ 所有文件已处理完成!")
        return
    
    total = len(pdf_files)
    print(f"\n📚 开始处理 {total} 个文件 (并发: {args.workers})")
    print(f"📁 输出到: {output_dir}\n")
    
    success = 0
    failed = 0
    failed_files = []
    
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(process_file, token, str(f), output_dir, i, total): f
            for i, f in enumerate(pdf_files)
        }
        
        for future in as_completed(futures):
            ok, filename = future.result()
            if ok:
                success += 1
            else:
                failed += 1
                failed_files.append(filename)
    
    elapsed = time.time() - start_time
    print(f"\n{'='*50}")
    print(f"✅ 成功: {success}")
    print(f"❌ 失败: {failed}")
    print(f"⏱️  耗时: {elapsed/60:.1f} 分钟")
    
    if failed_files:
        print(f"\n失败文件:")
        for f in failed_files:
            print(f"  - {f}")
    
    print(f"\n📁 结果: {output_dir}")


if __name__ == "__main__":
    main()
