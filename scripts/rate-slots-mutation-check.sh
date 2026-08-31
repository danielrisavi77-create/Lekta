#!/usr/bin/env bash
# Dokaz da rate-slots smoke GRIZE (audit P1-05).
#
# Zeleni smoke sam po sebi ne razlikuje "kompenzacija radi" od "smoke uopce ne mjeri
# kompenzaciju". Zato se prije urednog prolaza migracija namjerno pokvari (ukloni se vracanje
# prvog slota) i trazi se da smoke padne, i to TOCNO na tvrdnji o kompenzaciji.
#
# Trazi zivu psql vezu (PGHOST/PGPORT/PGUSER/...), isto kao i sam smoke.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/supabase/migrations/0096_two_rate_slots.sql"
SMOKE="$ROOT/scripts/rate-slots-smoke.sql"
BAK="$(mktemp)"
LOG="$(mktemp)"

cleanup() { cp "$BAK" "$MIG"; rm -f "$BAK" "$LOG"; }
trap cleanup EXIT

cp "$MIG" "$BAK"

python3 - "$MIG" <<'PY'
import re, sys
path = sys.argv[1]
src = open(path).read()
# Meta: cijeli `if v_a_consumed then ... end if;` blok koji vraca prvi slot.
pattern = re.compile(r'      if v_a_consumed then\n(?:.*\n)*?      end if;\n')
if not pattern.search(src):
    sys.exit('mutacijska meta nije nadjena; azuriraj ovu skriptu zajedno s migracijom')
open(path, 'w').write(pattern.sub('      -- MUTACIJA: kompenzacija uklonjena\n', src, count=1))
PY

if psql -v ON_ERROR_STOP=1 -f "$SMOKE" > "$LOG" 2>&1; then
  echo "FAIL: smoke je PROSAO uz uklonjenu kompenzaciju, dakle ne mjeri kvar P1-05." >&2
  exit 1
fi

if ! grep -q "korisnicki brojac NIJE potrosen" "$LOG"; then
  echo "FAIL: smoke je pao, ali NE na tvrdnji o kompenzaciji:" >&2
  cat "$LOG" >&2
  exit 1
fi

echo "ok: mutacija uredno srusi rate-slots smoke (gate grize)."
