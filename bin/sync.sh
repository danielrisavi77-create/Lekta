#!/usr/bin/env bash
# katedra-pkg — dohvat ili osvježavanje paketa. Idempotentno; tiho kad je sve u redu.
#
#   bin/sync.sh                 # pull ako je repo tu; inače clone iz KATEDRA_PKG_URL
#   KATEDRA_PKG_URL=https://…   # remote (privatni repo: token u URL-u ili ssh ključ)
#   KATEDRA_PKG=~/.katedra-pkg  # odredište (zadano)
#
# Izlazni kod: 0 = paket spreman (svjež ili lokalan), 1 = paketa nema i clone nije uspio.
# Nikad ne ruši lokalne izmjene: pull je --ff-only; ako ne prođe, ostaje lokalna kopija uz ⚠️.

set -u
DEST="${KATEDRA_PKG:-$HOME/.katedra-pkg}"
URL="${KATEDRA_PKG_URL:-}"

if [ -d "$DEST/.git" ]; then
  if [ -n "$URL" ] && [ "$(git -C "$DEST" remote get-url origin 2>/dev/null)" != "$URL" ]; then
    git -C "$DEST" remote set-url origin "$URL" 2>/dev/null || git -C "$DEST" remote add origin "$URL"
  fi
  # __pycache__ koje skripte ostave nisu u repou, ali blokiraju --ff-only pull kad
  # se u novoj verziji pojavi datoteka istog imena; čiste se prije pulla.
  find "$DEST" -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null
  if git -C "$DEST" remote get-url origin >/dev/null 2>&1; then
    if out=$(git -C "$DEST" pull -q --ff-only 2>&1); then
      :
    else
      echo "⚠️ katedra-pkg: pull nije prošao (${out%%$'\n'*}) — radim s lokalnom kopijom $(cat "$DEST/VERSION" 2>/dev/null)"
    fi
  fi
  exit 0
fi

if [ -n "$URL" ]; then
  if git clone -q --depth 1 "$URL" "$DEST" 2>/dev/null; then
    echo "katedra-pkg $(cat "$DEST/VERSION" 2>/dev/null) kloniran u $DEST"
    exit 0
  fi
  echo "❌ katedra-pkg: clone iz $URL nije uspio (mreža/token?)"
  exit 1
fi

echo "❌ katedra-pkg: nema $DEST i KATEDRA_PKG_URL nije zadan"
exit 1
