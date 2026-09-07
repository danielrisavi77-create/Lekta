# -*- coding: utf-8 -*-
"""Zakrpa: samo promijenjene datoteke, s uputama i sigurnosnom kopijom.

Zašto ne puni paket
-------------------
Na jednoj stvarnoj izmjeni od 10 datoteka puni je paket imao 203 datoteke i
1,1 MB, a zakrpa 19 datoteka i 145 KB. Uz to puni paket prepisuje i ono što
nitko nije tražio da se mijenja, a kad se ime skilla poklopi — i cijelu tuđu
instalaciju.

Uporaba
-------
    python3 zakrpa.py --izlaz zakrpa/ \\
        --par katedra-lite:/put/baseline/katedra:/put/rad/katedra-lite \\
        --par rad-docx:/put/baseline/rad-docx:/put/rad/rad-docx

`--par IME:IZVORNI:IZMIJENJENI` može se ponoviti. IZVORNI je verzija od koje se
kreće (instalirana ili preuzeta), IZMIJENJENI je ona s izmjenama. IME je ime pod
kojim skill živi na odredištu — ne mora biti isto kao ime mape.

Izlaz je mapa spremna za zip: po jedna podmapa za svaki skill, `UPUTE.md` s
tablicom promjena i `primijeni.sh` koji radi sigurnosnu kopiju svake prepisane
datoteke.
"""
import argparse
import re
import subprocess
import json
import filecmp
import os
import pathlib
import shutil
import sys

PRESKOCI = {"__pycache__", ".git", ".DS_Store"}

PRIMIJENI = r"""#!/usr/bin/env bash
# Primjenjuje zakrpu na postojeću instalaciju skillova.
# Ne briše ništa: svaku datoteku koju prepisuje prvo kopira u .bak-<vrijeme>.
set -euo pipefail

ODREDISTE="${1:-}"
if [ -z "$ODREDISTE" ]; then
  for k in "$HOME/.claude/skills/synced" "$HOME/.claude/skills" "/root/.claude/skills/synced"; do
    [ -d "$k" ] && ODREDISTE="$k" && break
  done
fi
if [ -z "$ODREDISTE" ] || [ ! -d "$ODREDISTE" ]; then
  echo "Ne nalazim mapu sa skillovima." >&2
  echo "Uporaba: bash primijeni.sh /put/do/skills" >&2
  exit 1
fi

IZVOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PECAT="$(date +%Y%m%d-%H%M%S)"
novih=0; zamijenjenih=0; preskocenih=0

for skill in __SKILLOVI__; do
  [ -d "$IZVOR/$skill" ] || continue
  if [ ! -d "$ODREDISTE/$skill" ]; then
    echo "⚠ preskačem $skill — nije instaliran u $ODREDISTE"
    preskocenih=$((preskocenih+1))
    continue
  fi
  while IFS= read -r rel; do
    src="$IZVOR/$skill/$rel"; dst="$ODREDISTE/$skill/$rel"
    mkdir -p "$(dirname "$dst")"
    if [ -f "$dst" ]; then
      if cmp -s "$src" "$dst"; then echo "   = $skill/$rel (već jednako)"; continue; fi
      cp -p "$dst" "$dst.bak-$PECAT"; cp "$src" "$dst"
      echo "   ~ $skill/$rel   (kopija: $(basename "$dst").bak-$PECAT)"
      zamijenjenih=$((zamijenjenih+1))
    else
      cp "$src" "$dst"; echo "   + $skill/$rel"; novih=$((novih+1))
    fi
  done < <(cd "$IZVOR/$skill" && find . -type f | sed 's|^\./||' | sort)
done

echo
echo "Gotovo: $novih novih, $zamijenjenih zamijenjenih, $preskocenih preskočenih skillova."
echo "Odredište: $ODREDISTE"
"""


def datoteke(korijen):
    korijen = pathlib.Path(korijen)
    for put in korijen.rglob("*"):
        if not put.is_file():
            continue
        if any(d in PRESKOCI for d in put.relative_to(korijen).parts):
            continue
        yield put.relative_to(korijen).as_posix()


