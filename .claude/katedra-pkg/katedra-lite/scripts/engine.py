#!/usr/bin/env python3
"""Most između Katedre (mod 4) i zasebnog skilla rad-audit.

Rad-audit je JEDINI vlasnik audit-koda. Katedra ga ne kopira nego poziva kroz
verzionirani engine contract. Katedra ne inspecta source motora i ne prosljeđuje
faculty profil; profil ostaje samo Katedrin kontekst za interpretaciju nalaza.

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/engine.py --provjeri
  python3 <KATEDRA_SKILL>/scripts/engine.py --audit ./rad.docx --sources ./izvori/ \
                    --profil <KATEDRA_SKILL>/references/fakulteti/efzg.json \
                    --out ./.katedra/audit.md --json ./.katedra/nalazi.json
  python3 <KATEDRA_SKILL>/scripts/engine.py --faza F ./rad.docx
  python3 <KATEDRA_SKILL>/scripts/engine.py --faza G ./rad.docx --allow-mutation --project-root .
  python3 <KATEDRA_SKILL>/scripts/engine.py --gdje

Izlazni kodovi:
  0  kompatibilan motor / audit bez kritičnih nalaza
  1  audit gotov, ima kritičnih nalaza
  2  neispravan lokalni poziv/argument
  3  rad-audit kandidat nije pronađen
  4  motor ili DocumentAuditResult nije kompatibilan s ugovorom
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import time

from profile_rules import ResolvedRules
from rad_audit_contract import ContractError, load_engine_contract, validate_document_audit_result
from review_policy import mutation_snapshot_status

HERE = os.path.dirname(os.path.abspath(__file__))

KANDIDATI = [
    os.environ.get("RAD_AUDIT_HOME"),
    os.path.join(HERE, "..", "..", "rad-audit", "scripts"),
    os.path.expanduser("~/.claude/skills/rad-audit/scripts"),
    "/root/.claude/skills/rad-audit/scripts",
    "/home/claude/.claude/skills/rad-audit/scripts",
]
GLOBOVI = [
    os.path.expanduser("~/.claude/plugins/*/skills/rad-audit/scripts"),
    "/root/.claude/plugins/*/skills/rad-audit/scripts",
]

# v1.1-fix (D11): izlazni kodovi kojima motor smije javiti da je audit stvarno
# proveden — 0 (bez kritičnih nalaza) i 1 (ima kritičnih nalaza). Sve ostalo je
# pad motora i Katedra tada NE smije interpretirati zatečeni nalazi.json.
MOTOR_USPJESNI_KODOVI = (0, 1)
# Tolerancija za grubu granulaciju mtime-a na nekim datotečnim sustavima.
MTIME_TOLERANCIJA_S = 2.0


class MotorOverrideError(RuntimeError):
    """Eksplicitni RAD_AUDIT_HOME ne pokazuje ni na jedan postojeći direktorij."""


def _normaliziraj_kandidata(path):
    if not path:
        return None
    p = os.path.abspath(os.path.expanduser(path))
    if os.path.isdir(p):
        if os.path.isdir(os.path.join(p, "scripts")) and not os.path.basename(p) == "scripts":
            return os.path.join(p, "scripts")
        return p
    return None


def nadi_motor():
    # v1.1-fix (AUD-010): eksplicitni RAD_AUDIT_HOME je naredba, ne prijedlog.
    # Ako pokazuje na putanju koja nije direktorij, Katedra NE nastavlja
    # auto-discovery — tiha zamjena drugim motorom daje audit koji korisnik
    # nikad nije tražio. Auto-discovery ostaje netaknut kad override nije zadan.
    override = (os.environ.get("RAD_AUDIT_HOME") or "").strip()
    if override:
        motor = _normaliziraj_kandidata(override)
        if not motor:
            raise MotorOverrideError(override)
        return motor

    putanje = [p for p in KANDIDATI if p]
    for g in GLOBOVI:
        putanje.extend(sorted(glob.glob(g)))
    for p in putanje:
        motor = _normaliziraj_kandidata(p)
        if motor:
            return motor
    return None


def ucitaj_profil(put):
    if not put or not os.path.isfile(put):
        return {}
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"[⚠ profil fakulteta se ne može pročitati: {e}]", file=sys.stderr)
        return {}


def _ugovor_ili_greska(motor):
    try:
        return load_engine_contract(motor), None
    except ContractError as exc:
        return None, str(exc)


def izvjestaj_o_motoru(motor):
    if not motor:
        print("❌ rad-audit nije pronađen.")
        print()
        print("Katedra mod 4 tada radi u SMANJENOM OPSEGU: strukturne provjere iz")
        print("check_rules.py i check_argument.py rade, ali faze A–G (citati, brojke,")
        print("tipografija, Word polja) nemaju motor.")
        print()
        print("Rješenje: instaliraj skill `rad-audit` ili postavi")
        print("  export RAD_AUDIT_HOME=/putanja/do/rad-audit/scripts")
        return 3

    contract, error = _ugovor_ili_greska(motor)
    print(f"✅ motor kandidat: {motor}")
    if error:
        print(f"⚠️  motor je nekompatibilan: {error}")
        print("Katedra mu ne vjeruje i neće inspectati njegov source kao zamjenu za ugovor.")
        return 4

    print(
        f"✅ contract v{contract.contract_version} · engine {contract.engine_version} · "
        f"{contract.engine}"
    )
    print("✅ capabilities: " + ", ".join(sorted(contract.capabilities)))
    return 0


def pokreni(motor, entrypoint, argv):
    return subprocess.run([sys.executable, entrypoint] + argv, cwd=motor).returncode


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--gdje", action="store_true")
    ap.add_argument("--provjeri", action="store_true")
    ap.add_argument("--audit", metavar="RAD.DOCX")
    ap.add_argument("--faza", metavar="A|B|C|D|E|F|G")
    ap.add_argument("rad", nargs="?")
    ap.add_argument("--sources")
    ap.add_argument("--profil")
    ap.add_argument("--out")
    ap.add_argument("--json", dest="json_out")
    ap.add_argument("--allow-mutation", action="store_true", help="dopusti mutacijsku fazu G samo uz valjan snapshot")
    ap.add_argument("--project-root", default=None, help="korijen project statea za mutation/snapshot gate")
    a = ap.parse_args()

    try:
        motor = nadi_motor()
    except MotorOverrideError as exc:
        # v1.1-fix (AUD-010): tvrda greška s imenom loše putanje, bez fallbacka.
        print(f"❌ rad-audit nije pronađen na eksplicitno zadanoj putanji: {exc}")
        print()
        print("RAD_AUDIT_HOME je zadan, pa Katedra NE traži drugi motor:")
        print("tiha zamjena drugim rad-auditom dala bi audit koji nisi tražio.")
        print()
        print("Što napraviti: ispravi ili ukloni override")
        print("  export RAD_AUDIT_HOME=/putanja/do/rad-audit/scripts")
        print("  unset RAD_AUDIT_HOME   # pa Katedra sama traži motor")
        return 3

    if a.gdje:
        print(motor or "")
        return 0 if motor else 3
    if a.provjeri or not (a.audit or a.faza):
        return izvjestaj_o_motoru(motor)
    if not motor:
        return izvjestaj_o_motoru(motor)

    contract, error = _ugovor_ili_greska(motor)
    if error:
        print(f"⚠️  motor je nekompatibilan: {error}", file=sys.stderr)
        print("Katedra neće pokrenuti nekompatibilan motor.", file=sys.stderr)
        return 4

    profil = ucitaj_profil(a.profil)
    if profil:
        pravila = ResolvedRules.from_profile(profil)
        print(
            f"[profil: {pravila.naziv} · citatni stil: "
            f"{pravila.citation_style or 'n/a'} · odlomak "
            f"{pravila.paragraph_min if pravila.paragraph_min is not None else '?'}–"
            f"{pravila.paragraph_max if pravila.paragraph_max is not None else '?'} redaka · "
            f"prijelom pred poglavljem: "
            f"{pravila.page_break_before if pravila.page_break_before is not None else 'n/a'}]\n"
        )

    if a.faza:
        phase = a.faza.upper()
        if phase == "D":
            print("Za fazu D koristi --audit uz --sources.", file=sys.stderr)
            return 2
        # v1.1-advisory patch (Q11): „--faza A" bez dokumenta je bio os.path.abspath(None),
        # dakle TypeError i izlazni kod 1. Jedinica 1 ovdje znači „audit je gotov i ima
        # kritičnih nalaza", pa je pozivatelj pad skripte čitao kao nalaz o radu;
        # neispravan poziv mora izaći kodom 2, kako i piše u zaglavlju ove datoteke.
        put_rada = a.rad or a.audit
        if not put_rada:
            print(f"❌ faza {phase} traži dokument, a nijedan nije zadan.", file=sys.stderr)
            print(f"   Što napraviti: python3 <KATEDRA_SKILL>/scripts/engine.py --faza {phase} "
                  "./rad.docx", file=sys.stderr)
            return 2
        rad = os.path.abspath(put_rada)
        if phase == "G":
            if not a.allow_mutation:
                print("❌ faza G je mutation capability: dodaj --allow-mutation tek nakon odobrenja i snapshota.", file=sys.stderr)
                return 2
            gate = mutation_snapshot_status(rad, a.project_root)
            if not gate.get("passed"):
                print(f"❌ mutation snapshot gate: {gate.get('reason')}", file=sys.stderr)
                return 2
            print(f"[mutation gate: snapshot {gate.get('snapshot_id')} · {gate.get('version_id')} ✓]")
        try:
            entrypoint = contract.phase_entrypoint(phase)
        except ContractError as exc:
            print(f"Nekompatibilan phase contract: {exc}", file=sys.stderr)
            return 4
        return pokreni(motor, entrypoint, [rad])

    rad = os.path.abspath(a.audit)
    argv = [rad]
    if a.sources:
        argv += ["--sources", os.path.abspath(a.sources)]
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
        argv += ["--out", os.path.abspath(a.out)]
    json_abs = None
    if a.json_out:
        json_abs = os.path.abspath(a.json_out)
        os.makedirs(os.path.dirname(json_abs) or ".", exist_ok=True)
        argv += ["--json", json_abs]
        # v1.1-fix (D11): makni zatečeni nalazi.json PRIJE pokretanja motora.
        # Ista se putanja reusa (audit.md korak 3, predaja.md), pa bi stari
        # čisti nalaz preživio pad motora i bio pročitan kao svjež audit.
        if os.path.exists(json_abs):
            try:
                os.unlink(json_abs)
            except OSError as exc:
                print(
                    f"⚠️  stari DocumentAuditResult se ne može ukloniti: {exc}",
                    file=sys.stderr,
                )
                print(
                    f"Što napraviti: ručno obriši {a.json_out} pa ponovi audit.",
                    file=sys.stderr,
                )
                return 4

    pokretanje_ts = time.time()
    rc = pokreni(motor, contract.audit_entrypoint, argv)

    if a.json_out:
        # v1.1-fix (D11): rc motora je dio nalaza, ne dekoracija.
        if rc not in MOTOR_USPJESNI_KODOVI:
            print(
                f"⚠️  motor je završio izlaznim kodom {rc}; nije proizveden svjež "
                "DocumentAuditResult i Katedra ga ne interpretira.",
                file=sys.stderr,
            )
            print(
                "Što napraviti: pročitaj poruku motora iznad, otkloni uzrok "
                "(npr. neispravan .docx ili nedostupan izvor) pa ponovi audit.",
                file=sys.stderr,
            )
            return 4
        if not os.path.isfile(json_abs):
            print(
                "⚠️  DocumentAuditResult nije proizveden na traženoj --json putanji.",
                file=sys.stderr,
            )
            return 4
        # v1.1-fix (D11): datoteka starija od pokretanja motora je ostatak, ne nalaz.
        try:
            mtime = os.path.getmtime(json_abs)
        except OSError:
            mtime = 0.0
        if mtime < pokretanje_ts - MTIME_TOLERANCIJA_S:
            print(
                "⚠️  DocumentAuditResult na --json putanji je stariji od pokretanja "
                "motora; to je zaostali nalaz iz ranijeg audita.",
                file=sys.stderr,
            )
            print(
                f"Što napraviti: obriši {a.json_out} pa ponovi audit s motorom "
                "koji stvarno upisuje --json.",
                file=sys.stderr,
            )
            return 4
        try:
            nalazi = validate_document_audit_result(a.json_out, contract)
        except ContractError as exc:
            print(f"⚠️  nekompatibilan rezultat (DocumentAuditResult): {exc}", file=sys.stderr)
            return 4

        brojevi = nalazi["counts"]
        n_kriticno = brojevi.get("kritično", 0)
        print(
            f"\n[Katedra: kritično {n_kriticno} · srednje {brojevi.get('srednje', 0)} · "
            f"kozmetičko {brojevi.get('kozmetičko', 0)} → {a.json_out}]"
        )
        faze = nalazi["phase_exit_codes"]
        pale = [f for f, rc_ in faze.items() if rc_ not in (0, None)]
        if pale:
            print(f"[Katedra: faze s nalazima: {', '.join(pale)}]")
        return 1 if n_kriticno else 0

    return rc


if __name__ == "__main__":
    sys.exit(main())
