# Ulazi podatkovnog PR-a: AI audit run5 (privremeno)

Grana `wf/ai-evidence-run5-ulazi`, bez PR-a, po nalogu koordinatora lekta-32 (2026-09-28). Brise se nakon mergea
podatkovnog PR-a. Primopredaja: komentar na PR #211.

Sadrzaj je samo iz sluzbenih izvora (pravilnika i uputa fakulteta); nema studentskih radova, pseudonima ni kljuceva.

- `moj-popis-run5.json`: 290 prihvacenih ruleId i 53 profila za sidrenje citata.
- `run5/in`: paketi za izvlacenje po profilu (pravila i izvod iz snimke izvora).
- `run5/out`: slijepo izvlacenje (Luna, Sol ponovni pokusaj samo za neslaganja), samo JSON; logovi nisu ukljuceni.
- `run5/verdict`: Sonnet refute drugog providera (accepted, refuted s razlogom).
- `run5/truth`, `run5/*.json`: istina iz repozitorija u trenutku pripreme, plan (s `blocked`), sazeci i grupe refutea.
- `run4`: popis profila za sidrenje i dry-run sidrenja.
- `alati`: priprema (`prep-ai-evidence.mts`), usporedba, sastavljanje (`assemble-ai-evidence.mts --partial`), Codex driver,
  sidrenje, `partial-apply.ps1`, workflow skripte za izvlacenje i refute, upute za izvlacenje.
- `WORKFLOW-sinteticki-set.md`: plan mjerenja sintetickog seta (set ostaje izvan repoa).

Alati imaju apsolutne staze laptopa; na radnoj stanici ih prilagodi. Presude su vezane uz stanje profila u trenutku run5,
pa prije primjene ponovno pokreni pripremu i usporedi (`overlap-221.mjs` kao primjer ukrizavanja).
Iznimka: `kif-diplomski--word-count` se ne primjenjuje dok vlasnik ne odluci (#221: covjek-odlucuje).
