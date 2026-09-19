"""Lekta autonomni kontroler: deterministicki raspored, red zadataka, politika i dokaz.

Paket je namjerno samo standardna biblioteka (sqlite3, subprocess, hmac, json). Nijedan modul ovdje
ne poziva model niti pise na GitHub sam od sebe: to rade adapteri koje `cli.tick` dobiva izvana, pa se
cijeli tok testira s lažnim providerima. Vidi docs/agents/autonomy-runbook.md.
"""

__all__ = ["policy", "store", "signals", "worker", "gate", "publisher", "report", "cli"]
