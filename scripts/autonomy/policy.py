"""Politika naplate i opsega. Cista logika, bez poziva modelu, mreze ili diska (osim load_config).

Zadano je ZABRANJENO: nedostajuce polje profila znaci da poziv nije dopusten, nepoznata staza znaci
`needs_human`. Pozitivan bool u profilu sam po sebi nije aktivacija: profil pise `doctor` iz stvarno
provjerenih opazanja (`trusted_observation`), ne kandidatov kod. Provider aliasi dolaze iz zajednickog
`config/agent-providers.json` registra.
"""
from __future__ import annotations

import json
import os
import posixpath
import re
from typing import Iterable

from .provider_config import AGENT_PROVIDER, AGENT_ROLE

REQUIRED_PROFILE_KEYS = (
    "subscription_verified",
    "extra_credits_disabled",
    "model_included",
    "configuration_unchanged",
    "trusted_observation",
)

MODES = ("observe", "propose", "auto_low_risk")
VERDICT_AUTO = "auto_low_risk"
VERDICT_HUMAN = "needs_human"

# Datoteke koje odreduju sto je "prolaz": kontroler, CI, pragovi, ratcheti, dokaz izdanja, upute
# agentima. Kandidat koji ih dira NIKAD ne prolazi kroz vlastiti automatski prihvat (plan, odjeljak 1 i 7.2).
CONTROL_PATH_PREFIXES = (
    ".github/",
    ".claude/",
    "config/",
    "scripts/autonomy/",
    "scripts/agents/",
    "scripts/release-check.mjs",
    "scripts/release-proof-core.mjs",
    "scripts/verify-deploy-dist.mjs",
    "scripts/post-deploy-smoke.mjs",
    "scripts/npm-audit-ratchet",
    "scripts/security/",
    "docs/generated/",
    "docs/agents/tasks.json",
    "docs/agents/ORCHESTRATION.md",
    "docs/agents/PROJECT_RULES.md",
    "data/",
    "supabase/",
    "tests/gate-mutations.test.ts",
    "tests/ui-module-budget.test.ts",
    "package.json",
    "package-lock.json",
    "netlify.toml",
    "playwright.config.ts",
    "playwright.dist.config.ts",
    "vitest.config.ts",
    "vite.config.ts",
    "tsconfig.json",
    "AGENTS.md",
    "CLAUDE.md",
)
CONTROL_PATH_PATTERNS = (re.compile(r"ratchet", re.IGNORECASE), re.compile(r"golden", re.IGNORECASE), re.compile(r"__snapshots__"))

_DRIVE = re.compile(r"^[A-Za-z]:")


class PolicyError(ValueError):
    """Neispravna konfiguracija ili staza koja se ne smije ni razmatrati."""


def billing_allowed(profile: dict | None) -> bool:
    """Smije li kontroler uopce razmatrati modelski poziv.

    Novi profili imaju provider-specificki `providers` objekt. Legacy profil bez njega ostaje
    citljiv radi migracije/statusa, ali ne autorizira nijedan stvarni model provider.
    """
    if not isinstance(profile, dict):
        return False
    providers = profile.get("providers")
    if isinstance(providers, dict):
        if profile.get("configuration_unchanged") is not True or profile.get("trusted_observation") is not True:
            return False
        return any(isinstance(value, dict) and value.get("allowed") is True for value in providers.values())
    if profile.get("effective_auth") != "subscription":
        return False
    return all(profile.get(key) is True for key in REQUIRED_PROFILE_KEYS)


