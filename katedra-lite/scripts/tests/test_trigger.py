#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testovi za katedra-lite/evals/pokreni_trigger.py — mjerilo usmjeravanja.

Kvar 124: harness je bez instaliranog `claude` CLI-ja padao u
`FileNotFoundError [WinError 2]`, iz kojega se ne vidi da mjerenja uopće nije
bilo. Uz to je radnu mapu imao ukovanu, pa se drugi uvjet iz vlastitog
ograničenja („isti skup, ali s radom u mapi") nije dao izmjeriti.

Sam odziv modela ovdje se ne mjeri — to traži živi model. Mjeri se da harness
kaže istinu o tome je li mogao mjeriti i gdje je mjerio.
"""
import importlib.util
import os
import sys
import tempfile
import threading

TU = os.path.dirname(os.path.abspath(__file__))
KORIJEN = os.path.dirname(os.path.dirname(TU))
HARNESS = os.path.join(KORIJEN, "evals", "pokreni_trigger.py")

_spec = importlib.util.spec_from_file_location("pokreni_trigger", HARNESS)
pt = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pt)

PALO = []
SVE = []


def check(naziv, uvjet, detalj=""):
    # Kvar 125: broj u izvještaju mora se BROJATI, ne tvrditi. Ukovana
    # konstanta („%d/%d" % (6 - len(PALO), 6)) razmakne se čim se doda
    # provjera, i onda suite javlja 6/6 dok ih je pokrenuo sedam. Taj broj
    # čita `zakrpa.py --provjeri-tvrdnje`, pa laž putuje dalje.
    SVE.append(naziv)
    print("  %-8s %s" % ("✓" if uvjet else "✗ FAIL", naziv))
    if not uvjet:
        PALO.append(naziv)
        if detalj:
            print("           detalj: %r" % (detalj,))


class LazniRun:
    """Bilježi kako je subprocess.run pozvan i glumi zadani ishod."""

    def __init__(self, ishod=None):
        self.ishod = ishod
        self.poziv = None

    def __call__(self, cmd, **kw):
        self.poziv = (cmd, kw)
        if isinstance(self.ishod, Exception):
            raise self.ishod
        return self.ishod


class LazniIzlaz:
    def __init__(self, stdout="", returncode=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


class LazniNiz:
    """Vraća zadane ishode redom; isti upit, različiti prolazi."""

    def __init__(self, ishodi):
        self.ishodi = list(ishodi)
        self.brava = threading.Lock()

    def __call__(self, cmd, **kw):
        with self.brava:
            ishod = self.ishodi.pop(0)
        if isinstance(ishod, Exception):
            raise ishod
        return ishod


def main():
    print("=" * 70)
    print("TESTOVI pokreni_trigger.py")
    print("=" * 70)

    stari = pt.subprocess.run

    # R59: alat kojega nema je greška o okolini, ne pad mjerila
    pt.subprocess.run = LazniRun(FileNotFoundError(2, "nema"))
    r = pt.prvi_skill("upit", 5, None)
    check("R59: nedostatak CLI-ja je zapisana greška, ne traceback",
          r["greska"] and "claude" in r["greska"] and r["skill"] is None, r)
    check("R59: zapis ima sve ključeve koje izvještaj čita",
          {"skill", "pozicija", "greska"} <= set(r), sorted(r))

    # R59b: isto vrijedi za timeout
    pt.subprocess.run = LazniRun(pt.subprocess.TimeoutExpired("claude", 5))
    r = pt.prvi_skill("upit", 5, None)
    check("R59: timeout ima iste ključeve", {"skill", "pozicija", "greska"} <= set(r), r)

    # R60: radna mapa se prosljeđuje — bez toga se drugi uvjet ne da izmjeriti
    mapa = tempfile.mkdtemp()
    lazni = LazniRun(LazniIzlaz(""))
    pt.subprocess.run = lazni
    pt.prvi_skill("upit", 5, None, mapa)
    check("R60: --mapa postaje cwd upita", lazni.poziv[1].get("cwd") == mapa,
          lazni.poziv[1].get("cwd"))

    lazni2 = LazniRun(LazniIzlaz(""))
    pt.subprocess.run = lazni2
    pt.prvi_skill("upit", 5, None)
    check("R60: bez --mapa ostaje evals/", lazni2.poziv[1].get("cwd") == str(pt.OVDJE),
          lazni2.poziv[1].get("cwd"))

    # R61: prvi Skill poziv se traži BILO GDJE u prijepisu, ne samo kao prvi alat
    import json as _json
    redci = "\n".join(_json.dumps(x, ensure_ascii=False) for x in [
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Bash", "input": {}}]}},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Skill", "input": {"skill": "katedra-lite"}}]}},
    ])
    pt.subprocess.run = LazniRun(LazniIzlaz(redci))
    r = pt.prvi_skill("upit", 5, None)
    check("R61: Skill nakon drugog alata i dalje je okidanje",
          r["skill"] == "katedra-lite" and r["pozicija"] == 2, r)

    # R62: alat se traži prije nego se pošalje ijedan upit
    stara_which = pt.shutil.which
    pt.shutil.which = lambda ime: None
    check("R62: nadji_claude() javlja da alata nema", pt.nadji_claude() is None)
    pt.shutil.which = lambda ime: "/put/do/claude"
    check("R62: nadji_claude() vraća put kad alat postoji",
          pt.nadji_claude() == "/put/do/claude")
    pt.shutil.which = stara_which

    # R67: pokreće se točno onaj put koji je provjera potvrdila. Na Windowsu
    #      izvršni oblik je `claude.CMD`; golo ime ne postoji za CreateProcess,
    #      pa je provjera prolazila a pokretanje padalo (kvar 128).
    stara_which2 = pt.shutil.which
    pt.shutil.which = lambda ime: "/put/do/claude.CMD"
    lazni3 = LazniRun(LazniIzlaz(""))
    pt.subprocess.run = lazni3
    pt.prvi_skill("upit", 5, None)
    check("R67: pokreće se put iz nadji_claude(), ne golo ime",
          lazni3.poziv[0][0] == "/put/do/claude.CMD", lazni3.poziv[0][:2])
    pt.shutil.which = stara_which2

    # R68: razlog neuspjeha iz prijepisa stiže u izvještaj. „nema odgovora"
    #      ne razlikuje „skill nije okinuo" od „sesija se nije ni pokrenula".
    import json as _j
    greska_redak = _j.dumps({"type": "result", "is_error": True,
                             "result": "Failed to authenticate: OAuth session expired"})
    pt.subprocess.run = LazniRun(LazniIzlaz(greska_redak, returncode=1))
    rg = pt.prvi_skill("upit", 5, None)
    check("R68: razlog neuspjeha stiže u izvještaj",
          rg["greska"] and "authenticate" in rg["greska"], rg)

    pt.subprocess.run = LazniRun(LazniIzlaz("", returncode=1))
    rg2 = pt.prvi_skill("upit", 5, None)
    check("R68: bez razloga ostaje stara poruka",
          rg2["greska"] == "nema odgovora", rg2)

    # R69: prolaz koji je pukao (timeout) nije prolaz u kojem skill nije
    #      okinuo. U nazivnik ulaze samo izmjereni prolazi (kvar 131).
    import json as _js
    pogodak = _js.dumps({"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "Skill", "input": {"skill": "katedra-lite"}}]}})
    mapa = tempfile.mkdtemp()
    skup = os.path.join(mapa, "skup.json")
    izlaz = os.path.join(mapa, "rez.json")
    with open(skup, "w", encoding="utf-8", newline="\n") as f:
        f.write(_js.dumps([{"query": "u", "should_trigger": True}]))

    stara_which3 = pt.shutil.which
    stari_argv = sys.argv
    pt.shutil.which = lambda ime: "/put/do/claude"
    pt.subprocess.run = LazniNiz([
        pt.subprocess.TimeoutExpired("claude", 5),
        LazniIzlaz(pogodak), LazniIzlaz(pogodak)])
    sys.argv = ["pokreni_trigger.py", "--skup", skup, "--izlaz", izlaz,
                "--mapa", mapa, "--ponavljanja", "3", "--radnika", "1", "--tiho"]
    try:
        pt.main()
    finally:
        sys.argv = stari_argv
        pt.shutil.which = stara_which3
    with open(izlaz, encoding="utf-8") as f:
        rez = _js.load(f)["redci"][0]
    check("R69: timeout ne ulazi u nazivnik (2 od 3 prolaza mjerena)",
          rez["stopa"] == 1.0 and rez["izmjereno"] == 2 and rez["prolaza"] == 3, rez)
    check("R69: takav red se broji kao okinuo", rez["okinuo"] is True, rez)

    pt.subprocess.run = stari
    print("=" * 70)
    print("REZULTATI TESTOVA: %d/%d prošlo"
          % (len(SVE) - len(PALO), len(SVE)))
    print("=" * 70)
    return 1 if PALO else 0


if __name__ == "__main__":
    sys.exit(main())
