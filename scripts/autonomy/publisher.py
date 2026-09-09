"""Izdavac: PR, merge, deploy nadzor i jedan povrat (plan, odjeljak 7.3 i Zadatak 6).

Izdavac je ODVOJEN od radnika: dobiva samo provjereni kandidat, dokaz kroz pouzdani loader i adapter prema
udaljenim servisima (`remote`, `hosting`). Nikad ne izvrsava kandidatov shell ni npm skripte. Token je u
adapteru, ne u ovom modulu; testovi koriste lazne adaptere.

Adapter `remote` (GitHub) mora imati:
    find_pull_request(idempotency_key) -> dict | None      {number, head_sha, merged, merge_sha}
    open_pull_request(branch, base, title, body, idempotency_key) -> dict
    pull_request(number) -> dict                            {number, head_sha, base_sha, merged, merge_sha, checks: {name: conclusion}}
    branch_protection(base) -> dict                         {required_checks: [..], enforce_admins: bool, available: bool}
    base_head(base) -> str
    merge(number, expected_head_sha, idempotency_key) -> dict   {merged: bool, merge_sha}
Adapter `hosting` (Netlify):
    current_deployment() -> dict | None                     {id, commit_sha, artifact_hash}
    deployment(deployment_id) -> dict                       {id, state, commit_sha, artifact_hash}
    restore(deployment_id) -> dict                          {ok: bool, id}
Smoke: `smoke(url) -> 'pass' | 'fail' | 'unknown'`.

Nedostupan API nikad nije uspjeh: rezultat je `unknown` i blokira sljedecu objavu.
"""
from __future__ import annotations

import hashlib
from typing import Callable

from .gate import promotion_allowed


def idempotency_key(repository: str, candidate_sha: str, policy_version: str) -> str:
    return hashlib.sha256(f"{repository}\n{candidate_sha}\n{policy_version}".encode("utf-8")).hexdigest()[:32]


def _blocked(reason: str, **extra) -> dict:
    return {"status": "blocked", "reason": reason, **extra}


