"""Pouzdane provjere i svjez dokaz (plan, odjeljak 7 i Zadatak 5).

Dvije odvojene odgovornosti:

* `verify_candidate` POKRECE postojece repo provjere (`npm run release:check`) kroz ubrizgani `runner`,
  procita `docs/generated/RELEASE_PROOF.json` i sastavi MANIFEST vezan uz tocan kandidat (baseSha,
  candidateSha, sourceTreeHash, dependencyLockHash, artifactHash, policyVersion, alati, ishodi).
  Manifest potpisuje provjerivac (HMAC kljuc izvan repozitorija); agent ga ne moze potpisati.
* `load_evidence` je POUZDANI LOADER: iz datoteke uzima manifest, BRISE sva polja
  `signature_verified` / `hashes_verified` / `policy_current` koja je netko mogao upisati i racuna ih sam.
  `promotion_allowed` zatim odlucuje bez izvrsavanja kandidatova koda.

Tri ishoda svjezine dokaza (`fresh`/`stale`/`unknown`) su port `scripts/release-proof-core.mjs`; `unknown`
i `stale` blokiraju. Exit kod 0 uz `complete:false` blokira. Kontrolne datoteke u kandidatu blokiraju
automatski prihvat (ratchet ne moze sam sebi dati prolaz).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from typing import Callable

from .policy import is_control_path

MANIFEST_SCHEMA_VERSION = 1
PROOF_PATH = "docs/generated/RELEASE_PROOF.json"
TRUSTED_FIELDS = ("signature_verified", "hashes_verified", "policy_current", "complete_verified")
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")


# --------------------------------------------------------------------------------------------
# Otisci
# --------------------------------------------------------------------------------------------
def tree_digest_from_ls_tree(ls_tree_text: str, exclude_paths: tuple[str, ...] = (PROOF_PATH,)) -> str | None:
    """Port `treeDigestFromLsTree`: sha256 nad sortiranim `sha\\tstaza` blob redcima, bez datoteke dokaza."""
    if not isinstance(ls_tree_text, str):
        return None
    excluded = set(exclude_paths)
    entries: list[str] = []
    for raw in ls_tree_text.replace("\r\n", "\n").split("\n"):
        line = raw.rstrip()
        if not line:
            continue
        tab = line.find("\t")
        if tab < 0:
            return None
        meta = line[:tab].split()
        path_raw = line[tab + 1:]
        if len(meta) < 3:
            return None
        _, kind, sha = meta[0], meta[1], meta[2]
        if kind != "blob":
            continue
        path = path_raw[1:-1] if path_raw.startswith('"') and path_raw.endswith('"') else path_raw
        if path in excluded:
            continue
        entries.append(f"{sha}\t{path}")
    if not entries:
        return None
    entries.sort()
    return hashlib.sha256("\n".join(entries).encode("utf-8")).hexdigest()


def proof_staleness(proof: dict | None, head_digest: str | None) -> dict:
    """Port `proofStaleness`: fresh / stale / unknown, s razlogom. `unknown` nikad nije svjeze."""
    proof_digest = proof.get("treeDigest") if isinstance(proof, dict) else None
    if not isinstance(proof_digest, str) or not proof_digest:
        return {"verdict": "unknown", "reason": "dokaz nema treeDigest (stari format ili nije pecen kroz release-check)"}
    if not isinstance(head_digest, str) or not head_digest:
        return {"verdict": "unknown", "reason": "otisak stabla koje se gradi nije izracunat (git ls-tree nije uspio)"}
    if proof_digest != head_digest:
        return {"verdict": "stale", "reason": "stablo se razlikuje od stabla nad kojim je dokaz pecen (u necem osim samog dokaza)"}
    return {"verdict": "fresh", "reason": "stablo je jednako stablu dokaza, osim same datoteke dokaza"}


def file_sha256(path: str) -> str | None:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def directory_digest(root: str) -> str | None:
    """Deterministicki otisak artefakta (dist/): sortirane relativne staze + sha256 sadrzaja."""
    if not os.path.isdir(root):
        return None
    entries: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            digest = file_sha256(full)
            if digest is None:
                return None
            entries.append(f"{digest}\t{rel}")
    if not entries:
        return None
    return hashlib.sha256("\n".join(entries).encode("utf-8")).hexdigest()


def canonical_json(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


# --------------------------------------------------------------------------------------------
# Ishodi obveznih koraka iz RELEASE_PROOF.json
# --------------------------------------------------------------------------------------------
def release_proof_checks(proof: dict | None, required: list[str]) -> dict[str, str]:
    """Po obveznoj razini: 'pass' samo za status pass; 'fail' za fail; sve ostalo (skipped, unavailable,
    stale, nedostaje) je 'unknown'. `windowsOnly` razina preskocena drugdje NIJE prolaz."""
    statuses: dict[str, str] = {}
    results = proof.get("results") if isinstance(proof, dict) else None
    by_id = {r.get("id"): r for r in results} if isinstance(results, list) else {}
    for name in required:
        entry = by_id.get(name)
        status = entry.get("status") if isinstance(entry, dict) else None
        statuses[name] = "pass" if status == "pass" else ("fail" if status == "fail" else "unknown")
    return statuses


# --------------------------------------------------------------------------------------------
# Manifest i potpis
# --------------------------------------------------------------------------------------------
def sign_manifest(manifest: dict, key: bytes) -> str:
    body = {k: v for k, v in manifest.items() if k not in ("signature", *TRUSTED_FIELDS)}
    return hmac.new(key, canonical_json(body), hashlib.sha256).hexdigest()


def verify_signature(manifest: dict, key: bytes) -> bool:
    sig = manifest.get("signature")
    if not isinstance(sig, str) or not key:
        return False
    return hmac.compare_digest(sig, sign_manifest(manifest, key))


def build_manifest(*, base_sha: str, candidate_sha: str, source_tree_hash: str | None, dependency_lock_hash: str | None,
                   artifact_hash: str | None, policy_version: str, tool_versions: dict, checks: dict[str, str],
                   staleness: dict, proof: dict | None, control_files_changed: list[str], created_at: str,
                   exit_code: int | None) -> dict:
    required_ok = bool(checks) and all(v == "pass" for v in checks.values())
    complete = (
        required_ok
        and staleness.get("verdict") == "fresh"
        and isinstance(proof, dict) and proof.get("complete") is True
        and proof.get("commit") == candidate_sha
        and proof.get("dirtyWorkingTree") is False
        and exit_code == 0
        and all(isinstance(h, str) and h for h in (source_tree_hash, dependency_lock_hash, artifact_hash))
    )
    return {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "baseSha": base_sha,
        "candidateSha": candidate_sha,
        "sourceTreeHash": source_tree_hash,
        "dependencyLockHash": dependency_lock_hash,
        "artifactHash": artifact_hash,
        "policyVersion": policy_version,
        "toolVersions": tool_versions,
        "createdAt": created_at,
        "checks": checks,
        "staleness": staleness,
        "proofCommit": proof.get("commit") if isinstance(proof, dict) else None,
        "proofComplete": proof.get("complete") if isinstance(proof, dict) else None,
        "releaseCheckExitCode": exit_code,
        "controlFilesChanged": sorted(control_files_changed),
        "complete": complete,
    }


def verify_candidate(candidate: dict, policy: dict, *, runner: Callable[[list[str]], tuple[int, str]],
                     read_proof: Callable[[], dict | None], tool_versions: dict | None = None,
                     signing_key: bytes | None = None, created_at: str = "") -> dict:
    """Pokrece obvezne provjere i vraca potpisan manifest. `runner(argv) -> (exit_code, stdout)` je jedini
    kontakt s vanjskim svijetom pa se cijeli tok testira bez npm-a. Kandidatov kod se NE izvrsava ovdje
    osim kroz taj runner (koji u produkciji radi u odvojenom sandboxu)."""
    required = list(policy.get("requiredReleaseTiers") or [])
    candidate_sha = str(candidate.get("candidateSha") or "")
    base_sha = str(candidate.get("baseSha") or "")
    if not _SHA_RE.match(candidate_sha) or not _SHA_RE.match(base_sha):
        raise ValueError("candidateSha i baseSha moraju biti puni 40-hex SHA")
    exit_code, _ = runner(["npm", "run", "release:check"])
    proof = read_proof()
    ls_code, ls_out = runner(["git", "ls-tree", "-r", candidate_sha])
    head_digest = tree_digest_from_ls_tree(ls_out) if ls_code == 0 else None
    staleness = proof_staleness(proof, head_digest)
    checks = release_proof_checks(proof, required)
    changed = list(candidate.get("changedPaths") or [])
    control = [p for p in changed if is_control_path(p)]
    manifest = build_manifest(
        base_sha=base_sha, candidate_sha=candidate_sha, source_tree_hash=head_digest,
        dependency_lock_hash=candidate.get("dependencyLockHash"), artifact_hash=candidate.get("artifactHash"),
        policy_version=str(policy.get("policyVersion") or ""), tool_versions=tool_versions or {}, checks=checks,
        staleness=staleness, proof=proof, control_files_changed=control, created_at=created_at, exit_code=exit_code,
    )
    if signing_key:
        manifest["signature"] = sign_manifest(manifest, signing_key)
    return manifest


# --------------------------------------------------------------------------------------------
# Pouzdani loader i odluka o promociji
# --------------------------------------------------------------------------------------------
def load_evidence(manifest: dict, *, key: bytes, policy_version: str, expected: dict) -> dict:
    """Pouzdani loader: sam racuna `signature_verified`, `hashes_verified`, `policy_current`; nikad ih ne
    preuzima iz datoteke. `expected` nosi neovisno izracunate `sourceTreeHash`, `artifactHash`,
    `dependencyLockHash` (izdavac ih mjeri sam nad artefaktom koji ce objaviti)."""
    evidence = {k: v for k, v in (manifest or {}).items() if k not in TRUSTED_FIELDS}
    schema_ok = evidence.get("schemaVersion") == MANIFEST_SCHEMA_VERSION
    evidence["signature_verified"] = bool(schema_ok and verify_signature(evidence, key))
    evidence["hashes_verified"] = bool(schema_ok and all(
        isinstance(expected.get(name), str) and expected.get(name) and evidence.get(name) == expected.get(name)
        for name in ("sourceTreeHash", "artifactHash", "dependencyLockHash")
    ))
    evidence["policy_current"] = bool(schema_ok and policy_version and evidence.get("policyVersion") == policy_version)
    if not schema_ok:
        evidence["complete"] = False
    return evidence


def promotion_allowed(evidence: dict, candidate_sha: str, required: list[str]) -> bool:
    if not isinstance(evidence, dict) or not required:
        return False
    checks = evidence.get("checks", {})
    if not isinstance(checks, dict):
        return False
    return (
        evidence.get("signature_verified") is True
        and evidence.get("hashes_verified") is True
        and evidence.get("policy_current") is True
        and evidence.get("candidateSha") == candidate_sha
        and evidence.get("complete") is True
        and evidence.get("proofComplete") is True
        and (evidence.get("staleness") or {}).get("verdict") == "fresh"
        and not evidence.get("controlFilesChanged")
        and all(checks.get(name) == "pass" for name in required)
    )
