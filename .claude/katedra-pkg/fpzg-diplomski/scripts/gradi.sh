#!/bin/bash
# Dvoprolazna izgradnja: prvi prolaz daje stranice natpisa, drugi ih upisuje
# u popis ilustracija kao živa PAGEREF polja.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
DOC="$(python3 -c 'import json,pathlib;print(json.loads(pathlib.Path("rad.json").read_text(encoding="utf-8"))["docx"])')"
PDF="${DOC%.docx}.pdf"
REF="${REF_DOCX:-$HERE/../assets/ref_fpzg.docx}"

gradi () {
  pandoc rad_predaja.md -o "$DOC" \
    --from=markdown+pipe_tables+footnotes \
    --reference-doc="$REF"
  python3 "$HERE/build_docx.py"
  # Prolaz po arhivi (prijelom rijeci, font teme, docDefaults) NIJE vise ovdje.
  # Isti je posao radio i motor izrade, pa su postojale dvije kopije istog koda —
  # tocno ono sto zeljezno pravilo 10 zabranjuje. Sada je jedan izvor: rad-docx.
  #
  # Prijelom rijeci mijenja lom redaka, znaci i PAGINACIJU. Bez ovog poziva dokument
  # je u document.xml identican, a prelomi se drukcije (nalaz s prihvatnog testa).
  if [ -z "$MOTOR" ]; then
    for k in "$RAD_DOCX_HOME" "$HOME/.claude/skills/rad-docx" \
             "/root/.claude/skills/rad-docx" "$HERE/../../rad-docx"; do
      [ -n "$k" ] && [ -f "$k/scripts/arhiva.py" ] && MOTOR="$k/scripts" && break
    done
  fi
  if [ -z "$MOTOR" ]; then
    echo "X nema skilla rad-docx (sposobnost izrada.docx), a bez njega ovaj lanac" >&2
    echo "  ne moze primijeniti prijelom rijeci, font teme i docDefaults." >&2
    echo "  Instaliraj rad-docx ili zadaj MOTOR=/put/do/rad-docx/scripts." >&2
    echo "  Improvizirati taj prolaz ovdje znacilo bi drugu verziju istine." >&2
    exit 3
  fi
  python3 "$MOTOR/arhiva.py" "$DOC" --pismo "Times New Roman" \
      --prijelom-rijeci --osvjezi-polja
  rm -f "$PDF"
  timeout 240 libreoffice --headless --convert-to pdf "$DOC" --outdir . >/dev/null 2>&1
}

echo "— prvi prolaz —"
rm -f natpisi_stranice.json
gradi

echo "— očitavam stranice natpisa —"
python3 - <<'EOF'
import subprocess, re, json, docx, pathlib
DOCX = json.loads(pathlib.Path("rad.json").read_text(encoding="utf-8"))["docx"]
PDF = DOCX[:-5] + ".pdf"
n = int(subprocess.run(["pdfinfo",PDF],
        capture_output=True, text=True).stdout.split("Pages:")[1].split()[0])
def norm(s):
    return re.sub(r"[^0-9a-zšđčćž]+", " ", s.replace("­","").lower()).strip()
str_ = [norm(subprocess.run(["pdftotext","-f",str(i),"-l",str(i),
        PDF,"-"],capture_output=True,text=True).stdout)
        for i in range(1, n+1)]
# Numeracija krece od 1 tek na "1. Uvod", pa se otisnuti broj cita iz podnozja
# svake stranice; bez toga bi popis prikaza nosio fizicke, a ne otisnute brojeve.
OTISNUTO = {}
for i in range(1, n+1):
    sirovo = subprocess.run(["pdftotext","-f",str(i),"-l",str(i),
        PDF,"-"],capture_output=True,text=True).stdout
    redci = [r.strip() for r in sirovo.strip().split("\n") if r.strip()]
    if redci and re.fullmatch(r"\d{1,3}", redci[-1]):
        OTISNUTO[i] = int(redci[-1])

d = docx.Document(DOCX)
NAT = re.compile(r"^(Tablica|Grafikon)\s+(\d+)\s*\.")
karta = {}
for p in d.paragraphs:
    m = NAT.match(p.text.strip())
    if not m: continue
    kljuc = f"_Ref_{'tab' if m.group(1)=='Tablica' else 'graf'}{m.group(2)}"
    igla = norm(p.text.strip())[:45]
    pog = [i+1 for i, s in enumerate(str_) if igla in s]
    if len(pog) == 1:
        karta[kljuc] = OTISNUTO.get(pog[0], pog[0])
    else:
        print(f"  ⚠ {p.text.strip()[:40]} -> {pog}")
json.dump(karta, open("natpisi_stranice.json","w",encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"  očitano {len(karta)} natpisa")
EOF

echo "— drugi prolaz —"
gradi
echo "gotovo"