def publish_verified(candidate: dict, evidence: dict, policy: dict, *, remote, store, now: int,
                     change_class: str = "needs_human") -> dict:
    """Otvori ili pronadji PR za kandidat; u `auto_low_risk` nacinu i spoji, ali samo uz dokaz.

    Redoslijed je namjeran: prvo se cita UDALJENO stanje (idempotencija nakon pada izmedju mergea i lokalnog
    zapisa), zatim politika, zatim zastita grane i provjere na aktualnom headu, pa tek onda merge.
    """
    repository = str(policy.get("repository") or "")
    base = str(policy.get("baseBranch") or "master")
    candidate_sha = str(candidate.get("candidateSha") or "")
    branch = str(candidate.get("branch") or "")
    key = idempotency_key(repository, candidate_sha, str(policy.get("policyVersion") or ""))
    result = {"status": None, "idempotency_key": key, "pr": None, "merge_sha": None, "reason": None}

    if not policy.get("publisherEnabled"):
        return _blocked("publisher_disabled", idempotency_key=key)
    mode = policy.get("mode")
    if mode == "observe":
        return _blocked("mode_observe: nema udaljenih write akcija", idempotency_key=key)
    if store.is_paused():
        return _blocked("paused", idempotency_key=key)
    if store.is_frozen():
        return _blocked("publish_frozen: prethodni povrat ceka razjasnjenje", idempotency_key=key)
    if not candidate_sha or not branch:
        return _blocked("kandidat bez SHA ili grane", idempotency_key=key)

    # 1. Udaljeno stanje prije bilo cega: pad izmedju mergea i lokalnog zapisa ne smije ponoviti objavu.
    try:
        existing = remote.find_pull_request(key)
    except Exception as exc:  # noqa: BLE001
        return {"status": "unknown", "reason": f"remote_unavailable: {type(exc).__name__}", "idempotency_key": key}
    if existing and existing.get("merged"):
        store.record_event(candidate.get("task_id"), "publish_found_merged", {"pr": existing.get("number"), "merge_sha": existing.get("merge_sha")}, now)
        return {"status": "merged", "pr": existing.get("number"), "merge_sha": existing.get("merge_sha"),
                "idempotency_key": key, "reason": "vec spojeno; nista ponovljeno"}

    # 2. PR postoji ili se otvara (propose i auto_low_risk).
    if existing:
        pr = existing
    else:
        open_prs = int(candidate.get("openAutonomyPrs", 0))
        if open_prs >= int(policy.get("maxOpenAutonomyPrs", 0)):
            return _blocked(f"max_open_prs: {open_prs}", idempotency_key=key)
        try:
            pr = remote.open_pull_request(branch, base, str(candidate.get("title") or f"autonomy: {candidate_sha[:12]}"),
                                          str(candidate.get("body") or ""), key)
        except Exception as exc:  # noqa: BLE001
            return {"status": "unknown", "reason": f"remote_unavailable: {type(exc).__name__}", "idempotency_key": key}
        store.record_event(candidate.get("task_id"), "pr_opened", {"pr": pr.get("number"), "head_sha": candidate_sha}, now)
    result["pr"] = pr.get("number")
    if pr.get("head_sha") and pr.get("head_sha") != candidate_sha:
        return _blocked("pr_head_mismatch: PR glava nije provjereni kandidat", idempotency_key=key, pr=pr.get("number"))

    if mode == "propose":
        result.update(status="proposed", reason="PR pripremljen; merge trazi covjeka u ovom nacinu")
        return result
    if mode != "auto_low_risk":
        return _blocked(f"nepoznat nacin {mode}", idempotency_key=key, pr=pr.get("number"))

    # 3. Dokaz, klasa promjene, dnevni limit.
    required = list(policy.get("requiredReleaseTiers") or [])
    if change_class != "auto_low_risk":
        return _blocked("needs_human: klasa promjene nije auto_low_risk", idempotency_key=key, pr=pr.get("number"))
    if not promotion_allowed(evidence, candidate_sha, required):
        return _blocked("evidence_rejected: dokaz nije potpun, svjez, potpisan ili vezan uz kandidat", idempotency_key=key, pr=pr.get("number"))
    if store.daily_counter("deploys", now) >= int(policy.get("maxSuccessfulAutoDeploysPerDay", 1)):
        return _blocked("max_deploys_today", idempotency_key=key, pr=pr.get("number"))

    # 4. Zastita grane i provjere na AKTUALNOM headu, neposredno prije mergea.
    try:
        protection = remote.branch_protection(base)
        live = remote.pull_request(pr["number"])
        base_head = remote.base_head(base)
    except Exception as exc:  # noqa: BLE001
        return {"status": "unknown", "reason": f"remote_unavailable: {type(exc).__name__}", "idempotency_key": key, "pr": pr.get("number")}
    if not protection.get("available"):
        return _blocked("branch_protection_unreadable: bez dokaza o zastiti nema mergea", idempotency_key=key, pr=pr.get("number"))
    if live.get("merged"):
        return {"status": "merged", "pr": pr.get("number"), "merge_sha": live.get("merge_sha"), "idempotency_key": key, "reason": "spojeno u medjuvremenu"}
    if live.get("head_sha") != candidate_sha:
        return _blocked("pr_head_moved: glava PR-a vise nije kandidat", idempotency_key=key, pr=pr.get("number"))
    if base_head != evidence.get("baseSha"):
        return _blocked("stale_base: master se pomaknuo, integracijski dokaz vise ne vrijedi", idempotency_key=key, pr=pr.get("number"))
    checks = live.get("checks") or {}
    missing = [name for name in protection.get("required_checks") or [] if checks.get(name) != "success"]
    if missing:
        return _blocked(f"required_checks_not_green: {', '.join(missing)}", idempotency_key=key, pr=pr.get("number"))
    if not protection.get("required_checks"):
        return _blocked("no_required_checks: grana bez obveznih provjera se ne spaja automatski", idempotency_key=key, pr=pr.get("number"))

    # 5. Merge s ocekivanim headom; udaljeni odgovor je jedini dokaz.
    try:
        merged = remote.merge(pr["number"], candidate_sha, key)
    except Exception as exc:  # noqa: BLE001
        store.record_event(candidate.get("task_id"), "merge_unknown", {"pr": pr.get("number")}, now)
        return {"status": "unknown", "reason": f"merge_unknown: {type(exc).__name__}; prvo procitaj udaljeno stanje", "idempotency_key": key, "pr": pr.get("number")}
    if not merged.get("merged"):
        return _blocked("merge_refused_by_remote", idempotency_key=key, pr=pr.get("number"))
    store.bump_daily("deploys", now)
    store.record_event(candidate.get("task_id"), "merged", {"pr": pr.get("number"), "merge_sha": merged.get("merge_sha")}, now)
    result.update(status="merged", merge_sha=merged.get("merge_sha"), reason="spojeno uz potpun dokaz")
    return result


