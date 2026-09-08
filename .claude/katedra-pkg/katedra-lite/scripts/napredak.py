#!/usr/bin/env python3
"""Gdje rad stoji — jedan pogled preko sve četiri faze, s kompozitnim scoreom i trendom.

Zašto postoji
-------------
Paket već mjeri sve što treba: `plan.json` nosi status po potpoglavlju, `tempo.py`
računa opseg naspram roka, `rubrika.py` daje pojas ocjene i što ga drži, `gate.py`
piše `gate.json` po fazi, `diff_versions.py` vodi `verzije.json`. Nijedan alat te
brojke ne stavlja **na jedno mjesto**, pa student otvara pet izlaza da bi saznao
„jesam li blizu”. Ovaj alat je agregator: čita, ne mjeri ništa novo.

Što ovo JEST i što NIJE
-----------------------
**Agregator, ne sudac.** Isti princip kao `rubrika.py`: nedostatak dokaza nije dokaz.
Score nikad ne stoji sam — uvijek uz `pokrivenost` (koliki dio komponenata uopće ima
artefakt). Score 80 uz pokrivenost 0.4 znači „80 na onome što se mjeri, a 60 %
rada još nema mjerenje”, ne „rad je 80 % gotov”.

Nije predviđanje ocjene mentora. Nije zamjena za `gate.py` u modu 6.

Komponente scorea (težine se zbrajaju na 100)
---------------------------------------------
* **opseg** (40) — `tempo.udio_gotovo`: planirane stranice sa statusom napisano/provjereno
* **rubrika** (35) — pojas iz `rubrika.ocijeni`: 3→40, 4→70, 4–5→85, 5→100; nepoznato→bez podatka
* **gate** (25) — zadnji `gate_povijest.jsonl` zapis: udio koraka `ok`, 0 ako išta blokira

Komponenta bez podatka ne ulazi u prosjek i smanjuje pokrivenost. Ispod pokrivenosti
0.5 score je označen kao orijentacijski.

Statusi faza
------------
* plan     — gotovo: `stanje.plan_odobren` ILI gotov rad bez plana (`datoteke.rad_docx` bez `plan.json`, mod 4/6); u tijeku: postoji `plan.json`
* pisanje  — gotovo: sve jedinice napisano/provjereno; u tijeku: bilo koja započeta
* audit    — gotovo: zadnji audit gate bez nalaza i bez blokade; u tijeku: bilo koji audit prolaz ili `mod: audit`
* predaja  — gotovo: zadnji predaja gate bez blokade; u tijeku: prolaz ili `mod: predaja`

Uporaba
-------
  python3 <KATEDRA_SKILL>/scripts/napredak.py                    # ispis u terminal
  python3 <KATEDRA_SKILL>/scripts/napredak.py --zabiljezi        # + zapis u .katedra/napredak_povijest.jsonl (trend)
  python3 <KATEDRA_SKILL>/scripts/napredak.py --json .katedra/napredak.json
  python3 <KATEDRA_SKILL>/scripts/napredak.py --html napredak.html   # samostalna stranica, bez servera

`napredak.json` namjerno ima isti oblik kao tablice `radovi` / `faza_status` /
`rad_verzije` u budućoj Katedra aplikaciji — migracija je 1:1, bez prevođenja polja.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import sys
from datetime import date, datetime

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
KORIJEN = os.path.dirname(SKRIPTE)
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import context  # noqa: E402

FAZE = ("plan", "pisanje", "audit", "predaja")
FAZA_NAZIV = {"plan": "Plan", "pisanje": "Pisanje", "audit": "Audit", "predaja": "Predaja"}
MOD_FAZA = {"1": "plan", "2": "pisanje", "4": "audit", "6": "predaja",
            "plan": "plan", "pisanje": "pisanje", "audit": "audit", "predaja": "predaja",
            "novi-rad": "plan"}

NIJE_POCELO, U_TIJEKU, GOTOVO = "nije_pocelo", "u_tijeku", "gotovo"
ZNAK = {NIJE_POCELO: "🔴", U_TIJEKU: "🟡", GOTOVO: "🟢"}

TEZINE = {"opseg": 40, "rubrika": 35, "gate": 25}
POJAS_U_BODOVE = {"3": 40, "4": 70, "4–5": 85, "5": 100}
PRAG_ORIJENTACIJSKI = 0.5

PLAN_GOTOVO = ("napisano", "provjereno")
PLAN_U_TIJEKU = ("u-tijeku",)


# ── učitavanje ─────────────────────────────────────────────────────────────
def _json(put):
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _jsonl(put):
    zapisi = []
    try:
        with open(put, encoding="utf-8") as f:
            for redak in f:
                redak = redak.strip()
                if redak:
                    try:
                        zapisi.append(json.loads(redak))
                    except json.JSONDecodeError:
                        continue
    except OSError:
        pass
    return zapisi


def _zadnji_gate(povijest, faza):
    for z in reversed(povijest):
        if z.get("faza") == faza:
            return z
    return None


# ── komponente ─────────────────────────────────────────────────────────────
def komponenta_opseg(kat, plan, stanje):
    if not plan:
        # mod 4/6 nad gotovim radom: plan nikad nije postojao, a dokument jest — opseg je ispunjen
        # činjenicom rada, ne planom (pravilo 8: deklarirano, ne prešućeno)
        if ((stanje or {}).get("datoteke") or {}).get("rad_docx"):
            return 100, {"ocjena": "postojeći rad", "poruka": "opseg iz gotovog rada (mod 4/6), bez plana — tempo se ne mjeri"}
        return None, "nema plan.json"
    try:
        import tempo  # noqa: WPS433 — isti paket, isti izračun kao `tempo.py`
    except ImportError:
        return None, "tempo.py nije dostupan"
    t = tempo.izracun(plan, stanje or {})
    if t.get("udio_gotovo") is None:
        return None, "plan nema stranica po potpoglavlju"
    return round(100 * t["udio_gotovo"]), t


def komponenta_rubrika(kat):
    try:
        import rubrika  # noqa: WPS433
    except ImportError:
        return None, "rubrika.py nije dostupan"
    try:
        reg = rubrika.ucitaj_registar(rubrika.REGISTAR)
    except Exception as e:  # RubrikaError i sl. — bez registra nema mjerenja
        return None, f"registar rubrike: {e}"
    if not os.path.isdir(kat):
        return None, "nema .katedra/"
    r = rubrika.ocijeni(reg, kat)
    bod = POJAS_U_BODOVE.get(r.get("pojas"))
    return bod, r


def komponenta_gate(povijest):
    if not povijest:
        return None, "nijedan gate prolaz"
    z = povijest[-1]
    koraci = z.get("koraci") or {}
    if not koraci:
        return None, "gate zapis bez koraka"
    if z.get("blokira"):
        return 0, z
    ok = sum(1 for s in koraci.values() if s == "ok")
    relevantni = sum(1 for s in koraci.values() if s in ("ok", "nalaz", "pukao"))
    if not relevantni:
        return None, "svi koraci preskočeni"
    return round(100 * ok / relevantni), z


# ── faze ───────────────────────────────────────────────────────────────────
def status_faza(stanje, plan, povijest):
    mod = str((stanje or {}).get("mod", ""))
    aktivna = MOD_FAZA.get(mod)
    st = {}

    gotov_rad_bez_plana = not plan and bool(((stanje or {}).get("datoteke") or {}).get("rad_docx"))
    if (stanje or {}).get("plan_odobren") or gotov_rad_bez_plana:
        st["plan"] = GOTOVO
    elif plan or aktivna == "plan":
        st["plan"] = U_TIJEKU
    else:
        st["plan"] = NIJE_POCELO

    jedinice = []
    for p in (plan or {}).get("poglavlja", []) or []:
        for s in p.get("potpoglavlja", []) or []:
            jedinice.append(s.get("status"))
    if (jedinice and all(s in PLAN_GOTOVO for s in jedinice)) or gotov_rad_bez_plana:
        st["pisanje"] = GOTOVO
    elif any(s in PLAN_GOTOVO + PLAN_U_TIJEKU for s in jedinice) or aktivna == "pisanje":
        st["pisanje"] = U_TIJEKU
    else:
        st["pisanje"] = NIJE_POCELO

    for faza in ("audit", "predaja"):
        z = _zadnji_gate(povijest, faza)
        if z:
            koraci = z.get("koraci") or {}
            cist = not z.get("blokira") and not any(v in ("nalaz", "pukao") for v in koraci.values())
            st[faza] = GOTOVO if cist else U_TIJEKU
        elif aktivna == faza:
            st[faza] = U_TIJEKU
        else:
            st[faza] = NIJE_POCELO

    return aktivna, st


# ── score ──────────────────────────────────────────────────────────────────
def izracun(kat):
    stanje = _json(os.path.join(kat, "stanje.json"))
    plan = _json(os.path.join(kat, "plan.json"))
    povijest_gate = _jsonl(os.path.join(kat, "gate_povijest.jsonl"))
    verzije = _json(os.path.join(kat, "verzije.json")) or {}

    aktivna, faze = status_faza(stanje, plan, povijest_gate)

    komponente = {}
    detalji = {}
    for ime, fn in (("opseg", lambda: komponenta_opseg(kat, plan, stanje)),
                    ("rubrika", lambda: komponenta_rubrika(kat)),
                    ("gate", lambda: komponenta_gate(povijest_gate))):
        vrijednost, detalj = fn()
        komponente[ime] = vrijednost
        detalji[ime] = detalj

    s_podatkom = {k: v for k, v in komponente.items() if v is not None}
    tez_ukupno = sum(TEZINE[k] for k in s_podatkom)
    pokrivenost = round(tez_ukupno / sum(TEZINE.values()), 2)
    score = round(sum(v * TEZINE[k] for k, v in s_podatkom.items()) / tez_ukupno) if tez_ukupno else None

    # što ga najviše diže: komponenta s najvećim nepokrivenim potencijalom (težina × manjak)
    dize = sorted(((TEZINE[k] * (100 - v) / 100, k) for k, v in s_podatkom.items()), reverse=True)
    dize_najvise = dize[0][1] if dize and dize[0][0] > 0 else None
    drzi = []
    if isinstance(detalji.get("rubrika"), dict):
        drzi = detalji["rubrika"].get("drzi") or []

    snapshoti = verzije.get("snapshoti") or []
    return {
        "schema_version": 1,
        "kad": datetime.now().isoformat(timespec="seconds"),
        "rad": {
            "tip": (stanje or {}).get("tip"),
            "tema": (stanje or {}).get("tema"),
            "fakultet": ((stanje or {}).get("fakultet") or {}).get("slug"),
            "rok": (stanje or {}).get("rok"),
            "mod": (stanje or {}).get("mod"),
            "trenutna_faza": aktivna,
            "health_score": score,
            "pokrivenost": pokrivenost,
            "orijentacijski": pokrivenost < PRAG_ORIJENTACIJSKI,
        },
        "faza_status": [{"faza": f, "status": faze[f]} for f in FAZE],
        "komponente": komponente,
        "bez_podatka": {k: (detalji[k].get("razlog") or detalji[k].get("poruka") or "nema podatka")
                        if isinstance(detalji[k], dict) else str(detalji[k])
                        for k, v in komponente.items() if v is None},
        "dize_najvise": dize_najvise,
        "drzi": drzi,
        "tempo": detalji["opseg"] if isinstance(detalji.get("opseg"), dict) else None,
        "rad_verzije": [{"id": s.get("id"), "datum": s.get("datum"), "biljeska": s.get("biljeska"),
                         "datoteka": s.get("datoteka")} for s in snapshoti][-8:],
    }


def zabiljezi(kat, r):
    put = os.path.join(kat, "napredak_povijest.jsonl")
    prethodni = _jsonl(put)
    zapis = {"kad": r["kad"], "faza": r["rad"]["trenutna_faza"],
             "score": r["rad"]["health_score"], "pokrivenost": r["rad"]["pokrivenost"],
             "komponente": r["komponente"]}
    with open(put, "a", encoding="utf-8") as f:
        f.write(json.dumps(zapis, ensure_ascii=False) + "\n")
    zadnji = next((p for p in reversed(prethodni) if p.get("score") is not None), None)
    if zadnji and r["rad"]["health_score"] is not None:
        return r["rad"]["health_score"] - zadnji["score"], zadnji.get("kad")
    return None, None


# ── ispis ──────────────────────────────────────────────────────────────────
def ispisi(r, trend=None):
    rad = r["rad"]
    print("NAPREDAK — gdje rad stoji")
    print("=" * 46)
    if rad["tema"]:
        print(f"{rad['tip'] or '?'} · {rad['tema']}")
    if rad["rok"]:
        try:
            d = (datetime.strptime(rad["rok"], "%Y-%m-%d").date() - date.today()).days
            print(f"rok {rad['rok']} (za {d} d)")
        except ValueError:
            print(f"rok {rad['rok']}")
    print()
    for fs in r["faza_status"]:
        oznaka = "◀ trenutna" if fs["faza"] == rad["trenutna_faza"] else ""
        print(f"  {ZNAK[fs['status']]} {FAZA_NAZIV[fs['faza']]:<10} {fs['status']:<12} {oznaka}")
    print()
    if rad["health_score"] is None:
        print("SCORE: — (nijedna komponenta nema artefakt; nema što mjeriti)")
    else:
        napomena = "  ⚠️ orijentacijski — pokrivenost < 0.5" if rad["orijentacijski"] else ""
        tr = ""
        if trend and trend[0] is not None:
            tr = f"  ({'+' if trend[0] >= 0 else ''}{trend[0]} od {str(trend[1])[:16]})"
        print(f"SCORE: {rad['health_score']}/100   pokrivenost {rad['pokrivenost']}{tr}{napomena}")
    for k in ("opseg", "rubrika", "gate"):
        v = r["komponente"].get(k)
        if v is None:
            print(f"   ❔ {k:<8} tež. {TEZINE[k]:<3} — {r['bez_podatka'].get(k)}")
        else:
            print(f"   ✅ {k:<8} tež. {TEZINE[k]:<3} {v}/100")
    if r["dize_najvise"]:
        print(f"\nnajviše diže sljedeće: {r['dize_najvise']}")
    if r["drzi"]:
        print("drži ga (rubrika): " + ", ".join(r["drzi"]))
    if r["tempo"] and r["tempo"].get("ocjena"):
        print(f"tempo: {r['tempo']['ocjena']} — {r['tempo'].get('poruka', '')}")
    if r["rad_verzije"]:
        print("\nverzije (zadnje):")
        for v in r["rad_verzije"][-5:]:
            print(f"   {v['id']:<5} {str(v.get('datum', ''))[:16]}  {v.get('biljeska') or ''}")
    print("\nScore je agregat postojećih mjerenja, ne predviđanje ocjene. Komponenta bez\n"
          "artefakta je ❔ i ne ulazi u prosjek — zato uvijek gledaj i pokrivenost.")


# ── HTML (samostalna datoteka, bez servera) ─────────────────────────────────
def html_stranica(r, povijest):
    rad = r["rad"]
    score = rad["health_score"]
    boja = "#9ca3af" if score is None else "#10b981" if score >= 70 else "#f59e0b" if score >= 40 else "#ef4444"
    obod = 2 * 3.14159 * 52
    offset = obod if score is None else obod - obod * score / 100
    e = html.escape

    kartice = ""
    for fs in r["faza_status"]:
        kl = fs["status"]
        akt = " aktivna" if fs["faza"] == rad["trenutna_faza"] else ""
        kartice += (f'<div class="kartica {kl}{akt}"><div class="tocka"></div>'
                    f'<h3>{FAZA_NAZIV[fs["faza"]]}</h3><p>{e(kl.replace("_", " "))}</p></div>')

    komp = ""
    for k in ("opseg", "rubrika", "gate"):
        v = r["komponente"].get(k)
        if v is None:
            komp += f'<li><span class="k">{k}</span><span class="nema">❔ {e(str(r["bez_podatka"].get(k)))}</span></li>'
        else:
            komp += (f'<li><span class="k">{k}</span><div class="bar"><div style="width:{v}%"></div></div>'
                     f'<span class="v">{v}</span></li>')

    tocke = [p["score"] for p in povijest if p.get("score") is not None][-20:]
    trend_svg = ""
    if len(tocke) >= 2:
        w, h = 260, 60
        xs = [i * (w / (len(tocke) - 1)) for i in range(len(tocke))]
        pts = " ".join(f"{x:.1f},{h - t * h / 100:.1f}" for x, t in zip(xs, tocke))
        trend_svg = (f'<p class="trend-naslov">trend scorea — zadnjih {len(tocke)} zapisa '
                     f'({tocke[0]} → {tocke[-1]})</p>'
                     f'<svg viewBox="0 0 {w} {h}" class="trend"><polyline points="{pts}" '
                     f'fill="none" stroke="{boja}" stroke-width="2"/></svg>')

    verz = "".join(f'<li><b>{e(str(v["id"]))}</b> <span>{e(str(v.get("datum", ""))[:16])}</span> '
                   f'{e(v.get("biljeska") or "")}</li>' for v in reversed(r["rad_verzije"]))

    napomena = ('<p class="upozorenje">⚠️ orijentacijski — manje od pola komponenata ima artefakt</p>'
                if rad["orijentacijski"] else "")
    drzi = f'<p class="drzi">drži ga: {e(", ".join(r["drzi"]))}</p>' if r["drzi"] else ""
    dize = f'<p class="dize">najviše diže sljedeće: <b>{e(r["dize_najvise"])}</b></p>' if r["dize_najvise"] else ""

    return f"""<!doctype html><html lang="hr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Napredak — {e(rad['tema'] or 'rad')}</title>
