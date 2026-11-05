"""Production entry point for Railway / Docker deployment."""
import os
import uvicorn
from geo_engine.api import create_app

internal_token = os.environ.get("GEO_INTERNAL_TOKEN", "")
demo = os.environ.get("GEO_DEMO", "true").lower() in ("1", "true", "yes")

if not internal_token:
    raise RuntimeError("GEO_INTERNAL_TOKEN environment variable is required")

app = create_app(demo=demo, internal_token=internal_token)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8767))
    print(f"[GEO] Starting server on http://0.0.0.0:{port}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