def provider_billing_allowed(profile: dict | None, command: str, requested_model: str | None = None) -> bool:
    """Fail-closed provjera TOCNOG providera/modela koji se sprema pokrenuti."""
    if not billing_allowed(profile):
        return False
    providers = profile.get("providers") if isinstance(profile, dict) else None
    if not isinstance(providers, dict):
        # Legacy globalni profil ne moze dokazati KOJI je provider prijavljen. Za stvarne
        # providere zato je fail-closed i trazi novi doctor profil. Nepoznati command ostaje
        # dopusten samo testnom/process harnessu koji ne predstavlja vanjski model provider.
        return command not in ("codex", "claude", "grok") and billing_allowed(profile)
    provider = providers.get(command)
    if not isinstance(provider, dict) or provider.get("allowed") is not True:
        return False
    approved = provider.get("approved_models")
    if requested_model and isinstance(approved, list) and approved:
        req = requested_model.lower()
        if not any(isinstance(model, str) and (req in model.lower() or model.lower() in req) for model in approved):
            return False
    return True


def canonical_path(path: str) -> str:
    """Kanonska repo-relativna staza ili PolicyError. Odbija apsolutne staze, pogone, `..`, NUL i prazno."""
    if not isinstance(path, str) or not path or "\x00" in path:
        raise PolicyError(f"neispravna staza: {path!r}")
    p = path.replace("\\", "/")
    if p.startswith("/") or _DRIVE.match(p):
        raise PolicyError(f"apsolutna staza nije dopustena: {path!r}")
    parts = [seg for seg in p.split("/") if seg not in ("", ".")]
    if not parts or any(seg == ".." for seg in parts):
        raise PolicyError(f"staza izlazi iz repozitorija ili je prazna: {path!r}")
    return posixpath.join(*parts)


def path_escapes_root(root: str, rel: str) -> bool:
    """Provjera na disku: prati symlinke/junctione. True kad stvarna lokacija nije unutar `root`."""
    real_root = os.path.realpath(root)
    target = os.path.realpath(os.path.join(real_root, rel))
    try:
        return os.path.commonpath([real_root, target]) != real_root
    except ValueError:
        return True


def is_control_path(rel: str) -> bool:
    if any(rel == prefix or rel.startswith(prefix) for prefix in CONTROL_PATH_PREFIXES):
        return True
    return any(pattern.search(rel) for pattern in CONTROL_PATH_PATTERNS)


def explain_change(paths: Iterable[str], changed_lines: int, policy: dict, root: str | None = None) -> tuple[str, list[str]]:
    """Presuda i razlozi. Kanonizira staze; malformirana staza je PolicyError, ne `needs_human`."""
    reasons: list[str] = []
    allow = tuple(policy.get("autoLowRiskPathPrefixes") or ())
    max_files = int(policy.get("maxFilesPerAutoChange", 0) or 0)
    max_lines = int(policy.get("maxChangedLinesPerAutoChange", 0) or 0)
    canon = [canonical_path(p) for p in paths]
    if not canon:
        reasons.append("nema promijenjenih datoteka")
    if len(canon) > max_files:
        reasons.append(f"previse datoteka: {len(canon)} > {max_files}")
    if not isinstance(changed_lines, int) or isinstance(changed_lines, bool) or changed_lines < 0:
        reasons.append("broj promijenjenih redaka nije poznat")
    elif changed_lines > max_lines:
        reasons.append(f"previse redaka: {changed_lines} > {max_lines}")
    for rel in canon:
        if root is not None and path_escapes_root(root, rel):
            raise PolicyError(f"staza izlazi iz radnog stabla (symlink/junction): {rel}")
        if is_control_path(rel):
            reasons.append(f"kontrolna datoteka: {rel}")
        elif not any(rel.startswith(prefix) for prefix in allow):
            reasons.append(f"izvan dopustenih staza: {rel}")
    return (VERDICT_HUMAN if reasons else VERDICT_AUTO), reasons


def classify_change(paths: Iterable[str], changed_lines: int, policy: dict, root: str | None = None) -> str:
    return explain_change(paths, changed_lines, policy, root)[0]