def razlika(izvorni, izmijenjeni):
    """(nove, promijenjene, obrisane) relativne putanje."""
    a, b = set(datoteke(izvorni)), set(datoteke(izmijenjeni))
    nove = sorted(b - a)
    obrisane = sorted(a - b)
    promijenjene = sorted(
        r for r in (a & b)
        if not filecmp.cmp(os.path.join(izvorni, r), os.path.join(izmijenjeni, r), shallow=False))
    return nove, promijenjene, obrisane



# ---------------------------------------------------------------------------
# --provjeri-tvrdnje: SKILL.md ne smije tvrditi ono što kod ne radi.
#
# Povod (rad-audit, rujan 2026.): SKILL.md je opisivao Vancouver dijalekt kao
# gotov i dokazan — "common.detect_citation_style sada zna vancouver",
# "Mjereno: kritično 1 → 0, 78/78 testova", sposobnost hr.citations.vancouver.v1
# "potvrđena izvođenjem". U kodu: nula pojava riječi vancouver, testova nema,
# suite ima 63 testa, manifest tu sposobnost ne sadrži. Opis je napisan, kod nije.
# Drugi slučaj istog mehanizma (prvi: kvar 36), pa prestaje biti kvar i postaje
# provjera koja se pokreće prije svake zakrpe.
# ---------------------------------------------------------------------------

SPOSOBNOST_RE = re.compile(r"`([a-z][\w.\-]*\.v\d+)`")
TESTOVI_RE = re.compile(r"(\d+)\s*/\s*(\d+)\s+testova")
KVAR_RE = re.compile(r"\*\*(R\d+)\s*[—-]")

# Kvar 72: provjera tvrdnji nad katedra-liteom vraćala je „✓ SKILL.md i kod se
# slažu" i izlazni kod 0, iako je SKILL.md imenovao dvije skripte kojih na disku
# nema (model.py, citati.py). Sve tri postojeće provjere oslanjale su se na
# `scripts/engine_contract.json` i `scripts/tests/test_all.py`, kojih katedra-lite
# nema, pa su pucale u prazno. Alat koji lovi tvrdnje bez pokrića bio je i sam
# tvrdnja bez pokrića.
# Hvata samo pozive koji ciljaju SAM PAKET. Poziv s apsolutnom putanjom u tuđi
# skill (`/root/.claude/skills/docx/scripts/validate.py`) nije tvrdnja o ovom
# paketu i ne smije se prijaviti — inače provjera postane šum, a šum se ignorira.
SKRIPTA_RE = re.compile(
    r"python3\s+(?!/root/|/usr/|/opt/|~/)"
    r"(?:\$\{?[A-Z_]+\}?/|\./|[A-Za-z0-9_.\-]+/)*"
    r"([A-Za-z_][A-Za-z0-9_]*\.py)\b")

# Imena koja se u dokumentaciji pojavljuju kao PRIMJER, ne kao poziv alata paketa.
IZUZETE_SKRIPTE = {"skripta.py", "tvoja_skripta.py", "primjer.py", "ime.py",
                   "soffice.py"}

# Skripte koje autor piše U SVOM PROJEKTU rada, a ne isporučuje ih paket.
# `model.py` je po željeznom pravilu 13 jedini izvor brojki tog rada: paket
# propisuje njegov OBLIK (rad-docx/references/brojke.md), ne njegov sadržaj.
PROJEKTNE_SKRIPTE = {"model.py"}


