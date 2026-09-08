#!/usr/bin/env python3
"""Project-local path resolution shared by Katedra state tools.

Project state belongs to the academic-work project, never to the installed skill.
Resolution order for the project root is explicit CLI value, KATEDRA_PROJECT_ROOT,
then the current working directory. An explicit state directory (``--kat``) wins
above project-root resolution to preserve existing callers.
"""
from __future__ import annotations

import json
import os
import tempfile
from typing import Any, Mapping

PROJECT_ROOT_ENV = "KATEDRA_PROJECT_ROOT"


def _absolute(path: str) -> str:
    return os.path.abspath(os.path.expanduser(path))


def resolve_project_root(
    project_root: str | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    cwd: str | None = None,
) -> str:
    """Resolve project root: CLI > KATEDRA_PROJECT_ROOT > cwd."""
    if project_root:
        return _absolute(project_root)
    env = os.environ if environ is None else environ
    from_env = (env.get(PROJECT_ROOT_ENV) or "").strip()
    if from_env:
        return _absolute(from_env)
    return _absolute(cwd or os.getcwd())


def resolve_state_dir(
    kat: str | None = None,
    project_root: str | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    cwd: str | None = None,
) -> str:
    """Resolve .katedra directory; explicit --kat has highest precedence."""
    if kat:
        return _absolute(kat)
    root = resolve_project_root(project_root, environ=environ, cwd=cwd)
    return os.path.join(root, ".katedra")


def resolve_state_file(
    name: str,
    *,
    kat: str | None = None,
    project_root: str | None = None,
    environ: Mapping[str, str] | None = None,
    cwd: str | None = None,
) -> str:
    """Resolve a named file inside project-local .katedra state."""
    return os.path.join(
        resolve_state_dir(kat, project_root, environ=environ, cwd=cwd),
        name,
    )


# --- v1.1-advisory patch (Q14): jedan zajednički atomaran zapis stanja ---
# Stari obrazac („<datoteka>.tmp" pa os.replace) ima dvije rupe: dvije istovremene
# naredbe dijele isto ime pa gubitnik pukne s FileNotFoundError, a unaprijed
# podmetnuta simbolička poveznica na .tmp putanji se slijedi i stanje.json završi
# izvan projekta. Zapis ide preko tempfile.mkstemp (O_CREAT|O_EXCL, jedinstveno
# ime u istom direktoriju) i odbija se ako je cilj simbolička poveznica.

class NesigurnaPutanja(OSError):
    """Cilj zapisa je simbolička poveznica — zapis se odbija, ne slijedi se."""


def _unutar(putanja: str, sidro: str) -> bool:
    """Leži li razriješena putanja unutar razriješenog sidra (ili je jednaka)?"""
    a = os.path.realpath(sidro)
    b = os.path.realpath(putanja)
    return b == a or b.startswith(a.rstrip(os.sep) + os.sep)


