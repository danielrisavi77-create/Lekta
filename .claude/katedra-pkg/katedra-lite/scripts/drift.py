# -*- coding: utf-8 -*-
"""Drift SKILL.md-a: kartica naspram repoa, izmjereno a ne zapamćeno.

SKILL.md postoji na dva mjesta. Account skill (kartica u claude.ai) učitava se u
svakoj poruci i **on je izvor doktrine**; repo `katedra-pkg` nosi skripte, reference
i profile, a svoju kopiju SKILL.md-a samo prati. Pravilo (b) iz § 0.0 kaže da poslije
svake izmjene doktrine kroz karticu ista verzija ide i u repo, u istom commitu — ali
to je do sada bilo obećanje u prozi, a pravilo 20 zabranjuje baš to: provjera koja se
nije pokrenula izgleda identično kao provjera koja je prošla.

Ovaj alat je mjeri. Kartica je u sesiji na disku kao synced kopija, pa se razlika
računa, ne pamti. Traži se u `~/.claude/skills/synced/*/` (Claude Code) i u desktop
stablu `<APPDATA|Library|.config>/Claude/local-agent-mode-sessions/skills-plugin/*/*/`;
put se može i zadati s `--kartica` ili `KATEDRA_KARTICA`:

    python3 drift.py                      # kartica vs. repo kopija pored ove skripte
    python3 drift.py --kratko             # jedan redak za prvu poruku sesije
    python3 drift.py --json out.json
    python3 drift.py --kartica PUT --repo PUT

Izlazni kodovi: 0 = iste, 1 = razišle se, 2 = NIJE izmjereno (jedna strana nedostaje,
dvije različite kartice, greška ulaza). Dvojka nikad ne znači „uredno" — tiha nula nad
neizmjerenom razlikom bila bi isti kvar koji je pravilo 20 nastalo spriječiti.

Alat NE zna koja je verzija bolja i ne spaja ih. Smjer imenuje samo kad ga može
dokazati iz git povijesti; inače broji retke i to izgovara kao brojku, ne kao presudu.
"""
import argparse
import difflib
import glob
import hashlib
import io
import json
import os
import re
import subprocess
import sys

SLUG = "katedra-lite"
NASLOV = re.compile(r"^(#{1,4})\s+(.+?)\s*$")
POVIJEST_DUBINA = 300           # commita unatrag; dalje od toga smjer se ne dokazuje


def normaliziraj(tekst):
    """BOM, CRLF, repovi razmaka i prazni redci na kraju — razlika u njima nije doktrina."""
    tekst = tekst.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")
    redci = [r.rstrip() for r in tekst.split("\n")]
    while redci and not redci[-1]:
        redci.pop()
    return "\n".join(redci) + "\n"


def procitaj(put):
    with io.open(put, encoding="utf-8") as f:
        return f.read()


def sha(tekst):
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


def _desktop_baze():
    """Korijeni u kojima Claude desktop aplikacija drži svoje podatke, po platformama."""
    baze = []
    appdata = os.environ.get("APPDATA")
    if appdata:
        baze.append(os.path.join(appdata, "Claude"))
    baze.append(os.path.expanduser("~/AppData/Roaming/Claude"))              # Windows bez APPDATA
    baze.append(os.path.expanduser("~/Library/Application Support/Claude"))  # macOS
    baze.append(os.path.expanduser("~/.config/Claude"))                      # Linux
    out = []
    for b in baze:
        rb = os.path.realpath(b)
        if rb not in out and os.path.isdir(rb):
            out.append(rb)
    return out


def kandidati_desktop():
    """Kartice iz desktop stabla, NAJNOVIJA PRVA.

    Desktop aplikacija drži po jednu kopiju za svaku sesiju, u
    `local-agent-mode-sessions/skills-plugin/<sesija>/<workspace>/skills/<slug>/`.
    Stare sesije zato ostavljaju starije kopije iste kartice. Njih se NE broji kao
    „dvije različite kartice": među njima postoji poredak koji dvije `synced/`
    instalacije nemaju — aplikacija kopiju piše na početku sesije, pa je najnovija
    ona koja je u sesiji učitana. Uzima se najnovija, a ostale se izgovore kao
    preskočene (pravilo 20: preskočeno se kaže, ne prešuti).
    """
    nadeni = []
    for baza in _desktop_baze():
        uzorak = os.path.join(baza, "local-agent-mode-sessions", "skills-plugin",
                              "*", "*", "skills", SLUG, "SKILL.md")
        for p in glob.glob(uzorak):
            rp = os.path.realpath(p)
            if rp not in nadeni and os.path.isfile(rp):
                nadeni.append(rp)
    nadeni.sort(key=os.path.getmtime, reverse=True)
    return nadeni


