"""ManuscriptV1 (Katedra app) -> .katedra/ radni direktorij (katedra-lite).

Jednosmjerna, deterministična pretvorba bez modela i bez mreže:
  sections[]  -> .katedra/poglavlja/NN-slug.md   (Tiptap JSON -> markdown po konvenciji rukopisa)
  sources[]   -> .katedra/izvori.json            (isti oblik koji verify_sources.py --json piše)
  meta        -> .katedra/stanje.json            (kroz stanje_init.py, ne ručno)
  profil      -> .katedra/resolved_profile.json  (iz Lektinog katedra-pack hinta, vidi pack_profile.py)

Tekst rada nikad ne napušta radni direktorij: pozivatelj ga briše nakon gatea.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import unicodedata
from typing import Any

from pack_profile import resolved_profile_from_hint

KIND_ORDER = {"frontmatter": 0, "chapter": 1, "conclusion": 2, "references": 3}
WORK_TYPE = {"s": "seminarski", "z": "zavrsni", "d": "diplomski"}


def slug(text: str, fallback: str = "poglavlje") -> str:
    norm = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    norm = re.sub(r"[^a-zA-Z0-9]+", "-", norm).strip("-").lower()
    return norm[:40] or fallback


# ---------------------------------------------------------------- Tiptap -> markdown

def _marks(text: str, marks: list[dict[str, Any]] | None) -> str:
    if not marks:
        return text
    types = {m.get("type") for m in marks}
    if "code" in types:
        text = f"`{text}`"
    if "italic" in types:
        text = f"*{text}*"
    if "bold" in types:
        text = f"**{text}**"
    return text


def _inline(node: dict[str, Any]) -> str:
    t = node.get("type")
    if t == "text":
        return _marks(node.get("text", ""), node.get("marks"))
    if t == "hardBreak":
        return "  \n"
    return "".join(_inline(c) for c in node.get("content", []) or [])


def _table(node: dict[str, Any]) -> list[str]:
    rows: list[list[str]] = []
    for row in node.get("content", []) or []:
        cells = []
        for cell in row.get("content", []) or []:
            cells.append(" ".join(_inline(p).strip() for p in cell.get("content", []) or []) or " ")
        rows.append(cells)
    if not rows:
        return []
    width = max(len(r) for r in rows)
    rows = [r + [" "] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
    out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return out


def _block(node: dict[str, Any], depth: int = 0) -> list[str]:
    t = node.get("type")
    kids = node.get("content", []) or []
    if t == "paragraph":
        text = _inline(node).strip()
        return [text] if text else []
    if t == "heading":
        level = min(int(node.get("attrs", {}).get("level", 2)), 6)
        # naslov sekcije je razina 1 u datoteci; naslovi unutar sadržaja idu razinu niže
        return ["#" * max(level, 2) + " " + _inline(node).strip()]
    if t in ("bulletList", "orderedList"):
        lines: list[str] = []
        for i, item in enumerate(kids, 1):
            prefix = f"{i}. " if t == "orderedList" else "- "
            sub = [ln for c in item.get("content", []) or [] for ln in _block(c, depth + 1)]
            if not sub:
                continue
            lines.append("  " * depth + prefix + sub[0])
            lines += ["  " * (depth + 1) + s for s in sub[1:]]
        return lines
    if t == "blockquote":
        inner = [ln for c in kids for ln in _block(c, depth)]
        return ["> " + ln for ln in inner]
    if t == "table":
        return _table(node)
    if t == "horizontalRule":
        return ["[[PB]]"]
    if t == "codeBlock":
        return ["```", _inline(node), "```"]
    if t == "doc" or kids:
        out: list[str] = []
        for c in kids:
            b = _block(c, depth)
            if b:
                out += b + [""]
        return out
    return []


def tiptap_to_markdown(doc: dict[str, Any] | None) -> str:
    if not doc:
        return ""
    lines = _block(doc)
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


# ---------------------------------------------------------------- izvori

def sources_to_izvori(sources: list[dict[str, Any]], scripts_dir: str) -> dict[str, Any]:
    """Isti oblik koji verify_sources.py --json piše, kroz iste pomoćnike (source_semantics), da ga
    evidence_gate.py i claim_ledger.py čitaju bez iznimke. Status `verified` dolazi iz appa
    (independent citation verifier), `unverified` inače; nikad se ne izmišlja identitet izvora."""
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    from source_semantics import UNVERIFIED, VERIFIED, classify_quality, verification_record  # noqa: E402
    zapisi = []
    for s in sources:
        url = s.get("urlOrDoi") or ""
        doi = url.lower().replace("https://doi.org/", "") if "doi.org/" in url.lower() else (url if url.lower().startswith("10.") else "")
        status = VERIFIED if s.get("verified") else UNVERIFIED
        ver = verification_record(status, provider="katedra-app", scope="identity",
                                  reason="ManuscriptV1.sources.verified iz Katedrinog citation verifiera" if s.get("verified")
                                  else "app nije potvrdio izvor; ručno provjeriti")
        source_type = "journal_article" if doi else "unknown"
        zapisi.append({
            "source_id": s.get("id"),
            "autori": s.get("authors") or "",
            "godina": s.get("year"),
            "naslov": s.get("title") or "",
            "doi": doi,
            "url": "" if doi else url,
            "status": "✅" if s.get("verified") else "⚠️",
            "obrazlozenje": ver["reason"],
            "verification": ver,
            "source_entity": {"kind": "bibliographic_source", "type": source_type},
            "quality": classify_quality(source_type, status),
            "blocking": False,
        })
    return {"verzija": "manuscript-v1", "izvori": zapisi}


# ---------------------------------------------------------------- plan.json

_ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"}


def _sp(cmd: list[str]) -> subprocess.CompletedProcess:
    """Jedino mjesto koje zove skripte paketa: utf-8 u oba smjera (kvar 119 katedra-lite —
    bez encoding= cp1250 konzola sruši čitač i r.stdout postane None)."""
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=_ENV)


def _run_ok(cmd: list[str], what: str) -> None:
    r = _sp(cmd)
    if r.returncode != 0:
        raise RuntimeError(f"{what} pao: {r.stdout[-500:]} {r.stderr[-300:]}")


def _plan_from_sections(manuscript: dict[str, Any], project_root: str, scripts_dir: str, plan: dict[str, Any]) -> None:
    """Artefakti plana koje je student odobrio u appu -> perspectives.json + plan.json, kroz iste
    skripte i iste gateove kao u Coworku (perspective gate -> plan gate -> odobri --actor user).
    plan = {thesis, question, perspectives: [{label, position, why}], approved}. Ništa se ne izmišlja:
    bez teze i dviju perspektiva plan se za završni/diplomski ne može odobriti, i to gate prijavi."""
    teza = plan.get("thesis") or "[TEZA: nije zadana u appu]"
    pm = os.path.join(scripts_dir, "perspective_map.py")
    _run_ok([sys.executable, pm, "--project-root", project_root, "init", "--topic", manuscript.get("title") or "(bez naslova)",
             "--question", plan.get("question") or "[PITANJE: nije zadano u appu]", "--force"], "perspective_map init")
    for p in plan.get("perspectives") or []:
        _run_ok([sys.executable, pm, "--project-root", project_root, "add", "--label", p.get("label", "?"),
                 "--position", p.get("position", "?"), "--why", p.get("why", "?")], "perspective_map add")
    ps = os.path.join(scripts_dir, "plan_state.py")
    r = _sp([sys.executable, ps, "--project-root", project_root, "init", "--teza", teza, "--force"])
    if r.returncode != 0:
        raise RuntimeError(f"plan_state.py init pao: {r.stdout[-400:]} {r.stderr[-400:]}")
    # Tablica `| N. | Naslov | str | opis sadržaja | izvori |`: opis i izvori dolaze iz planning koraka
    # (plan.chapters, po sectionId); bez njih PLAN GATE s pravom odbija odobrenje.
    by_section = {c.get("sectionId"): c for c in (plan.get("chapters") or [])}
    rows = ["<!-- STRUKTURA:POCETAK -->", "| Pogl. | Naslov | Str. | Sadržaj | Izvori |", "|---|---|---|---|---|"]
    n = 0
    for s in sorted(manuscript.get("sections") or [], key=lambda x: (KIND_ORDER.get(x.get("kind"), 1), x.get("order", 0))):
        if s.get("kind") not in ("chapter", "conclusion"):
            continue
        n += 1
        c = by_section.get(s.get("id")) or {}
        pages = c.get("pages") or max(1, round((s.get("targetWords") or 900) / 300))
        opis = str(c.get("content") or "").replace("|", "/").replace("\n", " ")
        izvori = ", ".join(c.get("sources") or [])
        rows.append(f"| {n}. | {s.get('title') or 'Poglavlje'} | {pages} | {opis} | {izvori} |")
    rows.append("<!-- STRUKTURA:KRAJ -->")
    md = os.path.join(project_root, ".katedra", "struktura_iz_appa.md")
    with open(md, "w", encoding="utf-8") as f:
        f.write("\n".join(rows) + "\n")
    r = _sp([sys.executable, ps, "--project-root", project_root, "import", md, "--force"])
    if r.returncode != 0:
        raise RuntimeError(f"plan_state.py import pao: {r.stdout[-400:]} {r.stderr[-400:]}")
    r = _sp([sys.executable, ps, "--project-root", project_root, "odobri", "--actor", "user"])
    if r.returncode != 0:
        raise RuntimeError(f"plan_state.py odobri pao: {r.stdout[-600:]} {r.stderr[-400:]}")


# ---------------------------------------------------------------- glavno

def write_katedra(manuscript: dict[str, Any], project_root: str, profile_hint: dict[str, Any] | None,
                  scripts_dir: str, ogranicenje: str | None = None, mod: str = "novi-rad",
                  plan_approved: bool = False, plan: dict[str, Any] | None = None,
                  mentor_comments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """`mod` i `plan_approved` dolaze iz appa (agent_runs / KatedraProjectState), ne iz teksta:
    stanje_init odbija mod=pisanje za završni i diplomski bez odobrenog plana, i to je ispravno."""
    kat = os.path.join(project_root, ".katedra")
    pogl = os.path.join(kat, "poglavlja")
    os.makedirs(pogl, exist_ok=True)

    meta = manuscript.get("meta") or {}
    tip = WORK_TYPE.get(manuscript.get("workType", "d"), "diplomski")
    profil = resolved_profile_from_hint(profile_hint, unit_id=meta.get("unitId") or "nepoznato", tip=tip)
    with open(os.path.join(kat, "resolved_profile.json"), "w", encoding="utf-8") as f:
        json.dump(profil, f, ensure_ascii=False, indent=1)

    # stanje.json isključivo kroz stanje_init.py (stanje_schema: nijednu datoteku ne piši ručno)
    cmd = [sys.executable, os.path.join(scripts_dir, "stanje_init.py"), "--project-root", project_root,
           "--mod", "novi-rad", "--tip", tip, "--tema", manuscript.get("title") or "(bez naslova)",
           "--fakultet", profil["slug"], "--fakultet-izvan-registryja", profil["slug"],
           "--citatni-stil", profil["citiranje"]["stil"],
           "--ogranicenje", ogranicenje or "profil je Lektina projekcija (katedra-pack); tehničku usklađenost potvrđuje Lekta",
           "--force"]
    if meta.get("mentor"):
        cmd += ["--mentor", meta["mentor"]]
    if meta.get("deadline"):
        cmd += ["--rok", str(meta["deadline"])[:10]]
    if manuscript.get("sources"):
        cmd += ["--ima", "literatura"]
    r = _sp(cmd)
    if r.returncode != 0:
        raise RuntimeError(f"stanje_init.py pao ({r.returncode}): {r.stdout[-800:]} {r.stderr[-800:]}")
    # os dijelova iz profila (dijelovi.py --sij) i zamjerke mentora iz appa (isti oblik kao extract_comments.py)
    _sp([sys.executable, os.path.join(scripts_dir, "dijelovi.py"), "--project-root", project_root, "--sij",
         "--profil", os.path.join(kat, "resolved_profile.json")])
    zamjerke = []
    for i, z in enumerate(mentor_comments or [], 1):
        zamjerke.append({"id": z.get("id") or f"Z{i}", "autor": z.get("author") or "mentor", "mjesto": z.get("location") or "",
                         "tekst": z.get("text") or "", "tip": z.get("kind") or "sadrzaj",
                         "status": "rijeseno" if z.get("resolved") else "otvoreno",
                         "rijeseno_gdje": z.get("resolvedWhere"), "izvor_id": f"app:{z.get('id') or i}", "_datum": z.get("date") or ""})
    with open(os.path.join(kat, "zamjerke.json"), "w", encoding="utf-8") as f:
        json.dump({"verzija": "manuscript-v1", "izvor": "katedra-app", "zamjerke": zamjerke}, f, ensure_ascii=False, indent=1)

    # plan.json iz sekcija rukopisa (struktura koju je student već odobrio u appu), kroz plan_state.py
    if plan_approved:
        _plan_from_sections(manuscript, project_root, scripts_dir, plan or {})
    postavke = []
    if plan_approved:
        postavke.append("plan_odobren=true")
    # mod=audit/predaja traže rad.docx koji u ovom trenutku još ne postoji; njih postavlja
    # pozivatelj NAKON gradnje dokumenta (app._verify_job). Ovdje smije samo pisanje.
    if mod not in ("novi-rad", "audit", "predaja"):
        postavke.append(f"mod={mod}")
    for p in postavke:
        r = _sp([sys.executable, os.path.join(scripts_dir, "stanje_init.py"), "--project-root", project_root, "--set", p])
        if r.returncode != 0:
            raise RuntimeError(f"stanje_init.py --set {p} pao: {r.stdout[-400:]} {r.stderr[-400:]}")

    sections = sorted(manuscript.get("sections") or [], key=lambda s: (KIND_ORDER.get(s.get("kind"), 1), s.get("order", 0)))
    written = []
    n = 0
    for s in sections:
        body = tiptap_to_markdown(s.get("content"))
        if s.get("kind") == "references":
            name = "literatura.md"
        else:
            n += 1
            name = f"{n:02d}-{slug(s.get('title', ''), 'poglavlje')}.md"
        with open(os.path.join(pogl, name), "w", encoding="utf-8") as f:
            f.write(f"# {s.get('title') or 'Poglavlje'}\n\n{body}")
        written.append({"file": name, "sectionId": s.get("id"), "status": s.get("status"), "chars": len(body)})

    with open(os.path.join(kat, "izvori.json"), "w", encoding="utf-8") as f:
        json.dump(sources_to_izvori(manuscript.get("sources") or [], scripts_dir), f, ensure_ascii=False, indent=1)

    return {"kat": kat, "poglavlja": written, "profil": profil["slug"], "tip": tip}


if __name__ == "__main__":  # ručna uporaba: python3 manuscript_to_katedra.py rukopis.json ./projekt
    m = json.load(open(sys.argv[1], encoding="utf-8"))
    here = os.path.dirname(os.path.abspath(__file__))
    print(json.dumps(write_katedra(m, sys.argv[2], None, os.path.join(here, "..", "katedra-lite", "scripts")), ensure_ascii=False, indent=1))