def atomic_write_text(
    path: str,
    text: str,
    *,
    encoding: str = "utf-8",
    dopusti_poveznicu: bool = False,
    sidro: str | None = None,
) -> str:
    """Atomaran zapis teksta: jedinstveni tmp u istom direktoriju pa os.replace.

    Rep audita (2. krug) — PREKORREKCIJA: jedno pravilo pokrivalo je dva različita
    konteksta. PROJEKTNO stanje (.katedra u repozitoriju) alat sam stvara i njime
    upravlja, pa poveznica ondje znači da zapis izlazi iz projekta i odbija se.
    KORISNIČKI profil u $HOME nije alatov direktorij: upravitelji dotfileova (GNU
    stow, chezmoi) rutinski simlinkaju konfiguraciju u $HOME, pa je poveznica
    ondje uobičajen, a ne sumnjiv obrazac — odbijanje je ondje lažna prijava koja
    korisniku blokira posve ispravan setup. Zato režim bira POZIVATELJ
    (`dopusti_poveznicu`), prema tome čije je stanje, a ne sama datoteka.

    Rep audita (2. krug) — NEDOVRŠEN POPRAVAK: provjera je gledala samo ZADNJU
    komponentu putanje, pa je poveznica na samom direktoriju (`.katedra` →
    izvan projekta) i dalje tiho odvodila zapis van, uz izlaz 0. Zato se u
    strogom režimu provjerava i direktorij stanja, a pozivatelj koji zna korijen
    projekta može zadati `sidro`: tada zapis mora ostati unutar njega bez obzira
    na to koliko poveznica stoji na putu.
    """
    put = _absolute(path)
    direktorij = os.path.dirname(put) or "."
    if dopusti_poveznicu:
        # Korisnički direktorij: poveznica je ovdje ISPRAVAN ulaz — i na datoteci
        # i na cijelom direktoriju (stow i chezmoi linkaju oboje). Piše se u pravu
        # datoteku na koju poveznica pokazuje, pa poveznica ostaje netaknuta;
        # pozivatelj dobiva stvarnu putanju natrag da ispis ne tvrdi jedno dok se
        # piše drugdje.
        if os.path.islink(put):
            cilj = os.path.realpath(put)
            if os.path.exists(cilj) and not os.path.isfile(cilj):
                raise NesigurnaPutanja(
                    f"{put} je poveznica na {cilj}, a to nije obična datoteka. Što "
                    "napraviti: preusmjeri poveznicu na datoteku profila ili je obriši."
                )
            put, direktorij = cilj, os.path.dirname(cilj) or "."
    elif os.path.islink(put):
        raise NesigurnaPutanja(
            f"{put} je simbolička poveznica, a stanje se piše samo u pravu datoteku "
            "unutar projekta. Što napraviti: obriši poveznicu i vrati pravu datoteku "
            "iz .katedra/migrations/ ili iz gita, pa ponovi naredbu."
        )
    elif (os.path.islink(direktorij)
          and os.path.basename(direktorij.rstrip(os.sep)) == ".katedra"):
        # PREKOREKCIJA (3. krug recenzije): odbijalo se svako odredište čiji je
        # neposredni roditelj poveznica, pa je pao i posve legitiman studentski
        # setup — `--out izvjestaji/gate.json` gdje je „izvjestaji" poveznica na
        # drugi disk ili Dropbox. Granica je vlasništvo, ne dubina putanje:
        # `.katedra` je direktorij koji alat sam stvara i njime upravlja, pa
        # poveznica ondje znači da stanje izlazi iz projekta. Direktorij koji je
        # korisnik izričito naveo njegov je i smije biti poveznica.
        # Ni ovdje se ne gleda cijeli lanac predaka: korisnikov ~/radovi ili /tmp
        # smiju biti poveznice i to je ispravan ulaz.
        raise NesigurnaPutanja(
            f"{direktorij} je simbolička poveznica, pa bi zapis izašao iz projekta. "
            "Što napraviti: zamijeni poveznicu pravim direktorijem stanja (prenesi "
            "sadržaj u .katedra) pa ponovi naredbu."
        )
    if sidro and not _unutar(direktorij, sidro):
        raise NesigurnaPutanja(
            f"zapis bi završio izvan projekta: {os.path.realpath(direktorij)} nije "
            f"unutar {os.path.realpath(sidro)}. Što napraviti: provjeri poveznice u "
            "putanji stanja (.katedra) ili zadaj --project-root koji sadrži rad."
        )
    os.makedirs(direktorij, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        prefix=os.path.basename(put) + ".", suffix=".tmp", dir=direktorij)
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, put)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return put


def atomic_write_json(
    path: str,
    data: Any,
    *,
    indent: int = 2,
    dopusti_poveznicu: bool = False,
    sidro: str | None = None,
) -> str:
    """Atomaran zapis JSON-a (hrvatski znakovi ostaju doslovni)."""
    return atomic_write_text(
        path, json.dumps(data, ensure_ascii=False, indent=indent) + "\n",
        dopusti_poveznicu=dopusti_poveznicu, sidro=sidro)