def validate_config(cfg: dict) -> list[str]:
    """Popis problema; prazan popis znaci valjanu konfiguraciju. Ne popravlja nista sam."""
    problems: list[str] = []
    if not isinstance(cfg, dict):
        return ["konfiguracija nije objekt"]
    if cfg.get("schemaVersion") != 1:
        problems.append("schemaVersion mora biti 1")
    if cfg.get("mode") not in MODES:
        problems.append(f"mode mora biti jedan od {MODES}")
    if cfg.get("billingMode") != "subscription_only":
        problems.append("billingMode mora biti subscription_only")
    for key in ("allowApiBilling", "allowPaidCredits", "fableEnabled", "externalDocumentUploadAllowed"):
        if cfg.get(key) is not False:
            problems.append(f"{key} mora biti false")
    if not isinstance(cfg.get("grokEnabled", False), bool):
        problems.append("grokEnabled mora biti bool")
    coordinators = {name for name, role in AGENT_ROLE.items() if role == "coordinator"}
    implementers = {name for name, role in AGENT_ROLE.items() if role == "implementer"}
    routing_agents = {
        "plannerAgent": {"auto", *coordinators},
        "implementerAgent": {"auto", *implementers},
        "reviewerAgent": {"auto", *AGENT_PROVIDER.keys()},
    }
    for key, allowed in routing_agents.items():
        value = cfg.get(key, "auto")
        if not isinstance(value, str) or value not in allowed:
            problems.append(f"{key} mora biti jedan od {sorted(allowed)}")
    if not cfg.get("grokEnabled", False) and any(
        AGENT_PROVIDER.get(str(cfg.get(key))) == "grok" for key in routing_agents
    ):
        problems.append("Grok routing trazi grokEnabled=true")
    if cfg.get("providerFallback") not in ("wait", "authorized"):
        problems.append("providerFallback mora biti wait ili authorized")
    if cfg.get("maxPaidActionsUsd") != 0 or isinstance(cfg.get("maxPaidActionsUsd"), bool):
        problems.append("maxPaidActionsUsd mora biti 0")
    if cfg.get("allowedRunnerClass") != "public_standard":
        problems.append("allowedRunnerClass mora biti public_standard")
    if cfg.get("maxConcurrentJobs") != 1:
        problems.append("maxConcurrentJobs mora biti 1")
    for key in ("maxNewJobsPerDay", "maxAttemptsPerTask", "agentTimeoutMinutes", "gateTimeoutMinutes",
                "pollMinutes", "maxOpenAutonomyPrs", "maxFilesPerAutoChange", "maxChangedLinesPerAutoChange",
                "maxSuccessfulAutoDeploysPerDay"):
        value = cfg.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            problems.append(f"{key} mora biti cijeli broj >= 1")
    if not isinstance(cfg.get("repository"), str) or "/" not in cfg.get("repository", ""):
        problems.append("repository mora biti owner/name")
    if not isinstance(cfg.get("policyVersion"), str) or not cfg.get("policyVersion"):
        problems.append("policyVersion je obavezan")
    worker_repo = cfg.get("workerRepoPath", None)
    if worker_repo is not None and (not isinstance(worker_repo, str) or not worker_repo.strip()):
        # Kljuc je NEOBAVEZAN i zadano `null` cuva staro ponasanje (radnikovo stablo je cwd), ali prazan niz je
        # tipfeler koji bi tiho vratio isti fallback.
        problems.append("workerRepoPath mora biti staza ili null")
    if not isinstance(cfg.get("publisherEnabled"), bool):
        problems.append("publisherEnabled mora biti bool")
    prefixes = cfg.get("autoLowRiskPathPrefixes")
    if not isinstance(prefixes, list) or not all(isinstance(p, str) and p.endswith("/") for p in prefixes):
        problems.append("autoLowRiskPathPrefixes mora biti popis prefiksa koji zavrsavaju s /")
    else:
        for prefix in prefixes:
            if is_control_path(prefix):
                problems.append(f"dopusteni prefiks je kontrolna staza: {prefix}")
    tiers = cfg.get("requiredReleaseTiers")
    if not isinstance(tiers, list) or not tiers or not all(isinstance(t, str) and t for t in tiers):
        problems.append("requiredReleaseTiers mora biti neprazan popis")
    return problems


def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        cfg = json.load(fh)
    problems = validate_config(cfg)
    if problems:
        raise PolicyError("; ".join(problems))
    return cfg
