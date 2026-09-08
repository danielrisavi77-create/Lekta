#!/usr/bin/env python3
"""CLI za B07 compositional profile resolver."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from profile_rules import (  # noqa: E402
    ProfileRuleError,
    load_profile,
    resolve_profile,
    validate_project_override,
)

DEFAULT_FACULTY_DIR = HERE.parent / "references" / "fakulteti"


def _samostojni(args, override) -> int:
    """Profil izvan registryja: gate ostaje binaran za ADMISIJU, ne za UPORABU.

    `faculty_scale_gate.py` ispravno odbija fakultet bez qualification caseva. Ali dosad je
    posljedica bila da `check_rules.py` uopće ne može raditi i da se formalne provjere pišu
    rukom — a to željezno pravilo 8 izrijekom ne dopušta („ako alat ne radi, reci to i
    provjeri strukturno", ne „improviziraj"). Zato ovaj put: alat radi, ali svi su nalazi
    označeni kao savjetodavni i ne blokiraju predaju.

    Uvjet je da datoteka sama sebe deklarira nepotvrđenom. Profil koji tvrdi da je
    `production` ne smije ući ovim putem — to bi bilo obilaženje admisije.
    """
    put = Path(args.profil_datoteka)
    try:
        profil = load_profile(put)
    except ProfileRuleError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2
    except OSError as exc:
        print(f"❌ profil se ne može pročitati ({put}): {exc}", file=sys.stderr)
        return 2

    status = str(profil.get("status") or "").strip().lower()
    if status != "nepotvrdeno":
        print(f"❌ {put}: samostojni put traži \"status\": \"nepotvrdeno\", "
              f"a stoji {status or '(ništa)'}.", file=sys.stderr)
        print("   Profil koji tvrdi potvrđen status ide kroz registry i "
              "faculty_scale_gate.py, ne ovuda.", file=sys.stderr)
        return 2

    if override:
        profil = {**profil, **{k: v for k, v in override.items() if k != "status"}}

    profil["admisija"] = "nije-admitiran"
    profil["nalazi"] = "advisory"
    if args.work_type:
        profil.setdefault("tip", args.work_type)
    if args.mentor:
        profil.setdefault("mentor", args.mentor)

    ogranicenja = profil.get("ogranicenja") or []
    if not ogranicenja:
        print("⚠️  profil nema popis „ogranicenja\" — zapiši što nije provjereno i zašto, "
              "inače nitko\n   kasnije ne zna koliko nalazima vjerovati.", file=sys.stderr)

    if args.profile_out:
        out = Path(args.profile_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(profil, ensure_ascii=False, indent=2) + "\n",
                       encoding="utf-8")
    if args.provenance_out:
        out = Path(args.provenance_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({
            "put": "samostojni-profil",
            "datoteka": str(put),
            "admisija": "nije-admitiran",
            "nalazi": "advisory",
            "razlog": "fakultet nije u registryju; pravila su izvedena, ne pročitana "
                      "iz službenih strojno dostupnih uputa",
            "ogranicenja": ogranicenja,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    payload = {
        "context": {"faculty": profil.get("slug") or put.stem, "put": "samostojni-profil"},
        "applied_layers": [f"datoteka:{put.name}"],
        "profile": profil,
        "provenance": {"admisija": "nije-admitiran", "nalazi": "advisory"},
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"profil: {put} (samostojni, izvan registryja)")
        print("admisija: nije-admitiran · nalazi: ADVISORY (ne blokiraju predaju)")
        if ogranicenja:
            print("ograničenja:")
            for o in ogranicenja:
                print(f"   · {o}")
        if args.profile_out:
            print(f"zapisano: {args.profile_out}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Resolve Katedra compositional faculty profile.")
    ap.add_argument("--faculty-dir", default=str(DEFAULT_FACULTY_DIR))
    ap.add_argument("--fakultet", required=True, help="faculty/programme slug, naziv ili alias")
    ap.add_argument("--institution")
    ap.add_argument("--program", dest="programme")
    ap.add_argument("--tip", dest="work_type")
    ap.add_argument("--predmet", dest="course")
    ap.add_argument("--mentor")
    ap.add_argument("--profil-datoteka", dest="profil_datoteka",
                    help="samostojni profil izvan registryja (status: nepotvrdeno). "
                         "Rezultat nosi admisija=nije-admitiran i nalazi=advisory.")
    ap.add_argument("--project-override", help="putanja do JSON datoteke s project-local override pravilima")
    ap.add_argument("--json", action="store_true", help="ispiši context + layers + profile kao JSON")
    ap.add_argument("--profile-out", help="zapiši samo resolved profile JSON u datoteku")
    ap.add_argument("--provenance-out", help="zapiši resolved provenance sidecar JSON u datoteku")
    args = ap.parse_args()

    override = None
    if args.project_override:
        try:
            override = load_profile(args.project_override)
            # v1.1-fix Q15b: override se validira PRIJE mergea, kako SKILL.md i tvrdi.
            validate_project_override(override, faculty_dir=args.faculty_dir)
        except ProfileRuleError as exc:
            print(f"❌ {exc}", file=sys.stderr)
            return 2

    if args.profil_datoteka:
        return _samostojni(args, override)

    try:
        result = resolve_profile(
            args.fakultet,
            faculty_dir=args.faculty_dir,
            institution=args.institution,
            programme=args.programme,
            work_type=args.work_type,
            course=args.course,
            mentor=args.mentor,
            project_override=override,
        )
    except ProfileRuleError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2

    if args.profile_out:
        out = Path(args.profile_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result.profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.provenance_out:
        out = Path(args.provenance_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result.provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    payload = {
        "context": result.context,
        "applied_layers": list(result.applied_layers),
        "profile": result.profile,
        "provenance": result.provenance,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print("context:", json.dumps(result.context, ensure_ascii=False, sort_keys=True))
        print("layers:", " → ".join(result.applied_layers))
        if args.profile_out:
            print(f"profile: {args.profile_out}")
        if args.provenance_out:
            print(f"provenance: {args.provenance_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
