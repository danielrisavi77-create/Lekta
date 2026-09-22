"""Shared agent/provider registry loaded from config/agent-providers.json.

Ovaj modul ne bira agenta i ne poziva model. Samo daje Python autonomy sloju isti
registry koji Node scripts/agents koristi, da alias/provider/model ne driftaju.
"""
from __future__ import annotations

import json
from pathlib import Path

_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "config" / "agent-providers.json"

with _REGISTRY_PATH.open(encoding="utf-8") as fh:
    _RAW = json.load(fh)

if _RAW.get("schemaVersion") != 1 or not isinstance(_RAW.get("agents"), dict):
    raise RuntimeError("config/agent-providers.json ima nepodrzan ugovor")

AGENT_REGISTRY: dict[str, dict] = _RAW["agents"]
AGENT_PROVIDER: dict[str, str] = {
    name: str(spec.get("command")) for name, spec in AGENT_REGISTRY.items()
}
AGENT_ROLE: dict[str, str] = {
    name: str(spec.get("role")) for name, spec in AGENT_REGISTRY.items()
}

_grok_version = str(_RAW.get("grokMinVersion") or "")
try:
    GROK_MIN_VERSION = tuple(int(part) for part in _grok_version.split("."))
except ValueError as exc:
    raise RuntimeError("grokMinVersion nije semver x.y.z") from exc
if len(GROK_MIN_VERSION) != 3:
    raise RuntimeError("grokMinVersion nije semver x.y.z")


def model_for(agent: str) -> str | None:
    spec = AGENT_REGISTRY.get(agent)
    return str(spec.get("model")) if isinstance(spec, dict) and spec.get("model") else None
