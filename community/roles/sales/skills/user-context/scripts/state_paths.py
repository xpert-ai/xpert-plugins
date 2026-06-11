#!/usr/bin/env python3
"""Shared Sales state path resolution."""

from __future__ import annotations

import os
from pathlib import Path

MARKETPLACE_ID = "role-specific-plugins"
PLUGIN_ID = "sales"
STATE_FILENAMES = (
    "user-context.md",
    # Legacy readiness state is no longer created by onboarding, but reset should clear it.
    "category-state.json",
    "onboarding-state.json",
)

STATE_DIR_HELP = (
    f"Sales state directory. Defaults to <xpertai-home>/state/plugins/{MARKETPLACE_ID}/"
    f"{PLUGIN_ID}."
)


def default_xpertai_home() -> Path:
    env_home = os.environ.get("XPERTAI_HOME")
    if env_home:
        return Path(env_home).expanduser()
    return Path.home() / ".xpertai"


def configured_state_dir(xpertai_home: Path) -> Path:
    return xpertai_home / "state/plugins" / MARKETPLACE_ID / PLUGIN_ID


def resolve_state_dir(xpertai_home: Path | None, state_dir: Path | None) -> Path:
    if state_dir:
        return state_dir.expanduser()

    resolved_home = xpertai_home.expanduser() if xpertai_home else default_xpertai_home()
    return configured_state_dir(resolved_home)
