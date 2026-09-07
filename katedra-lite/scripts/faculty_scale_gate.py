#!/usr/bin/env python3
"""B20 faculty scale-out readiness/admission gate."""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
from typing import Any, Mapping

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from profile_rules import (  # noqa: E402
    ProfileRuleError,
    build_provenance_report,
    compose_profile,
    faculty_bundle_sha256,
    load_overlays,
    load_profile,
)

DEFAULT_FACULTY_DIR = ROOT / "references" / "fakulteti"
DEFAULT_CASES = ROOT / "evals" / "quality" / "faculty_cases.jsonl"
DEFAULT_BENCHMARK = ROOT / "evals" / "benchmark" / "v1_vs_v2_contract.json"
# Kvar 32: `evals/` od v1.3 nije u paketu, pa instalirani skill nema ni benchmark ni
# cases. Bez benchmarka gate SMIJE proći uz ⚠ (evidence.benchmark_sha256 = null);
# bez cases NE smije — kvalifikacijski slučajevi jedini su dokaz da profil radi.
BEZ_BENCHMARKA = "admisija bez benchmarka: evals/benchmark/v1_vs_v2_contract.json nije u paketu"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _norm(value: Any) -> str:
    import re
    import unicodedata
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(c for c in text if not unicodedata.combining(c)).casefold()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def _get_pointer(value: Any, pointer: str) -> Any:
    current = value
    for token in pointer.lstrip("/").split("/") if pointer != "/" else []:
        token = token.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, Mapping) or token not in current:
            raise KeyError(pointer)
        current = current[token]
    return current


# v1.1-fix Q15d: kvalifikacijska ljestvica mjeri TVRDNJE, ne retke. Obitelji su
# pravila koja stvarno proizvode nalaze u check_rules.py — ako ih case-ovi ne
# dodiruju, „prošao je kvalifikaciju“ ne znači ništa.
RULE_FAMILIES: tuple[tuple[str, str], ...] = (
    ("citiranje", "/citiranje"),
    ("margine", "/format/margine_cm"),
    ("geometrija_odlomka", "/format/odlomak"),
    ("opseg", "/struktura/opseg"),
    ("obavezni_dijelovi", "/struktura/obavezni_dijelovi"),
)

# v1.1-fix Q15d: pojas zdravog razuma. Vrijednost izvan pojasa ne smije se moći
# „ovjeriti“ kvalifikacijskim caseom koji profil uspoređuje sam sa sobom.
SANITY_BANDS: dict[str, tuple[float, float]] = {
    "velicina_pt": (8, 16),
    "prored": (1.0, 2.5),
    "margina_cm": (1.0, 5.0),
    "redaka": (1, 40),
    "recenica": (1, 15),
    "rijeci": (300, 60000),
    "stranice": (3, 500),
    "izvori_min": (1, 200),
    "poglavlja": (1, 30),
}


def _family_of(pointer: str) -> str | None:
    for name, prefix in RULE_FAMILIES:
        if pointer == prefix or pointer.startswith(prefix + "/"):
            return name
    return None


def _band(problems: list[str], label: str, value: Any, band: str) -> None:
    lo, hi = SANITY_BANDS[band]
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        problems.append(f"{label}: vrijednost nije broj ({value!r})")
        return
    if not (lo <= float(value) <= hi):
        problems.append(f"{label}: {value} izvan razumnog pojasa {lo}–{hi}")


def sanity_violations(profile: Mapping[str, Any]) -> list[str]:
    """Vrati opise vrijednosti koje nijedan hrvatski fakultet ne bi propisao."""
    problems: list[str] = []
    fmt = profile.get("format") or {}
    if fmt.get("velicina_pt") is not None:
        _band(problems, "format.velicina_pt", fmt["velicina_pt"], "velicina_pt")
    if fmt.get("prored") is not None:
        _band(problems, "format.prored", fmt["prored"], "prored")
    for strana, vrijednost in (fmt.get("margine_cm") or {}).items():
        _band(problems, f"format.margine_cm.{strana}", vrijednost, "margina_cm")
    odlomak = fmt.get("odlomak") or {}
    for kljuc in ("min_redaka", "max_redaka"):
        if odlomak.get(kljuc) is not None:
            _band(problems, f"format.odlomak.{kljuc}", odlomak[kljuc], "redaka")
    if odlomak.get("min_recenica") is not None:
        _band(problems, "format.odlomak.min_recenica", odlomak["min_recenica"], "recenica")
    if (odlomak.get("min_redaka") is not None and odlomak.get("max_redaka") is not None
            and isinstance(odlomak["min_redaka"], int) and isinstance(odlomak["max_redaka"], int)
            and odlomak["min_redaka"] > odlomak["max_redaka"]):
        problems.append("format.odlomak: min_redaka je veći od max_redaka")
    for tip, opseg in ((profile.get("struktura") or {}).get("opseg") or {}).items():
        if not isinstance(opseg, Mapping):
            continue
        for kljuc, band in (("rijeci", "rijeci"), ("stranice", "stranice"), ("poglavlja", "poglavlja")):
            raspon = opseg.get(kljuc)
            if raspon is None:
                continue
            if not isinstance(raspon, list) or len(raspon) != 2:
                problems.append(f"struktura.opseg.{tip}.{kljuc}: raspon mora imati dvije vrijednosti")
                continue
            for vrijednost in raspon:
                _band(problems, f"struktura.opseg.{tip}.{kljuc}", vrijednost, band)
            if all(isinstance(x, (int, float)) for x in raspon) and raspon[0] > raspon[1]:
                problems.append(f"struktura.opseg.{tip}.{kljuc}: donja granica veća od gornje")
        if opseg.get("izvori_min") is not None:
            _band(problems, f"struktura.opseg.{tip}.izvori_min", opseg["izvori_min"], "izvori_min")
    return problems


