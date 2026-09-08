#!/usr/bin/env bash
set -euo pipefail
fixture=$(mktemp)
output=$(mktemp)
trap 'rm -f "$fixture" "$output"' EXIT
# Bez autoritativnog popravka mora se vidjeti stvarna mogucnost lazne potvrde.
sed '/^\\i .*agent_payload_deletion_authority.sql$/d' scripts/agent-payload-cleanup-smoke.sql > "$fixture"
if psql -v ON_ERROR_STOP=1 -f "$fixture" > "$output" 2>&1; then
  echo 'FAIL: cleanup smoke nije uhvatio uklonjenu zastitu'
  exit 1
fi
if ! grep -q 'AUTH_FINALIZE_ALLOWED' "$output"; then
  cat "$output"
  echo 'FAIL: mutacija nije pala na ocekivanom autoritetu'
  exit 1
fi
echo 'AGENT_PAYLOAD_CLEANUP_MUTATION_PASS'
