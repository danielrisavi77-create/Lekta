"""Skupljanje signala bez AI potrosnje (plan, odjeljak 6 i Zadatak 3).

Signal je PODATAK, nikad uputa: sadrzaj issuea, loga ili weba prolazi redakciju prije nego dodje u
bazu ili prompt. Fingerprint je stabilan hash (vrsta, normalizirana lokacija, simptom), pa isti kvar
u dva polla daje isti `signal_key` i Store ga ne udvostrucuje. Kad nema izvora ili dokaza, izlaz je
prazan popis i nijedan model se ne poziva.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Callable

KINDS = ("ci_failure", "test_failure", "repair_net", "telemetry_aggregate", "maintenance", "manual")
DEFAULT_PRIORITY = {"ci_failure": 40, "test_failure": 50, "repair_net": 30, "telemetry_aggregate": 20, "maintenance": 10, "manual": 25}

# Markeri koji NIKAD ne smiju zavrsiti u bazi ili promptu. Redoslijed nije bitan: svaki se primjenjuje.
FORBIDDEN_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")),
    ("github_fine_grained", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
    ("bearer", re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{16,}")),
    ("anthropic_key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{10,}\b")),
    ("openai_key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b")),
    ("supabase_secret", re.compile(r"\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}\b")),
    ("service_role", re.compile(r"(?i)service[_-]?role")),
    ("private_key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)")),
    # OOXML: od prve <w:...> oznake do KRAJA teksta, jer je sadrzaj rada unutar oznaka, ne oznaka sama.
    ("ooxml", re.compile(r"<w:[A-Za-z]+\b[\s\S]*")),
    ("docx_base64", re.compile(r"\bUEsDB[A-Za-z0-9+/=]{20,}")),
    ("env_assignment", re.compile(r"(?im)^\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*\S+")),
)
# Redci koji izgledaju kao naredba za shell ili za promjenu pravila: brisu se cijeli.
INSTRUCTION_LINE = re.compile(
    r"(?im)^\s*(?:\$|>|#|-|\*)?\s*(?:run|execute|please run|pokreni|izvrsi|izvrši|ignore (?:all|previous)|"
    r"disable|skip|onemoguci|preskoci|rm\s+-rf|del\s+/|curl\s|wget\s|powershell|npm\s+run|git\s+(?:push|reset|commit)|"
    r"sudo\s|chmod\s)\b.*$"
)
REDACTED = "[REDACTED]"
MAX_TEXT = 4000

_ALLOWED_AGGREGATE_KEYS = {"event", "count", "profileId", "workType", "category", "durationMs", "checkId", "ruleId", "fixerId", "outcome", "period"}


def redact_text(text: str) -> tuple[str, list[str]]:
    """Vraca ociscen tekst i popis imena pogodjenih markera. Nikad ne vraca izvorni pogodak."""
    if not isinstance(text, str):
        return "", []
    hits: list[str] = []
    out = text
    for name, pattern in FORBIDDEN_PATTERNS:
        if pattern.search(out):
            hits.append(name)
            out = pattern.sub(REDACTED, out)
    if INSTRUCTION_LINE.search(out):
        hits.append("instruction_line")
        out = INSTRUCTION_LINE.sub("[REDACTED-INSTRUCTION]", out)
    if len(out) > MAX_TEXT:
        out = out[:MAX_TEXT] + " [TRUNCATED]"
        hits.append("truncated")
    return out, hits


def redact_payload(value: Any) -> Any:
    """Rekurzivna redakcija za JSON-slicne strukture; kljucevi se redigiraju kao i vrijednosti."""
    if isinstance(value, str):
        return redact_text(value)[0]
    if isinstance(value, dict):
        return {redact_text(str(k))[0]: redact_payload(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_payload(v) for v in value]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return redact_text(str(value))[0]


def contains_forbidden(text: str) -> list[str]:
    return [name for name, pattern in FORBIDDEN_PATTERNS if pattern.search(text or "")]


def _norm(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip().lower())
    t = re.sub(r"\b[0-9a-f]{7,40}\b", "<sha>", t)
    t = re.sub(r"\d+(?:\.\d+)?\s*(?:ms|s|kb|mb|b)\b", "<n>", t)
    t = re.sub(r":\d+:\d+", ":<l>:<c>", t)
    return t


def fingerprint(kind: str, location: str, symptom: str) -> str:
    digest = hashlib.sha256(f"{kind}\n{_norm(location)}\n{_norm(symptom)}".encode("utf-8")).hexdigest()
    return digest[:32]


def normalize_signal(raw: dict) -> dict | None:
    """Iz sirovog zapisa u ugovor signala; None kad nedostaje vrsta, lokacija, simptom ili revizija."""
    if not isinstance(raw, dict):
        return None
    kind = raw.get("kind")
    location = raw.get("location")
    symptom = raw.get("symptom")
    revision = raw.get("source_revision")
    observed = raw.get("observed_at")
    if kind not in KINDS or not isinstance(location, str) or not location.strip():
        return None
    if not isinstance(symptom, str) or not symptom.strip() or not isinstance(revision, str) or not revision:
        return None
    if not isinstance(observed, int) or isinstance(observed, bool) or observed <= 0:
        return None
    fp = fingerprint(kind, location, symptom)
    evidence, hits = redact_text(str(raw.get("evidence") or ""))
    scope = raw.get("scope") if isinstance(raw.get("scope"), dict) else {}
    paths = [p for p in (scope.get("paths") or []) if isinstance(p, str)]
    return {
        "kind": kind,
        "fingerprint": fp,
        "signal_key": f"{kind}:{fp}",
        "observed_at": observed,
        "source_revision": redact_text(revision)[0][:64],
        "location": redact_text(location.strip())[0][:300],
        "symptom": redact_text(symptom.strip())[0][:500],
        "sanitized_evidence": evidence,
        "redactions": hits,
        "reproduction": redact_text(str(raw.get("reproduction") or ""))[0][:1000],
        "expected_outcome": redact_text(str(raw.get("expected_outcome") or ""))[0][:500],
        "scope": {"paths": paths[:20], "area": redact_text(str(scope.get("area") or ""))[0][:100]},
        "priority": int(raw.get("priority", DEFAULT_PRIORITY.get(kind, 0))),
        "url": redact_text(str(raw.get("url") or ""))[0][:300],
    }


def normalize_aggregate(raw: dict) -> dict | None:
    """Telemetrijski/korpusni agregat: samo dopusteni kljucevi, brojevi i kratki identifikatori. Sve ostalo se ODBACUJE."""
    if not isinstance(raw, dict):
        return None
    out: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in _ALLOWED_AGGREGATE_KEYS:
            continue
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            out[key] = value
        elif isinstance(value, str) and len(value) <= 80 and not contains_forbidden(value) and "\n" not in value:
            out[key] = value
    return out or None


@dataclass
class CollectResult:
    signals: list[dict] = field(default_factory=list)
    unavailable: list[dict] = field(default_factory=list)
    rejected: int = 0


def _ci_items_to_raw(items: list[dict], source: dict, now: int) -> list[dict]:
    """Aktualni neuspjeh po (workflow, job, grana): stariji pad koji je noviji run istog posla prosao NIJE signal."""
    repo = source.get("repository")
    branch = source.get("branch")
    latest: dict[tuple, dict] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        if repo and item.get("repository") != repo:
            continue
        if branch and item.get("branch") != branch:
            continue
        if not item.get("workflow") or not item.get("sha") or not isinstance(item.get("completed_at"), int):
            continue
        key = (item.get("workflow"), item.get("job") or "", item.get("branch") or "")
        if key not in latest or item["completed_at"] > latest[key]["completed_at"]:
            latest[key] = item
    raws = []
    for (workflow, job, br), item in latest.items():
        if item.get("conclusion") != "failure":
            continue
        raws.append({
            "kind": "ci_failure",
            "location": f"{workflow}/{job or 'workflow'}@{br}",
            "symptom": f"{workflow} {job or ''} conclusion=failure".strip(),
            "source_revision": item["sha"],
            "observed_at": item["completed_at"],
            "evidence": item.get("summary") or "",
            "url": item.get("url") or "",
            "reproduction": item.get("reproduction") or f"gh run view --job {item.get('job_id') or ''} --log-failed".strip(),
            "expected_outcome": "posao prolazi na aktualnoj grani",
            "scope": {"area": "ci"},
        })
    return raws


def collect(sources: list[dict], now: int, *, dedupe: Callable[[str], bool] | None = None) -> CollectResult:
    """Deterministicki collector. Izvor: {'id','kind', 'items': [...] | 'loader': callable}.

    Nedostupan izvor (loader baca ili `unavailable` polje) ide u `unavailable`, ne u signal.
    `dedupe(signal_key)` vraca True ako je kljuc vec poznat u ovom pollu ili u Storeu.
    """
    result = CollectResult()
    seen: set[str] = set()
    for source in sources or []:
        sid = str(source.get("id") or source.get("kind") or "?")
        if source.get("unavailable"):
            result.unavailable.append({"id": sid, "reason": redact_text(str(source["unavailable"]))[0][:200]})
            continue
        items = source.get("items")
        loader = source.get("loader")
        if items is None and callable(loader):
            try:
                items = loader()
            except Exception as exc:  # noqa: BLE001 - nedostupnost izvora nije greska kontrolera
                result.unavailable.append({"id": sid, "reason": redact_text(f"{type(exc).__name__}: {exc}")[0][:200]})
                continue
        if not isinstance(items, list):
            result.unavailable.append({"id": sid, "reason": "izvor nije dao popis"})
            continue
        kind = source.get("kind")
        if kind in ("github_ci", "ci"):
            raws = _ci_items_to_raw(items, source, now)
        elif kind in ("telemetry", "corpus"):
            raws = []
            for item in items:
                agg = normalize_aggregate(item) if isinstance(item, dict) else None
                if not agg or not isinstance(item.get("symptom"), str):
                    result.rejected += 1
                    continue
                raws.append({
                    "kind": "telemetry_aggregate" if kind == "telemetry" else "repair_net",
                    "location": f"{kind}:{agg.get('event') or agg.get('checkId') or agg.get('fixerId') or 'aggregate'}",
                    "symptom": item["symptom"],
                    "source_revision": str(item.get("source_revision") or ""),
                    "observed_at": item.get("observed_at"),
                    "evidence": agg,
                    "scope": {"area": kind},
                })
        else:
            raws = items
        for raw in raws:
            if isinstance(raw, dict) and isinstance(raw.get("evidence"), dict):
                raw = {**raw, "evidence": str(sorted(raw["evidence"].items()))}
            signal = normalize_signal(raw)
            if signal is None:
                result.rejected += 1
                continue
            key = signal["signal_key"]
            if key in seen or (dedupe is not None and dedupe(key)):
                continue
            seen.add(key)
            signal["source_id"] = sid
            result.signals.append(signal)
    return result


def collect_signals(sources: list[dict], now: int, *, dedupe: Callable[[str], bool] | None = None) -> list[dict]:
    return collect(sources, now, dedupe=dedupe).signals
