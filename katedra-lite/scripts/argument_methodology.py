#!/usr/bin/env python3
"""Methodology-aware policies for Katedra argument heuristics.

The methodology policy only changes which heuristic signals are relevant. It
never declares a methodology academically correct and never replaces manual
review. Explicit CLI context wins over a resolved-profile methodology; if
neither is available, Katedra uses a neutral ``generic`` policy rather than
silently assuming an empirical design.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Mapping


class MethodologyError(ValueError):
    pass


@dataclass(frozen=True)
class MethodologyPolicy:
    type: str
    label: str
    requires_analytical_section: bool = False
    theory_share_max: float | None = None
    display_contribution: str = "optional"  # optional | expected
    analytical_title_markers: tuple[str, ...] = ()


_COMMON_EMPIRICAL = (
    "analiz", "empirij", "rezultat", "istrazivanj", "rasprav", "nalaz",
)

POLICIES: dict[str, MethodologyPolicy] = {
    "generic": MethodologyPolicy(
        "generic", "neutralna / neodređena metodologija",
        analytical_title_markers=_COMMON_EMPIRICAL,
    ),
    "quantitative": MethodologyPolicy(
        "quantitative", "kvantitativna",
        requires_analytical_section=True,
        theory_share_max=0.65,
        display_contribution="expected",
        analytical_title_markers=_COMMON_EMPIRICAL + ("statist", "model", "regres", "podac"),
    ),
    "qualitative": MethodologyPolicy(
        "qualitative", "kvalitativna",
        requires_analytical_section=True,
        analytical_title_markers=_COMMON_EMPIRICAL + (
            "tematsk", "kodir", "intervju", "diskurs", "interpret",
        ),
    ),
    "mixed_methods": MethodologyPolicy(
        "mixed_methods", "mješovite metode",
        requires_analytical_section=True,
        theory_share_max=0.65,
        display_contribution="expected",
        analytical_title_markers=_COMMON_EMPIRICAL + (
            "statist", "tematsk", "intervju", "podac",
        ),
    ),
    "case_study": MethodologyPolicy(
        "case_study", "studija slučaja",
        requires_analytical_section=True,
        analytical_title_markers=_COMMON_EMPIRICAL + ("studija slucaja", "case study", "slucaj"),
    ),
    "doctrinal_legal": MethodologyPolicy(
        "doctrinal_legal", "doktrinarno-pravna",
        analytical_title_markers=("pravn", "doktrin", "normativ", "sudsk", "tumacen", "rasprav"),
    ),
    "theoretical": MethodologyPolicy(
        "theoretical", "teorijska / konceptualna",
        analytical_title_markers=("teor", "koncept", "rasprav", "usporedb", "kritik"),
    ),
    "historical": MethodologyPolicy(
        "historical", "povijesna",
        analytical_title_markers=("povij", "razvoj", "razdob", "usporedb", "interpret"),
    ),
    "review": MethodologyPolicy(
        "review", "pregledna / sintezna",
        analytical_title_markers=("sintez", "pregled", "rasprav", "usporedb", "kritik"),
    ),
    "systematic_review": MethodologyPolicy(
        "systematic_review", "sustavni pregled",
        requires_analytical_section=True,
        analytical_title_markers=("rezultat", "sintez", "nalaz", "rasprav", "pregled"),
    ),
}

METHODOLOGY_TYPES = tuple(POLICIES)


def load_methodology_from_profile(path: str | Path | None) -> str | None:
    if not path:
        return None
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MethodologyError(f"profil se ne može pročitati: {path}: {exc}") from exc
    if not isinstance(data, Mapping):
        raise MethodologyError("profil mora biti JSON objekt")
    methodology = data.get("metodologija")
    if methodology is None:
        return None
    if not isinstance(methodology, Mapping):
        raise MethodologyError("metodologija u profilu mora biti objekt")
    value = methodology.get("type")
    if value is None:
        raise MethodologyError("metodologija.type nedostaje u profilu")
    return str(value)


def resolve_methodology(explicit: str | None, profile_path: str | Path | None = None):
    if explicit:
        value = explicit
        source = "cli"
    else:
        profile_type = load_methodology_from_profile(profile_path)
        value = profile_type or "generic"
        source = "profile" if profile_type else "default"
    if value not in POLICIES:
        raise MethodologyError(
            f"nepoznata metodologija: {value}; dopušteno: " + ", ".join(METHODOLOGY_TYPES)
        )
    return POLICIES[value], source
