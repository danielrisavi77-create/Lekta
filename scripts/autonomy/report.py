"""Lokalni status.json i status.md (plan, odjeljak 8). Bez procjene cijene tokena: to nije racun."""
from __future__ import annotations

import datetime as _dt
import json
import os

from .signals import redact_payload


def _iso(ts: int | None) -> str:
    if not ts:
        return "-"
    return _dt.datetime.fromtimestamp(int(ts), tz=_dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def build_status(store, config: dict | None, now: int, last_tick: dict | None = None, doctor: dict | None = None) -> dict:
    snap = store.snapshot(now)
    warnings: list[str] = []
    if snap["paused"]:
        warnings.append("paused")
    if snap["publishFrozen"]:
        warnings.append("publish_frozen: povrat ceka razjasnjenje")
    for status in ("needs_login", "waiting_quota", "needs_human", "blocked"):
        n = snap["tasksByStatus"].get(status, 0)
        if n:
            warnings.append(f"{status}: {n}")
    if doctor:
        if not doctor.get("billing", {}).get("allowed"):
            warnings.append("billing_unknown: profil naplate nije potvrdjen, nema modelskih poziva")
        if doctor.get("word", {}).get("available") is False:
            warnings.append("Word unavailable")
        for name, info in (doctor.get("logins") or {}).items():
            if info.get("logged_in") is False:
                warnings.append(f"needs_login: {name}")
    if last_tick and last_tick.get("unavailable"):
        warnings.append("izvori nedostupni: " + ", ".join(u["id"] for u in last_tick["unavailable"]))
    return redact_payload({
        "generatedAt": _iso(now),
        "mode": (config or {}).get("mode"),
        "publisherEnabled": (config or {}).get("publisherEnabled"),
        "paused": snap["paused"],
        "publishFrozen": snap["publishFrozen"],
        "policyVersion": snap["policyVersion"],
        "lastPoll": _iso(last_tick.get("now")) if last_tick else "-",
        "lastTick": last_tick,
        "activeTask": {k: snap["activeTask"][k] for k in ("id", "kind", "status", "attempts", "signal_key")} if snap["activeTask"] else None,
        "tasksByStatus": snap["tasksByStatus"],
        "jobsToday": snap["jobsToday"],
        "deploysToday": snap["deploysToday"],
        "lastVerifiedDeployment": snap["lastVerifiedDeployment"],
        "lastEvent": snap["lastEvent"],
        "warnings": warnings,
        "nextAttempt": _iso(now + int((config or {}).get("pollMinutes", 60)) * 60),
    })


def render_markdown(status: dict) -> str:
    lines = [
        "# Lekta autonomija: status",
        "",
        f"Generirano: {status['generatedAt']}. Nacin: `{status['mode']}`. Izdavac: {'ukljucen' if status['publisherEnabled'] else 'iskljucen'}.",
        "",
        "| polje | vrijednost |",
        "| --- | --- |",
        f"| zadnji poll | {status['lastPoll']} |",
        f"| aktivni posao | {status['activeTask']['id'] + ' (' + status['activeTask']['status'] + ')' if status['activeTask'] else 'nema'} |",
        f"| poslova danas | {status['jobsToday']} |",
        f"| objava danas | {status['deploysToday']} |",
        f"| zadnji verificirani deploy | {(status['lastVerifiedDeployment'] or {}).get('deployment_id', '-')} |",
        f"| pauza | {'DA' if status['paused'] else 'ne'} |",
        f"| objave zamrznute | {'DA' if status['publishFrozen'] else 'ne'} |",
        f"| sljedeci pokusaj | {status['nextAttempt']} |",
        "",
        "## Zadaci po stanju",
        "",
    ]
    if status["tasksByStatus"]:
        lines += [f"- `{k}`: {v}" for k, v in sorted(status["tasksByStatus"].items())]
    else:
        lines.append("- red je prazan (idle)")
    lines += ["", "## Upozorenja", ""]
    lines += [f"- {w}" for w in status["warnings"]] or ["- nema"]
    lines += ["", "Napomena: brojke tokena ili procijenjeni trosak se ne prikazuju; racun je izvor istine o naplati.", ""]
    return "\n".join(lines)


def write_report(store, destination: str, *, config: dict | None = None, now: int, last_tick: dict | None = None,
                 doctor: dict | None = None) -> dict:
    os.makedirs(destination, exist_ok=True)
    status = build_status(store, config, now, last_tick, doctor)
    with open(os.path.join(destination, "status.json"), "w", encoding="utf-8") as fh:
        json.dump(status, fh, ensure_ascii=False, indent=2)
    with open(os.path.join(destination, "status.md"), "w", encoding="utf-8") as fh:
        fh.write(render_markdown(status))
    return status