def load_cases(path: Path, faculty: str) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows=[]
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row=json.loads(line)
        if row.get("faculty") == faculty:
            rows.append(row)
    return rows


def _aliases_for_faculty(root: Path, base: Mapping[str, Any], overlays: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    slug = str(base["slug"])
    routes: dict[str, dict[str, str]] = {}
    for alias in [slug, base.get("naziv", ""), *(base.get("aliasi") or [])]:
        if alias:
            routes[_norm(alias)] = {"faculty": slug}
    for ov in overlays:
        match = {k: str(v) for k, v in (ov.get("match") or {}).items() if v not in (None, "")}
        if _norm(match.get("faculty")) != _norm(slug):
            continue
        for alias in ov.get("aliases") or []:
            key = _norm(alias)
            existing = routes.get(key)
            if existing and existing != match:
                raise ProfileRuleError(f"alias collision za {alias}")
            routes[key] = match
    return routes


def benchmark_check(benchmark_path: Path | None, tier_policy: Mapping[str, Any]) -> tuple[dict[str, Any], str | None, list[str]]:
    """Vraća (provjera, sha256 ili None, upozorenja). None = benchmarka nema (kvar 32)."""
    if benchmark_path is None:
        return {"passed": True, "skipped": True, "note": BEZ_BENCHMARKA}, None, [BEZ_BENCHMARKA]
    bench=load_profile(benchmark_path)
    score=((bench.get("candidate") or {}).get("score") or {})
    comp=bench.get("comparison") or {}
    bench_ok=(float(score.get("accuracy",0)) >= float(tier_policy["core_benchmark_min_accuracy"])
              and len(comp.get("regressions") or []) <= int(tier_policy["max_regressions"])
              and len(comp.get("critical_regressions") or []) <= int(tier_policy["max_critical_regressions"]))
    check={"passed":bench_ok,"accuracy":score.get("accuracy"),"regressions":len(comp.get("regressions") or []),"critical_regressions":len(comp.get("critical_regressions") or [])}
    return check, sha256_file(benchmark_path), []


def evaluate(faculty_dir: Path, faculty: str, tier: str, as_of: str, *, cases_path: Path, benchmark_path: Path | None) -> dict[str, Any]:
    if not Path(cases_path).is_file():  # kvar 32: bez cases nema gatea, i to se kaže, ne Errno
        raise ProfileRuleError(f"kvalifikacijski slučajevi ne postoje: {cases_path} — evals/ nije u paketu; "
                               "gate se pokreće u izvornom checkoutu (razvoj.md), a u instaliranom paketu "
                               "zakrpa profila ide s: profile_registry.py --write --bez-admisije")
    try:
        import jsonschema
    except ImportError as exc:  # kvar 32: traceback nije poruka; kaži što napraviti
        raise ProfileRuleError("profil se ne može validirati: nedostaje paket jsonschema. "
                               "Što napraviti: instaliraj jsonschema (pyproject.toml) pa ponovi.") from exc

    policy=load_profile(faculty_dir / "_scale_policy.json")
    tier_policy=(policy.get("tiers") or {}).get(tier)
    if not isinstance(tier_policy, Mapping):
        raise ProfileRuleError(f"nepoznat support tier: {tier}")
    base_path=faculty_dir / f"{faculty}.json"
    base=load_profile(base_path)
    overlays=load_overlays(faculty_dir)
    reasons: list[str]=[]
    checks: dict[str, dict[str, Any]]={}

    # Schema
    schema=load_profile(faculty_dir / "_schema.json")
    try:
        jsonschema.Draft7Validator(schema).validate(base)
        checks["profile_schema"]={"passed":True}
    except jsonschema.ValidationError as exc:
        checks["profile_schema"]={"passed":False,"error":exc.message}
        reasons.append("profile_schema_invalid")

    confirmed=base.get("status") == "potvrdeno"
    status_ok=confirmed or not tier_policy["require_confirmed_status"]
    checks["status"]={"passed":status_ok,"value":base.get("status")}
    if not status_ok: reasons.append("status_not_confirmed")

    # Provenance/freshness directly from candidate bundle, no admission needed.
    resolved=compose_profile(base, overlays, context={"faculty":faculty})
    prov=build_provenance_report(resolved, as_of=as_of, max_age_days=365)
    ps=prov["summary"]
    prov_ok=ps.get("untracked",0) <= tier_policy["max_untracked"]
    if tier_policy["require_fresh_provenance"]:
        prov_ok = prov_ok and ps.get("stale",0)==0 and ps.get("unknown",0)==0
    checks["provenance"]={"passed":prov_ok,"summary":ps}
    if not prov_ok: reasons.append("provenance_not_ready")

    # Candidate-local routes + collision check against already admitted faculty routes.
    routes = _aliases_for_faculty(faculty_dir, base, overlays)
    collisions: list[str] = []
    catalog_path = faculty_dir / "_support_catalog.json"
    if catalog_path.is_file():
        catalog = load_profile(catalog_path)
        for other_slug in (catalog.get("profiles") or {}):
            if str(other_slug) == faculty:
                continue
            other_path = faculty_dir / f"{other_slug}.json"
            if not other_path.is_file():
                continue
            other = load_profile(other_path)
            other_routes = _aliases_for_faculty(faculty_dir, other, overlays)
            overlap = sorted(set(routes).intersection(other_routes))
            collisions.extend(overlap)
    routing_ok = bool(routes) and not collisions
    checks["routing"] = {"passed": routing_ok, "aliases": len(routes), "collisions": collisions}
    if collisions:
        reasons.append("alias_collision")
    elif not routing_ok:
        reasons.append("routing_not_ready")

    cases=load_cases(cases_path, faculty)
    case_results=[]
    asserted_pointers: set[str]=set()
    for case in cases:
        query=str(case.get("query") or faculty)
        # normalize by reusing local route normalization through lookup iteration
        route = deepcopy(routes.get(_norm(query)))
        passed=route is not None
        detail=None
        expected_map = case.get("expected") or {}
        # „Fakultet ovo pravilo NE propisuje" je jednako provjerljiva tvrdnja kao i
        # vrijednost pravila, a dosad se nije mogla izraziti: gold skup je znao
        # zamrznuti samo vrijednosti. Zbog toga je izmišljena lijeva margina od
        # 3 cm bila ZAMRZNUTA kao ispravna i gate ju je štitio od ispravka, iako je
        # profil u vlastitom provenanceu pisao da je nema u Uputama.
        expected_absent = [str(x) for x in (case.get("expected_absent") or [])]
        # v1.1-fix Q15d: case bez ijedne tvrdnje prolazi vakuumski i napuhuje brojač.
        if (not isinstance(expected_map, Mapping)
                or (not expected_map and not expected_absent)):
            case_results.append({
                "id": case.get("id"),
                "passed": False,
                "detail": "case nema nijednu tvrdnju u „expected“",
            })
            continue
        if passed:
            context=dict(route)
            context.update({k:str(v) for k,v in (case.get("context") or {}).items()})
            try:
                rp=compose_profile(base, overlays, context=context)
                for pointer, expected in expected_map.items():
                    actual=_get_pointer(rp.profile, pointer)
                    if actual != expected:
                        passed=False; detail=f"{pointer}: {actual!r} != {expected!r}"; break
                for pointer in expected_absent if passed else []:
                    try:
                        actual=_get_pointer(rp.profile, pointer)
                    except (KeyError, TypeError):
                        continue          # nema ga — upravo se to tvrdi
                    if actual is not None:
                        passed=False
                        detail=f"{pointer}: profil to ipak propisuje ({actual!r})"
                        break
            except (ProfileRuleError, KeyError) as exc:
                passed=False; detail=str(exc)
        else:
            detail=f"query nije route: {query}"
        if passed:
            asserted_pointers.update(str(x) for x in expected_map)
            asserted_pointers.update(expected_absent)
        case_results.append({"id":case.get("id"),"passed":passed,"detail":detail})

    min_cases=int(tier_policy["min_qualification_cases"])
    min_pointers=int(tier_policy["min_distinct_asserted_pointers"])
    min_families=int(tier_policy["min_asserted_rule_families"])
    families=sorted({f for f in (_family_of(p) for p in asserted_pointers) if f})
    all_passed=bool(case_results) and all(x["passed"] for x in case_results)
    depth_ok=len(asserted_pointers)>=min_pointers and len(families)>=min_families
    qual_ok=len(cases)>=min_cases and all_passed and depth_ok
    checks["qualification_cases"]={
        "passed":qual_ok,
        "total":len(cases),
        "distinct_asserted_pointers":len(asserted_pointers),
        "asserted_rule_families":families,
        "missing_rule_families":[n for n,_ in RULE_FAMILIES if n not in families],
        "results":case_results,
    }
    if len(cases)<min_cases: reasons.append("insufficient_qualification_cases")
    elif not all_passed: reasons.append("qualification_case_failure")
    elif not depth_ok: reasons.append("qualification_assertions_too_shallow")

    # v1.1-fix Q15d: case-ovi profil uspoređuju sam sa sobom, pa apsurdna
    # vrijednost prolazi kvalifikaciju. Pojas zdravog razuma to hvata neovisno.
    sanity=sanity_violations(resolved.profile)
    checks["sanity_band"]={"passed":not sanity,"violations":sanity}
    if sanity: reasons.append("rule_values_outside_sanity_band")

    checks["core_benchmark"], benchmark_sha, upozorenja = benchmark_check(benchmark_path, tier_policy)
    if not checks["core_benchmark"]["passed"]: reasons.append("core_benchmark_not_stable")

    evidence={
        "bundle_sha256": faculty_bundle_sha256(faculty_dir, faculty),
        "qualification_sha256": sha256_file(cases_path),
        "benchmark_sha256": benchmark_sha,
    }
    return {"schema_version":1,"faculty":faculty,"tier":tier,"as_of":as_of,"decision":"pass" if not reasons else "fail","reasons":reasons,"warnings":upozorenja,"checks":checks,"evidence":evidence}


def admit(faculty_dir: Path, report: Mapping[str, Any]) -> None:
    if report.get("decision") != "pass":
        raise ProfileRuleError("admission je dopušten samo nakon PASS readiness reporta")
    path=faculty_dir / "_support_catalog.json"
    catalog=load_profile(path)
    profiles=dict(catalog.get("profiles") or {})
    ev=report["evidence"]
    profiles[str(report["faculty"])]= {
        "tier": report["tier"],
        "admitted_at": report["as_of"],
        "bundle_sha256": ev["bundle_sha256"],
        "qualification_sha256": ev["qualification_sha256"],
        "benchmark_sha256": ev["benchmark_sha256"],
        "gate_version": 1,
    }
    catalog["profiles"]=dict(sorted(profiles.items()))
    path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


def main() -> int:
    ap=argparse.ArgumentParser(description="Katedra B20 faculty production/pilot readiness gate.")
    ap.add_argument("--faculty-dir", default=str(DEFAULT_FACULTY_DIR))
    ap.add_argument("--fakultet", required=True)
    ap.add_argument("--tier", choices=["production","pilot"], required=True)
    ap.add_argument("--as-of", required=True, help="ISO date for provenance freshness/admission")
    ap.add_argument("--cases", default=str(DEFAULT_CASES))
    ap.add_argument("--benchmark", default=None, help="B18 benchmark JSON; bez opcije: evals/benchmark/… ako postoji, inače ⚠ admisija bez benchmarka (kvar 32)")
    ap.add_argument("--admit", action="store_true", help="write/update _support_catalog.json only if gate passes")
    ap.add_argument("--json", action="store_true")
    args=ap.parse_args()
    try:
        if args.benchmark:
            benchmark_path: Path | None = Path(args.benchmark)
        else:
            benchmark_path = DEFAULT_BENCHMARK if DEFAULT_BENCHMARK.is_file() else None
        report=evaluate(Path(args.faculty_dir),args.fakultet,args.tier,args.as_of,cases_path=Path(args.cases),benchmark_path=benchmark_path)
        if args.admit and report["decision"]=="pass":
            admit(Path(args.faculty_dir),report)
    except (ProfileRuleError, OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"❌ {exc}",file=sys.stderr); return 2
    if args.json:
        print(json.dumps(report,ensure_ascii=False,indent=2))
    else:
        print(f"{report['decision'].upper()}: {report['faculty']} [{report['tier']}]")
        for name, check in report["checks"].items(): print(f"  {'⚠' if check.get('skipped') else '✓' if check.get('passed') else '✗'} {name}")
        for u in report.get("warnings") or []: print(f"  ⚠ {u}")
        if report["reasons"]: print("  reasons: "+", ".join(report["reasons"]))
    return 0 if report["decision"]=="pass" else 1

if __name__ == "__main__":
    raise SystemExit(main())