def kandidati_kartice():
    """(putovi, biljeska). Klasični synced putovi + najnovija kopija iz desktop stabla."""
    uzorci = [
        os.path.expanduser("~/.claude/skills/synced/*/%s/SKILL.md" % SLUG),
        "/root/.claude/skills/synced/*/%s/SKILL.md" % SLUG,
        os.path.expanduser("~/.claude/skills/%s/SKILL.md" % SLUG),
        os.path.expanduser("~/.config/claude/skills/%s/SKILL.md" % SLUG),
    ]
    out = []
    for u in uzorci:
        for p in sorted(glob.glob(u)):
            rp = os.path.realpath(p)
            if rp not in out:
                out.append(rp)
    biljeska = None
    desktop = kandidati_desktop()
    if desktop:
        if desktop[0] not in out:
            out.append(desktop[0])
        razliciti = len(set(sha(normaliziraj(procitaj(x))) for x in desktop))
        if len(desktop) > 1 and razliciti > 1:
            biljeska = ("desktop stablo ima više kopija kartice i one nisu iste "
                        "(kopija: %d, verzija: %d) — uzeta najnovija (%s), "
                        "starije sesije preskočene"
                        % (len(desktop), razliciti, desktop[0]))
    return out, biljeska


def razrijesi_karticu(zadano):
    """(put, sadrzaj, razlog, biljeska). Dvije različite kartice = razlog, ne izbor."""
    if zadano:
        if not os.path.isfile(zadano):
            return None, None, "zadana kartica ne postoji: %s" % zadano, None
        return zadano, procitaj(zadano), None, None
    okolina = os.environ.get("KATEDRA_KARTICA")
    if okolina and os.path.isfile(okolina):
        return okolina, procitaj(okolina), None, None
    nadeni, biljeska = kandidati_kartice()
    if not nadeni:
        return None, None, ("synced kopija kartice nije nađena (traženo u "
                            "~/.claude/skills/synced/*/%s/, /root/.claude/skills/synced/*/%s/ "
                            "i u desktop stablu <APPDATA|Library|.config>/Claude/"
                            "local-agent-mode-sessions/skills-plugin/*/*/skills/%s/)"
                            % (SLUG, SLUG, SLUG)), None
    po_sadrzaju = {}
    for p in nadeni:
        po_sadrzaju.setdefault(sha(normaliziraj(procitaj(p))), []).append(p)
    if len(po_sadrzaju) > 1:
        return None, None, ("nađeno %d RAZLIČITIH kartica — ne zna se koja je učitana "
                            "(razriješi s --kartica PUT ili KATEDRA_KARTICA): %s"
                            % (len(po_sadrzaju), ", ".join(nadeni))), biljeska
    p = nadeni[0]
    return p, procitaj(p), None, biljeska


def usporedi_skripte(kartica_skill_md, repo_skill_md):
    """Popis i hash svake skripte u `scripts/` s obje strane (kvar 49).

    Vraća `{"izmjereno", "iste", "samo_kartica", "samo_repo", "razlicite"}`.
    Kad jedne strane nema, `izmjereno` je False i to se izgovara — neizmjereno
    nije isto što i jednako (željezno pravilo 20).
    """
    out = {"izmjereno": False, "iste": True, "samo_kartica": [], "samo_repo": [],
           "razlicite": []}
    mape = []
    for put in (kartica_skill_md, repo_skill_md):
        d = os.path.join(os.path.dirname(put or ""), "scripts")
        mape.append(d if put and os.path.isdir(d) else None)
    if not all(mape):
        # Kvar 54: „jedna strana nema scripts/" nije neutralno stanje kad je ta strana
        # KARTICA, a njezin SKILL.md imenuje scripts/*.py. To je najgori mogući ishod
        # (agent učitava router bez ijedne skripte), a alat ga je dosad prijavljivao
        # blaže od obične razlike. Mjeri se koliko datoteka router imenuje, a nema ih.
        if mape[1] and not mape[0] and kartica_skill_md:
            tekst = procitaj(kartica_skill_md) or ""
            imenovane = sorted(set(re.findall(r"scripts/([A-Za-z_0-9]+\.py)", tekst)))
            if imenovane:
                out["kartica_bez_scripts"] = True
                out["imenovane_a_nedostupne"] = imenovane
        return out
    popisi = []
    for d in mape:
        popisi.append({f: sha(procitaj(os.path.join(d, f)) or "")
                       for f in sorted(os.listdir(d)) if f.endswith(".py")})
    kart, repo = popisi
    out["izmjereno"] = True
    out["samo_kartica"] = sorted(set(kart) - set(repo))
    out["samo_repo"] = sorted(set(repo) - set(kart))
    out["razlicite"] = sorted(f for f in set(kart) & set(repo) if kart[f] != repo[f])
    out["iste"] = not (out["samo_kartica"] or out["samo_repo"] or out["razlicite"])
    out["broj_kartica"], out["broj_repo"] = len(kart), len(repo)
    return out


