"""Isolated LibreOffice worker for refreshing fields in DOCX files.

The public application never calls this service directly. The Supabase Edge
Function authenticates the user and forwards raw DOCX bytes with the internal
``x-lekta-worker-token``. Run the container with a read-only filesystem, a
temporary directory and network disabled.
"""
from __future__ import annotations

import base64
import hmac
import io
import os
import re
import subprocess
import tempfile
import uuid
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from fastapi import FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
WORKER_TOKEN = os.environ.get("LEKTA_FIELD_RENDER_TOKEN", "")
MAX_INPUT_BYTES = int(os.environ.get("LEKTA_FIELD_RENDER_MAX_BYTES", str(20 * 1024 * 1024)))
MAX_OUTPUT_BYTES = int(os.environ.get("LEKTA_FIELD_RENDER_MAX_OUTPUT_BYTES", str(30 * 1024 * 1024)))
MAX_XML_BYTES = int(os.environ.get("LEKTA_FIELD_RENDER_MAX_XML_BYTES", str(20 * 1024 * 1024)))
MAX_UNCOMPRESSED_BYTES = int(os.environ.get("LEKTA_FIELD_RENDER_MAX_UNCOMPRESSED_BYTES", str(80 * 1024 * 1024)))
RENDER_TIMEOUT_SECONDS = int(os.environ.get("LEKTA_FIELD_RENDER_TIMEOUT_SECONDS", "180"))
SOFFICE = os.environ.get("LIBREOFFICE_BIN", "soffice")
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W_VAL = f"{{{NS['w']}}}val"
W_INSTR = f"{{{NS['w']}}}instr"
W_FIELD_CHAR_TYPE = f"{{{NS['w']}}}fldCharType"
FIELD_INSTRUCTION_RE = re.compile(r"\b(?:TOC|PAGE|NUMPAGES|SEQ|REF|PAGEREF|HYPERLINK|DATE|DOCPROPERTY)\b", re.I)

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def _json_error(status: int, code: str, request_id: str = "") -> JSONResponse:
    return JSONResponse({"error": code, "requestId": request_id}, status_code=status)


def _authorized(token: str | None) -> bool:
    return bool(WORKER_TOKEN and token and hmac.compare_digest(token, WORKER_TOKEN))


def _safe_zip(blob: bytes) -> None:
    if len(blob) < 4 or blob[:4] != b"PK\x03\x04":
        raise ValueError("not_a_docx")
    try:
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            total = 0
            names = set(archive.namelist())
            for info in archive.infolist():
                name = info.filename.replace("\\", "/")
                if name.startswith("/") or ".." in name.split("/"):
                    raise ValueError("unsafe_zip_path")
                total += info.file_size
                if total > MAX_UNCOMPRESSED_BYTES:
                    raise ValueError("zip_uncompressed_limit")
                if name.endswith(".xml") and info.file_size > MAX_XML_BYTES:
                    raise ValueError("xml_size_limit")
            if not {"[Content_Types].xml", "word/document.xml"}.issubset(names):
                raise ValueError("not_a_docx")
    except (zipfile.BadZipFile, OSError) as exc:
        raise ValueError("invalid_zip") from exc


def _field_snapshot(path: Path) -> dict[str, Any]:
    fields: list[tuple[str, str]] = []
    unresolved = 0
    for name in ("word/document.xml", "word/footnotes.xml", "word/endnotes.xml"):
        try:
            xml = (path / name).read_bytes()
        except FileNotFoundError:
            continue
        if len(xml) > MAX_XML_BYTES:
            continue
        try:
            root = ET.fromstring(xml)
        except ET.ParseError:
            continue
        active: list[dict[str, Any]] = []
        for node in root.iter():
            tag = node.tag.rsplit("}", 1)[-1]
            if tag == "fldSimple":
                instruction = node.attrib.get(W_INSTR, "")
                result = "".join(t.text or "" for t in node.iter(f"{{{NS['w']}}}t"))
                if FIELD_INSTRUCTION_RE.search(instruction):
                    fields.append((instruction.strip().upper(), result))
            elif tag == "fldChar":
                value = node.attrib.get(W_FIELD_CHAR_TYPE, node.attrib.get(W_VAL, ""))
                if value == "begin":
                    active.append({"instruction": [], "result": [], "phase": "instruction"})
                elif value == "separate" and active:
                    active[-1]["phase"] = "result"
                elif value == "end" and active:
                    field = active.pop()
                    instruction = "".join(field["instruction"]).strip()
                    result = "".join(field["result"])
                    if FIELD_INSTRUCTION_RE.search(instruction) or not instruction:
                        fields.append((instruction.upper() or "COMPLEX", result))
            elif tag == "instrText" and active and active[-1]["phase"] == "instruction":
                active[-1]["instruction"].append(node.text or "")
            elif tag == "t" and active and active[-1]["phase"] == "result":
                active[-1]["result"].append(node.text or "")
        for field in active:
            instruction = "".join(field["instruction"]).strip()
            if FIELD_INSTRUCTION_RE.search(instruction) or not instruction:
                fields.append((instruction.upper() or "COMPLEX", "".join(field["result"])))
        unresolved += len(re.findall(rb"Error! Reference source not found", xml, re.I))
    return {"count": len(fields), "fields": fields, "unresolved": unresolved}


