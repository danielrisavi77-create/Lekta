#!/usr/bin/env python3
"""Registar sposobnosti: što Katedra treba, a ne posjeduje.

Katedra od početka ima jedno načelo: tuđi kod se ne kopira nego poziva
(`references/audit.md`, načelo 10). Dok je satelit bio jedan (`rad-audit`), to je
živjelo kao ručno pisan adapter u `engine.py`. S drugim i trećim satelitom
(`replikacija-pspp`, `fpzg-diplomski`) isti bi se adapter pisao iznova svaki put,
a najvažniji dio — „je li satelit uopće instaliran" — ostao bi obećanje u prozi.
Kad odgovora nema, agent improvizira: napiše brojke bez replikacije ili dokument
bez kućnog stila i nigdje ne piše da je nešto izostalo.

Ovdje je razrješavanje strojno i ima izlazni kod. Registar je podatak
(`references/vjestine.json`) — četvrti satelit je jedan zapis u JSON-u, bez
ijedne izmjene ovog koda.

Dvije razine povjerenja, i razlika je bitna:

  strojno — Katedra rezultat INTERPRETIRA (npr. `DocumentAuditResult`). Kandidat
            bez valjanog machine contracta nije kompatibilan bez obzira na to
            koje funkcije ili regekse sadrži. To razrješava `engine.py`.
  radno   — satelit proizvodi artefakte koje čita čovjek i agent (`usporedba.csv`,
            `.docx`). Ovdje se provjerava da deklarirani entrypointi doista
            postoje kao datoteke. Slabije jamstvo i tako se i prijavljuje.

Izlazni kodovi (isti rječnik koji `engine.py` već koristi):
  0 — sve tražene sposobnosti su razriješene
  3 — satelit nije pronađen
  4 — satelit postoji, ali mu nedostaju deklarirani entrypointi
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KORIJEN = os.path.dirname(HERE)
REGISTAR = os.path.join(KORIJEN, "references", "vjestine.json")

IZLAZ_OK = 0
IZLAZ_NEMA = 3
IZLAZ_NEKOMPATIBILAN = 4


class RegistarError(RuntimeError):
    """Registar sposobnosti se ne može pročitati ili nije valjan."""


def _env_ime(slug: str) -> str:
    """`rad-audit` → `RAD_AUDIT_HOME`; isti obrazac koji engine.py već koristi."""
    return slug.upper().replace("-", "_") + "_HOME"


def _normaliziraj(put: str | None) -> str | None:
    """Direktorij skilla iz proizvoljne putanje (prihvaća i `.../scripts`)."""
    if not put:
        return None
    p = os.path.abspath(os.path.expanduser(put))
    if not os.path.isdir(p):
        return None
    if os.path.basename(p) == "scripts":
        p = os.path.dirname(p)
    return p


def kandidati(slug: str) -> list[str]:
    """Redoslijed traženja, isti kao za motor: env → susjed → ~/.claude → plugini."""
    popis = [
        os.environ.get(_env_ime(slug)),
        os.path.join(KORIJEN, "..", slug),
        os.path.expanduser(f"~/.claude/skills/{slug}"),
        f"/root/.claude/skills/{slug}",
        f"/home/claude/.claude/skills/{slug}",
    ]
    # v1.9 (nalaz 2): u Cowork sesiji sinkronizirani skillovi žive u
    # ~/.claude/skills/synced/<hash>/<slug> — bez ovog uzorka satelit koji je
    # instaliran prolazi kao „nije pronađen". Sortirano, prvi postojeći pobjeđuje;
    # env `<SLUG>_HOME` i dalje ima prednost (v. nadi_vjestinu).
    for uzorak in (os.path.expanduser(f"~/.claude/skills/synced/*/{slug}"),
                   f"/root/.claude/skills/synced/*/{slug}",
                   f"/home/claude/.claude/skills/synced/*/{slug}",
                   os.path.expanduser(f"~/.claude/plugins/*/skills/{slug}"),
                   f"/root/.claude/plugins/*/skills/{slug}"):
        popis.extend(sorted(glob.glob(uzorak)))
    return [p for p in popis if p]


def nadi_vjestinu(slug: str) -> str | None:
    """Direktorij satelita ili None.

    Eksplicitni `<SLUG>_HOME` je NAREDBA, ne prijedlog: ako pokazuje na putanju
    koja ne postoji, traženje se NE nastavlja. Tiha zamjena drugim skillom daje
    rezultat koji korisnik nikad nije tražio — to je bio uzrok nalaza AUD-010.
    """
    override = (os.environ.get(_env_ime(slug)) or "").strip()
    if override:
        return _normaliziraj(override)
    for p in kandidati(slug):
        put = _normaliziraj(p)
        if put:
            return put
    return None


def ucitaj_registar(put: str = REGISTAR) -> dict:
    try:
        with open(put, encoding="utf-8") as f:
            registar = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        raise RegistarError(f"registar sposobnosti se ne može pročitati ({put}): {exc}") from exc
    if not isinstance(registar.get("sposobnosti"), dict):
        raise RegistarError(f"{put}: nedostaje objekt „sposobnosti\"")
    return registar


def _primjenjivo(zapis: dict, fakultet: str | None, tip: str | None = None) -> bool:
    """Vrijedi li sposobnost u ovom kontekstu (npr. samo za jedan fakultet / tip rada).

    v1.9 (nalaz 5): `uvjet.tipovi` (npr. ["zavrsni","diplomski"]) ograničava
    sposobnost na vrstu rada; bez polja ili bez konteksta ne isključuje se ništa.
    """
    uvjet = zapis.get("uvjet") or {}
    fak = uvjet.get("fakultet")
    if fak and fakultet and fakultet.strip().lower() not in [str(x).lower() for x in fak]:
        return False
    tipovi = uvjet.get("tipovi")
    if tipovi and tip and tip.strip().lower() not in [str(x).lower() for x in tipovi]:
        return False
    return True


def tip_iz_stanja(kat: str | None = None, project_root: str | None = None) -> str | None:
    """Tip rada iz .katedra/stanje.json (kad --tip nije zadan); None ako ga nema."""
    try:
        import context
        put = context.resolve_state_file("stanje.json", kat=kat, project_root=project_root)
        with open(put, encoding="utf-8") as f:
            tip = json.load(f).get("tip")
        return str(tip).strip().lower() if tip else None
    except Exception:  # noqa: BLE001 — bez stanja nema konteksta, i to je u redu
        return None


def razrijesi(sposobnost: str, registar: dict | None = None,
              fakultet: str | None = None, tip: str | None = None) -> dict:
    """Stanje jedne sposobnosti: tko ju nudi, gdje je i je li upotrebljiva."""
    registar = registar or ucitaj_registar()
    zapis = (registar.get("sposobnosti") or {}).get(sposobnost)
    if zapis is None:
        raise RegistarError(f"nepoznata sposobnost: {sposobnost}")

    slug = str(zapis.get("vjestina") or "")
    rezultat = {
        "sposobnost": sposobnost,
        "opis": zapis.get("opis", ""),
        "vjestina": slug,
        "razina_povjerenja": zapis.get("razina_povjerenja", "radno"),
        "modovi": list(zapis.get("modovi") or []),
        "primjenjivo": _primjenjivo(zapis, fakultet, tip),
        "izvan_uvjeta": (zapis.get("uvjet") or {}).get("izvan_uvjeta", ""),
        "putanja": None,
        "stanje": "nema",
        "nedostaju": [],
        "naredbe": {},
        "rezerva": None,
    }

    if zapis.get("razrjesitelj"):
        # Sposobnost razine `strojno` ima vlastiti razrješitelj s ugovorom;
        # ovdje se NE pretvaramo da je provjeravamo umjesto njega.
        rezultat["stanje"] = "razrjesitelj"
        rezultat["razrjesitelj"] = zapis["razrjesitelj"]
        rezultat["provjera"] = zapis.get("provjera", "")
        return rezultat

    put = nadi_vjestinu(slug) if slug else None
    rezerva = zapis.get("rezerva")
    if rezerva:
        rezultat["rezerva"] = {
            "vjestina": rezerva.get("vjestina"),
            "naredba": _naredba(KORIJEN, rezerva.get("entrypoint", "")),
            "opis": rezerva.get("opis", ""),
        }

    if not put:
        rezultat["stanje"] = "nema"
        return rezultat

    rezultat["putanja"] = put
    nedostaju = []
    for ime, rel in (zapis.get("entrypoints") or {}).items():
        cijela = os.path.join(put, rel)
        if os.path.isfile(cijela):
            rezultat["naredbe"][ime] = _naredba(put, rel)
        else:
            nedostaju.append(rel)
    rezultat["nedostaju"] = nedostaju
    rezultat["stanje"] = "nekompatibilan" if nedostaju else "dostupno"
    return rezultat


def _naredba(korijen: str, rel: str) -> str:
    return f"python3 {os.path.join(korijen, rel)}" if rel else ""


def pregled(registar: dict | None = None, fakultet: str | None = None,
            tip: str | None = None) -> list[dict]:
    registar = registar or ucitaj_registar()
    return [razrijesi(ime, registar, fakultet, tip)
            for ime in sorted(registar.get("sposobnosti") or {})]


ZNAK = {
    "dostupno": "✅",
    "nema": "❌",
    "nekompatibilan": "⚠️",
    "razrjesitelj": "→",
}


def _ispis(redci: list[dict]) -> None:
    print("=" * 78)
    print("SPOSOBNOSTI KOJE KATEDRA TREBA, A NE POSJEDUJE")
    print("=" * 78)
    for r in redci:
        znak = ZNAK.get(r["stanje"], "?")
        modovi = ", ".join(r["modovi"]) or "—"
        print(f"{znak} {r['sposobnost']:16} {r['vjestina']:18} "
              f"[{r['razina_povjerenja']}, mod {modovi}]")
        print(f"   {r['opis']}")
        if not r["primjenjivo"]:
            print("   (ne odnosi se na ovaj fakultet / tip rada)")
            if r.get("izvan_uvjeta"):
                print(f"   {r['izvan_uvjeta']}")
        if r["stanje"] == "razrjesitelj":
            print(f"   razrješava: {r['razrjesitelj']} — provjeri s: {r.get('provjera','')}")
        elif r["stanje"] == "dostupno":
            print(f"   {r['putanja']}")
            for ime, naredba in r["naredbe"].items():
                print(f"     {ime}: {naredba}")
        elif r["stanje"] == "nekompatibilan":
            print(f"   {r['putanja']}")
            print(f"   nedostaju deklarirani entrypointi: {', '.join(r['nedostaju'])}")
            print("   Što napraviti: nadogradi ili ponovno instaliraj taj skill; "
                  "Katedra ne smije pretpostaviti da posao netko drugi radi.")
        else:
            print(f"   nije pronađen: instaliraj skill „{r['vjestina']}\" ili zadaj "
                  f"{_env_ime(r['vjestina'])}=/putanja/do/skilla")
        if r["rezerva"]:
            print(f"   rezerva: {r['rezerva']['opis']}")
            print(f"     {r['rezerva']['naredba']}")
        print()


def _izlazni_kod(redci: list[dict]) -> int:
    """Najgore stanje odlučuje; sposobnost koja se ne odnosi na kontekst ne računa."""
    vazni = [r for r in redci if r["primjenjivo"] and r["stanje"] != "razrjesitelj"]
    if any(r["stanje"] == "nekompatibilan" for r in vazni):
        return IZLAZ_NEKOMPATIBILAN
    if any(r["stanje"] == "nema" and not r["rezerva"] for r in vazni):
        return IZLAZ_NEMA
    return IZLAZ_OK


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Razriješi satelitske skillove koje Katedra poziva, ali ne posjeduje.")
    ap.add_argument("--provjeri", action="store_true", help="pregled svih sposobnosti")
    ap.add_argument("--sposobnost", help="razriješi jednu sposobnost (npr. izrada.docx)")
    ap.add_argument("--fakultet", help="kontekst fakulteta (utječe na uvjetovane sposobnosti)")
    ap.add_argument("--tip", help="tip rada (seminarski|esej|zavrsni|diplomski); "
                                  "default: .katedra/stanje.json ako postoji")
    ap.add_argument("--kat", help="putanja do .katedra/ (za tip rada)")
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--registar", default=REGISTAR)
    ap.add_argument("--json", dest="kao_json", action="store_true")
    a = ap.parse_args(argv)

    tip = (a.tip or "").strip().lower() or tip_iz_stanja(a.kat, a.project_root)
    try:
        registar = ucitaj_registar(a.registar)
        if a.sposobnost:
            redci = [razrijesi(a.sposobnost, registar, a.fakultet, tip)]
        else:
            redci = pregled(registar, a.fakultet, tip)
    except RegistarError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2

    if a.kao_json:
        print(json.dumps({"sposobnosti": redci}, ensure_ascii=False, indent=2))
    else:
        _ispis(redci)
    return _izlazni_kod(redci)


if __name__ == "__main__":
    raise SystemExit(main())
