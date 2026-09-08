#!/bin/bash
# Prilagodnik: ovaj skill kao GRADITELJ za motor izrade (sposobnost `izrada.docx`).
#
# Motor (rad-docx/scripts/gradi.py) vrti petlju do fiksne tocke i preko okoline predaje
# stanje petlje. Ovaj skript prevodi to stanje u ono sto build_docx.py razumije, pozove ga,
# pa motorovim alatima nadopuni ono sto build_docx.py sam ne radi.
#
# Poziv iz motora:
#   python3 <RAD_DOCX>/scripts/gradi.py --rukopis rukopis/ \
#       --profil .katedra/resolved_profile.json \
#       --graditelj <FPZG_SKILL>/scripts/graditelj.sh --izlaz rad.docx
#
# Okolina koju motor postavlja: RAD_MD RAD_DOCX RAD_PROFIL RAD_SADRZAJ RAD_TOC RAD_PRELOMI
#
# Zasto prilagodnik, a ne izmjena build_docx.py: build_docx.py radi nad python-docx
# objektom, a dva od tri posla ispod su druge datoteke u zipu ili viseodlomcano polje.
# Prilagodnik je mjesto gdje se ugovor motora ispunjava bez diranja kucnog stila.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REF="${REF_DOCX:-$HERE/../assets/ref_fpzg.docx}"

if [ -z "$MOTOR" ]; then
  for k in "$RAD_DOCX_HOME" "$HOME/.claude/skills/rad-docx" \
           "/root/.claude/skills/rad-docx" "$HERE/../../rad-docx"; do
    [ -n "$k" ] && [ -f "$k/scripts/sadrzaj.py" ] && MOTOR="$k/scripts" && break
  done
fi
[ -n "$MOTOR" ] || { echo "X ne nalazim rad-docx; zadaj MOTOR=/put/do/rad-docx/scripts" >&2; exit 3; }
[ -n "$RAD_MD" ] && [ -n "$RAD_DOCX" ] || { echo "X motor mora zadati RAD_MD i RAD_DOCX" >&2; exit 2; }

# build_docx.py cita ime izlaza iz rad.json, ne iz okoline.
python3 - "$RAD_DOCX" <<'PY'
import json, pathlib, sys
put = pathlib.Path("rad.json")
k = json.loads(put.read_text(encoding="utf-8")) if put.exists() else {}
k["docx"] = sys.argv[1]
put.write_text(json.dumps(k, ensure_ascii=False, indent=1), encoding="utf-8")
PY

# Prijevod imenskog prostora prikaza, PRIJE izgradnje. Motor kljuc zove `tablica1`, ovaj
# graditelj svoje sidro `_Ref_tab1`. Prijevod POSLIJE izgradnje znaci da ga graditelj vidi
# krug zakasnjelo, a petlja koja konvergira u dva kruga stane prije nego ga upotrijebi —
# posljedica je popis tablica koji ide u predaju prazan.
python3 - <<'PY'
import json, os, re
if os.path.exists("natpisi.json"):
    VRSTA = {"Tablica": "tab", "Grafikon": "graf", "Slika": "slika"}
    out = {}
    for n in json.load(open("natpisi.json", encoding="utf-8")):
        m = re.match(r"^(Tablica|Grafikon|Slika)\s+(\d+)\s*\.", n.get("natpis", ""))
        if m:
            out[f"_Ref_{VRSTA[m.group(1)]}{m.group(2)}"] = n["str"]
    json.dump(out, open("natpisi_stranice.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
PY

pandoc "$RAD_MD" -o "$RAD_DOCX" \
  --from=markdown+pipe_tables+footnotes --reference-doc="$REF"
python3 "$HERE/build_docx.py"

# Prijelom rijeci, font teme, docDefaults. Mijenja LOM REDAKA, znaci i paginaciju, pa se
# mora primijeniti na obje varijante jednako.
python3 "$MOTOR/arhiva.py" "$RAD_DOCX" --pismo "Times New Roman" --prijelom-rijeci

# build_docx.py ubaci sadrzaj samo kao zivo polje TOC s tekstom-zamjenom, a LibreOffice
# polje pri pretvorbi ne popunjava. Bez ovoga pregled ima sadrzaj od jednog retka i svaki
# izmjereni broj stranice je pomaknut.
OBLIK=staticni
[ "$RAD_SADRZAJ" = "zivi" ] && OBLIK=zivi
python3 "$MOTOR/sadrzaj.py" "$RAD_DOCX" --toc "${RAD_TOC:-toc.json}" --oblik "$OBLIK"