def provjeri_tvrdnje(korijen):
    """Vraća popis nalaza (str). Prazan popis = SKILL.md i kod se slažu."""
    # Apsolutni put je obavezan: test suite se pokreće s `cwd` u `scripts/tests`,
    # pa bi relativan korijen ondje pokazivao u prazno. Alat je tada ispisivao
    # „suite se ne može pokrenuti" i obarao provjeru tvrdnji na vlastitom rukovanju
    # putovima — lažni ❌ iz alata koji upravo lovi tvrdnje bez pokrića.
    korijen = pathlib.Path(korijen).resolve()
    skill_md = korijen / "SKILL.md"
    if not skill_md.exists():
        return [f"❌ nema {skill_md}"]
    md = skill_md.read_text(encoding="utf-8")
    nalazi = []

    # 1) sposobnosti spomenute u SKILL.md naspram manifesta
    manifesti = list(korijen.glob("scripts/engine_contract.json"))
    if manifesti:
        man = json.loads(manifesti[0].read_text(encoding="utf-8"))
        u_manifestu = set(man.get("capabilities", []))
        u_opisu = set(SPOSOBNOST_RE.findall(md))
        for c in sorted(u_opisu - u_manifestu):
            nalazi.append(f"❌ SKILL.md spominje sposobnost `{c}`, manifest je NEMA")
        for c in sorted(u_manifestu - u_opisu):
            nalazi.append(f"⚠ manifest nosi `{c}`, SKILL.md je ne spominje")

    # 2) tvrdnja "N/M testova" naspram stvarnog broja testova
    testovi = korijen / "scripts" / "tests" / "test_all.py"
    stvarno = None
    if testovi.exists():
        # Kvar 117: `text=True` bez `encoding` dekodira izlaz djeteta kodnom
        # stranicom konzole. Na hrvatskom Windowsu (cp1250) suite koji ispisuje
        # ✓/⚠ obori dretvu čitača, `r.stdout` ostane None, i cijela provjera
        # tvrdnji padne u traceback — alat koji lovi tvrdnje bez pokrića srušio
        # bi se prije nego išta provjeri. Pravilo 20: alat koji je pukao nije
        # provjera koja je prošla.
        r = subprocess.run([sys.executable, str(testovi)], capture_output=True,
                           text=True, encoding="utf-8", errors="replace",
                           cwd=str(testovi.parent), timeout=600,
                           env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        m = re.search(r"REZULTATI TESTOVA:\s*(\d+)\s*/\s*(\d+)", r.stdout or "")
        if m:
            stvarno = (int(m.group(1)), int(m.group(2)))
            if stvarno[0] != stvarno[1]:
                nalazi.append(f"❌ testovi ne prolaze: {stvarno[0]}/{stvarno[1]}")
    for m in TESTOVI_RE.finditer(md):
        tvrdi = (int(m.group(1)), int(m.group(2)))
        if stvarno is None:
            nalazi.append(f"❌ SKILL.md tvrdi {tvrdi[0]}/{tvrdi[1]} testova, a suite se ne može pokrenuti")
        elif tvrdi[1] > stvarno[1]:
            nalazi.append(f"❌ SKILL.md tvrdi {tvrdi[0]}/{tvrdi[1]} testova, suite ima {stvarno[1]}")

    # 3) svaki kvar R<N> opisan u SKILL.md mora imati test-skupinu "R<N>:"
    if testovi.exists():
        t = testovi.read_text(encoding="utf-8")
        for oznaka in sorted(set(KVAR_RE.findall(md))):
            if f'"{oznaka}:' not in t and f"'{oznaka}:" not in t:
                nalazi.append(f"❌ SKILL.md opisuje {oznaka}, a testova s oznakom {oznaka}: nema")

    # 4) svaka skripta imenovana u SKILL.md-u i referencama mora postojati
    #    (naredba koju model pokuša pozvati, a ne postoji, tiho se preskoči i
    #    korak se prijavi gotovim)
    # rekurzivno: tests/, domains/ i druge podmape su i dalje dio paketa
    # Kvar 126: tražilo se samo u `scripts/`, pa je alat koji živi drugdje u
    # skillu (`katedra-lite/evals/pokreni_trigger.py`) prijavljen kao „skripte
    # nema ni u paketu ni kod satelita" — lazan ❌ iz alata koji lovi lazne
    # tvrdnje. Postojanje se provjerava nad cijelim skillom.
    dostupne = {q.name for q in korijen.glob("**/*.py")}
    for satelit in ("rad-audit", "rad-docx", "fpzg-diplomski", "replikacija-pspp",
                    "katedra-lite", "katedra", "rad-orchestrator"):
        dostupne |= {q.name for q in (korijen.parent / satelit).glob("**/*.py")}
    tekstovi = [("SKILL.md", md)]
    for ref in sorted(korijen.glob("references/*.md")):
        tekstovi.append((f"references/{ref.name}", ref.read_text(encoding="utf-8")))
    imenovane = {}
    for gdje, tekst in tekstovi:
        for ime in SKRIPTA_RE.findall(tekst):
            if ime not in IZUZETE_SKRIPTE and ime not in PROJEKTNE_SKRIPTE:
                imenovane.setdefault(ime, gdje)
    for ime, gdje in sorted(imenovane.items()):
        if ime not in dostupne:
            nalazi.append(f"❌ {gdje} zove `{ime}`, a te skripte nema ni u paketu "
                          f"ni kod satelita")

    # 5) ZRCALNI SMJER: alat koji postoji, a dokumentacija ga nikad ne spominje.
    #    Kvar 113: provjera tvrdnji dotad je gledala samo jedan smjer („SKILL.md
    #    zove skriptu koje nema"). Obrnuto se nije gledalo, pa je rad-audit dobio
    #    OSAM novih alata (metapodaci, uputnice, tablice, statistika, hipoteze,
    #    tvrdnja↔izvor, postojanje reference, mapa izvora) i nijedan nije bio u
    #    njegovu SKILL.md-u. Radili su samo zato što ih agregat zove; tko skill
    #    otvori izravno, za njih ne zna. Nedokumentiran alat je alat koji se ne
    #    koristi, isto kao alat koji ne postoji.
    #    v1.9.12: nalaz je bio ⚠, a ⚠ ne ruši `bin/testovi.sh`. Provjera koja
    #    ne blokira je provjera koja se ne popravlja — isti oblik tihe nule zbog
    #    kojega postoji pravilo 20. Sada je ❌. Izlaz za pomoćni alat koji doista
    #    nije za čovjeka: u vlastitom docstringu napiši `interno: <razlog>`.
    #    Izjava stoji u samoj skripti, pa ne može zaostati za njom kao popis izuzeća.
    ZANEMARI = {"__init__", "common", "conftest", "setup"}
    svi_tekstovi = md + "\n" + "\n".join(t for _g, t in tekstovi)
    for q in sorted(korijen.glob("scripts/*.py")):
        ime = q.stem
        if ime in ZANEMARI or ime.startswith("_"):
            continue
        if q.name in svi_tekstovi or ime in svi_tekstovi:
            continue
        glava = "\n".join(q.read_text(encoding="utf-8", errors="replace").split("\n")[:40])
        if re.search(r"interno:\s*\S", glava):
            continue
        nalazi.append(f"❌ `scripts/{q.name}` postoji, a ne spominje ga ni SKILL.md "
                      f"ni ijedna referenca — dokumentiraj ga ili u njegov docstring "
                      f"upiši `interno: <razlog>`")

    # 5b) ZNAMENKA KVARA: SKILL.md se poziva na „kvar N", a N mora postojati u
    #     katalogu. Kvar 116: kartica i repo razisli su se samo u jednoj brojci
    #     („kvar 121" naspram „kvar 114"), pa je router upućivao na unos kojega
    #     u katalogu nema. Broj kvara je lokator kao i broj stranice: ako ne
    #     pogađa, uputa je gora od nikakve, jer izgleda provjerljivo.
    zamke = korijen / "references" / "zamke.md"
    if zamke.exists():
        katalog = zamke.read_text(encoding="utf-8")
        postojeci = set()
        # Kvar 135: uzorak je čitao raspon SAMO u tuđem obliku
        # (`## Kvarovi 80–86 — X`), a ne u kanonskom (`## 80–86. X`) koji
        # `kvar.py --popravi-naslove` upravo proizvodi. Dok je zadnji unos
        # pojedinačan, `max(postojeci)` to skriva; čim katalog završi
        # rasponom, `najveci` je prenizak i svaki uredan lokator iznad njega
        # postaje lažan nalaz. Treći put isti uzorak (kvarovi 116, 122).
        UNOS = re.compile(
            r"^##\s*(?:(\d+)(?:\s*[\u2013\u2014-]\s*(\d+))?\."
            r"|Kvar(?:ovi)?\s+(\d+)(?:\s*[\u2013\u2014-]\s*(\d+))?)", re.M)
        for m in UNOS.finditer(katalog):
            prvi = m.group(1) or m.group(3)
            zadnji = m.group(2) if m.group(1) else m.group(4)
            if not prvi:
                continue
            a = int(prvi)
            b = int(zadnji) if zadnji else a
            postojeci.update(range(a, b + 1))
        if postojeci:
            # Dvije stvari koje bi inače proizvele lažni nalaz, obje mjerene na
            # samom katedra-lite SKILL.md-u prije nego je provjera puštena:
            #
            #  (a) „rad-audit kvar 3" je kvar u TUĐEM katalogu, s vlastitom
            #      numeracijom; ne traži se ovdje.
            #  (b) zamke.md je fragment koji se nadovezuje na unos 23, pa brojevi
            #      ispod prvog unosa NISU dokaz da unosa nema, nego da je raniji
            #      dio kataloga drugdje. Prijavljuju se samo brojevi IZNAD
            #      zadnjeg unosa: oni upućuju u budućnost i sigurno ne pogađaju.
            najveci = max(postojeci)
            trazeni = set()
            for m in re.finditer(r"(?:(\S+)\s+)?kvar(?:ovi)?\s+(\d+)", md, re.I):
                prije = (m.group(1) or "").strip("`*(,.").lower()
                if prije in ("rad-audit", "rad-docx", "fpzg-diplomski",
                             "replikacija-pspp", "rektorova", "katedra"):
                    continue
                trazeni.add(int(m.group(2)))
            fantomski = sorted(n for n in trazeni if n > najveci)
            if fantomski:
                nalazi.append(
                    "❌ SKILL.md se poziva na kvar(ove) kojih u references/zamke.md "
                    f"nema: {', '.join(str(n) for n in fantomski)} "
                    f"(zadnji unos u katalogu je {najveci})")

    # 6) brojka o veličini kataloga mora se slagati s katalogom.
    #    Kvar 118: `rad-docx/SKILL.md` je na dva mjesta tvrdio „31 stvarni kvar"
    #    nad katalogom koji ih nosi 26. Tvrdnja je stara pet unosa i nitko je
    #    nije mjerio jer je nitko nije ni mogao mjeriti — brojka u prozi nije
    #    bila vezana ni za što. Vezana je sada.
    katalog = korijen / "references" / "zamke.md"
    if katalog.exists():
        stvarnih = len(re.findall(r"^##\s+(\d+)(?:\s*[–—-]\s*\d+)?\.\s",
                                  katalog.read_text(encoding="utf-8"), re.M))
        # Samo SKILL.md: katalozi jedni druge citiraju (kvar 37 u
        # katedra-liteu doslovno nosi tuđi `31 stvarni kvar` kao dokaz), pa bi
        # skeniranje referenci prijavljivalo citat kao tvrdnju. Lažan nalaz iz
        # alata koji lovi lažne tvrdnje skuplji je od tvrdnje koju propusti.
        for gdje, tekst in [("SKILL.md", md)]:
            for red in tekst.splitlines():
                if "zamke.md" not in red:
                    continue
                for m in re.finditer(r"(\d+)\s+(?:stvarn\w+\s+)?kvar\w*", red):
                    tvrdi = int(m.group(1))
                    if tvrdi != stvarnih:
                        nalazi.append(f"❌ {gdje} tvrdi „{m.group(0)}\" o references/"
                                      f"zamke.md, a katalog nosi {stvarnih} unosa")

    # 7) skill koji propisuje testove mora ih i imati
    if not testovi.exists() and "test_all.py" in md:
        nalazi.append("❌ SKILL.md spominje test_all.py, a scripts/tests/test_all.py "
                      "ne postoji — tvrdnje o testovima nisu provjerive")

    return nalazi


# Kvar 117, drugi kraj: alat ispisuje ⚠ i ❌, a hrvatska konzola je cp1250.
# Bez ovoga prvi nalaz obori ispis u UnicodeEncodeError, pa provjera koja je
# NAŠLA nalaz javi traceback umjesto nalaza. Kodna stranica se ne mijenja
# (č, ć, ž, š, đ postoje u cp1250) — mijenja se samo to što znak koji
# u njoj ne postoji više ne ruši alat. PYTHONIOENCODING, ako je postavljen,
# i dalje odlučuje o kodiranju.
for _tok in (sys.stdout, sys.stderr):
    try:
        _tok.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--par", action="append", metavar="IME:IZVORNI:IZMIJENJENI")
    ap.add_argument("--izlaz")
    ap.add_argument("--naslov", default="Zakrpa")
    ap.add_argument("--provjeri-tvrdnje", metavar="KORIJEN_SKILLA",
                    help="usporedi tvrdnje iz SKILL.md sa stanjem koda i testova")
    a = ap.parse_args()

    if a.provjeri_tvrdnje:
        nalazi = provjeri_tvrdnje(a.provjeri_tvrdnje)
        print("=" * 62)
        print("PROVJERA TVRDNJI —", a.provjeri_tvrdnje)
        print("=" * 62)
        for n in nalazi:
            print(" ", n)
        tvrdo = [n for n in nalazi if n.startswith("❌")]
        print("\nREZULTAT:", "✓ SKILL.md i kod se slažu" if not tvrdo
              else f"❌ {len(tvrdo)} tvrdnja bez pokrića u kodu")
        return 1 if tvrdo else 0

    if not a.par or not a.izlaz:
        sys.exit("❌ --par i --izlaz su obavezni kad se gradi zakrpa")

    izlaz = pathlib.Path(a.izlaz)
    if izlaz.exists():
        shutil.rmtree(izlaz)
    izlaz.mkdir(parents=True)

    redci, imena, upozorenja = [], [], []
    ukupno = 0
    for par in a.par:
        try:
            ime, izvorni, izmijenjeni = par.split(":", 2)
        except ValueError:
            sys.exit(f"❌ --par mora biti IME:IZVORNI:IZMIJENJENI, dobio: {par}")
        for d in (izvorni, izmijenjeni):
            if not os.path.isdir(d):
                sys.exit(f"❌ nema mape: {d}")

        nove, promijenjene, obrisane = razlika(izvorni, izmijenjeni)
        if obrisane:
            upozorenja.append(
                f"`{ime}`: {len(obrisane)} datoteka postoji u izvornoj, a nema ih u "
                "izmijenjenoj verziji. Zakrpa NE briše — ako ih treba maknuti, reci to "
                "izrijekom u uputama: " + ", ".join(obrisane[:6]))
        if not nove and not promijenjene:
            upozorenja.append(f"`{ime}`: nema razlike, preskočeno")
            continue

        imena.append(ime)
        for rel in nove + promijenjene:
            odrediste = izlaz / ime / rel
            odrediste.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(os.path.join(izmijenjeni, rel), odrediste)
            redci.append((ime, rel, "novo" if rel in nove else "mijenjano"))
        ukupno += len(nove) + len(promijenjene)

    if not imena:
        sys.exit("❌ nijedan par nema razliku — nema što pakirati")

    tablica = "\n".join(
        f"| `{ime}/{rel}` | {'**novo**' if v == 'novo' else 'mij.'} |  |"
        for ime, rel, v in redci)
    upute = f"""# {a.naslov}

Samo promijenjene i nove datoteke. Ukupno **{ukupno}** u {len(imena)} skilla.

## Primjena

```bash
bash primijeni.sh /put/do/skills
```

Skripta pravi sigurnosnu kopiju svake datoteke koju prepisuje
(`ime.bak-RRRRMMDD-HHMMSS`) i ispisuje što je napravila. Bez argumenta traži
`~/.claude/skills/synced`. Ručno kopiranje mapa preko postojećih jednako je dobro —
nijedna datoteka se ne briše, samo dodaje ili zamjenjuje.

## Što je gdje

| Datoteka | Novo? | Zašto |
|---|---|---|
{tablica}

> Stupac „Zašto” popuni rukom prije slanja. Zakrpa bez razloga po stavci tjera
> primatelja da čita diff.

## Provjera nakon primjene

> Dopiši naredbe kojima se vidi da je zakrpa sjela.
"""
    if upozorenja:
        upute += "\n## Upozorenja\n\n" + "\n".join(f"- {u}" for u in upozorenja) + "\n"
    (izlaz / "UPUTE.md").write_text(upute, encoding="utf-8")

    sh = PRIMIJENI.replace("__SKILLOVI__", " ".join(imena))
    (izlaz / "primijeni.sh").write_text(sh, encoding="utf-8")
    os.chmod(izlaz / "primijeni.sh", 0o755)

    print("=" * 72)
    print(f"ZAKRPA — {izlaz}")
    print("=" * 72)
    for ime in imena:
        n = sum(1 for i, _, _ in redci if i == ime)
        print(f"  {ime}: {n} datoteka")
    print(f"\n✔ {ukupno} datoteka + UPUTE.md + primijeni.sh")
    for u in upozorenja:
        print(f"⚠ {u}")
    print("\nPopuni stupac \u201eZašto\u201d u UPUTE.md prije slanja.")


if __name__ == "__main__":
    # Kvar 73: main() je vraćao 1 na tvrdnju bez pokrića, a ulaz ga je zvao bez
    # sys.exit — pa je alat koji lovi lažni prolaz i sam uvijek izlazio s 0.
    sys.exit(main() or 0)
