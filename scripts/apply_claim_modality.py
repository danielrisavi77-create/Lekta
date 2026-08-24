"""
Upisuje PRIJEDLOG modaliteta i opsega u ruleEntries, ali samo ondje gdje izvod nije dvojben.

    python scripts/apply_claim_modality.py            # suho, nista ne pise
    python scripts/apply_claim_modality.py --write    # stvarno upisuje

Granica koju ovaj skript NE prelazi: modalitet i opseg su OPIS CITATA (koja rijec u recenici nosi
obvezu, koji dio rada recenica imenuje), a ne presuda o tome smije li pravilo bodovati. Zato se
upisuju s `modalitySource: "mechanical"` i sami po sebi ne mijenjaju ni analizu ni ocjenu. Presudu
"boduje li se to" i dalje donosi covjek kroz `status`/`scored`, kao i dosad.

Dvojbene jedinice (`needsHuman`) se NE upisuju: one idu covjeku, jer su tocno onaj razred na kojem
je FER pilot pao (vise modalnih razina u istoj recenici, citat koji imenuje drugi dio rada, predlozak
umjesto propisa).

Upis je LINIJSKI, ne kroz ponovnu serijalizaciju JSON-a: osam draft datoteka drzi objekte u nizu u
jednom retku, pa bi `json.dumps` napravio 55 redaka kozmeticke razlike po datoteci i zatrpao stvarnu
izmjenu.
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PROPOSALS = os.path.join(ROOT, "docs", "generated", "claim-modality-proposals.json")

RULE_ID_LINE = re.compile(r'^(\s*)"ruleId"\s*:\s*"([^"]+)"\s*,\s*$')


def load_plan() -> dict[str, dict]:
    """ruleId -> {modality, scope} za jedinice koje ne traze covjeka.

    Skup pravila odredjuje PREDLAGAC (`propose_claim_modality.py`), koji od 2026-08-23 bira po
    IZVEDENOM `scored` (isRuleScored), ne po pohranjenoj zastavici. Ovaj upisivac ide po `ruleId` iz
    prijedloga, pa se sirenje skupa ovdje dogadja samo od sebe i ne treba mu vlastiti uvjet.
    """
    with open(PROPOSALS, encoding="utf-8") as fh:
        data = json.load(fh)
    plan: dict[str, dict] = {}
    for unit in data["proposals"]:
        if unit["needsHuman"]:
            continue
        if not unit["proposedModality"]:
            continue
        # UGOVOR, ozicen ovdje a ne samo u testu: mehanika smije upisati SAMO obvezujuce razine.
        # Prijedlog moze nositi i ublazene (12 recommendation, 8 permission u trenutnom izlazu); svi
        # su danas `needsHuman`, ali jedan flip te zastavice inace upisuje ublazen modalitet s
        # `modalitySource: "mechanical"`. Pripisivanje ublazavanja pravoj osi je citanje, ne uzorak.
        if unit["proposedModality"] not in ("obligation", "directive"):
            continue
        for rule_id in unit["ruleIds"]:
            plan[rule_id] = {"modality": unit["proposedModality"], "scope": unit["proposedScope"]}
    return plan


def existing_fields(path: str) -> dict[str, dict]:
    """Vec upisan modalitet po ruleId, da se ljudska potvrda nikad ne pregazi strojnim prijedlogom."""
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    groups = data["profiles"].items() if "profiles" in data else [(data.get("profileId"), data.get("entries", []))]
    out: dict[str, dict] = {}
    for _profile_id, entries in groups:
        for entry in entries or []:
            if entry.get("ruleId"):
                out[entry["ruleId"]] = entry
    return out


def main() -> None:
    write = "--write" in sys.argv
    plan = load_plan()
    stats = Counter()
    touched_files = 0

    for path in sorted(glob.glob(os.path.join(ROOT, "data", "profiles", "*", "drafts", "*.json"))):
        entries = existing_fields(path)
        if not any(rid in plan for rid in entries):
            continue
        with open(path, encoding="utf-8", newline="") as fh:
            raw = fh.read()
        newline = "\r\n" if "\r\n" in raw else "\n"
        lines = raw.replace("\r\n", "\n").split("\n")

        out: list[str] = []
        changed = False
        for line in lines:
            out.append(line)
            match = RULE_ID_LINE.match(line)
            if not match:
                continue
            indent, rule_id = match.group(1), match.group(2)
            proposal = plan.get(rule_id)
            if not proposal:
                continue
            entry = entries.get(rule_id, {})
            if entry.get("modalitySource") == "human":
                stats["preskoceno (ljudski potvrdjeno)"] += 1
                continue
            if entry.get("modality") == proposal["modality"] and entry.get("scope") == proposal["scope"]:
                stats["vec upisano"] += 1
                continue
            out.append(f'{indent}"modality": "{proposal["modality"]}",')
            out.append(f'{indent}"scope": "{proposal["scope"]}",')
            out.append(f'{indent}"modalitySource": "mechanical",')
            stats["upisano"] += 1
            changed = True

        if not changed:
            continue
        touched_files += 1
        if write:
            text = "\n".join(out)
            with open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(text.replace("\n", newline) if newline == "\r\n" else text)
            # Provjera odmah, ne kasnije: linijski upis mora ostati valjan JSON.
            with open(path, encoding="utf-8") as fh:
                json.load(fh)

    print("=== Upis modaliteta i opsega ===")
    print(f"jedinica u planu (bez dvojbenih): {len({v['modality'] for v in plan.values()})} razlicitih modaliteta, {len(plan)} pravila")
    for key, value in sorted(stats.items()):
        print(f"  {key}: {value}")
    print(f"  datoteka pogodjeno: {touched_files}")
    if not write:
        print("\nSUHO. Nista nije zapisano. Pokreni s --write kad si zadovoljan brojkama.")


if __name__ == "__main__":
    main()
