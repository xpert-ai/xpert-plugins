"""Start the GEO Hub API server with demo data."""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

# Load DeepSeek API config from .env file (no hardcoded secrets)
from geo_engine.config import load_model_env
_env_path = os.path.join(_HERE, ".env")
if os.path.isfile(_env_path):
    load_model_env(_env_path)
    _key = os.environ.get("DEEPSEEK_API_KEY", "")
    print(f"[GEO] Loaded model env: {_env_path} (key={'set' if _key else 'MISSING'})", flush=True)
else:
    print(f"[GEO] WARNING: .env not found at {_env_path}", flush=True)

import uvicorn
from geo_engine.api import create_app

app = create_app(demo=True, internal_token="test-token-123")

if __name__ == "__main__":
    print("[GEO] Starting server on http://127.0.0.1:8767", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=8767, log_level="info")
