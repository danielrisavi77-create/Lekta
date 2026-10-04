#!/usr/bin/env bash
# Dokaz da repair-slot-per-user smoke GRIZE (T84 RD-3).
#
# Iz migracije 0209 se namjerno ukloni provjera limita po korisniku i trazi se da smoke padne,
# i to TOCNO na tvrdnji o limitu po korisniku. Trazi zivu psql vezu, isto kao i sam smoke.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/supabase/migrations/0209_repair_limit_po_korisniku.sql"
SMOKE="$ROOT/scripts/repair-slot-per-user-smoke.sql"
BAK="$(mktemp)"
LOG="$(mktemp)"

cleanup() { cp "$BAK" "$MIG"; rm -f "$BAK" "$LOG"; }
trap cleanup EXIT

cp "$MIG" "$BAK"

python3 - "$MIG" <<'PY'
import re, sys
path = sys.argv[1]
src = open(path).read()
pattern = re.compile(r"  if p_max_per_user > 0\n(?:.*\n)*?  end if;\n")
if not pattern.search(src):
    sys.exit('mutacijska meta nije nadjena; azuriraj ovu skriptu zajedno s migracijom')
open(path, 'w').write(pattern.sub('  -- MUTACIJA: limit po korisniku uklonjen\n', src, count=1))
PY

if (cd "$ROOT" && psql -v ON_ERROR_STOP=1 -f "$SMOKE") > "$LOG" 2>&1; then
  echo "FAIL: smoke je PROSAO bez limita po korisniku, dakle ne mjeri RD-3." >&2
  exit 1
fi

if ! grep -q "A ne dobiva drugi slot (limit po korisniku)" "$LOG"; then
  echo "FAIL: smoke je pao, ali NE na tvrdnji o limitu po korisniku:" >&2
  cat "$LOG" >&2
  exit 1
fi

echo "OK: smoke pada bez limita po korisniku (mutacija uhvacena)."
