#!/usr/bin/env python3
"""Test suite za rad-orchestrator — priprema, provjera i smoke bez Workflowa.

Workflow tool može pokrenuti samo agent u sesiji, ne Python. Zato runner ima tri
koraka koji se slažu oko njega:

  priprema  <fixture> --project-root <dir> [--rad-docx <put>]
            napravi čistu projektnu mapu i ispiši JSON `args` za Workflow (stdout).
  provjeri  <fixture> --project-root <dir> --rezultat <rezultat.json>
            provjeri završni status, artefakte, iteracije, nepromijenjen izvornik,
            napredak.json i lens budget (audit posjećen 2+ puta → drugi put < svih leća).
  smoke     <fixture> --project-root <dir>
            bez Workflowa: profil resolver + stanje_init + gate --faza <faza> --suho;
            dokazuje da paket na fixture-u uopće radi prije nego se troše agenti.
  svi       --root <dir>   priprema + smoke za sva tri fixture-a (bez Workflowa).

Rezultat Workflowa (`rezultat.json`) je JSON koji `zavrsi()` vraća — spremi ga iz
tool resulta Write alatom. Izlazni kod: 0 sve prošlo, 1 nešto palo, 2 greška ulaza.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

OVDJE = Path(__file__).resolve().parent
FIXTURES = OVDJE / "fixtures"
PKG = OVDJE.parent.parent  # katedra-pkg/
KATEDRA_SKILL = Path(os.environ.get("KATEDRA_SKILL") or PKG / "katedra-lite")


def ucitaj_fixture(ime: str) -> dict:
    p = FIXTURES / (ime if ime.endswith(".json") else ime + ".json")
    if not p.is_file():
        sys.exit(f"❌ nema fixture-a {p}")
    return json.loads(p.read_text(encoding="utf-8"))


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def sastavi_args(fx: dict, root: Path, rad_docx: str | None) -> dict:
    a = dict(fx["args"])
    a["project_root"] = str(root)
    a["katedra_skill"] = str(KATEDRA_SKILL)
    a["sateliti_dir"] = str(PKG)
    if "profil_datoteka" in a:
        a["profil_datoteka"] = a["profil_datoteka"].replace("<KATEDRA_SKILL>", str(KATEDRA_SKILL))
    if a.get("rad_docx", "").startswith("<"):
        if not rad_docx:
            sys.exit("❌ fixture traži --rad-docx <put do gotovog rada>")
        a["rad_docx"] = str(Path(rad_docx).resolve())
    return a


# ── priprema ────────────────────────────────────────────────────────────────
def priprema(fx: dict, root: Path, rad_docx: str | None, ocisti: bool) -> dict:
    if root.exists() and ocisti:
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    args = sastavi_args(fx, root, rad_docx)
    if args.get("rad_docx"):
        src = Path(args["rad_docx"])
        dst = root / "rad.docx"
        if not dst.exists():
            shutil.copy2(src, dst)
        args["rad_docx"] = str(dst)
        (root / ".fixture_sha").write_text(sha(dst), encoding="utf-8")
    (root / ".fixture.json").write_text(json.dumps({"fixture": fx["naziv"], "args": args},
                                                   ensure_ascii=False, indent=2), encoding="utf-8")
    return args


# ── smoke (bez Workflowa) ───────────────────────────────────────────────────
def _run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    env = dict(os.environ)
    env.setdefault("KATEDRA_SKILL", str(KATEDRA_SKILL))
    for slug in ("rad-audit", "rad-docx", "fpzg-diplomski", "replikacija-pspp"):
        env.setdefault(slug.upper().replace("-", "_") + "_HOME", str(PKG / slug))
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.returncode, (p.stdout + p.stderr)[-1500:]


def smoke(fx: dict, root: Path, args: dict) -> bool:
    S = KATEDRA_SKILL / "scripts"
    ok = True
    tip = args["tip"]
    print(f"— smoke {fx['naziv']} u {root}")
    if "profil_datoteka" in args:
        rc, out = _run([sys.executable, str(S / "profile_resolver.py"), "--fakultet", args["fakultet"],
                        "--profil-datoteka", args["profil_datoteka"], "--tip", tip,
                        "--profile-out", ".katedra/resolved_profile.json",
                        "--provenance-out", ".katedra/resolved_profile.provenance.json"], root)
    else:
        rc, out = _run([sys.executable, str(S / "profile_resolver.py"), "--fakultet", args["fakultet"],
                        "--tip", tip, "--profile-out", ".katedra/resolved_profile.json",
                        "--provenance-out", ".katedra/resolved_profile.provenance.json"], root)
    (root / ".katedra").mkdir(exist_ok=True)
    if rc != 0:
        # resolver piše prije mkdir-a? pokušaj još jednom s postojećom mapom
        rc, out = _run([sys.executable, str(S / "profile_resolver.py"), "--fakultet", args["fakultet"],
                        *(["--profil-datoteka", args["profil_datoteka"]] if "profil_datoteka" in args else []),
                        "--tip", tip, "--profile-out", ".katedra/resolved_profile.json",
                        "--provenance-out", ".katedra/resolved_profile.provenance.json"], root)
    print(f"  {'✅' if rc == 0 else '❌'} profile_resolver rc={rc}")
    ok &= rc == 0
    if not (root / ".katedra/stanje.json").exists():
        mod = "audit" if args.get("rad_docx") else "novi-rad"
        cmd = [sys.executable, str(S / "stanje_init.py"), "--mod", mod, "--tip", tip, "--tema", args["tema"],
               "--fakultet", args["fakultet"]]
        if args.get("rok"):
            cmd += ["--rok", args["rok"]]
        if args.get("rad_docx"):
            cmd += ["--ima", "rad_docx"]
        if "profil_datoteka" in args:
            cmd += ["--fakultet-izvan-registryja", args["fakultet"], "--ogranicenje", "profil izvan registryja (samostojni, ADVISORY)"]
        rc, out = _run(cmd, root)
        print(f"  {'✅' if rc == 0 else '❌'} stanje_init rc={rc}" + ("" if rc == 0 else "\n" + out))
        ok &= rc == 0
    faza = args["faza"]
    cmd = [sys.executable, str(S / "gate.py"), "--faza", faza, "--tip", tip, "--suho",
           "--profil", ".katedra/resolved_profile.json"]
    if args.get("rad_docx"):
        cmd += ["--rad", "./rad.docx"]
    rc, out = _run(cmd, root)
    print(f"  {'✅' if rc == 0 else '❌'} gate --faza {faza} --suho rc={rc}")
    ok &= rc == 0
    rc, out = _run([sys.executable, str(S / "vjestine.py"), "--provjeri", "--tip", tip], root)
    print(f"  {'✅' if rc == 0 else '⚠️'} vjestine --provjeri rc={rc}")
    if args.get("rad_docx"):
        rc, out = _run([sys.executable, str(S / "gate.py"), "--faza", "audit", "--tip", tip,
                        "--rad", "./rad.docx", "--profil", ".katedra/resolved_profile.json",
                        "--json", ".katedra/gate.json"], root)
        print(f"  {'✅' if rc == 0 else '⚠️'} gate --faza audit (stvarno) rc={rc} — {out.strip().splitlines()[-1] if out.strip() else ''}")
    return ok


# ── provjeri (poslije Workflowa) ────────────────────────────────────────────
def provjeri(fx: dict, root: Path, rez: dict) -> bool:
    oc = fx["ocekivano"]
    ok = True

    def tvrdi(uvjet: bool, poruka: str):
        nonlocal ok
        print(f"  {'✅' if uvjet else '❌'} {poruka}")
        ok &= uvjet

    print(f"— provjera {fx['naziv']}: status={rez.get('status')} iteracija={rez.get('ukupno_iteracija')}")
    tvrdi(rez.get("status") in oc["status"], f"status u {oc['status']}")
    tvrdi((rez.get("ukupno_iteracija") or 0) <= oc.get("max_iteracija", 12), "iteracije ≤ max")
    for rel in oc.get("artefakti_moraju_postojati", []):
        tvrdi((root / rel).exists(), f"postoji {rel}")
    dovrsene = [h["faza"] for h in rez.get("povijest", [])]
    for f in oc.get("min_faza_dovrseno", []):
        tvrdi(f in dovrsene, f"faza '{f}' posjećena")
    if oc.get("izvornik_nepromijenjen"):
        p = root / oc["izvornik_nepromijenjen"]
        ref = (root / ".fixture_sha").read_text(encoding="utf-8").strip() if (root / ".fixture_sha").exists() else None
        tvrdi(p.exists() and ref and sha(p) == ref, f"izvornik {p.name} nepromijenjen (sha)")
    if oc.get("kopija_postoji"):
        tvrdi(any((root / k).exists() for k in oc["kopija_postoji"]), f"kopija s popravcima postoji ({' | '.join(oc['kopija_postoji'])})")
    if oc.get("bez_plana"):
        tvrdi(not (root / ".katedra/plan.json").exists(), "rad_docx mod: nema plan.json")
    np_ = root / ".katedra/napredak.json"
    if np_.exists():
        n = json.loads(np_.read_text(encoding="utf-8"))
        komp = n.get("komponente") or n.get("components") or {}
        tvrdi(bool(komp), "napredak.json ima komponente")
        tvrdi("pokrivenost" in json.dumps(n), "napredak.json nosi pokrivenost")
    # lens budget: ako je audit posjećen 2+ puta, drugi posjet mora pokrenuti < svih leća
    auditi = [h for h in rez.get("povijest", []) if h.get("faza") == "audit" and h.get("lens_budget")]
    if len(auditi) >= 2:
        prvi, drugi = auditi[0]["lens_budget"], auditi[1]["lens_budget"]
        tvrdi(len(drugi.get("preskoceno", [])) > 0 or len(drugi.get("pokrenuto", [])) < len(prvi.get("pokrenuto", [])),
              f"lens budget: 2. audit pokrenuo {len(drugi.get('pokrenuto', []))} od {len(prvi.get('pokrenuto', []))} leća")
    elif len(auditi) == 1:
        print(f"  ℹ️ audit posjećen 1x — lens budget nije imao što preskočiti (pokrenuto {len(auditi[0]['lens_budget'].get('pokrenuto', []))})")
    pale = [h for h in rez.get("povijest", []) if h.get("naredbe_pale")]
    if pale:
        print(f"  ⚠️ naredbe koje su pale: {sum(len(h['naredbe_pale']) for h in pale)} (v. povijest)")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("priprema", "smoke", "provjeri"):
        s = sub.add_parser(c)
        s.add_argument("fixture")
        s.add_argument("--project-root", required=True)
        s.add_argument("--rad-docx")
        s.add_argument("--ocisti", action="store_true", help="obriši project-root prije pripreme")
        if c == "provjeri":
            s.add_argument("--rezultat", required=True)
    s = sub.add_parser("svi")
    s.add_argument("--root", required=True)
    s.add_argument("--rad-docx")
    a = ap.parse_args()

    if a.cmd == "svi":
        root = Path(a.root)
        sve_ok = True
        for ime in ("fpzg-seminarski", "efzg-zavrsni", "hks-fzs-diplomski"):
            fx = ucitaj_fixture(ime)
            if ime == "hks-fzs-diplomski" and not a.rad_docx:
                print(f"— {ime}: preskočeno (treba --rad-docx)")
                continue
            args = priprema(fx, root / ime, a.rad_docx, ocisti=True)
            sve_ok &= smoke(fx, root / ime, args)
        sys.exit(0 if sve_ok else 1)

    fx = ucitaj_fixture(a.fixture)
    root = Path(a.project_root).resolve()
    if a.cmd == "priprema":
        args = priprema(fx, root, a.rad_docx, a.ocisti)
        print(json.dumps(args, ensure_ascii=False, indent=2))
    elif a.cmd == "smoke":
        args = priprema(fx, root, a.rad_docx, a.ocisti)
        sys.exit(0 if smoke(fx, root, args) else 1)
    else:
        rez = json.loads(Path(a.rezultat).read_text(encoding="utf-8"))
        # Workflow tool sprema omot {summary, logs, result, …}; goli zavrsi() JSON ima "status"
        if "status" not in rez and isinstance(rez.get("result"), dict):
            rez = rez["result"]
        sys.exit(0 if provjeri(fx, root, rez) else 1)


if __name__ == "__main__":
    main()