<style>
:root{{--bg:#fafafa;--fg:#111;--muted:#6b7280;--card:#fff;--line:#e5e7eb}}
@media(prefers-color-scheme:dark){{:root{{--bg:#0f0f10;--fg:#f3f4f6;--muted:#9ca3af;--card:#18181b;--line:#27272a}}}}
body{{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--fg)}}
main{{max-width:960px;margin:0 auto;padding:28px 18px}}
header{{display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:44px}}
h1{{font-size:22px;margin:4px 0}} .meta{{color:var(--muted);font-size:13px}}
.gauge{{position:relative;width:128px;height:128px}} .gauge svg{{transform:rotate(-90deg)}}
.gauge .n{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}}
.gauge .n b{{font-size:30px;color:{boja}}} .gauge .n small{{color:var(--muted);font-size:11px}}
.gauge .pokr{{position:absolute;left:0;right:0;top:100%;margin-top:6px;text-align:center;font-size:12px;color:var(--muted);white-space:nowrap}}
.faze{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}}
.kartica{{background:var(--card);border:2px solid var(--line);border-radius:16px;padding:14px;position:relative}}
.kartica h3{{margin:6px 0 2px;font-size:16px}} .kartica p{{margin:0;color:var(--muted);font-size:13px;text-transform:capitalize}}
.kartica .tocka{{width:10px;height:10px;border-radius:50%;background:#d1d5db}}
.kartica.u_tijeku{{border-color:#fbbf24}} .kartica.u_tijeku .tocka{{background:#f59e0b;animation:p 1.4s infinite}}
.kartica.gotovo{{border-color:#34d399}} .kartica.gotovo .tocka{{background:#10b981}}
.kartica.aktivna{{box-shadow:0 0 0 3px rgba(139,92,246,.35)}}
@keyframes p{{50%{{opacity:.35}}}}
section{{margin-top:30px}} h2{{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}}
ul{{list-style:none;padding:0;margin:0}} .komp li{{display:grid;grid-template-columns:90px 1fr 40px;gap:10px;align-items:center;padding:6px 0}}
.komp .bar{{height:8px;background:var(--line);border-radius:6px;overflow:hidden}} .komp .bar div{{height:100%;background:{boja}}}
.komp .v{{text-align:right;font-weight:600}} .komp .nema{{grid-column:2/4;color:var(--muted);font-size:13px}}
.verz li{{padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}} .verz span{{color:var(--muted);margin:0 8px}}
.trend{{width:260px;height:60px;display:block;margin-top:4px}} .trend-naslov{{margin:14px 0 0;font-size:12px;color:var(--muted)}}
.upozorenje{{color:#b45309;font-size:13px}} .drzi,.dize{{font-size:14px;color:var(--muted)}}
footer{{margin-top:36px;color:var(--muted);font-size:12px}}
</style></head><body><main>
<header><div><div class="meta">{e(str(rad['tip'] or ''))} · {e(str(rad['fakultet'] or ''))}{(' · rok ' + e(rad['rok'])) if rad['rok'] else ''}</div>
<h1>{e(rad['tema'] or 'Rad bez teme')}</h1>{napomena}{dize}{drzi}</div>
<div class="gauge"><svg width="128" height="128"><circle cx="64" cy="64" r="52" fill="none" stroke="var(--line)" stroke-width="10"/>
<circle cx="64" cy="64" r="52" fill="none" stroke="{boja}" stroke-width="10" stroke-linecap="round" stroke-dasharray="{obod:.1f}" stroke-dashoffset="{offset:.1f}"/></svg>
<div class="n"><b>{'—' if score is None else score}</b><small>/ 100</small></div>
<div class="pokr">pokrivenost {rad['pokrivenost']}</div></div></header>
<section><h2>Faze</h2><div class="faze">{kartice}</div></section>
<section><h2>Komponente scorea</h2><ul class="komp">{komp}</ul>{trend_svg}</section>
<section><h2>Verzije</h2><ul class="verz">{verz or '<li><span>još nema snapshota — diff_versions.py --snapshot</span></li>'}</ul></section>
<footer>Score je agregat postojećih mjerenja (tempo, rubrika, gate), ne predviđanje ocjene. Komponenta bez artefakta ne ulazi u prosjek.<br>Generirano {e(r['kad'])}</footer>
</main></body></html>"""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Gdje rad stoji: faze, kompozitni score, trend, verzije.")
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--kat")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    ap.add_argument("--html", metavar="PUT", help="samostalna HTML stranica (bez servera)")
    ap.add_argument("--zabiljezi", action="store_true",
                    help="dodaj zapis u .katedra/napredak_povijest.jsonl (trend)")
    ap.add_argument("--tiho", action="store_true", help="bez ispisa u terminal")
    args = ap.parse_args(argv)

    kat = context.resolve_state_dir(args.kat, args.project_root)
    if not os.path.isdir(kat):
        print(f"❌ nema {kat} — napredak čita artefakte projekta; prvo stanje_init.py", file=sys.stderr)
        return 2

    r = izracun(kat)
    trend = zabiljezi(kat, r) if args.zabiljezi else None

    if not args.tiho:
        ispisi(r, trend)
    if args.kao_json:
        context.atomic_write_json(os.path.abspath(args.kao_json), r)
    if args.html:
        povijest = _jsonl(os.path.join(kat, "napredak_povijest.jsonl"))
        context.atomic_write_text(os.path.abspath(args.html), html_stranica(r, povijest))
        if not args.tiho:
            print(f"\n✅ HTML: {os.path.abspath(args.html)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
