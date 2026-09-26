from __future__ import annotations
import json
from pathlib import Path
_PATH = Path(__file__).resolve().parents[2] / "config" / "agent-providers.json"
with _PATH.open(encoding="utf-8") as fh:
    _RAW = json.load(fh)
if _RAW.get("schemaVersion") != 1 or not isinstance(_RAW.get("agents"), dict):
    raise RuntimeError("config/agent-providers.json ima nepodrzan ugovor")
AGENT_REGISTRY = _RAW["agents"]
AGENT_PROVIDER = {name: str(spec.get("command")) for name, spec in AGENT_REGISTRY.items()}
AGENT_ROLE = {name: str(spec.get("role")) for name, spec in AGENT_REGISTRY.items()}
GROK_MIN_VERSION = tuple(int(p) for p in str(_RAW.get("grokMinVersion") or "").split("."))
if len(GROK_MIN_VERSION) != 3:
    raise RuntimeError("grokMinVersion nije semver x.y.z")
def model_for(agent: str) -> str | None:
    spec = AGENT_REGISTRY.get(agent)
    return str(spec.get("model")) if isinstance(spec, dict) and spec.get("model") else None