def _run_libreoffice(input_path: Path, output_dir: Path, profile_dir: Path) -> Path:
    output_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    profile_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    command = [
        SOFFICE, "--headless", "--invisible", "--nologo", "--nodefault",
        "--nofirststartwizard", f"-env:UserInstallation={profile_dir.as_uri()}",
        "--convert-to", "docx:Office Open XML Text", "--outdir", str(output_dir), str(input_path),
    ]
    try:
        completed = subprocess.run(
            command, check=False, capture_output=True, timeout=RENDER_TIMEOUT_SECONDS,
            cwd=str(output_dir),
            env={**os.environ, "HOME": "/tmp/lekta-home", "SAL_USE_VCLPLUGIN": "svp"},
        )
    except FileNotFoundError as exc:
        raise RuntimeError("libreoffice_unavailable") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("render_timeout") from exc
    if completed.returncode != 0:
        raise RuntimeError("libreoffice_failed")
    result = output_dir / input_path.name
    if not result.is_file() or result.stat().st_size == 0:
        raise RuntimeError("render_output_missing")
    return result


def _render(blob: bytes, request_id: str) -> dict[str, Any]:
    _safe_zip(blob)
    with tempfile.TemporaryDirectory(prefix="lekta-field-render-") as raw_tmp:
        tmp = Path(raw_tmp)
        source_dir, output_dir, profile_dir = tmp / "source", tmp / "output", tmp / "lo-profile"
        source_dir.mkdir(mode=0o700)
        input_path = source_dir / "input.docx"
        input_path.write_bytes(blob)
        before_dir = tmp / "before"
        before_dir.mkdir(mode=0o700)
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            archive.extractall(before_dir)
        before = _field_snapshot(before_dir)
        rendered = _run_libreoffice(input_path, output_dir, profile_dir)
        output_blob = rendered.read_bytes()
        if len(output_blob) > MAX_OUTPUT_BYTES:
            raise ValueError("render_output_too_large")
        _safe_zip(output_blob)
        after_dir = tmp / "after"
        after_dir.mkdir(mode=0o700)
        with zipfile.ZipFile(io.BytesIO(output_blob)) as archive:
            archive.extractall(after_dir)
        after = _field_snapshot(after_dir)
        updated = sum(1 for before_field, after_field in zip(before["fields"], after["fields"]) if before_field != after_field)
        warnings: list[str] = []
        if after["unresolved"]:
            warnings.append(f"{after['unresolved']} polja i dalje imaju neriješenu referencu.")
        if not updated and after["count"]:
            warnings.append("LibreOffice je spremio dokument, ali nije promijenio cached rezultate polja.")
        return {
            "jobId": request_id, "status": "done",
            "renderedDocxBase64": base64.b64encode(output_blob).decode("ascii"),
            "warnings": warnings, "fieldsUpdated": updated,
            "unresolvedFields": after["unresolved"], "source": "libreoffice",
        }


@app.get("/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "lekta-field-renderer", "version": "1"}


@app.post("/v1/render")
async def render(
    request: Request,
    x_lekta_worker_token: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
) -> Response:
    request_id = (x_request_id or uuid.uuid4().hex)[:80]
    if not _authorized(x_lekta_worker_token):
        return _json_error(401, "unauthorized", request_id)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type and content_type != DOCX_MIME:
        return _json_error(415, "unsupported_media_type", request_id)
    content_length = request.headers.get("content-length")
    if content_length and (not content_length.isdigit() or int(content_length) > MAX_INPUT_BYTES):
        return _json_error(413, "payload_too_large", request_id)
    body = await request.body()
    if not body or len(body) > MAX_INPUT_BYTES:
        return _json_error(413 if len(body) > MAX_INPUT_BYTES else 400, "payload_too_large" if len(body) > MAX_INPUT_BYTES else "bad_request", request_id)
    try:
        return JSONResponse(_render(body, request_id))
    except ValueError as exc:
        code = str(exc)
        status = 413 if code in {"zip_uncompressed_limit", "xml_size_limit", "render_output_too_large"} else 415
        return _json_error(status, code, request_id)
    except RuntimeError as exc:
        code = str(exc)
        return _json_error(504 if code == "render_timeout" else 503, code, request_id)
    except Exception:
        return _json_error(500, "render_failed", request_id)