def _redak_skripti(s):
    if not s.get("izmjereno"):
        if s.get("kartica_bez_scripts"):
            im = s["imenovane_a_nedostupne"]
            return ("❗ skripte: KARTICA NEMA `scripts/` — njezin SKILL.md imenuje %d skripti "
                    "(%s…) kojih u kartici nema. U sesiji bez paketa nijedna nije dostupna; "
                    "svaki strojni korak ide kao „preskočeno“ (pravilo 8)."
                    % (len(im), ", ".join(im[:3])))
        return "⚠️  skripte: NIJE izmjereno — jedna strana nema mapu `scripts/`"
    if s["iste"]:
        return "✅ skripte: kartica i repo su iste (%d datoteka)" % s["broj_kartica"]
    dijelovi = []
    if s["razlicite"]:
        dijelovi.append("%d različitih (%s)" % (len(s["razlicite"]),
                                                ", ".join(s["razlicite"][:4])))
    if s["samo_repo"]:
        dijelovi.append("%d samo u repou (%s)" % (len(s["samo_repo"]),
                                                  ", ".join(s["samo_repo"][:4])))
    if s["samo_kartica"]:
        dijelovi.append("%d samo u kartici (%s)" % (len(s["samo_kartica"]),
                                                    ", ".join(s["samo_kartica"][:4])))
    return ("❌ skripte drift: " + "; ".join(dijelovi)
            + " — agent radi iz kartice, pa dokumentirana naredba zna ne postojati")


def repo_korijen(put_datoteke):
    try:
        out = subprocess.run(["git", "-C", os.path.dirname(put_datoteke), "rev-parse",
                              "--show-toplevel"], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=20)
        return out.stdout.strip() or None if out.returncode == 0 else None
    except Exception:
        return None


def smjer_iz_povijesti(korijen, rel_put, kartica_norm):
    """Ako sadržaj kartice = neka RANIJA verzija iz repoa → kartica zaostaje. Inače None."""
    if not korijen:
        return None
    # Kvar 127: `os.path.relpath` na Windowsu daje `katedra-lite\SKILL.md`, a
    # `git show <rev>:<put>` prima SAMO kosu crtu:
    #     fatal: path 'katedra-lite\SKILL.md' exists on disk, but not in '98e6bfc'
    # Svaki `show` je time padao, petlja nije nasla nista, i alat je javljao
    # „sadrzaj kartice NIJE nijedna ranija verzija iz repoa" — optuzbu da je
    # kartica rucno mijenjana, nad karticom koja je uredno jednu verziju iza.
    rel_put = str(rel_put).replace(os.sep, "/")
    try:
        # Kvar 127: `text=True` bez `encoding` dekodira git-ov izlaz kodnom
        # stranicom konzole. Na cp1250 `git show` nad SKILL.md-om baci
        # UnicodeDecodeError, `except Exception` ga proguta, i alat javi
        # „sadržaj kartice NIJE nijedna ranija verzija iz repoa" — optužbu
        # da je kartica ručno mijenjana, nad karticom koja je uredno jednu
        # verziju iza. Pravilo 20: alat koji je pukao nije provjera koja je
        # prošla, a najskuplji oblik je onaj u kojem pad izgleda kao nalaz.
        log = subprocess.run(["git", "-C", korijen, "log", "--format=%h %ad", "--date=short",
                              "-n", str(POVIJEST_DUBINA), "--", rel_put],
                             capture_output=True, text=True, encoding="utf-8",
                             errors="replace", timeout=60)
        if log.returncode != 0:
            return None
        for redak in log.stdout.splitlines():
            dio = redak.split(None, 1)
            if not dio:
                continue
            h = dio[0]
            datum = dio[1] if len(dio) > 1 else ""
            pok = subprocess.run(["git", "-C", korijen, "show", "%s:%s" % (h, rel_put)],
                                 capture_output=True, text=True, encoding="utf-8",
                                 errors="replace", timeout=30)
            if pok.returncode != 0:
                continue
            if sha(normaliziraj(pok.stdout)) == sha(kartica_norm):
                return {"commit": h, "datum": datum}
    except Exception as e:
        # Neuspjela pretraga NIJE nalaz da ranije verzije nema. Razlika je
        # cijeli sud o kartici, pa se kaže naglas (kvar 127).
        return {"greska": "%s: %s" % (type(e).__name__, e)}
    return None


