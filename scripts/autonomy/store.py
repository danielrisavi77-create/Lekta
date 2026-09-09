"""Trajni red zadataka: SQLite s WAL-om, singleton lease i dnevni limiti (plan, odjeljak 5.1 i 5.2).

Sva stanja se mijenjaju UVJETNO (`WHERE status = :expected`) unutar `BEGIN IMMEDIATE`; nula
promijenjenih redova je konflikt, ne prepisivanje. Baza zivi izvan repozitorija. Zapisi prolaze
redakciju iz `signals.redact_payload`, pa studentski tekst i tokeni ne mogu zavrsiti u dnevniku.
"""
from __future__ import annotations

import datetime as _dt
import json
import sqlite3
import uuid
from typing import Callable

from .signals import redact_payload

SCHEMA_VERSION = 1

STATUSES = (
    "queued", "planning", "implementing", "reviewing", "verifying", "ready_to_publish", "publishing",
    "monitoring", "done", "waiting_quota", "needs_login", "needs_human", "blocked", "failed",
)
ACTIVE_STATUSES = ("planning", "implementing", "reviewing", "verifying", "ready_to_publish", "publishing", "monitoring")
# Stanja koja NE trose implementacijski pokusaj: poziv nije ni poceo (plan 5.2).
REFUND_STATUSES = ("waiting_quota", "needs_login")
LEASE_RESOURCE = "worker"
DEFAULT_LEASE_SECONDS = 3 * 3600

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  signal_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  base_sha TEXT,
  scope_json TEXT NOT NULL,
  signal_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  occurrences INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  phase TEXT NOT NULL,
  provider TEXT,
  requested_model TEXT,
  reported_model TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  verdict TEXT,
  evidence_hash TEXT
);
CREATE TABLE IF NOT EXISTS leases (
  resource TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  process_start_id TEXT,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(id),
  event_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sanitized_payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deployments (
  deployment_id TEXT PRIMARY KEY,
  commit_sha TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  previous_deployment_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""


class TransitionConflict(RuntimeError):
    """Stanje u bazi nije ono koje je pozivatelj ocekivao; nista nije promijenjeno."""


def utc_day(now: int) -> str:
    return _dt.datetime.fromtimestamp(int(now), tz=_dt.timezone.utc).strftime("%Y-%m-%d")


def _dumps(payload) -> str:
    return json.dumps(redact_payload(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class Store:
    def __init__(self, db_path: str, *, busy_timeout_ms: int = 5000):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, timeout=busy_timeout_ms / 1000, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute(f"PRAGMA busy_timeout={int(busy_timeout_ms)}")
        self._init_schema()

    def close(self) -> None:
        self.conn.close()

    # -- shema -------------------------------------------------------------------------------
    def _init_schema(self) -> None:
        # executescript sam zatvara otvorenu transakciju, pa se DDL izvodi izvan BEGIN IMMEDIATE (idempotentan je).
        self.conn.executescript(SCHEMA)
        with self._immediate():
            row = self.conn.execute("SELECT version FROM schema_version").fetchone()
            if row is None:
                self.conn.execute("INSERT INTO schema_version(version) VALUES (?)", (SCHEMA_VERSION,))
            elif row["version"] != SCHEMA_VERSION:
                raise RuntimeError(f"nepoznata verzija sheme baze: {row['version']} (ocekivano {SCHEMA_VERSION})")

    class _Immediate:
        def __init__(self, conn: sqlite3.Connection):
            self.conn = conn

        def __enter__(self):
            self.conn.execute("BEGIN IMMEDIATE")
            return self.conn

        def __exit__(self, exc_type, exc, tb):
            if exc_type is None:
                self.conn.execute("COMMIT")
            else:
                self.conn.execute("ROLLBACK")
            return False

    def _immediate(self):
        return Store._Immediate(self.conn)

    # -- postavke ----------------------------------------------------------------------------
    def _get_setting(self, key: str, default: str | None = None) -> str | None:
        row = self.conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    def _set_setting(self, key: str, value: str) -> None:
        self.conn.execute("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))

    def set_paused(self, paused: bool, reason: str = "") -> None:
        with self._immediate():
            self._set_setting("paused", "1" if paused else "0")
            self._event(None, "paused" if paused else "resumed", {"reason": reason}, self._now_hint())

    def is_paused(self) -> bool:
        return self._get_setting("paused", "0") == "1"

    def set_frozen(self, frozen: bool, reason: str, now: int) -> None:
        with self._immediate():
            self._set_setting("publish_frozen", "1" if frozen else "0")
            self._event(None, "publish_frozen" if frozen else "publish_unfrozen", {"reason": reason}, now)

    def is_frozen(self) -> bool:
        return self._get_setting("publish_frozen", "0") == "1"

    def set_policy_version(self, version: str) -> None:
        with self._immediate():
            self._set_setting("policy_version", version)

    def policy_version(self) -> str | None:
        return self._get_setting("policy_version")

    def _now_hint(self) -> int:
        return int(_dt.datetime.now(tz=_dt.timezone.utc).timestamp())

    # -- dnevni brojaci ----------------------------------------------------------------------
    def _daily(self, name: str, now: int) -> int:
        """Vrijednost brojaca za danasnji UTC dan; promjena dana ga vraca na 0 (unutar transakcije pozivatelja)."""
        day = utc_day(now)
        if self._get_setting(f"{name}_date") != day:
            self._set_setting(f"{name}_date", day)
            self._set_setting(f"{name}_count", "0")
        return int(self._get_setting(f"{name}_count", "0") or 0)

    def _bump_daily(self, name: str, now: int) -> int:
        value = self._daily(name, now) + 1
        self._set_setting(f"{name}_count", str(value))
        return value

    def daily_counter(self, name: str, now: int) -> int:
        with self._immediate():
            return self._daily(name, now)

    def bump_daily(self, name: str, now: int) -> int:
        with self._immediate():
            return self._bump_daily(name, now)

    # -- dogadaji ----------------------------------------------------------------------------
    def _event(self, task_id: str | None, event_type: str, payload, now: int) -> None:
        self.conn.execute(
            "INSERT INTO events(task_id, event_type, created_at, sanitized_payload) VALUES (?, ?, ?, ?)",
            (task_id, event_type, int(now), _dumps(payload)),
        )

    def record_event(self, task_id: str | None, event_type: str, payload, now: int) -> None:
        with self._immediate():
            self._event(task_id, event_type, payload, now)

    def events(self, task_id: str | None = None) -> list[dict]:
        if task_id is None:
            rows = self.conn.execute("SELECT * FROM events ORDER BY event_id").fetchall()
        else:
            rows = self.conn.execute("SELECT * FROM events WHERE task_id = ? ORDER BY event_id", (task_id,)).fetchall()
        return [dict(r) | {"payload": json.loads(r["sanitized_payload"])} for r in rows]

    # -- zadaci ------------------------------------------------------------------------------
    def enqueue(self, signal: dict, now: int | None = None) -> str:
        """Jedan signal_key = jedan zadatak. Ponovljeni signal samo povecava `occurrences`."""
        now = int(now if now is not None else signal.get("observed_at") or self._now_hint())
        key = signal["signal_key"]
        with self._immediate():
            row = self.conn.execute("SELECT id FROM tasks WHERE signal_key = ?", (key,)).fetchone()
            if row:
                self.conn.execute(
                    "UPDATE tasks SET occurrences = occurrences + 1, last_seen_at = ?, updated_at = ? WHERE id = ?",
                    (now, now, row["id"]),
                )
                self._event(row["id"], "signal_repeated", {"signal_key": key}, now)
                return row["id"]
            task_id = str(uuid.uuid4())
            self.conn.execute(
                "INSERT INTO tasks(id, signal_key, kind, status, base_sha, scope_json, signal_json, attempts, occurrences,"
                " priority, next_run_at, created_at, updated_at, last_seen_at) VALUES (?, ?, ?, 'queued', ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)",
                (task_id, key, signal.get("kind", "unknown"), signal.get("source_revision"),
                 _dumps(signal.get("scope") or {}), _dumps(signal), int(signal.get("priority", 0)), now, now, now, now),
            )
            self._event(task_id, "queued", {"signal_key": key, "kind": signal.get("kind")}, now)
            return task_id

    def get_task(self, task_id: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return self._task(row) if row else None

    def _task(self, row) -> dict:
        d = dict(row)
        d["scope"] = json.loads(d.pop("scope_json"))
        d["signal"] = json.loads(d.pop("signal_json"))
        return d

    def list_tasks(self, status: str | None = None) -> list[dict]:
        if status is None:
            rows = self.conn.execute("SELECT * FROM tasks ORDER BY created_at").fetchall()
        else:
            rows = self.conn.execute("SELECT * FROM tasks WHERE status = ? ORDER BY created_at", (status,)).fetchall()
        return [self._task(r) for r in rows]

    def lease(self) -> dict | None:
        row = self.conn.execute("SELECT * FROM leases WHERE resource = ?", (LEASE_RESOURCE,)).fetchone()
        return dict(row) if row else None

    def claim(self, owner_id: str, now: int, *, process_start_id: str | None = None,
              max_new_per_day: int = 3, max_attempts: int = 2, lease_seconds: int = DEFAULT_LEASE_SECONDS,
              process_alive: Callable[[str, str | None], bool] | None = None) -> dict | None:
        """Uzmi jedan dospjeli zadatak, ili None. Dva raspoređivaca dobiju najvise jedan posao.

        Istekli lease NE daje pravo drugom vlasniku dok `process_alive(owner, process_start_id)` ne vrati
        False; bez te funkcije istek se ne priznaje (plan 5.1: "dok nije dokazan prestanak").
        """
        now = int(now)
        with self._immediate():
            if self._get_setting("paused", "0") == "1":
                return None
            lease = self.conn.execute("SELECT * FROM leases WHERE resource = ?", (LEASE_RESOURCE,)).fetchone()
            if lease and lease["owner_id"] != owner_id:
                if lease["expires_at"] > now:
                    return None
                if process_alive is None or process_alive(lease["owner_id"], lease["process_start_id"]):
                    return None
                self._event(None, "lease_taken_over", {"from": lease["owner_id"], "to": owner_id}, now)
            active = self.conn.execute(
                f"SELECT COUNT(*) AS n FROM tasks WHERE status IN ({','.join('?' * len(ACTIVE_STATUSES))})", ACTIVE_STATUSES
            ).fetchone()["n"]
            if active:
                return None
            if self._daily("jobs", now) >= int(max_new_per_day):
                return None
            task = self.conn.execute(
                "SELECT * FROM tasks WHERE status = 'queued' AND next_run_at <= ? AND attempts < ?"
                " ORDER BY priority DESC, created_at ASC LIMIT 1",
                (now, int(max_attempts)),
            ).fetchone()
            if task is None:
                return None
            changed = self.conn.execute(
                "UPDATE tasks SET status = 'planning', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued'",
                (now, task["id"]),
            ).rowcount
            if changed != 1:
                raise TransitionConflict("zadatak je promijenio stanje tijekom claima")
            self.conn.execute(
                "INSERT INTO leases(resource, owner_id, process_start_id, expires_at) VALUES (?, ?, ?, ?)"
                " ON CONFLICT(resource) DO UPDATE SET owner_id = excluded.owner_id,"
                " process_start_id = excluded.process_start_id, expires_at = excluded.expires_at",
                (LEASE_RESOURCE, owner_id, process_start_id, now + int(lease_seconds)),
            )
            self._bump_daily("jobs", now)
            self._event(task["id"], "claimed", {"owner": owner_id, "attempt": task["attempts"] + 1}, now)
        return self.get_task(task["id"])

    def transition(self, task_id: str, expected: str, target: str, payload: dict | None = None, now: int | None = None) -> None:
        """Uvjetna promjena stanja. Nula redova = TransitionConflict, uz rollback."""
        if target not in STATUSES or expected not in STATUSES:
            raise ValueError(f"nepoznat status: {expected} -> {target}")
        now = int(now if now is not None else self._now_hint())
        payload = dict(payload or {})
        with self._immediate():
            changed = self.conn.execute(
                "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
                (target, now, task_id, expected),
            ).rowcount
            if changed != 1:
                raise TransitionConflict(f"zadatak {task_id} nije u stanju {expected}")
            if target in REFUND_STATUSES and payload.pop("refund_attempt", True):
                self.conn.execute("UPDATE tasks SET attempts = MAX(attempts - 1, 0) WHERE id = ?", (task_id,))
            if "next_run_at" in payload:
                self.conn.execute("UPDATE tasks SET next_run_at = ? WHERE id = ?", (int(payload["next_run_at"]), task_id))
            if target not in ACTIVE_STATUSES:
                self.conn.execute("DELETE FROM leases WHERE resource = ?", (LEASE_RESOURCE,))
            self._event(task_id, f"status:{target}", {"from": expected, **payload}, now)

    def release_lease(self, owner_id: str) -> bool:
        with self._immediate():
            return self.conn.execute("DELETE FROM leases WHERE resource = ? AND owner_id = ?", (LEASE_RESOURCE, owner_id)).rowcount == 1

    # -- runs i deployi ----------------------------------------------------------------------
    def record_run(self, task_id: str, phase: str, result: dict, started_at: int, ended_at: int) -> str:
        run_id = str(uuid.uuid4())
        with self._immediate():
            self.conn.execute(
                "INSERT INTO runs(run_id, task_id, phase, provider, requested_model, reported_model, started_at, ended_at, verdict, evidence_hash)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (run_id, task_id, phase, result.get("provider"), result.get("requested_model"),
                 ",".join(result.get("reported_models") or []) or result.get("reported_model"),
                 int(started_at), int(ended_at), result.get("verdict"), result.get("evidence_hash")),
            )
            self._event(task_id, f"run:{phase}", {"verdict": result.get("verdict"), "reason": result.get("reason")}, ended_at)
        return run_id

    def runs(self, task_id: str) -> list[dict]:
        return [dict(r) for r in self.conn.execute("SELECT * FROM runs WHERE task_id = ? ORDER BY started_at", (task_id,)).fetchall()]

    def record_deployment(self, deployment_id: str, commit_sha: str, artifact_hash: str, status: str,
                          now: int, previous_deployment_id: str | None = None) -> None:
        with self._immediate():
            self.conn.execute(
                "INSERT INTO deployments(deployment_id, commit_sha, artifact_hash, previous_deployment_id, status, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(deployment_id) DO UPDATE SET status = excluded.status",
                (deployment_id, commit_sha, artifact_hash, previous_deployment_id, status, int(now)),
            )
            self._event(None, f"deployment:{status}", {"deployment_id": deployment_id, "commit_sha": commit_sha}, now)

    def set_deployment_status(self, deployment_id: str, status: str, now: int, verified: bool = False) -> None:
        with self._immediate():
            self.conn.execute(
                "UPDATE deployments SET status = ?, verified_at = COALESCE(?, verified_at) WHERE deployment_id = ?",
                (status, int(now) if verified else None, deployment_id),
            )
            self._event(None, f"deployment:{status}", {"deployment_id": deployment_id}, now)

    def deployment(self, deployment_id: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM deployments WHERE deployment_id = ?", (deployment_id,)).fetchone()
        return dict(row) if row else None

    def last_verified_deployment(self) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM deployments WHERE status = 'verified' ORDER BY verified_at DESC, created_at DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None

    # -- snimka za izvjestaj -----------------------------------------------------------------
    def snapshot(self, now: int) -> dict:
        by_status = {r["status"]: r["n"] for r in self.conn.execute("SELECT status, COUNT(*) AS n FROM tasks GROUP BY status")}
        last_event = self.conn.execute("SELECT * FROM events ORDER BY event_id DESC LIMIT 1").fetchone()
        return {
            "paused": self.is_paused(),
            "publishFrozen": self.is_frozen(),
            "policyVersion": self.policy_version(),
            "tasksByStatus": by_status,
            "activeTask": next((self._task(r) for r in self.conn.execute(
                f"SELECT * FROM tasks WHERE status IN ({','.join('?' * len(ACTIVE_STATUSES))}) LIMIT 1", ACTIVE_STATUSES)), None),
            "lease": self.lease(),
            "jobsToday": self.daily_counter("jobs", now),
            "deploysToday": self.daily_counter("deploys", now),
            "lastEvent": dict(last_event) if last_event else None,
            "lastVerifiedDeployment": self.last_verified_deployment(),
        }
