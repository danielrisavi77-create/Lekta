#!/usr/bin/env python3
"""Jedan orkestrator provjera po fazama rada.

Zašto postoji
-------------
Do v1.3 je ``references/predaja.md`` tražio da agent zapamti desetak naredbi, u
točnom redoslijedu, sa svojim zastavicama. Preskočena naredba nije proizvodila
nikakvu poruku — provjera koja se nije pokrenula izgleda identično kao provjera
koja je prošla. To je najvjerojatniji način da lanac padne u stvarnoj sesiji, i
jedini kvar u paketu koji se ne vidi ni na jednom izlaznom kodu.

Što radi
--------
Pokreće propisane provjere za fazu, redom, i svaki korak svrstava u jedno od
četiri stanja. Razlika između zadnja dva je bit ove skripte:

* ``ok``          — provjera je prošla;
* ``nalaz``       — provjera je našla problem (izlazni kod 1);
* ``preskočeno``  — ulaz ne postoji; razlog se ISPISUJE, ne prešućuje (pravilo 8);
* ``alat pukao``  — provjera se srušila ili je odbila ulaz (izlazni kod ≥ 2).

Alat koji je pukao **nije** provjera koja je prošla. Prije ovoga su ta dva
stanja u praksi izgledala isto, jer ih je čovjek razlikovao po tekstu na ekranu.

Ne zamjenjuje reference. ``predaja.md`` i dalje nosi ono što alat ne može
provjeriti (potpis izjave, zvanje mentora, Update Field u Wordu).
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import time
from datetime import datetime

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import context  # noqa: E402
import vjestine  # noqa: E402

FAZE = ("plan", "pisanje", "audit", "predaja")

# Kvar 112: do v1.9.9 su „provjera se NIJE POKRENULA" i „provjera se JE pokrenula
# i utvrdila da se na ovaj rad ne odnosi" bile isto stanje. Nakon kvara 58
# preskočeno blokira, pa je pravni rad bez hipoteza i bez p-vrijednosti PADAO na
# fazi audit, iako su obje provjere uredno odradile svoj posao i rekle da nemaju
# što mjeriti. Pravilo 20 razlikuje pad od prolaza; ovo je ista razlika jedan
# stupanj finije:
#
#   ok             provjera je prošla
#   nalaz          provjera je našla problem                     → blokira
#   neprimjenjivo  provjera se izvela i NE ODNOSI se na ovaj rad → ne blokira
#   preskočeno     provjera se NIJE izvela, nema ulaza           → blokira
#   pukao          provjera se srušila                           → blokira
OK, NALAZ, PRESKOCENO, PUKAO = "ok", "nalaz", "preskoceno", "pukao"
NEPRIMJENJIVO = "neprimjenjivo"
# Kvar 152: pozivatelj koji NE ŽELI pokrenuti korak (forma provjerava drugi sustav) imao
# je samo --dopusti-preskok, a taj oprašta korak kojemu FALI ULAZ — korak s ulazom se
# i dalje pokretao. Isključenje je zasebno stanje: upisano, vidljivo, ne blokira.
ISKLJUCENO = "iskljuceno"
ZNAK = {OK: "✅", NALAZ: "❌", PRESKOCENO: "➖", PUKAO: "💥",
        NEPRIMJENJIVO: "◦", ISKLJUCENO: "⊘"}


class Korak:
    """Jedan korak faze.

    ``covjek=True`` znači: korak po svojoj naravi traži čovjeka, bez obzira na
    ishod (npr. obavezno čitanje tijela rada, pravilo 31). To je zaseban podatak
    od ``blokira``: blokirajući korak koji prođe ne traži nikoga, a ljudski
    korak traži čovjeka i kad je sve zeleno. Mjeri se jer je broj ljudskih
    koraka po fazi jedina brojka koja kaže koliko je lanac daleko od toga da
    ga korisnik vozi sam.
    """

    def __init__(self, kid, naziv, argv, *, blokira=True, treba=(),
                 satelit=None, zasto="", covjek=False):
        self.kid = kid
        self.naziv = naziv
        self.argv = argv
        self.blokira = blokira
        self.treba = list(treba)
        self.satelit = satelit
        self.zasto = zasto
        self.covjek = covjek


def _k(*dijelovi):
    return [sys.executable, os.path.join(SKRIPTE, dijelovi[0]), *dijelovi[1:]]


MOD_FAZE = {"plan": "1", "pisanje": "2", "audit": "4", "predaja": "6"}


def _ucitavanje(faza, kat):
    """Prvi korak svake faze: što se mora pročitati na OVOM projektu.

    Ide prije provjera jer je jeftin, savjetodavan i mijenja ono što slijedi —
    provjera pokrenuta bez pročitanog protokola daje nalaz koji nitko ne zna
    protumačiti.
    """
    return Korak("ucitavanje", "što se mora pročitati na ovom projektu",
                 _k("ucitavanje.py", "--mod", MOD_FAZE[faza], "--kat", kat),
                 blokira=False,
                 zasto="popis je izveden iz stanja, ne fiksan (pravilo 25)")



def _revizije(rad, kat):
    """Prvi korak nad .docx-om: ima li praćenih izmjena.

    Željezno pravilo 30. Ekstrakcija nad dokumentom s Track Changes čita krivi
    tekst — obrisani odlomci se broje, umetnuti ne — pa je svaki idući nalaz
    izmjeren nad tekstom koji ne postoji. Do v1.9.4 je to pravilo živjelo samo
    u prozi i nije imalo izvršitelja.
    """
    return Korak("revizije", "praćene izmjene (Track Changes) prihvaćene",
                 _k("revizije.py", "provjeri", rad,
                    "--json", os.path.join(kat, "revizije.json")),
                 treba=[rad],
                 zasto="ekstrakcija nad praćenim izmjenama mjeri tekst koji ne postoji")


def koraci(faza: str, c: dict) -> list[Korak]:
    """Popis koraka za fazu. Redoslijed je ugovor, ne preporuka."""
    rad, pdf, profil, tip, kat = c["rad"], c["pdf"], c["profil"], c["tip"], c["kat"]
    korijen_izvora = os.path.dirname(os.path.abspath(kat.rstrip("/")))
    claims = os.path.join(kat, "claims.jsonl")
    evidence = os.path.join(kat, "evidence.jsonl")
    izvori = os.path.join(kat, "izvori.json")

    if faza == "plan":
        return [
            _ucitavanje(faza, kat),
            Korak("perspektive", "perspective map (2+ perspektive)",
                  _k("perspective_map.py", "--kat", kat, "validate",
                     "--work-type", tip or "diplomski"),
                  zasto="bez njega PLAN GATE blokira uvoz strukture"),
            Korak("plan", "PLAN GATE (teza, struktura, izvori)",
                  _k("plan_state.py", "--kat", kat, "status"),
                  zasto="nijedno poglavlje završnog/diplomskog prije odobrenog plana"),
            Korak("dijelovi", "os dijelova — što rad uopće mora imati",
                  _k("dijelovi.py", "--kat", kat, "--status"),
                  blokira=False,
                  zasto="popis dijelova i ono što nitko ne provjerava"),
            Korak("pretraga", "strategija pretrage i plan čitanja",
                  _k("pretraga.py", "--kat", kat, "status"),
                  blokira=False,
                  zasto="na obrani se pita „kako ste došli do ove literature”"),
            Korak("grill", "sokratski stress-test plana",
                  _k("grill_me.py", "--kat", kat, "status"),
                  blokira=False, zasto="advisory; ne blokira gate"),
        ]

    if faza == "pisanje":
        return [
            _ucitavanje(faza, kat),
            _revizije(rad, kat),
            Korak("evidence", "strict evidence gate",
                  _k("evidence_gate.py", "--claims", claims, "--evidence", evidence,
                     "--sources", izvori, "--policy", "strict",
                     "--out", os.path.join(kat, "evidence_gate.json")),
                  treba=[claims, evidence],
                  zasto="unsupported/conflicted/contradicted ne ulaze u tekst"),
            Korak("zamjerke", "otvorene zamjerke mentora",
                  _k("zamjerke.py", "--kat", kat, "provjeri"),
                  treba=[os.path.join(kat, "zamjerke.json")],
                  zasto="zamjerka spomenuta u intakeu pa zaboravljena je najskuplja greška"),
            Korak("jezik", "hrvatski pravopis i gramatika",
                  _k("provjeri_jezik.py", rad,
                     "--json", os.path.join(kat, "jezik.json")),
                  treba=[rad], blokira=False,
                  zasto="ono što mentor zaokruži crvenim"),
            Korak("tempo", "opseg naspram dana do roka",
                  _k("tempo.py", "--kat", kat, "--profil", profil),
                  treba=[os.path.join(kat, "plan.json")], blokira=False,
                  zasto="hodogram postoji tek u modu 6, a tada je kasno"),
            Korak("stil", "tragovi generiranog teksta",
                  _k("check_ai_style.py", rad), treba=[rad], blokira=False),
            Korak("argument", "teza i zaključak",
                  _k("check_argument.py", rad, "--profil", profil,
                     "--json", os.path.join(kat, "arg.json")),
                  treba=[rad, profil], blokira=False,
                  zasto="forma nije argument (željezno pravilo 11)"),
            Korak("dijelovi", "os dijelova — je li koji obavezan dio netaknut",
                  _k("dijelovi.py", "--kat", kat, "--provjeri", "--faza", "pisanje"),
                  blokira=False),
        ]

    if faza == "audit":
        return [
            _ucitavanje(faza, kat),
            _revizije(rad, kat),
            Korak("motor", "razrješavanje motora rad-audit",
                  _k("engine.py", "--provjeri"), blokira=False,
                  zasto="izlaz 3/4 = smanjeni opseg, deklarira se, ne prešućuje"),
            # Kvar 59: do v1.9.4 je faza audit razrješavala motor, ali ga nikad
            # nije POKRENULA — pravi audit (faze A–G: citati, brojke, tipografija,
            # Word polja) stajao je samo u prozi references/audit.md. Mod čija je
            # jedina svrha naći pogreške nije imao korak koji ih traži.
            Korak("motor_audit", "rad-audit faze A–G (citati, brojke, tipografija, polja)",
                  _k("engine.py", "--audit", rad, "--profil", profil,
                     "--json", os.path.join(kat, "nalazi.json")),
                  treba=[rad, profil],
                  zasto="bez ovoga faza audit ne pokreće nijednu provjeru citata ni brojki"),
            Korak("pravila", "usklađenost s profilom fakulteta",
                  _k("check_rules.py", rad, "--profil", profil, "--tip", tip or "zavrsni",
                     "--strogo",
                     "--json", os.path.join(kat, "pravila.json")),
                  treba=[rad, profil],
                  zasto="--strogo: „nije-admitiran” mijenja tekst nalaza, ne izlazni kod"),
            Korak("argument", "teza, zaključak, razina argumenta",
                  _k("check_argument.py", rad, "--profil", profil,
                     "--json", os.path.join(kat, "arg.json")),
                  treba=[rad, profil], blokira=False),
            Korak("stil", "tragovi generiranog teksta",
                  _k("check_ai_style.py", rad), treba=[rad], blokira=False),
            Korak("jezik", "hrvatski pravopis i gramatika",
                  _k("provjeri_jezik.py", rad,
                     "--json", os.path.join(kat, "jezik.json")),
                  treba=[rad],
                  zasto="ono što mentor zaokruži crvenim; do v1.9.4 savjet, sada blokira"),
            Korak("odlomci", "geometrija odlomaka u stvarnom prijelomu",
                  _k("check_paragraphs.py", rad, "--profil", profil),
                  treba=[rad, profil], blokira=False),
            Korak("izracuni", "izbor formule: postotni bod, osnovica, indeks, udjeli",
                  _k("provjeri_izracune.py", rad, "--model",
                     os.path.join(kat, "model.json"),
                     "--json", os.path.join(kat, "izracuni.json")),
                  treba=[rad], blokira=False,
                  zasto="brojka može biti aritmetički točna, a formula kriva"),
            Korak("fusnote", "disciplina fusnota: ibid., skraćeni oblik, numeracija",
                  _k("provjeri_fusnote.py", rad,
                     "--json", os.path.join(kat, "fusnote.json")),
                  treba=[rad],
                  zasto="za legal-footnote profile središnja provjera; bez fusnota alat vrati 0"),
            Korak("dosljednost", "cross-chapter proturječja",
                  _k("consistency_check.py", "--claims", claims,
                     "--out", os.path.join(kat, "consistency.json")),
                  treba=[claims],
                  zasto="proturječje između poglavlja mentor nađe za minutu, alat za sekundu"),
            # Kvar 48: korak iznad gleda samo tvrdnje iz lanca, pa brojka koju
            # rad izvodi iz vlastitog prikaza („šest od sedam koraka") nikad
            # nije uspoređena sa sobom.
            Korak("brojke_teksta", "brojke koje rad sam izvodi iz svojih prikaza",
                  _k("provjeri_brojke_u_tekstu.py", rad,
                     "--json", os.path.join(kat, "brojke_teksta.json")),
                  treba=[rad], blokira=False,
                  zasto="pita, ne presuđuje: dva ciklusa smiju imati različite brojke"),
            # Faza D2: brojka mora biti u izvoru koji JE citiran, ne bilo gdje.
            # Traži izvori/mapa.json; bez nje korak izlazi s 2 (nije mjereno).
            Korak("tvrdnja_izvor", "brojka naspram izvora koji je citiran",
                  ["<RAD_AUDIT>/scripts/check_tvrdnja_izvor.py", rad,
                   "--izvori", os.path.join(korijen_izvora, "izvori"),
                   "--json", os.path.join(kat, "tvrdnja_izvor.json")],
                  treba=[rad], satelit="rad-audit", blokira=False,
                  zasto="brojka iz izvora A pripisana izvoru B do sada je prolazila čista"),
            Korak("reference_postoje", "postoji li jedinica iz popisa literature",
                  ["<RAD_AUDIT>/scripts/check_reference_exists.py", rad,
                   "--izvori", os.path.join(korijen_izvora, "izvori"),
                   "--json", os.path.join(kat, "reference.json")],
                  treba=[rad], satelit="rad-audit", blokira=False,
                  zasto="izmišljena jedinica koja JE citirana prolazila je kao čista"),
            Korak("hipoteze", "dobiva li svaka postavljena hipoteza presudu",
                  ["<RAD_AUDIT>/scripts/check_hipoteze.py", rad,
                   "--json", os.path.join(kat, "hipoteze.json")],
                  treba=[rad], satelit="rad-audit",
                  zasto="hipoteza koja se postavi pa ostavi vidi se iz sadržaja"),
            Korak("tablice", "aritmetika unutar tablica",
                  ["<RAD_AUDIT>/scripts/check_tablice.py", rad,
                   "--json", os.path.join(kat, "tablice.json")],
                  treba=[rad], satelit="rad-audit", blokira=False,
                  zasto="zbroj stupca recenzent izračuna u glavi za pola minute"),
            Korak("statistika", "slaže li se opis s prijavljenim p",
                  ["<RAD_AUDIT>/scripts/check_statistika.py", rad,
                   "--json", os.path.join(kat, "statistika.json")],
                  treba=[rad], satelit="rad-audit",
                  zasto="„značajno (p = 0,322)” ima brojku koja postoji i opis koji ne stoji"),
            Korak("originalnost", "preklapanje s ingestiranim izvorima",
                  _k("originality_check.py", rad, "--evidence", evidence,
                     "--json", os.path.join(kat, "originality.json")),
                  treba=[rad, evidence], blokira=False,
                  zasto="advisory; NIJE plagijat-detekcija protiv interneta"),
            Korak("literatura", "popis literature protiv kućnog stila",
                  _k("provjeri_literaturu.py", rad, "--profil", profil,
                     "--json", os.path.join(kat, "literatura.json")),
                  treba=[rad, profil],
                  zasto="oblik jedinice, uvlaka, razmak i abecedni red; u modu 4 blokira"),
            Korak("prikazi", "slike i grafikoni: dpi, širina, omjer, pismo",
                  _k("provjeri_prikaze.py", rad,
                     "--json", os.path.join(kat, "prikazi.json")),
                  treba=[rad], blokira=False,
                  zasto="struktura prikaza ide kroz check_rules; ovo mjeri samu sliku"),
            Korak("rubrika", "gdje rad stoji prema kriterijima i što ga drži",
                  _k("rubrika.py", "--kat", kat, "--opsirno",
                     "--json", os.path.join(kat, "rubrika.json")),
                  blokira=False,
                  zasto="ide ZADNJI: agregira artefakte koje su prethodni koraci napisali"),
        ]

    # predaja
    return [
        _ucitavanje(faza, kat),
        _revizije(rad, kat),
        Korak("dijelovi", "svi obavezni dijelovi rada napravljeni",
              _k("dijelovi.py", "--kat", kat, "--provjeri", "--faza", "predaja"),
              covjek=True,
              zasto="rad kojemu fali dio pada formalno, prije nego ga itko pročita; "
                    "nosi i dio citanje_tijela (razina rucno), jedinu blokadu u "
                    "paketu koju alat ne može sam zadovoljiti (pravilo 31)"),
        Korak("pravila", "usklađenost s profilom fakulteta",
              _k("check_rules.py", rad, "--profil", profil, "--tip", tip or "zavrsni",
                 "--strogo",
                 "--json", os.path.join(kat, "pravila.json")),
              treba=[rad, profil],
              zasto="--strogo: advisory profil mijenja tekst nalaza, ne izlazni kod"),
        Korak("metapodaci", "što dokument o sebi govori u docProps/",
              ["<RAD_AUDIT>/scripts/provjeri_metapodatke.py", rad,
               "--json", os.path.join(kat, "metapodaci.json")],
              treba=[rad], satelit="rad-audit",
              zasto="metapodaci putuju u repozitorij i na provjeru podudarnosti, "
                    "a u Wordu se ne vide dok se ne otvore Podaci"),
        Korak("placeholderi", "[TREBA IZVOR] / [PROVJERI STR.] u tekstu, ćelijama i fusnotama",
              _k("check_placeholders.py", rad, "--json",
                 os.path.join(kat, "placeholders.json")),
              treba=[rad]),
        Korak("sazetak", "sažetak protiv rada",
              _k("provjeri_sazetak.py", rad, "--json",
                 os.path.join(kat, "sazetak.json")),
              treba=[rad],
              zasto="mentor ga čita prvi; paritetnu tablicu i dalje mora pročitati čovjek"),
        Korak("engleski", "summary i ključne riječi protiv hrvatskog sažetka",
              _k("provjeri_engleski.py", rad, "--profil", profil, "--json",
                 os.path.join(kat, "engleski.json")),
              treba=[rad], blokira=False),
        Korak("jezik", "hrvatski pravopis i gramatika",
              _k("provjeri_jezik.py", rad,
                 "--json", os.path.join(kat, "jezik.json")),
              treba=[rad],
              zasto="pravopisna pogreška na prvoj stranici stoji koliko i na zadnjoj"),
        Korak("izracuni", "izbor formule: postotni bod, osnovica, indeks, udjeli",
              _k("provjeri_izracune.py", rad, "--model",
                 os.path.join(kat, "model.json"),
                 "--json", os.path.join(kat, "izracuni.json")),
              treba=[rad], blokira=False,
              zasto="brojka može biti aritmetički točna, a formula kriva"),
        Korak("fusnote", "disciplina fusnota: ibid., skraćeni oblik, numeracija",
              _k("provjeri_fusnote.py", rad,
                 "--json", os.path.join(kat, "fusnote.json")),
              treba=[rad], blokira=False,
              zasto="za legal-footnote profile središnje; bez fusnota alat kaže da nema što"),
        Korak("izvori", "pokrivenost citata i popisa",
              _k("verify_sources.py", rad, "--pokrivenost", "--offline"),
              treba=[rad],
              zasto="svaki izvor citiran barem jednom, svaki citat ima izvor"),
        Korak("zamjerke", "sve zamjerke mentora zatvorene",
              _k("zamjerke.py", "--kat", kat, "provjeri"),
              treba=[os.path.join(kat, "zamjerke.json")]),
        Korak("originalnost", "preklapanje s ingestiranim izvorima",
              _k("originality_check.py", rad, "--evidence", evidence,
                 "--json", os.path.join(kat, "originality.json")),
              treba=[rad, evidence], blokira=False),
        Korak("literatura", "popis literature protiv kućnog stila",
              _k("provjeri_literaturu.py", rad, "--profil", profil,
                 "--json", os.path.join(kat, "literatura.json")),
              treba=[rad, profil],
              zasto="oblik bibliografske jedinice mentor vidi prvi"),
        Korak("reference_postoje", "svaka jedinica ima građu, identifikator ili oznaku",
              ["<RAD_AUDIT>/scripts/check_reference_exists.py", rad,
               "--izvori", os.path.join(korijen_izvora, "izvori"), "--strogo",
               "--json", os.path.join(kat, "reference.json")],
              treba=[rad], satelit="rad-audit", blokira=False,
              zasto="u modu 6 --strogo: nepotvrđena jedinica na obrani nosi autor"),
        Korak("prikazi", "slike i grafikoni: dpi, širina, omjer, pismo",
              _k("provjeri_prikaze.py", rad,
                 "--json", os.path.join(kat, "prikazi.json")),
              treba=[rad], blokira=False,
              zasto="grafikon skaliran nakon izvoza mijenja veličinu pisma u sebi"),
        Korak("reference", "brojevi stranica protiv stvarnog otiska",
              ["<RAD_DOCX>/scripts/provjeri_reference.py", pdf or "rad.pdf"],
              treba=[pdf] if pdf else ["rad.pdf"], satelit="rad-docx",
              zasto="dokument dosljedan sam sa sobom i dalje može imati sve brojeve krive"),
        # Kvar 60: provjeri_predaju.py je postojao od v1.4 i hvatao zastarjele
        # brojke, neosvježena polja, TOC bez updateFields, REF bez zabilješke i
        # numeraciju sekcija — ali nije bio korak nijednog gatea, nego naredba u
        # references/predaja.md koje se agent morao sjetiti. Zato je i rubrika
        # rutinski čitala .katedra/predaja.json koji nitko nije napisao.
        Korak("predaja_docx", "polja, TOC, numeracija sekcija i zastarjele brojke",
              ["<RAD_DOCX>/scripts/provjeri_predaju.py", rad,
               "--profil", profil,
               "--model", os.path.join(kat, "model.json"),
               "--json", os.path.join(kat, "predaja.json")],
              treba=[rad, profil], satelit="rad-docx",
              zasto="dokument može biti sadržajno čist, a polja i brojevi stranica krivi"),
        Korak("izmjene", "što se promijenilo od zadnje snimke prije audita",
              _k("diff_versions.py", "--kat", kat, "--za-mentora",
                 "--json", os.path.join(kat, "izmjene.json")),
              treba=[rad], blokira=False,
              zasto="izgubljen citat ili preokrenuta brojka nastaju IZMEĐU audita i predaje"),
        Korak("rubrika", "gdje rad stoji prema kriterijima i što ga drži",
              _k("rubrika.py", "--kat", kat, "--opsirno",
                 "--json", os.path.join(kat, "rubrika.json")),
              blokira=False,
              zasto="ide ZADNJI: agregira artefakte koje su prethodni koraci upravo napisali"),
    ]


def _razrijesi_satelit(korak: Korak) -> tuple[list[str] | None, str]:
    korijen = vjestine.nadi_vjestinu(korak.satelit)
    if not korijen:
        return None, (f"satelit `{korak.satelit}` nije instaliran — "
                      f"ograničenje se upisuje u projekt, ne prešućuje")
    rel = korak.argv[0].split("/", 1)[1]
    put = os.path.join(korijen, rel)
    if not os.path.exists(put):
        return None, f"`{korak.satelit}` nema {rel} — treba ponovna instalacija"
    return [sys.executable, put, *korak.argv[1:]], ""


def pokreni(korak: Korak, cwd: str, suho: bool) -> dict:
    pocetak = time.perf_counter()

    def _rez(**kw):
        kw.setdefault("korak", korak.kid)
        kw.setdefault("naziv", korak.naziv)
        kw.setdefault("blokira", korak.blokira)
        kw["covjek"] = korak.covjek
        kw["sekunde"] = round(time.perf_counter() - pocetak, 3)
        return kw

    argv, poruka = korak.argv, ""
    if korak.satelit:
        argv, poruka = _razrijesi_satelit(korak)
        if argv is None:
            return _rez(stanje=PRESKOCENO, razlog=poruka, naredba=None)

    fale = [t for t in korak.treba if t and not os.path.exists(t)]
    if fale:
        return _rez(stanje=PRESKOCENO,
                    razlog="nema ulaza: " + ", ".join(
                        os.path.relpath(f, cwd) for f in fale),
                    naredba=" ".join(shlex.quote(a) for a in argv))

    naredba = " ".join(shlex.quote(a) for a in argv)
    if suho:
        return _rez(stanje="planirano", naredba=naredba, razlog=korak.zasto)

    try:
        # Kvar 119/153: bez encoding= Windows konzola (cp1250) sruši čitač izlaza i izlaz
        # koraka nestane; dijete bez PYTHONIOENCODING padne na prvom ✔ koje ispiše.
        r = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=900,
                           encoding="utf-8", errors="replace",
                           env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    except subprocess.TimeoutExpired:
        return _rez(stanje=PUKAO, kod=None, naredba=naredba,
                    razlog="provjera nije završila u 15 minuta")
    except OSError as e:
        return _rez(stanje=PUKAO, kod=None, naredba=naredba, razlog=str(e))

    kod = r.returncode
    if kod == 0:
        stanje = OK
    elif kod == 1:
        stanje = NALAZ
    elif kod == 3:
        # Izlazni kod 3 je ugovor: „izvela sam se, i na ovom se radu ne mogu
        # primijeniti". Vrijedi i za skripte paketa, ne samo za satelite.
        stanje = NEPRIMJENJIVO
    elif korak.satelit and kod == 4:
        stanje = PRESKOCENO
    else:
        stanje = PUKAO
    izlaz = (r.stdout or "").strip()
    grijeh = (r.stderr or "").strip()
    return _rez(stanje=stanje, kod=kod, naredba=naredba, razlog=korak.zasto,
                izlaz=izlaz[-4000:], greska=grijeh[-2000:])


def iskljucen(korak: Korak, razlog: str) -> dict:
    """Rezultat koraka koji pozivatelj izrijekom NE pokreće (--iskljuci). Nije prošao,
    nije pao, nije preskočen zbog ulaza: isključen je, s razlogom u izvještaju."""
    return {"korak": korak.kid, "naziv": korak.naziv, "blokira": korak.blokira,
            "covjek": korak.covjek, "sekunde": 0.0, "stanje": ISKLJUCENO,
            "razlog": "isključeno pozivom: " + razlog, "naredba": None}


def _bitni_redci(izlaz: str, koliko: int = 8) -> list[str]:
    """Redci nalaza, ne zadnjih N redaka izlaza.

    Rep izlaza je gotovo uvijek sažetak i uputa, a sam nalaz stoji iznad njega —
    pa je „zadnjih šest redaka" pouzdano odsijecalo baš ono zbog čega je korak
    pao. Prednost imaju redci koji nose oznaku kršenja ili upozorenja.
    """
    redci = [r.rstrip() for r in izlaz.splitlines() if r.strip()]
    oznaceni = [r for r in redci if r.lstrip().startswith(("❌", "⚠️", "💥"))]
    izabrani = oznaceni or redci[-koliko:]
    izrezano = len(izabrani) - koliko
    izabrani = izabrani[:koliko]
    if izrezano > 0:
        izabrani.append(f"… još {izrezano} redaka — pokreni naredbu izravno")
    return izabrani


def _tablica(rezultati: list[dict], faza: str, suho: bool) -> None:
    naslov = f"GATE — faza {faza}" + (" (suhi prolaz)" if suho else "")
    print(naslov)
    print("=" * len(naslov))
    for r in rezultati:
        znak = "·" if r["stanje"] == "planirano" else ZNAK.get(r["stanje"], "?")
        tezina = "blokira" if r["blokira"] else "savjet"
        print(f"{znak} {r['naziv']:<52} {tezina}")
        if r["stanje"] in (PRESKOCENO, PUKAO, NEPRIMJENJIVO, ISKLJUCENO, "planirano") \
                and r.get("razlog"):
            print(f"     {r['razlog']}")
        if r["stanje"] == PUKAO and r.get("greska"):
            prva = r["greska"].splitlines()[0][:200]
            print(f"     stderr: {prva}")
        if r["stanje"] == NALAZ and r.get("izlaz"):
            for redak in _bitni_redci(r["izlaz"]):
                print(f"     {redak}")


def zakljucak(rezultati: list[dict],
              dopusteni: dict[str, str] | None = None) -> tuple[int, dict]:
    """Ishod faze.

    Kvar 58 (5.9.2026.): do v1.9.4 su ovdje blokirali samo NALAZ i PUKAO, pa je
    blokirajuća provjera kojoj fali ulaz izlazila kao ``preskočeno`` i gate je
    ispisivao „✅ nijedna blokirajuća provjera nije pala" uz izlazni kod 0.
    Dovoljno je bilo da se rad zove drukčije od ``rad.docx``: faza predaja tada
    prijavi zeleno, a šest blokirajućih provjera nikad se nije pokrenulo.

    Provjera koja se NIJE pokrenula nije provjera koja je prošla. Blokirajući
    korak u stanju ``preskočeno`` zato blokira jednako kao pad, osim kad je
    izuzet imenom kroz ``--dopusti-preskok korak=razlog``. Razlog se upisuje u
    izvještaj, pa preskok ostaje vidljiv i poslije sesije.
    """
    dop = dopusteni or {}
    br = lambda s: sum(1 for r in rezultati if r["stanje"] == s)  # noqa: E731
    blokirajuci = [r for r in rezultati
                   if r["blokira"] and r["stanje"] in (NALAZ, PUKAO)]
    nepokrenuti = [r for r in rezultati
                   if r["blokira"] and r["stanje"] == PRESKOCENO
                   and r["korak"] not in dop]
    neprimjenjivi = [r["korak"] for r in rezultati if r["stanje"] == NEPRIMJENJIVO]
    izuzeti = [r["korak"] for r in rezultati
               if r["blokira"] and r["stanje"] == PRESKOCENO
               and r["korak"] in dop]
    sazetak = {
        "ok": br(OK), "nalaz": br(NALAZ), "preskoceno": br(PRESKOCENO),
        "pukao": br(PUKAO),
        "blokira": [r["korak"] for r in blokirajuci],
        "nepokrenuto": [r["korak"] for r in nepokrenuti],
        "preskok_dopusten": {k: dop[k] for k in izuzeti},
        "neprimjenjivo": neprimjenjivi,
        "iskljuceno": {r["korak"]: r.get("razlog", "") for r in rezultati
                       if r["stanje"] == ISKLJUCENO},
    }
    return (1 if (blokirajuci or nepokrenuti) else 0), sazetak


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Pokreni sve propisane provjere za jednu fazu rada, redom.")
    ap.add_argument("--faza", required=True, choices=FAZE)
    ap.add_argument("--rad", default="./rad.docx")
    ap.add_argument("--pdf")
    ap.add_argument("--profil", default="./.katedra/resolved_profile.json")
    ap.add_argument("--tip")
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--kat")
    ap.add_argument("--json", dest="kao_json", metavar="PUT",
                    help="zapiši puni izvještaj")
    ap.add_argument("--suho", action="store_true",
                    help="ispiši što bi se pokrenulo, bez pokretanja")
    ap.add_argument("--dopusti-preskok", dest="dopusti_preskok", action="append",
                    default=[], metavar="KORAK=RAZLOG",
                    help="blokirajući korak smije ostati nepokrenut, uz upisan razlog; "
                         "može se ponoviti")
    ap.add_argument("--iskljuci", dest="iskljuci", action="append",
                    default=[], metavar="KORAK=RAZLOG",
                    help="korak se NE POKREĆE, uz upisan razlog (npr. formu provjerava "
                         "drugi sustav); vidljivo u izvještaju, ne blokira. Nije isto što "
                         "i --dopusti-preskok, koji oprašta korak kojemu fali ulaz")
    args = ap.parse_args(argv)

    korijen = context.resolve_project_root(args.project_root)
    kat = context.resolve_state_dir(args.kat, args.project_root)
    c = {
        "rad": os.path.abspath(os.path.join(korijen, args.rad))
        if not os.path.isabs(args.rad) else args.rad,
        "pdf": (os.path.abspath(os.path.join(korijen, args.pdf))
                if args.pdf and not os.path.isabs(args.pdf) else args.pdf),
        "profil": os.path.abspath(os.path.join(korijen, args.profil))
        if not os.path.isabs(args.profil) else args.profil,
        "tip": args.tip,
        "kat": kat,
    }

    iskljuceni: dict[str, str] = {}
    for stavka in args.iskljuci:
        korak_id, _, razlog = stavka.partition("=")
        korak_id, razlog = korak_id.strip(), razlog.strip()
        if not korak_id or not razlog:
            print(f"❌ --iskljuci traži oblik KORAK=RAZLOG, dobio: {stavka!r}", file=sys.stderr)
            return 2
        iskljuceni[korak_id] = razlog
    svi = koraci(args.faza, c)
    nepoznati = sorted(set(iskljuceni) - {k.kid for k in svi})
    if nepoznati:
        print(f"❌ --iskljuci imenuje korake kojih u fazi nema: {', '.join(nepoznati)}",
              file=sys.stderr)
        return 2

    rezultati = [iskljucen(k, iskljuceni[k.kid]) if k.kid in iskljuceni
                 else pokreni(k, korijen, args.suho) for k in svi]
    _tablica(rezultati, args.faza, args.suho)

    if args.suho:
        return 0

    dopusteni: dict[str, str] = {}
    for stavka in args.dopusti_preskok:
        korak_id, _, razlog = stavka.partition("=")
        korak_id = korak_id.strip()
        razlog = razlog.strip()
        if not korak_id or not razlog:
            print(f"❌ --dopusti-preskok traži oblik KORAK=RAZLOG, dobio: {stavka!r}",
                  file=sys.stderr)
            return 2
        dopusteni[korak_id] = razlog

    poznati = {r["korak"] for r in rezultati}
    nepoznati = sorted(set(dopusteni) - poznati)
    if nepoznati:
        print(f"❌ --dopusti-preskok imenuje korake kojih u fazi nema: "
              f"{', '.join(nepoznati)}", file=sys.stderr)
        return 2

    kod, s = zakljucak(rezultati, dopusteni)
    print(f"\n{s['ok']} prošlo · {s['nalaz']} nalaza · "
          f"{s['preskoceno']} preskočeno · {len(s['neprimjenjivo'])} neprimjenjivo · "
          f"{s['pukao']} alat pukao")
    if s["neprimjenjivo"]:
        print("◦ ne odnosi se na ovaj rad (provjera se izvela i to utvrdila): "
              + ", ".join(s["neprimjenjivo"]))
    if s["pukao"]:
        print("💥 alat koji je pukao NIJE provjera koja je prošla — "
              "riješi to prije nego zaključiš da je faza čista.")
    if s["preskok_dopusten"]:
        print("➖ preskok dopušten izrijekom (upisano u izvještaj):")
        for korak_id, razlog in s["preskok_dopusten"].items():
            print(f"     {korak_id}: {razlog}")
    if s["iskljuceno"]:
        print("⊘ isključeno pozivom, NIJE pokrenuto (upisano u izvještaj):")
        for korak_id, razlog in s["iskljuceno"].items():
            print(f"     {korak_id}: {razlog}")
    if s["nepokrenuto"]:
        print(f"⛔ NIJE POKRENUTO, a blokira: {', '.join(s['nepokrenuto'])}")
        print("   Provjera koja se nije pokrenula nije provjera koja je prošla.")
        print("   Ili joj daj ulaz, ili je izuzmi imenom: "
              "--dopusti-preskok korak=razlog")
    if s["blokira"]:
        print(f"❌ blokira: {', '.join(s['blokira'])}")
    if not kod:
        print("✅ nijedna blokirajuća provjera nije pala i nijedna nije izostala.")

    if args.kao_json:
        context.atomic_write_json(
            os.path.abspath(os.path.join(korijen, args.kao_json)),
            {"faza": args.faza, "kad": datetime.now().isoformat(timespec="seconds"),
             "sazetak": s, "koraci": rezultati})
    return kod


if __name__ == "__main__":
    sys.exit(main())