def naslovi(tekst):
    out = []
    for r in tekst.split("\n"):
        m = NASLOV.match(r)
        if m:
            out.append("%s %s" % (m.group(1), m.group(2)))
    return out


def izmjeri(kartica_txt, repo_txt):
    a, b = normaliziraj(kartica_txt), normaliziraj(repo_txt)
    ar, br = a.split("\n"), b.split("\n")
    sm = difflib.SequenceMatcher(None, ar, br, autojunk=False)
    samo_kartica = samo_repo = 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ("delete", "replace"):
            samo_kartica += i2 - i1
        if tag in ("insert", "replace"):
            samo_repo += j2 - j1
    na, nb = naslovi(a), naslovi(b)
    return {
        "iste": a == b,
        "sha_kartica": sha(a)[:12],
        "sha_repo": sha(b)[:12],
        "bajtova_kartica": len(kartica_txt.encode("utf-8")),
        "bajtova_repo": len(repo_txt.encode("utf-8")),
        "redaka_samo_u_kartici": samo_kartica,
        "redaka_samo_u_repou": samo_repo,
        "sekcije_samo_u_kartici": [x for x in na if x not in nb],
        "sekcije_samo_u_repou": [x for x in nb if x not in na],
    }


def main():
    ap = argparse.ArgumentParser(description="Drift SKILL.md-a: kartica naspram repoa.")
    ap.add_argument("--kartica", help="put do account (synced) SKILL.md-a; inače se traži")
    ap.add_argument("--repo", help="put do repo SKILL.md-a; inače SKILL.md pored scripts/")
    ap.add_argument("--kratko", action="store_true", help="jedan redak, za prvu poruku sesije")
    ap.add_argument("--json", dest="json_out", help="zapiši nalaz kao JSON")
    a = ap.parse_args()

    repo_put = a.repo or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "SKILL.md")
    repo_put = os.path.realpath(repo_put)

    kartica_put, kartica_txt, razlog, biljeska = razrijesi_karticu(a.kartica)
    if razlog is None and not os.path.isfile(repo_put):
        razlog = "repo kopija ne postoji: %s" % repo_put

    if razlog:
        poruka = "⚠️  DRIFT NIJE IZMJEREN — %s" % razlog
        print(poruka if a.kratko else
              "=" * 72 + "\nDRIFT SKILL.md — kartica naspram repoa\n" + "=" * 72 + "\n" +
              poruka + "\n\nOvo NIJE nalaz da su verzije iste. Dok se razlika ne izmjeri,\n"
              "pravilo (b) iz § 0.0 stoji nepokriveno i ide u RUČNO PROVJERI (pravilo 8).")
        if a.json_out:
            io.open(a.json_out, "w", encoding="utf-8").write(
                json.dumps({"izmjereno": False, "razlog": razlog,
                            "biljeska": biljeska}, ensure_ascii=False, indent=2))
        return 2

    repo_txt = procitaj(repo_put)
    n = izmjeri(kartica_txt, repo_txt)
    korijen = repo_korijen(repo_put)
    rel = os.path.relpath(repo_put, korijen) if korijen else None
    povijest = None if n["iste"] else smjer_iz_povijesti(korijen, rel, normaliziraj(kartica_txt))

    # Kvar 127: tri ishoda, ne dva. „Pretraga je pukla" nije „kartica nije
    # nijedna ranija verzija" — druga rečenica optužuje da je kartica ručno
    # mijenjana, a prva kaže da se ne zna.
    if povijest and povijest.get("greska"):
        smjer = ("razlika je %d/%d redaka; pretraga ranijih verzija NIJE USPJELA "
                 "(%s) — smjer se ne tvrdi"
                 % (n["redaka_samo_u_kartici"], n["redaka_samo_u_repou"],
                    povijest["greska"]))
        povijest = None
    elif povijest:
        smjer = ("kartica zaostaje za repoom — njezin sadržaj je verzija iz commita %s (%s)"
                 % (povijest["commit"], povijest["datum"]))
    elif n["iste"]:
        smjer = "nema razlike"
    else:
        smjer = ("kartica ima %d redaka kojih repo nema, repo ima %d kojih kartica nema; "
                 "sadržaj kartice NIJE nijedna ranija verzija iz repoa"
                 % (n["redaka_samo_u_kartici"], n["redaka_samo_u_repou"]))

    n.update({"izmjereno": True, "kartica": kartica_put, "repo": repo_put, "smjer": smjer,
              "kartica_je_commit": povijest, "biljeska": biljeska})

    if a.json_out:
        io.open(a.json_out, "w", encoding="utf-8").write(
            json.dumps(n, ensure_ascii=False, indent=2))

    # Kvar 49: kartica se sinkronizira kao cjelina, pa može nositi identičan
    # SKILL.md uz starije `scripts/`. Mjereno na skillu `katedra`: SKILL.md isti,
    # a `kvar.py --nastavak-od` postoji samo u repou. Alat koji mjeri samo
    # doktrinu takvo stanje prijavljuje kao uredno.
    s = usporedi_skripte(kartica_put, repo_put)
    n["skripte"] = s

    if a.kratko:
        print("✅ SKILL.md: kartica i repo su iste (%s)" % n["sha_kartica"] if n["iste"]
              else "❌ SKILL.md drift: kartica %d B / repo %d B — %s"
                   % (n["bajtova_kartica"], n["bajtova_repo"], smjer))
        print(_redak_skripti(s))
        if biljeska:
            print("   ↳ %s" % biljeska)
        return 0 if (n["iste"] and s.get("iste", True)
                     and not s.get("kartica_bez_scripts")) else 1

    print("=" * 72)
    print("DRIFT SKILL.md — kartica naspram repoa")
    print("=" * 72)
    print("kartica: %s\n         %d B · %s" % (kartica_put, n["bajtova_kartica"], n["sha_kartica"]))
    print("repo:    %s\n         %d B · %s" % (repo_put, n["bajtova_repo"], n["sha_repo"]))
    if biljeska:
        print("   ↳ %s" % biljeska)
    print()
    if n["iste"]:
        print("✅ iste su (normalizirano: BOM, CRLF, repovi razmaka, prazni redci na kraju)")
        print("\nAlat uspoređuje sadržaj, ne kvalitetu doktrine — to čita čovjek.")
        return 0

    print("❌ razišle su se — %s" % smjer)
    for kljuc, opis in (("sekcije_samo_u_kartici", "sekcije samo u KARTICI"),
                        ("sekcije_samo_u_repou", "sekcije samo u REPOU")):
        if n[kljuc]:
            print("\n%s (%d):" % (opis, len(n[kljuc])))
            for s in n[kljuc][:12]:
                print("   %s" % s)
            if len(n[kljuc]) > 12:
                print("   … i još %d" % (len(n[kljuc]) - 12))
    print("""
Što s tim (§ 0.0, pravila (a) i (b)):
   (a) zakrpa koja mijenja SKILL.md piše se nad KARTICOM, nikad nad repo verzijom —
       inače commit vrati stariji router;
   (b) izmjena kroz karticu ide i u repo, u istom commitu.
Razliku pogledaj prije nego išta prepišeš:
   diff <(sed 's/[[:space:]]*$//' KARTICA) <(sed 's/[[:space:]]*$//' REPO)

Alat NE spaja verzije i ne zna koja je točna. Kaže samo da se razlikuju i koliko.""")
    return 1


if __name__ == "__main__":
    sys.exit(main())