def observe_deployment(deployment_id: str, *, hosting, smoke: Callable[[str], str], site_url: str, store, now: int,
                       expected_commit: str | None = None, expected_artifact_hash: str | None = None) -> dict:
    """Verdict za konkretan deploy: healthy / failed / unknown. `unknown` blokira sljedecu objavu."""
    try:
        dep = hosting.deployment(deployment_id)
    except Exception as exc:  # noqa: BLE001
        store.record_event(None, "deploy_observe_unknown", {"deployment_id": deployment_id}, now)
        return {"verdict": "unknown", "reason": f"hosting_unavailable: {type(exc).__name__}", "deployment_id": deployment_id}
    if not dep or dep.get("state") not in ("ready", "live", "published"):
        return {"verdict": "unknown", "reason": f"deploy_state={dep.get('state') if dep else None}", "deployment_id": deployment_id}
    if expected_commit and dep.get("commit_sha") != expected_commit:
        return {"verdict": "failed", "reason": "deploy_commit_mismatch", "deployment_id": deployment_id}
    if expected_artifact_hash and dep.get("artifact_hash") and dep.get("artifact_hash") != expected_artifact_hash:
        return {"verdict": "failed", "reason": "artifact_hash_mismatch", "deployment_id": deployment_id}
    outcome = smoke(site_url)
    if outcome == "pass":
        store.set_deployment_status(deployment_id, "verified", now, verified=True)
        return {"verdict": "healthy", "reason": "smoke pass", "deployment_id": deployment_id}
    if outcome == "fail":
        store.set_deployment_status(deployment_id, "failed", now)
        return {"verdict": "failed", "reason": "smoke fail", "deployment_id": deployment_id}
    store.record_event(None, "deploy_smoke_unknown", {"deployment_id": deployment_id}, now)
    return {"verdict": "unknown", "reason": "smoke unknown (mreza?)", "deployment_id": deployment_id}


def rollback_verified(deployment_id: str, *, hosting, smoke: Callable[[str], str], site_url: str, store, now: int) -> dict:
    """JEDAN povrat na zadnji verificirani kompatibilni artefakt, pa smoke, pa zamrzavanje objava."""
    failed = store.deployment(deployment_id)
    previous = store.last_verified_deployment()
    if previous and previous.get("deployment_id") == deployment_id:
        previous = None
    if not previous:
        store.set_frozen(True, f"rollback bez prethodnog verificiranog deploya za {deployment_id}", now)
        return {"status": "blocked", "reason": "no_verified_previous_deployment", "frozen": True}
    if failed and failed.get("previous_deployment_id") and failed["previous_deployment_id"] != previous["deployment_id"]:
        # Zapis kaze da je prethodnik netko drugi: ne nagadjamo, biramo zapisanog prethodnika ako je verificiran.
        recorded = store.deployment(failed["previous_deployment_id"])
        if recorded and recorded.get("status") == "verified":
            previous = recorded
    try:
        restored = hosting.restore(previous["deployment_id"])
    except Exception as exc:  # noqa: BLE001
        store.set_frozen(True, f"rollback nepoznat ishod: {type(exc).__name__}", now)
        return {"status": "unknown", "reason": f"hosting_unavailable: {type(exc).__name__}", "frozen": True}
    if not restored.get("ok"):
        store.set_frozen(True, "rollback odbijen od hostinga", now)
        return {"status": "failed", "reason": "restore_refused", "frozen": True}
    store.record_event(None, "rollback", {"from": deployment_id, "to": previous["deployment_id"]}, now)
    outcome = smoke(site_url)
    store.set_frozen(True, f"povrat izveden ({deployment_id} -> {previous['deployment_id']}); ceka razjasnjenje uzroka", now)
    return {"status": "rolled_back" if outcome == "pass" else ("unknown" if outcome == "unknown" else "failed"),
            "restored_deployment_id": previous["deployment_id"], "smoke": outcome, "frozen": True,
            "reason": "smoke nakon povrata: " + outcome}
