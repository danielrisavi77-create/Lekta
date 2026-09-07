#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PREDLOŽAK — jedini izvor istine za sve izvedene brojke u radu.

Kopiraj u korijen rada kao `model.py`, zamijeni pretpostavke i izračun svojima,
a strukturu (r2/r3, zapis u model.json, ispis za kontrolu) zadrži.

Primjer je iz pristupnog rada o kibernetičkom riziku — zadrži ga kao uzorak oblika
ili izbriši i napiši svoj.

ŽELJEZNO: udio i zbroj računaju se iz PRIKAZANIH (zaokruženih) vrijednosti, da se
stupac može provjeriti sabiranjem. V. rad-docx/references/brojke.md.

Prije svake izmjene: cp model.json model.prije.json  (bez toga nema crne liste).

Iz ove datoteke izvode se: tablica 5 (dekompozicija), tablica 6 (očekivani godišnji
gubitak), grafikon 3 (struktura gubitka) i grafikon 4 (osjetljivost). Ništa se
nigdje ne upisuje ručno, pa dokument, tablice i grafikoni ne mogu razići se.

Pokretanje:  python3 model.py          → ispis + model.json
"""

import json

# ── ulazne pretpostavke o Banci X ────────────────────────────────────────────
OPERATIVNI_PRIHOD = 140.0     # mln EUR godišnje
RADNI_DANI = 250
DNEVNI = OPERATIVNI_PRIHOD / RADNI_DANI      # 0,56 mln EUR

KLIJENATA = 350_000

# ── scenariji ────────────────────────────────────────────────────────────────
# dani  = radni dani znatno smanjene dostupnosti
# degrad = prosječni udio izgubljenog operativnog prihoda u tim danima
SC = {
    "bazni": {
        "naziv": "Bazni: 7 dana smanjene dostupnosti, oporavak iz kopija",
        "freq": 0.100, "dani": 7, "degrad": 0.55,
        "pravni": 1.95, "oporavak": 1.10, "reput": 0.80, "obav": 0.55, "otkup": 0.30,
    },
    "nepovoljni": {
        "naziv": "Nepovoljni: kompromitirane kopije, 30 dana, eksfiltracija",
        "freq": 0.030, "dani": 30, "degrad": 0.70,
        "pravni": 5.60, "oporavak": 3.50, "reput": 2.40, "obav": 1.10, "otkup": 0.30,
    },
    "repni": {
        "naziv": "Repni: kompromitiran ključni pružatelj usluga, 90 dana",
        "freq": 0.005, "dani": 90, "degrad": 0.85,
        "pravni": 18.00, "oporavak": 8.00, "reput": 8.00, "obav": 1.10, "otkup": 0.00,
    },
}

KOMPONENTE = [
    ("prekid",   "Prekid poslovanja"),
    ("pravni",   "Pravni i regulatorni trošak"),
    ("oporavak", "Odgovor i oporavak"),
    ("reput",    "Reputacijski gubitak"),
    ("obav",     "Obavješćivanje i zaštita klijenata"),
    ("otkup",    "Otkupnina (uvjetna komponenta)"),
]


def prekid(s, fd=1.0):
    """Trošak prekida poslovanja: dani × dnevni prihod × prosječna degradacija."""
    return s["dani"] * fd * DNEVNI * s["degrad"]


def komponenta(s, key, fd=1.0, fr=1.0):
    if key == "prekid":
        return prekid(s, fd)
    if key == "reput":
        return s["reput"] * fr
    return s[key]


def gubitak(s, fd=1.0, fr=1.0):
    return sum(komponenta(s, k, fd, fr) for k, _ in KOMPONENTE)


def r2(x):
    return round(x + 1e-12, 2)


def r3(x):
    return round(x + 1e-12, 3)


def ale(fd=None, fr=None, freq=None):
    """Očekivani godišnji gubitak kao zbroj PRIKAZANIH (zaokruženih) doprinosa,
    da se rezultat može provjeriti sabiranjem stupca u tablici."""
    fd, fr, freq = fd or {}, fr or {}, freq or {}
    return r3(sum(
        r3(freq.get(k, s["freq"]) * r2(gubitak(s, fd.get(k, 1.0), fr.get(k, 1.0))))
        for k, s in SC.items()
    ))


# ── intervencije ─────────────────────────────────────────────────────────────
# A: neizmjenjive sigurnosne kopije + testirana obnova → pada frekvencija
#    nepovoljnog scenarija s 0,030 na 0,010
INT_A = {"freq": {"nepovoljni": 0.010}}
# B: kraće ciljano vrijeme oporavka → bazni 7→2 dana, nepovoljni 30→10 dana;
#    reputacijski gubitak pritom pada na pola
INT_B = {"fd": {"bazni": 2 / 7, "nepovoljni": 10 / 30},
         "fr": {"bazni": 0.5, "nepovoljni": 0.5}}
INT_AB = {**INT_B, "freq": INT_A["freq"]}


def izracun():
    bazni = r2(gubitak(SC["bazni"]))

    struktura = []
    for k, naziv in KOMPONENTE:
        v = r2(komponenta(SC["bazni"], k))
        struktura.append({"kljuc": k, "naziv": naziv, "iznos": v,
                          "udio": round(v / bazni * 100, 1)})

    scenariji = []
    for k, s in SC.items():
        g = r2(gubitak(s))
        scenariji.append({"kljuc": k, "naziv": s["naziv"], "freq": s["freq"],
                          "gubitak": g, "doprinos": r3(s["freq"] * g)})

    base = ale()
    a, b, ab = ale(**INT_A), ale(**INT_B), ale(**INT_AB)

    def dopr(key):
        return sum(s["freq"] * komponenta(s, key) for s in SC.values())

    osj = {
        "Frekvencija napada": r3(base * 0.5),
        "Trajanje nedostupnosti": r3(0.5 * (dopr("prekid") + dopr("reput"))),
        "Regulatorna kazna i pravni trošak": r3(0.5 * dopr("pravni")),
        "Trošak odgovora i oporavka": r3(0.5 * dopr("oporavak")),
        "Trošak obavješćivanja klijenata": r3(0.5 * dopr("obav")),
        "Iznos otkupnine": r3(0.5 * dopr("otkup")),
    }

    prekid_reg = round(
        (struktura[0]["iznos"] + struktura[1]["iznos"]) / bazni * 100, 1)

    return {
        "dnevni_prihod": r2(DNEVNI),
        "bazni_gubitak": bazni,
        "struktura": struktura,
        "prekid_plus_regulatorno_udio": prekid_reg,
        "otkupnina_udio": struktura[5]["udio"],
        "scenariji": scenariji,
        "ale": {
            "prije": base,
            "A": a, "A_smanjenje": round((base - a) / base * 100, 1),
            "B": b, "B_smanjenje": round((base - b) / base * 100, 1),
            "AB": ab, "AB_smanjenje": round((base - ab) / base * 100, 1),
        },
        "ale_B_scenariji": {
            k: r2(gubitak(SC[k], INT_B["fd"].get(k, 1.0), INT_B["fr"].get(k, 1.0)))
            for k in SC
        },
        "osjetljivost": osj,
        "otkupnina_doprinos_ale": r3(dopr("otkup")),
        "odnos_trajanje_otkupnina": round(
            osj["Trajanje nedostupnosti"] / osj["Iznos otkupnine"], 1),
    }


if __name__ == "__main__":
    m = izracun()
    json.dump(m, open("model.json", "w"), ensure_ascii=False, indent=1)

    print(f"dnevni operativni prihod: {m['dnevni_prihod']} mln EUR\n")
    print(f"── struktura baznog scenarija (ukupno {m['bazni_gubitak']}) ──")
    for k in m["struktura"]:
        print(f"  {k['naziv']:<34} {k['iznos']:5.2f}  {k['udio']:5.1f} %")
    print(f"  → prekid + regulatorno: {m['prekid_plus_regulatorno_udio']} %"
          f"   otkupnina: {m['otkupnina_udio']} %")

    print("\n── očekivani godišnji gubitak ──")
    for s in m["scenariji"]:
        print(f"  {s['kljuc']:<11} {s['freq']:.3f} × {s['gubitak']:6.2f} = {s['doprinos']:.3f}")
    a = m["ale"]
    print(f"  UKUPNO prije intervencija: {a['prije']:.3f}")
    print(f"  Intervencija A:            {a['A']:.3f}  ({a['A_smanjenje']} % niže)")
    print(f"  Intervencija B:            {a['B']:.3f}  ({a['B_smanjenje']} % niže)")
    print(f"  A + B zajedno:             {a['AB']:.3f}  ({a['AB_smanjenje']} % niže)")
    print(f"  gubitak po događaju uz B: {m['ale_B_scenariji']}")

    print("\n── osjetljivost (±50 %) ──")
    for n, v in sorted(m["osjetljivost"].items(), key=lambda x: -x[1]):
        print(f"  {n:<36} ±{v:.3f}")
    print(f"  → trajanje / otkupnina = {m['odnos_trajanje_otkupnina']}×")
    print(f"  → doprinos otkupnine očekivanom godišnjem gubitku: "
          f"{m['otkupnina_doprinos_ale']:.3f} mln EUR")
    print("\n✅ model.json zapisan")
