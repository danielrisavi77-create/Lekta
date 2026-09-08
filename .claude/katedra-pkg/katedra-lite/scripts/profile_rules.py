#!/usr/bin/env python3
"""Katedra profile rules and deterministic compositional resolver.

B04 introduced :class:`ResolvedRules` for reading one already-selected flat
faculty profile. B07 added composition across explicit context layers. B08 adds
a sidecar JSON-Pointer provenance map and read-only freshness assessment while
keeping the functional resolved profile backwards compatible.

Precedence (weak -> strong):
  global -> institution -> faculty -> programme -> work_type -> course
  -> mentor -> project_override

Dictionary values merge recursively. Lists and scalar values are replaced by
the stronger layer. At most one overlay per non-faculty layer may match a
context; ambiguity is an error instead of an arbitrary last-write-wins choice.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from typing import Any, Iterable, Mapping


class ProfileRuleError(ValueError):
    """Profil ne sadrži dovoljno podataka za traženu determinističku odluku."""


LAYER_ORDER = (
    "global",
    "institution",
    "faculty",
    "programme",
    "work_type",
    "course",
    "mentor",
    "project_override",
)
OVERLAY_LEVELS = tuple(x for x in LAYER_ORDER if x not in {"faculty", "project_override"})
CONTEXT_KEYS = ("institution", "faculty", "programme", "work_type", "course", "mentor")
RULE_ROOTS = ("citiranje", "format", "struktura", "predaja", "obrana")

# v1.1-fix Q15a: pravilo postavljeno na null ili izvan dopuštenog enuma NIJE
# „profil ne propisuje“ nego „profil propisuje nešto što ne razumijemo“.
# Resolved profil zato nosi popis takvih pointera pod ovim ključem, a potrošači
# ga moraju prikazati kao upozorenje, ne kao prolaz.
UNKNOWN_RULES_KEY = "_nepoznata_pravila"
ENUM_RULES: dict[str, tuple[str, ...]] = {
    "/citiranje/stil": ("autor-godina", "ieee", "vancouver", "harvard", "apa", "apa-hr", "legal-footnote"),
    "/format/poravnanje": ("obostrano", "lijevo"),
    "/format/lice": ("trece-jednina", "trece-mnozina", "prvo-mnozina"),
    "/struktura/prikazi/natpis": ("iznad", "ispod"),
}


@dataclass(frozen=True)
class ResolvedRules:
    naziv: str
    citation_style: str | None
    paragraph_min: int | None
    paragraph_max: int | None
    page_break_before: bool | None
    work_types: tuple[str, ...]

    @classmethod
    def from_profile(cls, profile: dict[str, Any]) -> "ResolvedRules":
        fmt = profile.get("format") or {}
        paragraph = fmt.get("odlomak") or {}
        scope = ((profile.get("struktura") or {}).get("opseg")) or {}
        return cls(
            naziv=str(profile.get("naziv") or profile.get("slug") or "profil"),
            citation_style=(profile.get("citiranje") or {}).get("stil"),
            paragraph_min=paragraph.get("min_redaka"),
            paragraph_max=paragraph.get("max_redaka"),
            page_break_before=fmt.get("prijelom_pred_poglavljem"),
            work_types=tuple(scope.keys()),
        )


@dataclass(frozen=True)
class ResolvedProfile:
    """Rezultat kompozicije: functional profile + sidecar provenance metadata."""

    profile: dict[str, Any]
    context: dict[str, str]
    applied_layers: tuple[str, ...]
    provenance: dict[str, dict[str, Any]]
    # v1.1-fix Q15a: pravila koja je neki sloj eksplicitno učinio nepoznatima.
    unknown_rules: tuple[str, ...] = ()


def load_profile(path: str | Path) -> dict[str, Any]:
    try:
        with Path(path).open(encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise ProfileRuleError(f"profil se ne može pročitati: {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ProfileRuleError(f"profil mora biti JSON objekt: {path}")
    return data


def resolve_work_type(explicit: str | None, profile: dict[str, Any]) -> str:
    if explicit:
        return explicit
    work_types = ResolvedRules.from_profile(profile).work_types
    if len(work_types) == 1:
        return work_types[0]
    if not work_types:
        raise ProfileRuleError("profil nema definiranu nijednu vrstu rada; navedi --tip")
    raise ProfileRuleError(
        "profil definira više vrsta rada; navedi --tip jednu od: " + ", ".join(work_types)
    )


def resolve_paragraph_thresholds(
    profile: dict[str, Any] | None,
    explicit_min: int | None,
    explicit_max: int | None,
) -> tuple[int, int]:
    rules = ResolvedRules.from_profile(profile or {})
    minimum = explicit_min if explicit_min is not None else rules.paragraph_min
    maximum = explicit_max if explicit_max is not None else rules.paragraph_max

    if minimum is None or maximum is None:
        raise ProfileRuleError(
            "prag odlomaka nije razriješen: navedi --profil s format.odlomak pravilima "
            "ili eksplicitno oba --min i --max"
        )
    if not isinstance(minimum, int) or not isinstance(maximum, int) or minimum < 1 or maximum < 1:
        raise ProfileRuleError("--min/--max i format.odlomak pragovi moraju biti pozitivni cijeli brojevi")
    if minimum > maximum:
        raise ProfileRuleError(f"minimalni prag ({minimum}) ne smije biti veći od maksimalnog ({maximum})")
    return minimum, maximum




def _pointer_escape(token: str) -> str:
    return token.replace("~", "~0").replace("/", "~1")


def _iter_leaf_pointers(value: Any, prefix: str) -> Iterable[str]:
    if isinstance(value, Mapping):
        for key in sorted(value):
            child = f"{prefix}/{_pointer_escape(str(key))}"
            yield from _iter_leaf_pointers(value[key], child)
        return
    # Lists are rule values, not containers whose individual items need separate provenance.
    yield prefix


def iter_enforced_rule_pointers(profile: Mapping[str, Any]) -> Iterable[str]:
    """Yield deterministic JSON Pointers for rule leaves enforced by Katedra."""
    for root in RULE_ROOTS:
        if root in profile:
            yield from _iter_leaf_pointers(profile[root], f"/{root}")


def pointer_value(value: Any, pointer: str) -> Any:
    """Dohvati vrijednost na JSON Pointeru; KeyError ako put ne postoji."""
    current = value
    for token in pointer.lstrip("/").split("/") if pointer not in {"", "/"} else []:
        token = token.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, Mapping) or token not in current:
            raise KeyError(pointer)
        current = current[token]
    return current


def unknown_rule_pointers(profile: Mapping[str, Any]) -> list[str]:
    """v1.1-fix Q15a: pravila koja postoje, ali im vrijednost nije upotrebljiva.

    „Nema ključa“ = profil ne propisuje. „Ključ postoji, a vrijednost je null
    ili izvan enuma“ = profil propisuje nešto što Katedra ne zna provjeriti i to
    se ne smije prikazati kao uredan nalaz.
    """
    unknown: list[str] = []
    for pointer in iter_enforced_rule_pointers(profile):
        try:
            value = pointer_value(profile, pointer)
        except KeyError:  # pragma: no cover — pointer dolazi iz istog profila
            continue
        allowed = ENUM_RULES.get(pointer)
        if value is None or (allowed is not None and value not in allowed):
            unknown.append(pointer)
    return sorted(unknown)


def provenance_for_pointer(
    provenance: Mapping[str, Mapping[str, Any]], pointer: str
) -> dict[str, Any] | None:
    """Return exact/nearest-parent provenance for a JSON Pointer."""
    current = pointer.rstrip("/") or "/"
    while True:
        entry = provenance.get(current)
        if entry is not None:
            return deepcopy(dict(entry))
        if current in {"", "/"}:
            return None
        current = current.rsplit("/", 1)[0] or "/"


def _declared_provenance(source: Mapping[str, Any], pointer: str, label: str) -> dict[str, Any]:
    meta = source.get("provenance") or {}
    rules = meta.get("rules") or {}
    entry = provenance_for_pointer(rules, pointer) if isinstance(rules, Mapping) else None
    # v1.1-fix Q9c: zapamti je li pravilo dobilo VLASTITI JSON-Pointer zapis ili
    # je samo naslijedilo blanket provenance.default — inače je pokrivenost
    # provenancea nemjerljiva i „puna pokrivenost“ ne može pasti.
    if entry is not None:
        entry.setdefault("scope", "rule")
        return entry
    if isinstance(meta.get("default"), Mapping):
        entry = deepcopy(dict(meta["default"]))
        entry["scope"] = "default"
        return entry
    return {
        "source": label,
        "type": "untracked",
        "confidence": 0.0,
        "scope": "untracked",
    }


def _without_provenance(value: Mapping[str, Any]) -> dict[str, Any]:
    return {k: deepcopy(v) for k, v in value.items() if k != "provenance"}


def _apply_profile_layer(
    current: Mapping[str, Any],
    provenance: dict[str, dict[str, Any]],
    rules: Mapping[str, Any],
    source: Mapping[str, Any],
    label: str,
) -> dict[str, Any]:
    payload = _without_provenance(rules)
    merged = _deep_merge(current, payload)
    for pointer in iter_enforced_rule_pointers(payload):
        provenance[pointer] = _declared_provenance(source, pointer, label)
    return merged


def assess_provenance_freshness(
    entry: Mapping[str, Any], *, as_of: str | date, max_age_days: int = 365
) -> dict[str, Any]:
    """Assess freshness without mutating rule/profile status or source metadata."""
    if max_age_days < 0:
        raise ProfileRuleError("max_age_days mora biti >= 0")
    if entry.get("type") == "untracked":
        return {"freshness": "untracked", "reason": "missing_provenance"}
    verified = entry.get("verified_at")
    if not verified:
        return {"freshness": "unknown", "reason": "missing_verified_at"}
    try:
        checked = date.fromisoformat(str(verified))
        reference = as_of if isinstance(as_of, date) else date.fromisoformat(str(as_of))
    except ValueError as exc:
        raise ProfileRuleError(f"neispravan ISO datum provenance/freshness: {exc}") from exc
    age = (reference - checked).days
    if age < 0:
        return {"freshness": "unknown", "reason": "verified_at_in_future", "age_days": age}
    return {
        "freshness": "stale" if age > max_age_days else "fresh",
        "reason": "older_than_policy" if age > max_age_days else "within_policy",
        "age_days": age,
        "max_age_days": max_age_days,
    }


def build_provenance_report(
    resolved: ResolvedProfile, *, as_of: str | date, max_age_days: int = 365
) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    # v1.1-fix Q9c: „inherited“ je zasebna os pokrivenosti, ne podvrsta svježine.
    summary = {"fresh": 0, "stale": 0, "unknown": 0, "untracked": 0, "own": 0, "inherited": 0}
    for pointer in iter_enforced_rule_pointers(resolved.profile):
        entry = provenance_for_pointer(resolved.provenance, pointer) or {
            "source": "resolver",
            "type": "untracked",
            "confidence": 0.0,
            "scope": "untracked",
        }
        freshness = assess_provenance_freshness(entry, as_of=as_of, max_age_days=max_age_days)
        state = freshness["freshness"]
        summary[state] = summary.get(state, 0) + 1
        scope = str(entry.get("scope") or ("untracked" if entry.get("type") == "untracked" else "default"))
        coverage = {"rule": "own", "default": "inherited"}.get(scope, "untracked")
        if coverage != "untracked":  # untracked se već broji u freshness osi
            summary[coverage] += 1
        items.append({"pointer": pointer, "provenance": entry, "coverage": coverage, **freshness})
    return {
        "context": dict(resolved.context),
        "applied_layers": list(resolved.applied_layers),
        "profile_status": resolved.profile.get("status"),
        "as_of": as_of.isoformat() if isinstance(as_of, date) else str(as_of),
        "max_age_days": max_age_days,
        "summary": summary,
        "rules": items,
    }

# ---------------------------------------------------------------- composition

def _norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).casefold()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _deep_merge(weaker: Mapping[str, Any], stronger: Mapping[str, Any]) -> dict[str, Any]:
    out = deepcopy(dict(weaker))
    for key, value in stronger.items():
        if isinstance(value, Mapping) and isinstance(out.get(key), Mapping):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = deepcopy(value)
    return out


def _matches(match: Mapping[str, Any], context: Mapping[str, Any]) -> bool:
    for key, expected in match.items():
        if key not in CONTEXT_KEYS:
            raise ProfileRuleError(f"overlay match koristi nepoznat context ključ: {key}")
        actual = context.get(key)
        if actual is None or _norm(actual) != _norm(expected):
            return False
    return True


def compose_profile(
    base_profile: Mapping[str, Any],
    overlays: Iterable[Mapping[str, Any]],
    *,
    context: Mapping[str, Any],
    project_override: Mapping[str, Any] | None = None,
) -> ResolvedProfile:
    """Komponiraj routani faculty profil i sidecar provenance prema precedenceu."""
    ctx = {k: str(v) for k, v in context.items() if k in CONTEXT_KEYS and v not in (None, "")}
    faculty = str(base_profile.get("slug") or ctx.get("faculty") or "")
    if not faculty:
        raise ProfileRuleError("faculty profil nema slug")
    if ctx.get("faculty") and _norm(ctx["faculty"]) != _norm(faculty):
        raise ProfileRuleError(
            f"context faculty={ctx['faculty']} ne odgovara base profilu slug={faculty}"
        )
    ctx["faculty"] = faculty

    by_level: dict[str, list[Mapping[str, Any]]] = {level: [] for level in OVERLAY_LEVELS}
    for overlay in overlays:
        level = overlay.get("level")
        if level not in OVERLAY_LEVELS:
            raise ProfileRuleError(f"overlay {overlay.get('id', '?')} ima nepoznat level: {level}")
        match = overlay.get("match") or {}
        rules = overlay.get("rules")
        if not isinstance(match, Mapping) or not isinstance(rules, Mapping):
            raise ProfileRuleError(f"overlay {overlay.get('id', '?')} mora imati object match i rules")
        if _matches(match, ctx):
            by_level[level].append(overlay)

    result: dict[str, Any] = {}
    provenance: dict[str, dict[str, Any]] = {}
    applied: list[str] = []

    for level in ("global", "institution"):
        matches = sorted(by_level[level], key=lambda x: str(x.get("id", "")))
        if len(matches) > 1:
            raise ProfileRuleError(f"više overlayja iste razine odgovara kontekstu ({level})")
        if matches:
            ov = matches[0]
            result = _apply_profile_layer(result, provenance, ov["rules"], ov, f"{level}:{ov.get('id', '?')}")
            applied.append(f"{level}:{ov.get('id', '?')}")

    result = _apply_profile_layer(result, provenance, base_profile, base_profile, f"faculty:{faculty}")
    applied.append(f"faculty:{faculty}")

    for level in ("programme", "work_type", "course", "mentor"):
        matches = sorted(by_level[level], key=lambda x: str(x.get("id", "")))
        if len(matches) > 1:
            raise ProfileRuleError(f"više overlayja iste razine odgovara kontekstu ({level})")
        if not matches:
            continue
        ov = matches[0]
        rules = ov["rules"]
        if "slug" in rules and _norm(rules["slug"]) != _norm(faculty):
            raise ProfileRuleError(f"overlay {ov.get('id', '?')} ne smije promijeniti faculty slug")
        result = _apply_profile_layer(result, provenance, rules, ov, f"{level}:{ov.get('id', '?')}")
        applied.append(f"{level}:{ov.get('id', '?')}")

    if project_override:
        payload = _without_provenance(project_override)
        if "slug" in payload and _norm(payload["slug"]) != _norm(faculty):
            raise ProfileRuleError("project override ne smije promijeniti faculty slug")
        # v1.1-fix Q15b: override smije spustiti status, nikad ga podići — inače
        # jednolinijski {"status":"potvrdeno"} briše sve „za potvrdu“ oznake.
        if payload.get("status") == "potvrdeno" and base_profile.get("status") != "potvrdeno":
            raise ProfileRuleError(
                "project override ne smije podići status profila na „potvrdeno“ "
                f"(profil {faculty} je „{base_profile.get('status')}“). "
                "Što napraviti: makni „status“ iz override datoteke; status se podiže samo "
                "u <slug>.json uz stvarni izvor i datum provjere."
            )
        project_source: Mapping[str, Any] = project_override
        if not project_override.get("provenance"):
            project_source = {
                "provenance": {
                    "default": {
                        "source": "project override",
                        "type": "project_override",
                        "confidence": 1.0,
                    }
                }
            }
        result = _apply_profile_layer(result, provenance, payload, project_source, "project_override")
        applied.append("project_override")

    # v1.1-fix Q15a: nepoznata pravila putuju uz profil da ih potrošači mogu
    # prikazati kao upozorenje umjesto kao „profil ne propisuje“.
    unknown = tuple(unknown_rule_pointers(result))
    if unknown:
        result[UNKNOWN_RULES_KEY] = list(unknown)

    return ResolvedProfile(
        profile=result,
        context=ctx,
        applied_layers=tuple(applied),
        provenance=provenance,
        unknown_rules=unknown,
    )


# ------------------------------------------------------- validacija i opseg

def _validate_against(data: Mapping[str, Any], schema_path: Path, what: str) -> None:
    """v1.1-fix Q15b: stvarna JSON Schema validacija, kako SKILL.md i tvrdi."""
    try:
        import jsonschema
    except ImportError as exc:  # pragma: no cover — jsonschema je dependency skilla
        raise ProfileRuleError(
            f"{what} se ne može validirati: nedostaje paket jsonschema. "
            "Što napraviti: instaliraj jsonschema (pyproject.toml) pa ponovi."
        ) from exc
    schema = load_profile(schema_path)
    errors = sorted(
        jsonschema.Draft7Validator(schema).iter_errors(dict(data)),
        key=lambda e: list(e.path),
    )
    if errors:
        detalji = "; ".join(
            f"{'/'.join(str(p) for p in e.path) or '(korijen)'}: {e.message}" for e in errors[:5]
        )
        raise ProfileRuleError(
            f"{what} ne odgovara shemi {schema_path.name}: {detalji}. "
            "Što napraviti: popravi navedena polja ili ukloni ono što shema ne poznaje."
        )


def validate_project_override(override: Mapping[str, Any], *, faculty_dir: str | Path) -> None:
    """Provjeri project-local override PRIJE mergea (v1.1-fix Q15b)."""
    _validate_against(override, Path(faculty_dir) / "_override_schema.json", "project override")


def validate_resolved_profile(profile: Mapping[str, Any], *, faculty_dir: str | Path) -> None:
    """Provjeri razriješeni funkcionalni profil (v1.1-fix Q15b)."""
    _validate_against(profile, Path(faculty_dir) / "_resolved_schema.json", "razriješeni profil")


def declared_work_types(profile: Mapping[str, Any]) -> tuple[str, ...]:
    """Vrste rada koje profil izrijekom pokriva; prazno = profil ih ne deklarira."""
    declared = profile.get("tipovi_radova")
    if not isinstance(declared, (list, tuple)):
        return ()
    return tuple(str(x) for x in declared)


def assert_work_type_in_scope(profile: Mapping[str, Any], work_type: str | None) -> None:
    """v1.1-fix Q9b: odbij vrstu rada koju profil ne pokriva, na razini resolvera.

    Tiho razrješenje pa nada da će neki checker kasnije upozoriti znači da
    --tip diplomski na profilu bez diplomskog ne provjeri ni opseg, ni broj
    izvora, ni broj poglavlja.
    """
    declared = declared_work_types(profile)
    if not work_type or not declared:
        return
    if any(_norm(work_type) == _norm(x) for x in declared):
        return
    naziv = profile.get("slug") or profile.get("naziv") or "profil"
    raise ProfileRuleError(
        f"profil „{naziv}“ ne pokriva vrstu rada „{work_type}“; pokriva: {', '.join(declared)}. "
        "Što napraviti: odaberi --tip iz pokrivenog popisa ili dopuni profil blokom "
        f"struktura.opseg.{work_type} i unesi „{work_type}“ u tipovi_radova, uz stvarni izvor."
    )


# ------------------------------------------------------------------- registry


def _support_catalog_path(faculty_dir: Path) -> Path:
    return faculty_dir / "_support_catalog.json"


def load_support_catalog(faculty_dir: str | Path) -> dict[str, Any] | None:
    path = _support_catalog_path(Path(faculty_dir))
    if not path.is_file():
        return None
    data = load_profile(path)
    if data.get("schema_version") != 1 or not isinstance(data.get("profiles"), Mapping):
        raise ProfileRuleError("support catalog mora biti schema_version=1 s profiles objektom")
    return data


def faculty_bundle_paths(faculty_dir: str | Path, slug: str) -> list[Path]:
    root = Path(faculty_dir)
    base = root / f"{slug}.json"
    if not base.is_file():
        raise ProfileRuleError(f"faculty profil ne postoji: {slug}")
    # v1.1-fix Q15c: overlay bez match.faculty (ili s match samo po institution/
    # work_type) i dalje mijenja razriješeni profil ovog fakulteta, pa mora ući u
    # admission hash. Bundle je zato cijeli overlay direktorij, ne samo overlayji
    # koji se slugom deklariraju za ovaj fakultet.
    paths = [base, *_overlay_paths(root)]
    return sorted(paths, key=lambda x: str(x.relative_to(root)))


def _rel(path: Path, root: Path) -> str:
    """Putanja relativno na root, uvijek s „/”: kvar 148 — na Windowsu je
    `relative_to` davao backslash, pa je index.json ovisio o OS-u generiranja."""
    return str(path.relative_to(root)).replace("\\", "/")


def faculty_bundle_sha256(faculty_dir: str | Path, slug: str) -> str:
    root = Path(faculty_dir)
    h = hashlib.sha256()
    for path in faculty_bundle_paths(root, slug):
        rel = _rel(path, root)
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        h.update(path.read_bytes())
        h.update(b"\0")
    return h.hexdigest()


def _admitted_profiles(faculty_dir: Path) -> dict[str, Any] | None:
    catalog = load_support_catalog(faculty_dir)
    if catalog is None:
        return None
    profiles = dict(catalog.get("profiles") or {})
    for slug, admission in profiles.items():
        actual = faculty_bundle_sha256(faculty_dir, slug)
        expected = str((admission or {}).get("bundle_sha256") or "")
        if actual != expected:
            raise ProfileRuleError(
                f"admission bundle hash stale za {slug}: pokreni faculty_scale_gate.py ponovno, "
                "ili profile_registry.py --write --bez-admisije (tier → advisory; kvar 32)"
            )
    return profiles


def refresh_stale_admissions(faculty_dir: str | Path) -> list[tuple[str, str]]:
    """Kvar 32: bundle se promijenio, a gate se u instaliranom paketu ne može ponoviti
    (evals/ nije u paketu). Hash se osvježi, a tier pada na „advisory”: registry
    ostaje čitljiv, ali profil više ne tvrdi admisiju koju nitko nije ponovio.
    Vraća [(slug, stari_tier)] za svaki osvježeni profil; prazno = ništa nije bilo stale."""
    root = Path(faculty_dir)
    catalog = load_support_catalog(root)
    if catalog is None:
        return []
    osvjezeni: list[tuple[str, str]] = []
    for slug, admission in dict(catalog.get("profiles") or {}).items():
        actual = faculty_bundle_sha256(root, slug)
        if actual == str((admission or {}).get("bundle_sha256") or ""):
            continue
        osvjezeni.append((slug, str(admission.get("tier"))))
        admission["bundle_sha256"] = actual
        admission["tier"] = "advisory"
    if osvjezeni:
        _support_catalog_path(root).write_text(
            json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return osvjezeni


def _faculty_profile_paths(faculty_dir: Path) -> list[Path]:
    return sorted(
        p for p in faculty_dir.glob("*.json")
        if p.name != "index.json" and not p.name.startswith("_")
    )


def _overlay_paths(faculty_dir: Path) -> list[Path]:
    overlay_dir = faculty_dir / "overlays"
    return sorted(p for p in overlay_dir.glob("*.json") if not p.name.startswith("_")) if overlay_dir.is_dir() else []


def load_overlays(faculty_dir: str | Path) -> list[dict[str, Any]]:
    return [load_profile(p) for p in _overlay_paths(Path(faculty_dir))]


def _route_record(alias: str, context: Mapping[str, str], source: str) -> dict[str, Any]:
    return {"alias": alias, "context": dict(context), "source": source}


def generate_registry(faculty_dir: str | Path) -> dict[str, Any]:
    """Derive index.json only from canonical faculty profiles and overlay aliases."""
    root = Path(faculty_dir)
    admissions = _admitted_profiles(root)
    faculty_paths = _faculty_profile_paths(root)
    if admissions is not None:
        faculty_paths = [p for p in faculty_paths if p.stem in admissions]
    overlays = load_overlays(root)
    faculties: list[dict[str, Any]] = []
    route_map: dict[str, dict[str, Any]] = {}
    sources: list[str] = []

    def add_route(alias: str, context: Mapping[str, str], source: str) -> None:
        key = _norm(alias)
        if not key:
            return
        record = _route_record(alias, context, source)
        existing = route_map.get(key)
        if existing and existing["context"] != record["context"]:
            raise ProfileRuleError(
                f"alias collision za „{alias}“: {existing['context']} vs {record['context']}"
            )
        route_map.setdefault(key, record)

    for path in faculty_paths:
        profile = load_profile(path)
        slug = str(profile.get("slug") or "")
        if not slug:
            raise ProfileRuleError(f"faculty profil nema slug: {path}")
        aliases = list(profile.get("aliasi") or [])
        verified = (profile.get("izvor") or {}).get("provjereno")
        entry = {
            "slug": slug,
            "naziv": profile.get("naziv", ""),
            "aliasi": aliases,
            "status": profile.get("status", "nepotvrdeno"),
        }
        if admissions is not None:
            entry["support_tier"] = admissions[slug]["tier"]
        if verified:
            entry["provjereno"] = verified
        faculties.append(entry)
        source = path.name
        sources.append(source)
        for alias in [slug, profile.get("naziv", ""), *aliases]:
            add_route(str(alias), {"faculty": slug}, source)

    if admissions is not None:
        sources.append("_support_catalog.json")
    for path, overlay in zip(_overlay_paths(root), overlays):
        match = {k: str(v) for k, v in (overlay.get("match") or {}).items() if k in CONTEXT_KEYS}
        if admissions is not None and match.get("faculty") not in admissions:
            continue
        sources.append(_rel(path, root))
        aliases = overlay.get("aliases") or []
        if aliases and not match.get("faculty"):
            raise ProfileRuleError(f"overlay aliasi moraju imati match.faculty: {path}")
        for alias in aliases:
            add_route(str(alias), match, _rel(path, root))

    return {
        "verzija": 2,
        "generated": True,
        "generator": "scripts/profile_rules.py::generate_registry",
        "generated_from": sorted(sources),
        "fakulteti": sorted(faculties, key=lambda x: x["slug"]),
        "rute": sorted(route_map.values(), key=lambda x: (_norm(x["alias"]), x["alias"])),
        "napomena": (
            "GENERIRANO — ne uređuj ručno. Canonical podaci su <slug>.json i overlays/*.json; "
            "regeneriraj scripts/profile_registry.py."
        ),
    }


def _read_registry(faculty_dir: Path) -> dict[str, Any]:
    path = faculty_dir / "index.json"
    try:
        data = load_profile(path)
    except ProfileRuleError as exc:
        raise ProfileRuleError(f"registry se ne može pročitati: {exc}") from exc
    if not data.get("generated") or data.get("verzija") != 2:
        raise ProfileRuleError("index.json nije B07 generated registry v2")
    return data


def resolve_route(query: str, *, faculty_dir: str | Path) -> dict[str, str]:
    registry = _read_registry(Path(faculty_dir))
    wanted = _norm(query)
    matches = [r for r in registry.get("rute", []) if _norm(r.get("alias")) == wanted]
    if not matches:
        available = ", ".join(f["slug"] for f in registry.get("fakulteti", []))
        raise ProfileRuleError(f"nema profila/rute za „{query}“. Dostupni fakulteti: {available}")
    contexts = {json.dumps(r.get("context", {}), sort_keys=True, ensure_ascii=False) for r in matches}
    if len(contexts) != 1:
        raise ProfileRuleError(f"alias „{query}“ je dvosmislen; navedi precizniji kontekst")
    return dict(matches[0]["context"])


def resolve_profile(
    faculty_query: str,
    *,
    faculty_dir: str | Path,
    institution: str | None = None,
    programme: str | None = None,
    work_type: str | None = None,
    course: str | None = None,
    mentor: str | None = None,
    project_override: Mapping[str, Any] | None = None,
) -> ResolvedProfile:
    root = Path(faculty_dir)
    context = resolve_route(faculty_query, faculty_dir=root)
    explicit = {
        "institution": institution,
        "programme": programme,
        "work_type": work_type,
        "course": course,
        "mentor": mentor,
    }
    for key, value in explicit.items():
        if value in (None, ""):
            continue
        existing = context.get(key)
        if existing is not None and _norm(existing) != _norm(value):
            raise ProfileRuleError(
                f"route „{faculty_query}“ implicira {key}={existing}, ali eksplicitno je zadano {value}"
            )
        context[key] = str(value)

    faculty = context.get("faculty")
    if not faculty:
        raise ProfileRuleError(f"route „{faculty_query}“ nema faculty kontekst")
    base = load_profile(root / f"{faculty}.json")
    if project_override:
        validate_project_override(project_override, faculty_dir=root)  # v1.1-fix Q15b
    resolved = compose_profile(
        base,
        load_overlays(root),
        context=context,
        project_override=project_override,
    )
    # v1.1-fix Q15a (recenzija): mehanizam nepoznatih pravila više nije mrtav kod.
    # Shema bi ista ta pravila odbila generičkom jsonschema porukom, pa ovaj sloj
    # ide PRVI: imenuje točan JSON Pointer i konkretan sljedeći korak. Oba sloja
    # zatvaraju vrata (exit 2) — razlikuju se samo po preciznosti poruke.
    if resolved.unknown_rules:
        raise ProfileRuleError(
            "profil propisuje pravila koja Katedra ne zna provjeriti: "
            + ", ".join(resolved.unknown_rules)
            + " — vrijednost je null ili izvan dopuštenog popisa. "
            "Što napraviti: u <slug>.json ili u overlayju upiši dopuštenu vrijednost "
            "ili makni ključ; izostanak ključa znači „profil to ne propisuje“."
        )
    validate_resolved_profile(resolved.profile, faculty_dir=root)  # v1.1-fix Q15b
    assert_work_type_in_scope(resolved.profile, context.get("work_type"))  # v1.1-fix Q9b
    return resolved
