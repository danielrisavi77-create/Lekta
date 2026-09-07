#!/usr/bin/env bash
# katedra-pkg — okolina za jedan bash poziv.
# Svaki bash poziv u Cowork sesiji kreće iz čiste ljuske, pa se ovo source-a
# na početku SVAKOG poziva:   . "${KATEDRA_PKG:-$HOME/.katedra-pkg}/bin/env.sh"
#
# Izvozi: KATEDRA_PKG, KATEDRA_SKILL, RAD_AUDIT_HOME, RAD_DOCX_HOME,
#         FPZG_DIPLOMSKI_HOME, REPLIKACIJA_PSPP_HOME, RAD_ORCHESTRATOR_HOME,
#         KATEDRA_PKG_VERZIJA (opisna), KATEDRA_PKG_VERZIJA_DATOTEKA,
#         KATEDRA_PKG_COMMIT, KATEDRA_PKG_ZAOSTAJE
# Ne mijenja cwd. Ne ispisuje ništa osim uz KATEDRA_ENV_GLASNO=1.

_kp="${KATEDRA_PKG:-}"
if [ -z "$_kp" ]; then
  # tražimo korijen paketa: env → $HOME/.katedra-pkg → mapa ove skripte
  if [ -f "$HOME/.katedra-pkg/katedra-lite/scripts/gate.py" ]; then
    _kp="$HOME/.katedra-pkg"
  else
    _kp="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  fi
fi
export KATEDRA_PKG="$_kp"
export KATEDRA_SKILL="$KATEDRA_PKG/katedra-lite"
export RAD_AUDIT_HOME="$KATEDRA_PKG/rad-audit"
export RAD_DOCX_HOME="$KATEDRA_PKG/rad-docx"
export FPZG_DIPLOMSKI_HOME="$KATEDRA_PKG/fpzg-diplomski"
export REPLIKACIJA_PSPP_HOME="$KATEDRA_PKG/replikacija-pspp"
export RAD_ORCHESTRATOR_HOME="$KATEDRA_PKG/rad-orchestrator"
# Kvar 57: `VERSION` piše rukom onaj tko radi commit, pa zaostaje u tišini —
# izmjereno 5. 9. 2026.: datoteka je govorila 1.9.2, a repo je bio 16 commita
# dalje, s doktrinom v1.9.4. Sesija je tu brojku ispisivala kao činjenicu.
# Dok se ne veže uz commit, uz verziju ide i otisak commita i broj commita
# otkad se VERSION nije mijenjao. Zaostajanje se tako vidi bez pitanja.
export KATEDRA_PKG_VERZIJA_DATOTEKA="$(cat "$KATEDRA_PKG/VERSION" 2>/dev/null || echo nepoznato)"
export KATEDRA_PKG_COMMIT="$(git -C "$KATEDRA_PKG" rev-parse --short HEAD 2>/dev/null || true)"
# `--no-merges`: merge commit ne mijenja sadržaj, samo spaja. Bez toga svaki
# mergean PR odmah dodaje +1 i upozorenje je upaljeno stalno, pa prestaje značiti
# išta — mjereno nad ovim repoom: 4 commita „zaostatka", od toga 2 merge commita.
KATEDRA_PKG_ZAOSTAJE="$(git -C "$KATEDRA_PKG" rev-list --count --no-merges \
  "$(git -C "$KATEDRA_PKG" log -1 --format=%H -- VERSION 2>/dev/null)"..HEAD 2>/dev/null || true)"
export KATEDRA_PKG_ZAOSTAJE
if [ -z "$KATEDRA_PKG_COMMIT" ]; then
  export KATEDRA_PKG_VERZIJA="$KATEDRA_PKG_VERZIJA_DATOTEKA (bez gita — otisak se ne može provjeriti)"
elif [ -n "$KATEDRA_PKG_ZAOSTAJE" ] && [ "$KATEDRA_PKG_ZAOSTAJE" -gt 0 ] 2>/dev/null; then
  export KATEDRA_PKG_VERZIJA="$KATEDRA_PKG_VERZIJA_DATOTEKA ($KATEDRA_PKG_COMMIT · ❗ VERSION zaostaje $KATEDRA_PKG_ZAOSTAJE $([ "$KATEDRA_PKG_ZAOSTAJE" = 1 ] && echo commit || echo commita), v. kvar 57)"
else
  export KATEDRA_PKG_VERZIJA="$KATEDRA_PKG_VERZIJA_DATOTEKA ($KATEDRA_PKG_COMMIT)"
fi
unset _kp

if [ "${KATEDRA_ENV_GLASNO:-0}" = "1" ]; then
  echo "katedra-pkg $KATEDRA_PKG_VERZIJA @ $KATEDRA_PKG"
  for v in KATEDRA_SKILL RAD_AUDIT_HOME RAD_DOCX_HOME FPZG_DIPLOMSKI_HOME REPLIKACIJA_PSPP_HOME; do
    if [ -d "${!v}" ]; then echo "  ✅ $v"; else echo "  ❌ $v (nema mape)"; fi
  done
fi
