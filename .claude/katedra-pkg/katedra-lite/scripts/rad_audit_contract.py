#!/usr/bin/env python3
"""Verzionirani ugovor između Katedre i zasebnog rad-audit motora.

Katedra smije vjerovati isključivo deklariranom contractu/capabilities, nikad
implementacijskim detaljima ili tekstu unutar source datoteka rad-audita.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Any

CONTRACT_VERSION = "1"
ENGINE_NAME = "rad-audit"
MANIFEST_NAME = "engine_contract.json"

CORE_CAPABILITY = "audit.report-json.v1"
TRUST_CAPABILITIES = frozenset(
    {
        "hr.citations.author-year.v1",
        "hr.typography.numbers.v1",
        "safe-fixes.preserve-page-breaks.v1",
    }
)
REQUIRED_CAPABILITIES = frozenset({CORE_CAPABILITY}) | TRUST_CAPABILITIES


class ContractError(ValueError):
    """Contract postoji ili se očekuje, ali nije valjan/kompatibilan."""


def _nonempty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{field} mora biti neprazan string")
    return value.strip()


def _safe_entrypoint(motor: str, value: Any, field: str) -> str:
    rel = _nonempty_string(value, field)
    if os.path.isabs(rel):
        raise ContractError(f"{field} mora biti relativna putanja unutar motora")
    base = os.path.realpath(motor)
    target = os.path.realpath(os.path.join(base, rel))
    try:
        common = os.path.commonpath([base, target])
    except ValueError as exc:
        raise ContractError(f"{field} nije valjana putanja") from exc
    if common != base:
        raise ContractError(f"{field} izlazi iz direktorija motora")
    if not os.path.isfile(target):
        raise ContractError(f"{field} ne postoji: {rel}")
    return rel


@dataclass(frozen=True)
class EngineContract:
    contract_version: str
    engine: str
    engine_version: str
    capabilities: frozenset[str]
    audit_entrypoint: str
    phase_entrypoints: dict[str, str]

    def phase_entrypoint(self, phase: str) -> str:
        phase = phase.upper()
        capability = f"phase.{phase}"
        if capability not in self.capabilities:
            raise ContractError(f"motor ne deklarira capability {capability}")
        try:
            return self.phase_entrypoints[phase]
        except KeyError as exc:
            raise ContractError(f"motor nema entrypoint za fazu {phase}") from exc


def load_engine_contract(motor: str) -> EngineContract:
    manifest_path = os.path.join(motor, MANIFEST_NAME)
    if not os.path.isfile(manifest_path):
        raise ContractError(f"nedostaje {MANIFEST_NAME}")
    try:
        with open(manifest_path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"{MANIFEST_NAME} se ne može pročitati: {exc}") from exc
    if not isinstance(data, dict):
        raise ContractError(f"{MANIFEST_NAME} mora sadržavati JSON objekt")

    contract_version = _nonempty_string(data.get("contract_version"), "contract_version")
    engine = _nonempty_string(data.get("engine"), "engine")
    engine_version = _nonempty_string(data.get("engine_version"), "engine_version")

    if contract_version != CONTRACT_VERSION:
        raise ContractError(
            f"contract_version={contract_version!r} nije podržan; očekujem {CONTRACT_VERSION!r}"
        )
    if engine != ENGINE_NAME:
        raise ContractError(f"engine={engine!r} nije {ENGINE_NAME!r}")

    raw_capabilities = data.get("capabilities")
    if not isinstance(raw_capabilities, list) or not all(
        isinstance(item, str) and item.strip() for item in raw_capabilities
    ):
        raise ContractError("capabilities mora biti popis nepraznih stringova")
    capabilities = frozenset(item.strip() for item in raw_capabilities)
    missing = sorted(REQUIRED_CAPABILITIES - capabilities)
    if missing:
        raise ContractError("nedostaju obavezni capabilities: " + ", ".join(missing))

    entrypoints = data.get("entrypoints")
    if not isinstance(entrypoints, dict):
        raise ContractError("entrypoints mora biti JSON objekt")
    audit_entrypoint = _safe_entrypoint(motor, entrypoints.get("audit"), "entrypoints.audit")

    raw_phases = entrypoints.get("phases", {})
    if not isinstance(raw_phases, dict):
        raise ContractError("entrypoints.phases mora biti JSON objekt")
    phase_entrypoints: dict[str, str] = {}
    for phase, entrypoint in raw_phases.items():
        if not isinstance(phase, str) or not phase.strip():
            raise ContractError("entrypoints.phases ključevi moraju biti neprazni stringovi")
        upper = phase.upper()
        phase_entrypoints[upper] = _safe_entrypoint(
            motor, entrypoint, f"entrypoints.phases.{upper}"
        )

    return EngineContract(
        contract_version=contract_version,
        engine=engine,
        engine_version=engine_version,
        capabilities=capabilities,
        audit_entrypoint=audit_entrypoint,
        phase_entrypoints=phase_entrypoints,
    )


def validate_document_audit_result(path: str, contract: EngineContract) -> dict[str, Any]:
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"DocumentAuditResult se ne može pročitati: {exc}") from exc
    if not isinstance(data, dict):
        raise ContractError("DocumentAuditResult mora biti JSON objekt")

    required = {
        "contract_version",
        "engine",
        "engine_version",
        "capabilities",
        "findings",
        "counts",
        "phase_exit_codes",
    }
    missing = sorted(required - set(data))
    if missing:
        raise ContractError("DocumentAuditResult nema polja: " + ", ".join(missing))

    if data["contract_version"] != contract.contract_version:
        raise ContractError("DocumentAuditResult contract_version ne odgovara engine contractu")
    if data["engine"] != contract.engine:
        raise ContractError("DocumentAuditResult engine ne odgovara engine contractu")
    if data["engine_version"] != contract.engine_version:
        raise ContractError("DocumentAuditResult engine_version ne odgovara engine contractu")

    capabilities = data["capabilities"]
    if not isinstance(capabilities, list) or not all(isinstance(item, str) for item in capabilities):
        raise ContractError("DocumentAuditResult capabilities mora biti popis stringova")
    result_capabilities = frozenset(capabilities)
    if CORE_CAPABILITY not in result_capabilities:
        raise ContractError(f"DocumentAuditResult nema capability {CORE_CAPABILITY}")
    undeclared = sorted(result_capabilities - contract.capabilities)
    if undeclared:
        raise ContractError(
            "DocumentAuditResult tvrdi capability koji manifest nije deklarirao: "
            + ", ".join(undeclared)
        )
    if not isinstance(data["findings"], list):
        raise ContractError("DocumentAuditResult findings mora biti popis")
    if not isinstance(data["counts"], dict):
        raise ContractError("DocumentAuditResult counts mora biti objekt")
    if not isinstance(data["phase_exit_codes"], dict):
        raise ContractError("DocumentAuditResult phase_exit_codes mora biti objekt")

    for key in ("kritično", "srednje", "kozmetičko"):
        value = data["counts"].get(key, 0)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ContractError(f"DocumentAuditResult counts.{key} mora biti nenegativan cijeli broj")

    return data
