#!/usr/bin/env python3
"""Mjeri usmjeravanje: vodi li upit u katedra-lite (ili sestrinski skill) ili ne.

Zašto vlastiti harness, a ne `skill-creator/scripts/run_eval.py`: onaj harness
registrira privremenu kopiju skilla pod jedinstvenim imenom
(`katedra-lite-skill-<uuid>`) i broji okidanje samo ako se TO ime pojavi u ulazu
alata. Kad je pravi `katedra-lite` instaliran, on odgovori prvi, pod svojim
imenom, i harness to broji kao promašaj — 12/12 „should trigger" padne, a skill
je zapravo okinuo svaki put. Mjerilo je bilo pokvareno, ne opis.

Ovo mjeri uvjet koji Daniel doista ima: instalirana kartica, pravi upit, koji
skill odgovori prvi.

    ✅ should_trigger      prvi Skill poziv je iz obitelji katedra
    ✅ not should_trigger  prvi Skill poziv NIJE iz obitelji (ili ga nema)

Ograničenje koje se izriče u izvještaju: mjeri se opis KARTICE koja je
instalirana, ne onaj u repou. Ako se razlikuju, broj vrijedi za karticu.

    python3 katedra-lite/evals/pokreni_trigger.py --skup trigger_evals.json
    python3 katedra-lite/evals/pokreni_trigger.py --tiho   # samo zbroj + izlazni kod
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OVDJE = Path(__file__).resolve().parent
OBITELJ = {
    "katedra-lite", "katedra", "rad-audit", "rad-docx",
    "rad-orchestrator", "fpzg-diplomski", "replikacija-pspp",
}


def nadji_claude() -> str | None:
    """Put do `claude` CLI-ja, ili None.

    Kvar 124: bez ovoga `subprocess.run` baci FileNotFoundError [WinError 2] i
    mjerilo završi u tracebacku koji ne kaže što nedostaje. Desktop aplikacija
    (`AnthropicClaude/claude.exe`) NIJE ovaj alat — harness traži CLI koji zna
    `-p --output-format stream-json`.
    """
    return shutil.which("claude")


def prvi_skill(upit: str, timeout: int, model: str | None,
               mapa: str | None = None) -> dict:
    """Vrati {'skill': ime ili None, 'pozicija': int ili None, 'greska': str ili None}.

    Traži se PRVI Skill poziv u cijelom prijepisu, ne prvi alat uopće. Prva
    verzija ovog harnessa vraćala je „nije okinuo" čim prvi alat nije bio Skill,
    pa je upit koji je ručno okinuo `katedra-lite` ovdje pao: model je prvo
    pogledao `ls` ima li dokumenta, pa tek onda pozvao skill. Odgoda nije
    promašaj. Isti oblik greške kao u `run_eval.py` — mjerilo, ne opis.
    """
    # Kvar 128: `["claude", …]` na Windowsu ne postoji za CreateProcess —
    # izvršni oblik je `claude.CMD`. `nadji_claude()` ga nalazi (PATHEXT),
    # pa je provjera prolazila, a pokretanje padalo: provjera i radnja
    # tražile su različite stvari. Pokreće se točno ono što je provjereno.
    izvrsni = nadji_claude() or "claude"
    cmd = [izvrsni, "-p", upit, "--output-format", "stream-json", "--verbose"]
    if model:
        cmd += ["--model", model]
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    try:
        p = subprocess.run(
            cmd, capture_output=True, timeout=timeout, env=env,
            cwd=str(mapa or OVDJE), text=True, errors="replace",
        )
    except subprocess.TimeoutExpired:
        return {"skill": None, "pozicija": None, "greska": "timeout"}
    except FileNotFoundError:
        # Alat koji je pukao nije mjerenje koje je palo (pravilo 20).
        return {"skill": None, "pozicija": None, "greska": "nema `claude` CLI-ja"}
    n = 0
    razlog = None
    for redak in p.stdout.splitlines():
        redak = redak.strip()
        if not redak:
            continue
        try:
            e = json.loads(redak)
        except json.JSONDecodeError:
            continue
        # Kvar 128: prijepis nosi razlog neuspjeha, a harness je vraćao golo
        # „nema odgovora". Razlika je između „skill nije okinuo" i „sesija se
        # nije ni pokrenula" — prvo je nalaz o opisu, drugo o okolini.
        if e.get("type") == "result" and e.get("is_error"):
            razlog = str(e.get("result") or e.get("api_error_status") or "")[:200]
        if e.get("type") != "assistant":
            continue
        for c in e.get("message", {}).get("content", []):
            if c.get("type") != "tool_use":
                continue
            n += 1
            if c.get("name") == "Skill":
                return {
                    "skill": (c.get("input") or {}).get("skill"),
                    "pozicija": n,
                    "greska": None,
                }
    return {
        "skill": None,
        "pozicija": None,
        "greska": (razlog or (p.stderr or "").strip()[:200] or "nema odgovora")
                  if p.returncode else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--skup", default=str(OVDJE / "trigger_evals.json"))
    ap.add_argument("--izlaz", default=str(OVDJE / "trigger_rezultat.json"))
    ap.add_argument("--radnika", type=int, default=6)
    ap.add_argument("--timeout", type=int, default=180)
    ap.add_argument("--model", default=None)
    ap.add_argument("--ponavljanja", type=int, default=1,
                    help="pokretanja po upitu; okidanje se broji većinom. "
                         "Jedno pokretanje je bučno — isti upit zna okinuti u "
                         "jednom prolazu, a u drugom ne.")
    ap.add_argument("--mapa", default=None,
                    help="radna mapa u kojoj se upiti pokreću. Zadano: evals/. "
                         "Mjeri se drugi uvjet kad u mapi STOJI rad — model koji "
                         "nema dokument često prvo traži dokument umjesto da "
                         "učita skill, pa je odziv u praznoj mapi donja granica.")
    ap.add_argument("--tiho", action="store_true")
    a = ap.parse_args()

    # Prije nego se pošalje ijedan upit: alat mora postojati. Bez ovoga se
    # 24 × --ponavljanja poslova rasprši u tracebacke iz kojih se ne vidi
    # da uopće nije bilo mjerenja (kvar 124).
    if not nadji_claude():
        print("❌ `claude` CLI nije pronađen u PATH-u — mjerenje se ne može izvesti.",
              file=sys.stderr)
        print("   Ovo NIJE nalaz o opisu skilla, nego o okolini.", file=sys.stderr)
        print("   Desktop aplikacija nije taj alat; treba CLI koji zna", file=sys.stderr)
        print("   `claude -p --output-format stream-json`.", file=sys.stderr)
        return 2

    mapa = a.mapa or str(OVDJE)

    skup = json.loads(Path(a.skup).read_text(encoding="utf-8"))
    poslovi = [(i, s) for i, s in enumerate(skup) for _ in range(a.ponavljanja)]
    with ThreadPoolExecutor(max_workers=a.radnika) as ex:
        odgovori = list(ex.map(
            lambda t: (t[0], prvi_skill(t[1]["query"], a.timeout, a.model, mapa)), poslovi
        ))

    po_upitu: dict[int, list[dict]] = {}
    for i, odg in odgovori:
        po_upitu.setdefault(i, []).append(odg)

    redci, tocno = [], 0
    for i, stavka in enumerate(skup):
        prolazi = po_upitu.get(i, [])
        # Kvar 131: prolaz koji je pukao (timeout, pad sesije) nije prolaz u
        # kojem skill nije okinuo. Brojanje takvog prolaza kao promašaja
        # spušta stopu i pretvara kvar okoline u nalaz o opisu — isti oblik
        # kao kvarovi 121, 124 i 128. U nazivnik ulaze samo IZMJERENI prolazi.
        izmjereni = [o for o in prolazi if not o.get("greska") or o.get("skill")]
        okidanja = [(o["skill"] in OBITELJ) if o["skill"] else False
                    for o in izmjereni]
        stopa = sum(okidanja) / len(okidanja) if okidanja else 0.0
        okinuo = stopa > 0.5 and bool(izmjereni)
        ok = okinuo == stavka["should_trigger"]
        tocno += ok
        redci.append({
            "upit": stavka["query"],
            "ocekivano": stavka["should_trigger"],
            "okinuo": okinuo,
            "stopa": round(stopa, 2),
            "prolaza": len(prolazi),
            "izmjereno": len(izmjereni),
            "skill": next((o["skill"] for o in prolazi if o["skill"]), None),
            "pozicija": next((o["pozicija"] for o in prolazi if o["skill"]), None),
            "greska": next((o["greska"] for o in prolazi if o["greska"]), None),
            "prolaz": ok,
        })

    ukupno = len(redci)
    izv = {
        "ukupno": ukupno,
        "ponavljanja": a.ponavljanja,
        "tocno": tocno,
        "tocnost": round(tocno / ukupno, 3) if ukupno else 0.0,
        "napomena": (
            "Mjeri opis KARTICE koja je instalirana u sesiji, ne onaj u repou. "
            "Ako se verzije razlikuju, broj vrijedi za karticu."
        ),
        "mapa": mapa,
        "radova_u_mapi": len(list(Path(mapa).glob("*.docx"))),
        "ograničenje": (
            ("Upiti se pokreću u mapi bez .docx-a (%s). Model koji nema dokument "
             "često prvo traži dokument umjesto da učita skill, pa je odziv ovdje "
             "DONJA GRANICA, ne stvarni." % mapa)
            if not list(Path(mapa).glob("*.docx")) else
            ("U radnoj mapi (%s) stoji %d .docx — mjeri se uvjet u kojem rad postoji, "
             "pa je odziv usporediv sa stvarnim radom, ne donja granica."
             % (mapa, len(list(Path(mapa).glob("*.docx")))))
        ) + (
            " Redak s 33 % nije „ne okida”, nego „okida nepouzdano”; sud o opisu "
            "nose samo retci s 0 %."
        ),
        "redci": redci,
    }
    Path(a.izlaz).write_text(
        json.dumps(izv, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if not a.tiho:
        for r in redci:
            znak = "✅" if r["prolaz"] else "❌"
            koji = r["skill"] or "—"
            poz = f"#{r['pozicija']}" if r.get("pozicija") else "  "
            mjera = ("" if r.get("izmjereno") == r.get("prolaza")
                     else f" [{r.get('izmjereno')}/{r.get('prolaza')} izmjereno]")
            print(f"{znak} [{'DA ' if r['ocekivano'] else 'NE '}] {koji:<18} "
                  f"{poz:<4} {r['stopa']:.0%}{mjera}  {r['upit'][:56]}")
        print()
    print(f"{tocno}/{ukupno} točno ({izv['tocnost']:.0%}) → {a.izlaz}")
    return 0 if tocno == ukupno else 1


if __name__ == "__main__":
    raise SystemExit(main())
