#!/usr/bin/env python3
"""Project-local artifact hash/version manifest.

Tracks content versions without conflating them with Git commits. Artifact identity
is stable for a normalized project-relative path; each content hash gets a monotonic
``vN`` version unless a caller supplies a snapshot-aligned version id.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from context import atomic_write_json, resolve_project_root  # noqa: E402

SCHEMA_VERSION = 1


def file_sha256(path: str | os.PathLike[str]) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 16), b""):
            h.update(block)
    return h.hexdigest()


def _norm_path(project_root: str | os.PathLike[str], path: str | os.PathLike[str]) -> str:
    """Putanja artefakta izražena JEDINO prema korijenu projekta.

    Manifest putuje s radom (predaja mentoru, arhiva, git), pa u njemu nema što
    tražiti apsolutna putanja s korisničkim imenom — to je Q13-zakrpa ispravno
    uočila. Ali sidro koje je uvela za datoteke izvan projekta bio je $HOME, pa
    je IDENTITET artefakta počeo ovisiti o varijabli okoline: isti rad u istom
    projektu dobivao je „~/Preuzimanja/rad.docx" u jednoj ljusci i
    „../Preuzimanja/rad.docx" u drugoj — dva artifact_id-a, dva zapisa v1 u istom
    manifestu i `status` koji s „krivim" HOME-om javlja da artefakt nije praćen
    (a na tome visi mutation gate faze G). Identitet stanja ne smije se mijenjati
    s okolinom; to je teži kvar od higijenskog koji je zakrpa rješavala.

    Sidro je zato isključivo korijen projekta, koji je eksplicitan ulaz
    (--project-root / KATEDRA_PROJECT_ROOT / cwd): rad unutar projekta daje
    „poglavlja/rad.docx", rad izvan njega „../Preuzimanja/rad.docx". Rezultat je
    ključ identiteta i ne zapisuje se doslovno u manifest — za zapis v.
    `_prikaz_putanje`, koja iz njega miče sve što bi moglo nositi korisničko ime.
    """
    root = Path(project_root).resolve()
    p = Path(path).resolve()
    try:
        return p.relative_to(root).as_posix()
    except ValueError:
        pass
    try:
        return Path(os.path.relpath(p, root)).as_posix()
    except ValueError:
        # relpath ne postoji samo kad putanje nemaju zajednički korijen (druga
        # particija na Windowsu). Tada je stabilan identitet važniji od higijene.
        return p.as_posix()


def _artifact_id(normalized_path: str) -> str:
    return "art_" + hashlib.sha256(normalized_path.encode("utf-8")).hexdigest()[:16]


def _prikaz_putanje(kljuc: str) -> str:
    """Putanja kakva SMIJE stajati u manifestu koji putuje s radom.

    Q13 je tražila da u `.katedra/artifacts.json` ne bude korisničkog imena, i to
    je i dalje ispravan zahtjev — samo se ne smije plaćati identitetom. Zato se
    razdvaja: identitet je puni ključ prema korijenu projekta (`_norm_path`), a
    zapisuje se samo ono što o tuđem disku ništa ne odaje. Artefakt unutar
    projekta zapisuje se cijelom relativnom putanjom (tu nema ničega osobnog);
    artefakt IZVAN projekta svede se na zadnje dvije komponente s oznakom „…/",
    pa se datoteka i dalje prepoznaje („…/Preuzimanja/rad.docx"), a struktura
    tuđeg diska ne izlazi iz nje. Pravilo je strukturno (leži li datoteka izvan
    korijena), ne popis sumnjivih imena mapa.
    """
    if not kljuc.startswith("../") and not kljuc.startswith("/"):
        return kljuc
    dijelovi = [d for d in kljuc.split("/") if d not in ("", "..")]
    return "…/" + "/".join(dijelovi[-2:])


def _nadji_artefakt(manifest: dict, root: Path, p: Path, aid: str, normalized: str):
    """Nađi zapis za ovu datoteku, uključujući manifest zapisan starijim sidrom.

    Bez ovoga bi promjena sidra („~/…" → putanja prema korijenu projekta) svakom
    postojećem korisniku rascijepila povijest verzija: isti rad dobio bi novi
    artifact_id i krenuo ponovno od v1, a `status` bi do prvog `track`-a javljao
    da artefakt nije praćen. Stari zapis se prepoznaje po tome što pokazuje na
    ISTU datoteku na disku, pa se jednom preimenuje na novo sidro. Prepoznavanje
    smije koristiti $HOME (stari zapisi su tako i nastali), ali NOVI identitet iz
    njega se nikad ne računa — ako prepoznavanje ne uspije, ostaje uredan novi
    zapis, nikad tiho kriv.
    """
    for a in manifest.get("artifacts") or []:
        if a.get("artifact_id") == aid:
            return a
    for a in manifest.get("artifacts") or []:
        stara = str(a.get("path") or "")
        if not stara or stara.startswith("…/"):
            continue                       # skraćeni prikaz se ne da razriješiti
        try:
            kandidat = Path(os.path.expanduser(stara))
            if not kandidat.is_absolute():
                kandidat = root / kandidat
            if kandidat.resolve() != p:
                continue
        except OSError:
            continue
        a["path"] = _prikaz_putanje(normalized)
        a["artifact_id"] = aid
        return a
    return None


def _manifest_path(project_root: str | os.PathLike[str]) -> Path:
    return Path(project_root).resolve() / ".katedra" / "artifacts.json"


def load_manifest(project_root: str | os.PathLike[str]) -> dict:
    p = _manifest_path(project_root)
    if not p.exists():
        return {"schema_version": SCHEMA_VERSION, "artifacts": []}
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("artifacts"), list):
        raise ValueError(f"{p} nema očekivani artifact-manifest oblik")
    if data.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"{p} schema_version mora biti {SCHEMA_VERSION}")
    return data


def save_manifest(project_root: str | os.PathLike[str], data: dict) -> Path:
    """Q14-zakrpa: zapis je išao na fiksno ime `artifacts.json.tmp`.

    Dvije istovremene naredbe dijelile su to ime, pa je gubitnik rušio
    os.replace, a unaprijed podmetnuta simbolička poveznica na toj putanji
    slijedila se i pisala izvan projekta. Zajednički helper piše u jedinstvenu
    privremenu datoteku u istom direktoriju i odbija pisati kroz poveznicu.

    Rep audita (2. krug): provjera je pokrivala samo zadnju komponentu putanje,
    pa je poveznica na samom direktoriju `.katedra` tiho odvodila manifest izvan
    projekta, uz izlaz 0. Korijen projekta je ovdje poznat, pa se predaje kao
    sidro: zapis mora završiti unutar projekta ili se ne događa.
    """
    p = _manifest_path(project_root)
    atomic_write_json(str(p), data, sidro=str(Path(project_root).resolve()))
    return p


def _num_version(v: str | None) -> int:
    m = re.search(r"(\d+)$", str(v or ""))
    return int(m.group(1)) if m else 0


def record_artifact(
    project_root: str | os.PathLike[str],
    path: str | os.PathLike[str],
    *,
    kind: str = "document",
    version_id: str | None = None,
    snapshot_id: str | None = None,
    snapshot_path: str | None = None,
    note: str | None = None,
) -> tuple[dict, dict]:
    root = Path(project_root).resolve()
    p = Path(path).resolve()
    if not p.is_file():
        raise FileNotFoundError(str(p))
    manifest = load_manifest(root)
    normalized = _norm_path(root, p)
    aid = _artifact_id(normalized)
    artifact = _nadji_artefakt(manifest, root, p, aid, normalized)
    if artifact is None:
        artifact = {
            "artifact_id": aid,
            "path": _prikaz_putanje(normalized),
            "kind": kind,
            "current_version": None,
            "versions": [],
        }
        manifest["artifacts"].append(artifact)
    else:
        artifact["kind"] = artifact.get("kind") or kind

    digest = file_sha256(p)
    existing = next((v for v in artifact["versions"] if v.get("sha256") == digest), None)
    if existing is not None:
        artifact["current_version"] = existing["version_id"]
        save_manifest(root, manifest)
        rec = dict(existing)
        rec["artifact_id"] = aid
        return manifest, rec

    if version_id is None:
        n = max([_num_version(v.get("version_id")) for v in artifact["versions"]] or [0]) + 1
        version_id = f"v{n}"
    elif any(v.get("version_id") == version_id for v in artifact["versions"]):
        raise ValueError(f"version_id {version_id} već postoji za {normalized}")

    rec = {
        "version_id": version_id,
        "sha256": digest,
        "size_bytes": p.stat().st_size,
        "recorded_at": dt.datetime.now().replace(microsecond=0).isoformat(),
        "snapshot_id": snapshot_id,
        "snapshot_path": snapshot_path,
        "note": note or "",
    }
    artifact["versions"].append(rec)
    artifact["current_version"] = version_id
    save_manifest(root, manifest)
    out = dict(rec)
    out["artifact_id"] = aid
    return manifest, out


def current_record(project_root: str | os.PathLike[str], path: str | os.PathLike[str]):
    root = Path(project_root).resolve()
    normalized = _norm_path(root, path)
    aid = _artifact_id(normalized)
    manifest = load_manifest(root)
    # Čitanje ne dira manifest na disku; stari zapis se prepoznaje samo u memoriji
    # da `status` ne bi lagao „artefakt nije praćen" prije prvog novog `track`-a.
    artifact = _nadji_artefakt(manifest, root, Path(path).resolve(), aid, normalized)
    if artifact is None:
        return None, None
    current = next((v for v in artifact["versions"] if v.get("version_id") == artifact.get("current_version")), None)
    return artifact, current


def main() -> int:
    ap = argparse.ArgumentParser(description="Praćenje hash/verzija project artefakata")
    ap.add_argument("--project-root", default=None)
    sub = ap.add_subparsers(dest="cmd", required=True)
    tr = sub.add_parser("track")
    tr.add_argument("file")
    tr.add_argument("--kind", default="document")
    tr.add_argument("--note", default="")
    st = sub.add_parser("status")
    st.add_argument("file")
    sub.add_parser("show")
    a = ap.parse_args()
    root = resolve_project_root(a.project_root)
    try:
        if a.cmd == "track":
            _, rec = record_artifact(root, a.file, kind=a.kind, note=a.note)
            print(f"✅ {rec['artifact_id']} {rec['version_id']} sha256={rec['sha256'][:16]}…")
            return 0
        if a.cmd == "show":
            print(json.dumps(load_manifest(root), ensure_ascii=False, indent=2))
            return 0
        artifact, current = current_record(root, a.file)
        if artifact is None or current is None:
            print("❌ artefakt nije praćen — prvo artifact_state.py track", file=sys.stderr)
            return 2
        p = Path(a.file)
        if not p.is_file():
            print(f"❌ artefakt nedostaje: {p}", file=sys.stderr)
            return 1
        digest = file_sha256(p)
        if digest != current.get("sha256"):
            print(f"⚠️ ARTIFACT DRIFT: {artifact['path']} se promijenio nakon {current['version_id']}")
            print(f"   tracked {current['sha256'][:16]}… · current {digest[:16]}…")
            return 1
        print(f"✅ {artifact['artifact_id']} {current['version_id']} hash odgovara")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as e:
        print(f"❌ artifact state: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
