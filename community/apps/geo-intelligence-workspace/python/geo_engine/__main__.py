from __future__ import annotations

import argparse
import os

import uvicorn

from .config import load_model_env


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the isolated GEO engine")
    parser.add_argument("--env-file", help="Read only DeepSeek settings from this existing file")
    parser.add_argument("--demo", action="store_true", help="Seed fictional public-service documents")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.env_file:
        load_model_env(args.env_file)
    if not os.environ.get("GEO_INTERNAL_TOKEN"):
        parser.error("GEO_INTERNAL_TOKEN must be configured for the GEO service")
    from .api import create_app
    uvicorn.run(create_app(demo=args.demo), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
