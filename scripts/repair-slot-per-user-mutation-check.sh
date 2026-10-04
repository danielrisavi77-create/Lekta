#!/usr/bin/env bash
# Dokaz da repair-slot-per-user smoke GRIZE (T84 RD-3, RD-2 retencija i prava).
#
# Iz migracije 0209 se namjerno ukloni jedna zastita i trazi se da smoke padne, i to TOCNO na
# tvrdnji o toj zastiti. Svaka mutacija ide nad svjezom kopijom migracije. Trazi zivu psql vezu,
# isto kao i sam smoke.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/supabase/migrations/0209_repair_limit_po_korisniku.sql"
SMOKE="$ROOT/scripts/repair-slot-per-user-smoke.sql"
BAK="$(mktemp)"
LOG="$(mktemp)"

cleanup() { cp "$BAK" "$MIG"; rm -f "$BAK" "$LOG"; }
trap cleanup EXIT

cp "$MIG" "$BAK"

# mutate <ime> <ocekivana tvrdnja> : python iz stdin-a mijenja migraciju (regex, tocno jedan pogodak).
mutate() {
  local name="$1" expect="$2"
  cp "$BAK" "$MIG"
  python3 - "$MIG" "$name"
  if (cd "$ROOT" && psql -v ON_ERROR_STOP=1 -f "$SMOKE") > "$LOG" 2>&1; then
    echo "FAIL: smoke je PROSAO uz mutaciju '$name', dakle je ne mjeri." >&2
    exit 1
  fi
  if ! grep -q "$expect" "$LOG"; then
    echo "FAIL: smoke je uz mutaciju '$name' pao, ali NE na tvrdnji '$expect':" >&2
    cat "$LOG" >&2
    exit 1
  fi
  echo "OK: mutacija '$name' uhvacena na tvrdnji '$expect'."
}

mutate 'limit po korisniku uklonjen' 'A ne dobiva drugi slot (limit po korisniku)' <<'PY'
import re, sys
path = sys.argv[1]
src = open(path).read()
pattern = re.compile(r"  if p_max_per_user > 0\n(?:.*\n)*?  end if;\n")
if not pattern.search(src):
    sys.exit('mutacijska meta nije nadjena; azuriraj ovu skriptu zajedno s migracijom')
open(path, 'w').write(pattern.sub('  -- MUTACIJA: limit po korisniku uklonjen\n', src, count=1))
PY

mutate 'bez izricitog prava service_role na RPC' 'service_role ima execute' <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()
target = 'grant execute on function public.try_acquire_repair_slot_for_user(int, int, uuid, int) to service_role;\n'
if src.count(target) != 1:
    sys.exit('mutacijska meta nije nadjena; azuriraj ovu skriptu zajedno s migracijom')
open(path, 'w').write(src.replace(target, '-- MUTACIJA: bez granta\n'))
PY

mutate 'bez izricitog prava service_role na tablicu' 'permission denied for table repair_attempt_log' <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()
target = 'grant select, insert, update, delete on table public.repair_attempt_log to service_role;\n'
if src.count(target) != 1:
    sys.exit('mutacijska meta nije nadjena; azuriraj ovu skriptu zajedno s migracijom')
open(path, 'w').write(src.replace(target, '-- MUTACIJA: bez granta\n'))
PY

mutate 'pg_cron nije obvezan' 'FAIL migracija je prosla bez pg_crona' <<'PY'
import re, sys
path = sys.argv[1]
src = open(path).read()
pattern = re.compile(r"  if to_regprocedure\('cron\.schedule\(text,text,text\)'\) is null(?:.*\n)*?  end if;\n")
if not pattern.search(src):
    sys.exit('mutacijska meta nije nadjena; azuriraj ovu skriptu zajedno s migracijom')
src = pattern.sub("  if to_regclass('cron.job') is null then return; end if; -- MUTACIJA: tiho bez retencije\n", src, count=1)
open(path, 'w').write(src)
PY

mutate 'drugi prolaz uvijek zamjenjuje posao' 'drugi prolaz ne dira isti posao' <<'PY'
import re, sys
path = sys.argv[1]
src = open(path).read()
pattern = re.compile(r"  if exists \(select 1 from cron\.job where jobname = v_name and schedule = v_schedule and command = v_command\) then\n    return;\n  end if;\n")
if not pattern.search(src):
    sys.exit('mutacijska meta nije nadjena; azuriraj ovu skriptu zajedno s migracijom')
open(path, 'w').write(pattern.sub('  -- MUTACIJA: bez provjere istog posla\n', src, count=1))
PY

echo "OK: sve mutacije 0209 uhvacene."
