"""Read only the explicitly allowed model settings from a user-selected file."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values


MODEL_KEYS = ("DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL")


def load_model_env(path: str | Path) -> None:
    source = Path(path).resolve(strict=True)
    if not source.is_file():
        raise ValueError("Model environment path must be a file")
    # No interpolation: another secret must never be expanded into these settings.
    values = dotenv_values(source, interpolate=False)
    for key in MODEL_KEYS:
        value = values.get(key)
        if value:
            os.environ[key] = value

