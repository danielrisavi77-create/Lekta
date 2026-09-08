#!/usr/bin/env bash
# Pokreni sve testove paketa. Jedan ulaz, jedan izlazni kod.
#
# Zašto postoji: testovi su bili razasuti po skillovima i nitko ih nije pokretao
# u cjelini, pa je "82/82 prolazi" u jednom SKILL.md-u stajalo uz 87 stvarnih
# testova i uz manifest koji se razišao s kodom.
set -uo pipefail

# Windows konzola je cp1250, pa ✓/❌ u ispisu testova ruše Python s
# UnicodeEncodeError — svaka skupina tada „padne" iako je prošla, i jedini ulaz
# javi „12 od 12 palo" nad zelenim repoom. Mjereno na ovom stroju.
export PYTHONIOENCODING="${PYTHONIOENCODING:-utf-8}"
# Kvar 145: .pyc se smatra valjanim ako se izvor slaze po velicini i sekundi
# mtime-a. Dvije izmjene iste datoteke jednake velicine unutar iste sekunde
# (mutacija, brz pull) zato mogu izvesti STARI bytecode nad novim izvorom.
# Suite je malen; bytecode mu ne treba, a lazna zelena/crvena je skupa.
export PYTHONDONTWRITEBYTECODE=1
KORIJEN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UKUPNO=0
PALO=0
PALI=()

# Kvar 142: kad je jedna skupina pala, sažetak je javio samo BROJ. Tko ispis
# provuče kroz `tail`, ostane bez imena skupine i bez njezina izlaza, pa se pad
# koji se ne ponovi ne da ni dijagnosticirati — a nagađanje uzroka je točno ono
# što pravilo 20 zabranjuje. Zato: imena palih skupina idu u sažetak, a CIJELI
# ispis svake skupine u dnevnik koji preživi prolaz.
DNEVNIK="${KATEDRA_TESTOVI_DNEVNIK:-$KORIJEN/.testovi/zadnji.log}"
mkdir -p "$(dirname "$DNEVNIK")"
: > "$DNEVNIK"

pokreni() {
  local naziv="$1"; shift
  echo ""
  echo "── $naziv ────────────────────────────────────────────"
  {
    echo ""
    echo "══ $naziv"
  } >> "$DNEVNIK"
  # `tee` u dnevnik; izlazni kod uzima se iz PIPESTATUS, ne iz tee-a.
  "$@" 2>&1 | tee -a "$DNEVNIK"
  local kod="${PIPESTATUS[0]}"
  if [ "$kod" -eq 0 ]; then
    echo "   ✅ $naziv"
  else
    echo "   ❌ $naziv (izlazni kod $kod)"
    PALO=$((PALO + 1))
    PALI+=("$naziv")
  fi
  UKUPNO=$((UKUPNO + 1))
}

pokreni "rad-audit: regresije" \
  python3 "$KORIJEN/rad-audit/scripts/tests/test_all.py"
pokreni "rad-audit: bolesni rad mora pasti" \
  python3 "$KORIJEN/rad-audit/scripts/tests/test_bolesni.py"
pokreni "katedra-lite: gate" \
  python3 "$KORIJEN/katedra-lite/scripts/tests/test_gate.py"
pokreni "katedra: registar kvarova" python3 "$KORIJEN/katedra/scripts/tests/test_kvar.py"
pokreni "katedra: provjera tvrdnji" python3 "$KORIJEN/katedra/scripts/tests/test_zakrpa.py"
pokreni "katedra: verzija i oznake" python3 "$KORIJEN/katedra/scripts/tests/test_verzija.py"
pokreni "katedra: oznaka verzije = VERSION" python3 "$KORIJEN/katedra/scripts/verzija.py" --provjeri
pokreni "katedra-lite: indeks zamki" python3 "$KORIJEN/katedra-lite/scripts/tests/test_indeks.py"
pokreni "katedra-lite: mjerilo usmjeravanja" python3 "$KORIJEN/katedra-lite/scripts/tests/test_trigger.py"
pokreni "katedra-lite: pretraga ranijih verzija" python3 "$KORIJEN/katedra-lite/scripts/tests/test_drift.py"
pokreni "katedra-lite: stari kvarovi" python3 "$KORIJEN/katedra-lite/scripts/tests/test_stari_kvarovi.py"
# Kvar 32: registry je bio stale od v1.9.3 i nitko nije primijetio, jer --check nije
# bio u suiti. Zakrpa profila bez ponovne admisije od sada je crvena skupina.
pokreni "katedra-lite: registar fakulteta" python3 "$KORIJEN/katedra-lite/scripts/profile_registry.py" --check
# Kvar 149: tri .diff datoteke iz cloud sesije (1. 9.) bile su u paketu i u svakoj
# gradnji kartica; nitko ih nije vidio jer ih ništa ne traži. Ostatak zakrpe među
# praćenim datotekama je crvena skupina koja ga imenuje.
ostaci_zakrpa() {
  local nadjeno
  nadjeno=$(git -C "$KORIJEN" ls-files | grep -E '\.(diff|bak|orig|rej)$')
  if [ -n "$nadjeno" ]; then
    echo "$nadjeno"
    return 1
  fi
  echo "nema ostataka zakrpa među praćenim datotekama"
}
pokreni "paket: nema ostataka zakrpa" ostaci_zakrpa
# Kvar 159: isti kvar (subprocess bez encoding=, cp1250) vraćao se sa svakom isporukom
# (119, 152, 153, 155). AST pregled cijelog paketa; svaki novi poziv bez encoding= je crven.
pokreni "paket: subprocess s encoding=" python3 "$KORIJEN/katedra/scripts/provjeri_subprocess.py" "$KORIJEN"
# service/: verifikator za Katedra app. Testovi koji dižu FastAPI bez paketa fastapi su
# PRESKOČENI i imenovani (-rs) — deklarirano ograničenje, ne prolaz.
pokreni "servis: katedra-verifier" env KATEDRA_VERIFIER_TOKEN=dev python3 -m pytest -q -rs -p no:cacheprovider "$KORIJEN/service/tests"
pokreni "katedra-lite: indeks zamki usklađen s katalogom" \
  python3 "$KORIJEN/katedra-lite/scripts/indeks_zamki.py" --provjeri

for skill in katedra katedra-lite rad-audit rad-docx fpzg-diplomski replikacija-pspp; do
  pokreni "tvrdnje: $skill" \
    python3 "$KORIJEN/katedra/scripts/zakrpa.py" --provjeri-tvrdnje "$KORIJEN/$skill"
done

# Katalozi kvarova: numeracija i naslovi. Dosad ih ovaj ulaz nije pokretao, pa je
# suite bio zelen dok je katalog imao preskoke — a sljedeća bi zakrpa uzela brojeve
# koji su već potrošeni. Provjera koja nije u jedinom ulazu nije provjera.
for katalog in katedra-lite rad-audit rad-docx; do
  pokreni "katalog kvarova: $katalog"     python3 "$KORIJEN/katedra/scripts/kvar.py"       "$KORIJEN/$katalog/references/zamke.md" --provjeri
done

echo ""
echo "══════════════════════════════════════════════════════"
if [ "$PALO" -eq 0 ]; then
  echo "✅ svih $UKUPNO skupina prošlo"
else
  echo "❌ $PALO od $UKUPNO skupina palo:"
  for n in "${PALI[@]}"; do echo "   · $n"; done
  echo "   cijeli ispis: $DNEVNIK"
fi
exit "$PALO"
