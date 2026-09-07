# Nezavisni audit Katedre (kolovoz 2026.) — puni izvještaj

> Tri dijela izvještaja bila su tri datoteke; spojena su u jednu jer su jedan
> dokument i jer paket ima ograničenje broja datoteka. Ništa nije skraćeno.
> Ovo je povijest, ne radna referenca — ne učitava se tijekom rada sa studentom.


---

# Strateška ocjena

# Katedra — strategic assessment

Everything below is grounded in the package at `/tmp/katedra_v11/katedra`, which I read and ran. Where I state a number I produced it myself; where I lean on the audit findings I say so.

---

## 0. The measurement that frames everything else

I built the document a diligent EFZG student would submit: `/tmp/probe2/rad3.docx` — Times New Roman 12, line spacing 1.5, justified, 2.54 cm margins on all four sides, 3 637 words, all thirteen mandatory parts as Heading 1, five numbered content chapters, 47 correctly formatted apa-hr citations, and a real Ctrl+Enter page break before every chapter (encoded the way Word encodes it, on the preceding paragraph).

```
SAŽETAK
  ✅ u skladu: 7   ⚠️ za provjeru: 2   ❌ kršenja: 3      exit=1
```

All three ❌ are false:

- `broj poglavlja 5–8 · nađeno 11` — `BACK_MATTER_H1` (`scripts/check_rules.py:101`) is a seven-string allowlist; SAŽETAK, SUMMARY, IZJAVA and ŽIVOTOPIS are counted as content chapters. The same run's `obavezni dijelovi` row *requires* those headings. One report demands them and penalises them.
- `prijelom pred poglavljem · 0/14` — I inserted the breaks and it still says 0/14, because `ima_prijelom_prije` only inspects the heading paragraph's own runs.
- `obavezni dijelovi · nema naslova za: popis izvora` — the heading is POPIS LITERATURE, and `SINONIMI` matches the nominative `literatura` as a substring, which the genitive `literature` does not contain.

Exit 1 means "not ready to submit." A student's first contact with the product is three confident, sourced, wrong accusations. That is the number I'd want on the first slide, because it prices everything else: the architecture below is unusually good, and the file the student actually meets is currently below the bar that architecture sets.

---

## 1. What Katedra is genuinely excellent at, and which decisions built the moat

**Provenance-bound rules, not a rule table.** Every rule in `references/fakulteti/efzg.json` is reachable by JSON Pointer with a `source`, `verified_at`, a `type` of `explicit` vs `derived`, and a confidence. `provenance_report.py --fakultet efzg` returns `fresh=37 stale=0 unknown=0 untracked=0`. Three engineering decisions created this and each is individually cheap but jointly hard to retrofit:

1. `izvor` is a required schema field, so a rule without a source cannot be added.
2. `check_rules.py` prints `izvor pravila: …` under *every single finding*, not once in a header — I confirmed this on every row of every run. That makes provenance a UX property, not a metadata property, and it is what lets a student argue back to a mentor.
3. Freshness is a separate signal that never mutates `status` (`SKILL.md:202`). Staleness therefore surfaces as work, not as silent decay.

A competitor ships a hardcoded rule table. The week EFZG revises their PDF, their product is silently wrong and nobody finds out. Katedra's tells you. That is the moat — but be honest about its current depth: EFZG has **one** per-rule provenance entry out of 41 rule leaves; everything else inherits `provenance.default`. The mechanism is built and exercised once, on `/format/odlomak/min_redaka`. The moat is the architecture, not yet the data.

**The rewrite-invariant harness.** `verify_rewrite.py` + `diff_versions.py` encode a thesis nobody else has been willing to state: *the subagent's report that nothing was lost is not evidence.* Citations as a multiset keyed by dialect, numbers as a multiset, sentences as a multiset, markers verbatim, with per-`--zahvat` tolerance — geometry may merge paragraphs but not touch sentences, style may reword but not drop citations. `references/stil_pipeline.md`'s own war story ("subagent claimed *svi citati očuvani*, harness caught the drift") is the product insight. This is not Croatia-specific and it is the most transferable asset in the package. It is copyable in principle; it is uncopied in practice because most teams have not admitted their agent lies.

**One Croatian text layer, enforced as a contract.** `citation_dialects.py:4` states it outright: *"consumeri ne smiju imati vlastite regexe za citation dialecte."* That decision is why `apa-hr` (year-dot, comma after the parenthesis, no terminal period) versus `autor-godina` is a single profile field instead of a fork of the codebase, and why `hr_kljuc`'s C<Č<Ć / D<DŽ<Đ collation and the `KRATICE` guard (so `str. 41.` is not a sentence boundary) are available to every consumer. The auditors' bugs in this layer — `lj`/`nj` missing from the digraph table, `đ` surviving NFD — are *inside one file*. That is the payoff of centralisation, and it's the correct reading of those findings: they are cheap because the decision was right.

**Gates that fail closed and name the remedy.** I verified: `plan_state.py odobri` re-runs the gate and refuses; `stanje_init.py --set plan_odobren=true` exits 2 before machine approval; the PERSPECTIVE GATE blocks outline import for a diplomski and prints the exact two commands to unblock. The differentiator here is not technical, it is pedagogical: the product refuses to let a student write a diplomski until it has machine-checked that they have a contestable thesis and two genuinely conflicting perspectives. ChatGPT will happily write chapter 1. That refusal is the product.

**What is not the moat:** `check_rules.py`. Any competent developer writes a `.docx` format checker. Yours is currently the weakest file in the package and the most visible.

---

## 2. Where sophistication exceeds value

**`interaction_policy.py` and everything built on it. Cut.** 142 LOC of substring routing, plus `eval_runner.py`, `benchmark_runner.py` (218), `agent_policy.py` (189), 26 frozen gold cases, a 136-line frozen benchmark JSON, and `evals/benchmark/agent_policy.json`. I grepped every consumer: `route_interaction` is called by `eval_runner.py`, `benchmark_runner.py`, and one test. **Nothing at runtime calls it.** Its own docstring concedes it "does not replace host-level semantic skill activation." So the whole apparatus measures a *model* of the router while the real router — the frontmatter description read semantically by the host LLM — is untested by it. It fails on `poboljšaj mi tekst` (dative clitic breaks the bigram) and on any linguistics thesis containing `dijalekta` (substring `lekta` + `razvoj` → `ignore`), and those failures are scored as *correct* because the gold set was curated from the implementation. Delete `agent_policy.py` and `benchmark_runner.py`. Keep the 26 gold cases as intent documentation. This was not worth building, and it has consumed audit budget in three separate dimensions.

**`consistency_check.py` — heavily audited, not worth having built.** 169 LOC + a schema + a share of `test_review_safety_reviewer_consistency.py` (277 LOC), to detect cross-chapter contradictions. Its polarity detector strips `nije`/`nisu` from the anchor but leaves the affirmative `je`/`su` in place, so *"Digitalizacija je povećala produktivnost"* in Rezultati and *"Digitalizacija nije povećala produktivnost"* in Zaključak never group and never compare — that is the two most common Croatian negations, i.e. most of the job. Its numeric comparator treats the Croatian thousands separator as a decimal point, so `1.000` vs `1000` is a *blocking* contradiction. And `reviewer_simulation.py` launders its `coverage_status: insufficient` into lens status `clear`. In an LLM-native product, a paragraph in `audit.md` — "read Rezultati and Zaključak, list every claim appearing in both with opposite polarity or different numbers" — outperforms this, at zero LOC and zero maintenance. Delete it. Keep `reviewer_simulation.py` only as an aggregator over artifacts that already exist.

**The claim ledger at per-sentence granularity — right idea, wrong grain.** The machinery is genuinely correct; I ran ingest → add → link → strict gate in 0.27 s and confirmed that tampering with an evidence text fires both `text_sha256` and `evidence_id` mismatches. But the documented cost per claim is: run `add`, regex `clm_…` out of stdout, fish `ev_…` out of a JSONL with a separate `python3 -c` (neither `add` nor `link` has `--json` — only `report` does), run `link`, run the gate. For 150 claims in a diplomski that is ~450 subprocess calls and ~450 stdout regexes. Meanwhile `verify_rewrite.py --evidence-gate` silently degrades to *no source verification at all* when `izvori.json` is absent — and `SKILL.md:363` prescribes exactly that flag combination without `--sources`. **Collapse:** one `claim_ledger.py assert --text … --evidence ev_… --relation supports --json` that does add+link+verify in a call and returns the object; `--batch -` reading JSON from stdin; and reserve the full ledger for the 10–20 load-bearing empirical claims rather than every sentence.

**The 8-level compositional resolver.** Levels declared: `global, institution, faculty, programme, work_type, course, mentor, project_override`. Shipped: two faculties, two overlays (one `programme`, one `work_type`), zero `course`, zero `mentor`, zero `institution`, zero `global`. And `project_override` — the only level a *user* ever writes — is never validated against a schema at all, so a one-line `{"status":"potvrdeno"}` erases every `[za potvrdu]` marker from a pilot profile. Don't cut the resolver: the `mentor` level is the one that will matter most, because `SKILL.md`'s own precedence rule 1 says the mentor's written instruction beats the faculty document. But stop paying for unused surface — drop `global`/`institution` from the enum until something uses them, and validate `project_override`.

**Fields that exist only to be schema-validated.** 14 of 41 rule leaves in `efzg.json` are referenced by no script. Some of those are legitimately LLM-consumed (`studij`, `popis_primjer`, `predaja/koraci` land in the agent's context via the resolved profile — in an agent skill, "unread by Python" ≠ "unused"). But two of them appear as **blocking** items in `predaja.md`'s preflight: `izvori_min` and `ne_smije_se_lomiti`. So the product declares a minimum source count, provenances it, schema-validates it, hashes it into the admission bundle, and never counts the sources. Same for "no display may split across two pages" — checked by neither Katedra nor rad-audit. Either implement or delete; `izvori_min` against `izvori.json` is roughly ten lines.

---

## 3. What's missing that a student actually needs

The framing fact, which I verified: **Katedra never writes a `.docx`.** Zero `.save()` calls, zero `Document()` constructions across all 43 scripts. The student writes prose in chat, assembles the document by hand in Word, and Katedra grades the result. Every pain in the brief — supervisor rounds, deadline panic, plagiarism fear, defence anxiety, formatting rework the night before — is *diagnosed* by this product and *fixed* by none of them.

Ranked by student value per unit of build effort:

**1. Document assembly, delegated to the `docx` skill.** The delegation pattern is already established twice in your own package: `rad-audit` owns the audit pipeline (iron rule 10), and `obrana.md:29` says *"Za `.pptx` koristi javni `pptx` skill — ne improviziraj XML."* rad-audit's own `apply_safe_fixes.py:25` even says *"provjeri docx skillom."* The missing line is the same line for the artefact the student actually submits. What it buys, per faculty, from data you already have: naslovnica with correct mentor title and JMBAG, TOC as a real field rather than typed text, roman→arabic numbering split at Uvod, `pageBreakBefore` on Heading 1, `keepNext`/`cantSplit` on the caption/display/`Izvor:` triple. That is six of the fourteen blocking items in `predaja.md §2`, converted from "you failed" to "here it is." Effort: days. Value: it deletes the worst night of the student's year, and it is the one improvement a competitor cannot copy, because it needs the provenanced per-faculty rules you have and they don't.

**2. Placeholder sweep.** Iron rule 2 mandates emitting `[TREBA IZVOR]` and `[PROVJERI STR.]`. `predaja.md:53` lists removing them as *blocking*. I grepped: no script scans the final document for them (`plan_state.py:540` merely mentions the string). This is a `grep` over the extracted body. An afternoon. It prevents the single most humiliating failure mode there is — a bracketed TODO in a bound thesis.

**3. Finish the three declared-but-unchecked blocking rules.** `izvori_min`, `ne_smije_se_lomiti`, and the *order* of mandatory parts (`predaja.md:41` says "u propisanom redoslijedu"; `check_rules` checks presence only). All three are already in the profile, already provenanced, already on the blocking list. ~50 lines total. The value is trust as much as coverage: a student who discovers one promise the tool doesn't keep stops believing the ones it does.

**4. The mentor round as a first-class object.** The pieces all exist and none of them are joined: `zamjerke.json` has revision history, `artifacts.json` has per-version hashes, `diff_versions --za-mentora` produces a genuinely good mentor-facing markdown report (I ran it — it correctly says *"Svi izvori citirani u prethodnoj verziji citirani su i dalje"*). What's missing is the loop: which round are we in, what did the mentor ask last round, what changed *in this version*, which zamjerke closed *because of this diff*. A `mentor_round` command joining three already-versioned files. The mentor relationship is the highest-variance factor in a Croatian thesis and it is currently the least instrumented part of the product.

**5. Deadline arithmetic as code.** `rok` is in `stanje.json`. `administrativni_rep_dana: 14` is in the profile — and read by nothing. `predaja.md` §1 is a static prose table. The one sentence a panicking student needs at 2am is *"do roka je 9 dana, sam administrativni rep traži 14"* — the doc instructs the LLM to say it and nothing computes it. ~30 lines converts a paragraph the model might skip into a number it must state.

**6. The defence number sheet.** `obrana.md` asks for "5 brojki"; `plan.md §11` promises an Excel "brojka → izvor" deliverable. Given `evidence.jsonl` already carries page-level locators and `diff_versions.brojke()` already tokenises every number in the document, an `obrana --brojke` producing `number → source → page` is nearly free. It is also the artefact that most reduces defence anxiety, because the fear is being asked *"where did this number come from."*

**Deliberately not on this list:** plagiarism detection beyond the current advisory overlap. `originality_check.py` is correctly scoped and correctly labelled. Going further means competing with Turnitin, which every Croatian faculty already licenses and which the student must run anyway.

---

## 4. The architecture question

**The state design is right. The return channel is not.**

State first, because it deserves defending: JSON on disk, atomic `tmp`+`os.replace`, monotone migrations with byte-for-byte backups in `.katedra/migrations/`, refusal to downgrade a future schema. That is exactly correct for an agent, because the actual failure mode of a chat agent is context loss, and `SKILL.md:84` names it: *"Razgovor nije memorija."* Keep all of it.

The return channel has two generations coexisting, and you can date them. The B12/B13 evidence layer is genuinely agent-native — `evidence_gate.py` emits `passed: bool`, `policy: enum`, `preconditions[]`, `gate_status: enum`, against `references/evidence_gate_schema.json`. The older checker layer is a human CLI with a JSON dump bolted on. I dumped `check_rules --json`:

```json
{"pravilo": "broj poglavlja (seminarski)", "trazeno": "5–8", "nadjeno": "11",
 "stanje": "❌", "detalji": ["Heading 1: NASLOVNICA · IZJAVA…"], "za_potvrdu": false}
```

`pravilo` is a Croatian display string with the work type interpolated into it. `stanje` is an emoji. `trazeno` for margins is the prose `"gore 2.54, dolje 2.54, …"`. There is no stable rule id, no severity enum, no location, no machine-readable remedy. An agent consuming this must do Croatian NLP on your own output.

The cost is not theoretical — **it is why so many audit findings are "silent wrong output."** When the only contract is a formatted string, nothing can assert on it. `test_efzg_known_false_positives.py` matches rows by Croatian prose; rename a row and the test silently stops testing. Give every rule a `rule_id` and a severity enum and those tests become falsifiable — that alone would have caught both the chapter-count and the POPIS LITERATURE bugs before release.

The second symptom is id round-tripping. `claim_ledger.py add` prints `[claim added] clm_9977034c…` and the agent regexes it; `link` needs an `ev_` id that lives only inside a JSONL, so the documented flow requires a separate `python3 -c` to fish it out. That is a human affordance — *I'll read it and type it* — in a loop no human runs.

Agent-native would look like: every check emits `{rule_id, severity, status, expected, found, locations[], remedy{kind,args}, provenance{}}`, with Croatian confined to a `message` field the agent renders; every mutating command returns the object it created as JSON; exit codes stay exactly as they are, because `0/1/2` (+`3/4` for `engine.py`) is already consistent across the package and is the one channel that already works.

**Is the difference worth a migration?** Not a rewrite — a rewrite risks the only genuinely irreplaceable asset, the accumulated Croatian rule knowledge. Worth it as an *additive* contract: bump `schema_version` in the existing JSON envelope, emit the structured shape alongside, leave the human table byte-identical, and port checkers one at a time starting with `check_rules.py`, because that is where false-positive density and test-blindness are both highest. Two weeks, and it pays for itself in the next audit cycle.

---

## 5. The scaling question

I ran the gate at production tier against the pilot:

```
FAIL: fpzg [production]
  ✓ profile_schema  ✗ status  ✓ provenance  ✓ routing
  ✓ qualification_cases  ✓ core_benchmark
  reasons: status_not_confirmed
```

**Five of six checks are automatable and already free. The bottleneck is the sixth, and it is entirely human: opening the faculty's PDF and transcribing ~40 rules with attribution.** Everything the effort has gone into — registry regeneration, bundle hashing, alias-collision detection across admitted faculties, the frozen core benchmark — is correct, cheap, and already scales to fifty faculties. It is not where the cost is.

Three facts sharpen the picture, and none of them flatter the current state:

- EFZG, your production profile, has **one** per-rule provenance entry out of 41 rule leaves. The JSON-Pointer, nearest-pointer-wins, per-rule-confidence machinery has been exercised exactly once.
- EFZG's declared `studij` is *"prijediplomski stručni studij Poslovna ekonomija"* and `struktura.opseg` contains only `zavrsni` and `seminarski`. There is no `diplomski`. The resolver accepts `--tip diplomski` silently; only `check_rules` emits a ⚠️ at use time. So "production" covers two of the four work types the CLI accepts.
- FPZG's own `napomene` predicts its own failure: *"Margine i opseg su najvjerojatniji kandidati za odstupanje."* Its `izvor.dokument` reads *"nije dohvaćeno iz službenog PDF-a."*

So the honest count is not two faculties — it is roughly three `(faculty, work_type)` pairs, one of which is unverified by its own admission.

**How I'd remove the bottleneck, in order:**

**(a) Make transcription the product, not a side task.** Build `profile_draft.py`: input a faculty PDF or a Drive `fileId` (you already document the 302→Drive trap in `efzg.json`'s `napomena_o_dohvatu`, so you know the shape), output a candidate `<slug>.json` where every rule carries a page/section citation and `type: extracted`, plus a diff against the nearest existing profile. The human's job becomes *review* — confirm or correct 40 rows — not transcription. That turns a day into an hour, and as a side effect it finally populates the per-rule provenance the architecture was built for. It also produces the thing that is genuinely defensible as an asset: a corpus of provenanced Croatian faculty rules that nobody else has.

**(b) Admit `(faculty, work_type)` pairs, not faculties.** `_support_catalog.json` admits wholesale. "EFZG production" must not be able to silently mean "production for seminarski and završni, unknown for diplomski." The `_scale_policy.json` shape already supports it; this is a key change plus a resolver-time refusal instead of a use-time ⚠️.

**(c) Make the qualification bar mean something before the tenth faculty arrives.** `min_qualification_cases: 3`, and the check loops `for pointer, expected in (case.get("expected") or {}).items()` — an empty `expected` object passes vacuously, so the threshold counts *rows*, not assertions. Require a minimum number of *distinct asserted pointers*, covering the rules that actually produce findings: citation style, margins, opseg, obavezni dijelovi, odlomak geometry. Otherwise faculty ten gets admitted on three empty lines.

---

## 6. Three changes, in order

I've picked for compounding value, not for severity ranking.

**Week 1 — Fix precision on `check_rules.py`, and give it a machine contract in the same pass.**

Not because these are the scariest bugs in the audit, but because this file is every student's first contact and it currently scores 0/3 on a compliant EFZG paper (§0). Three fixes: count content chapters as those *between* the first Uvod-like H1 and the first back-matter H1, instead of subtracting a seven-string allowlist; determine the page break by scanning backwards over the preceding block, not by inspecting the heading's own runs; stem the `SINONIMI` match so `POPIS LITERATURE` satisfies `popis izvora` — the codebase already knows this heading, it's in `BACK_MATTER_H1` and in `hr_text.NASLOV_LIT`, so the same document is simultaneously treated as having and not having a bibliography.

While you are in the file, add `rule_id` + a severity enum + `locations[]` to the JSON and rewrite `test_efzg_known_false_positives.py` to assert on `rule_id`. Today those tests match Croatian prose, which is why a renamed message left the AUD-017 assertion vacuously true and why the chapter-count regression shipped green.

**Week 2 — Close the two safety-gate holes that produce a green light on real damage. Only those two.**

`verify_rewrite.py` decides severity over a five-item *display* sample: `det = list(nestale)[:5]` is built first, then `razina = "!" if all("IZMIJENJENA" in d for d in det)`. On a 60-page rewrite the cap is always in force, so any sentence deleted after the fifth difference cannot raise the finding. Compute over the full multiset; truncate only the printout. Second: `verify_rewrite` never reads `.docx` table cells while `diff_versions.odlomci_svi` does — so a citation deleted and a statistic flipped inside a table is certified *"sadržaj očuvan."* In a Croatian economics thesis every number that matters lives in a table. Make `hr_text._iz_docx` walk `d.tables` the way its sibling already does. Two regression tests: one deleting a sentence past the fifth diff, one mutating a table cell, both asserting exit 1.

While you're there, one wording change with outsized effect: when any sentence is reported `IZGUBLJENA`, print `✓ nema blokirajućih nalaza` rather than `✓ sadržaj očuvan`. I reproduced the current output — it states a sentence was lost and certifies the content preserved in the same breath. That is how you train people to stop reading your safety tool.

**Weeks 3–4 — Ship the `.docx` generation path.**

Delegate to the `docx` skill exactly as you delegate auditing to `rad-audit` and slides to `pptx`. The contract is a template block per faculty profile: naslovnica fields, TOC field, roman→arabic split at Uvod, `pageBreakBefore` on Heading 1, `keepNext`/`cantSplit` on the caption/display/`Izvor:` triple. This is the change that moves Katedra from grader to producer, it retires six of the fourteen blocking preflight items, and it is the only one of the three that a competitor cannot match quickly — because it consumes provenanced per-faculty rules that they would first have to go and collect.

**What I left out and why.** Deleting `interaction_policy`/`benchmark_runner`/`agent_policy` and `consistency_check` — do it, but it's cleanup, not a month's headline. The claim-ledger ergonomics fix is blocked behind the JSON contract from week 1 and belongs immediately after. The `lj`/`nj` collation and `đ` folding are one file and one afternoon; slot them wherever convenient.

---

## One closing observation

The audit found roughly forty confirmed defects and the pattern across them is singular: **almost every one is a green light on a red condition.** `0 fali` on a thesis with no conclusion. `sadržaj očuvan` on a deleted sentence. `kritično 0` on an engine that crashed. `PLAN GATE PASS` on a plan replaced after approval. `abecedni red ispravan` on a misordered bibliography.

That is not carelessness — it is the signature of a codebase where every check was written by someone imagining the *passing* case. Your gates fail closed where you designed them to (`odobri`, `--set plan_odobren`, the mutation snapshot, the engine contract — I tested all four and they hold). Your *measurements* fail open everywhere, because a measurement has no designed failure mode unless someone writes the fixture that breaks it.

The cheapest structural fix is not more tests. It's a rule for the next twelve months: **every check ships with a fixture that must make it fire.** `check_rules` has zero tests that assert a ❌ on the rules that decide whether a student graduates; `recenice()` has no direct test at all; `dim_teza`, `dim_zakljucak`, `dim_pitanje` and `dim_citati` — four of seven argument dimensions — have none either. A 298-green suite sitting on top of that is not assurance, and you are the only person in a position to know it.

---

# Nalazi

# Katedra — defect section

Ranked by what actually reaches a student's submitted thesis, not by the per-dimension severity labels. The per-dimension pass over-used "critical" (24 of the raw findings; verification kept exactly one) and under-rated a few advisory-looking items that sit on the only gate the workflow trusts. Where a defect was reported from two or three dimensions I have merged it and said so.

**Headline recalibrations you should know about before reading:** the one genuinely critical defect is not in any of the dimensions that reported "critical" volume — it is the mentor-feedback merge (#1), which was reported once and survived verification at critical. Conversely, everything the `plan_gate`, `meta_systems`, `skill_orchestrator`, `security` and `privacy` dimensions filed as critical collapsed to medium/low/nit under adversarial checking, mostly because the reporters ignored disclosed warnings, non-zero exit codes, or the fact that `scripts/interaction_policy.py` has no runtime caller at all.

---

## Part 1 — Blocking

These ship a wrong or non-compliant thesis, bypass a gate, or lose data.

### 1. Two mentor comments with identical text collapse on re-import; an unaddressed objection is stamped "riješeno" and preflight exits 0
`scripts/mentor_feedback_state.py` → `merge_feedback` (`by_text = {_key(z): z for z in existing}`), consumed by `scripts/extract_comments.py::spoji`.

Mentor writes "Izvor?" twice (chapter 1 and chapter 2). Student closes the first with `--zatvori z1`, re-imports the unchanged .docx: both rows come back `☑ z1 … riješeno: 1. UVOD, dodan izvor`, `--otvorene` prints "nema zamjerki za prikaz" and exits 0, and because both records now carry id `z1`, `--zatvori z2` fails permanently. The schema validates clean. Because `merge_feedback` sorts resolved items last, the *resolved* duplicate is the survivor — the failure always propagates in the wrong direction.

Fix: carry the Word `w:comment/@w:id` (and `commentsExtended` paraId where present) into the zamjerka record as a stable `izvor_id` and match on that first; fall back to `(tekst, mjesto)` positional matching only for pre-existing records. Assert id uniqueness when building output and add `uniqueItems`-style id uniqueness to `references/mentor_feedback_schema.json` so a collision fails loudly. Note the docstring and the runtime footer both already claim "spajanje po id-u i tekstu" — the id half does not exist.

This is the single defect I would fix before anything else. It is in AUD-006's certified scope, it is triggered by the most ordinary supervisor behaviour there is, and it produces exit 0 on the pre-submission check.

### 2. `verify_rewrite` does not read .docx table cells — a deleted citation and a flipped statistic inside a table certify as "sadržaj očuvan"
`scripts/verify_rewrite.py::usporedi` via `hr_text._iz_docx` and `citation_dialects.citation_fingerprint_file` (both iterate only `doc.paragraphs`).

Before/after differ only in one cell: `"…19,6 posto BDP-a (Gržinić, 2021.)."` → `"…61,9 posto BDP-a."`. Output: "brojke: multiskup identičan", "citati: identično", `REZULTAT: ✓ sadržaj očuvan`, exit 0 — so the agent applies the rewrite. `diff_versions.odlomci_svi` walks `d.tables` and catches the same edit, so the asymmetry is a bug, not scope.

Fix: traverse `d.tables` (including nested) in `hr_text._iz_docx` and `citation_fingerprint_file`, classifying cell text as `tijelo`, not marker. Same function is blind to footnotes under apa-hr/autor-godina (only `legal-footnote` reads them) and to embedded media entirely — a deleted `Grafikon 1.` leaves the caption and `Izvor:` line dangling and both tools report zero change. Add a media-part sha256/count comparison while you are in there. Regression test: mutate only a table cell, assert exit 1.

### 3. `geometrija` severity is decided from a truncated 5-item sample, so a fully deleted sentence past the fifth difference is a warning
`scripts/verify_rewrite.py::usporedi` — `det = list(nestale)[:5]` then `razina = "!" if all("IZMIJENJENA" in d for d in det) else "x"`.

*(Merged: `lost-sentence-hidden-by-5-item-sample` from diff_rewrite and `verify-rewrite-geometrija-not-blocking` from workflow_docs are the same three lines.)*

Reword five sentences, delete a sixth: "⚠ 7 rečenica nije doslovno preneseno (7 → 6)", five IZMIJENJENA blocks printed, the deleted sentence never printed, `✓ sadržaj očuvan`, exit 0. A real 60-page geometry pass always has more than five differing sentences, so the cap is always in force — this is the normal case, not an edge case. A lost sentence carrying no digit and no citation (a limitation, a caveat, a conclusion) vanishes silently.

Fix: build an `izgubljeno` flag while iterating the *full* `nestale` multiset, set `razina = "x"` if any entry has no close match, report true counts ("n izmijenjenih, m izgubljenih"), and truncate only the printed examples. One-line change; no test covers this branch (`grep -rn 'IZMIJENJENA|IZGUBLJENA' tests/` returns nothing).

### 4. A page locator ending in a period deletes the whole citation from the parser; an author swap then certifies as "citati identično"
`scripts/citation_dialects.py::LOKATOR` / `bez_lokatora` (L71-75, 126) → `parse_author_year` (L134).

`bez_lokatora('(Čavlek, 1998., str. 41.)')` → `'(Čavlek, 1998..)'` → `parse_citations` returns `[]`. Every trailing-dot form dies: `str. 41.`, `str. 41–43.`, `p. 41.`, `1998.: 41.`, `str. 41. i 42.`. Then `verify_rewrite … --citatni-stil apa-hr` on a rewrite that changes `(Čavlek, 1998., str. 41.)` to `(Bartoluci, 1998., str. 41.)` prints `✓ citati: 0 referenci, identično [apa-hr]` and exit 0. This is apa-hr, i.e. EFZG, the production profile. The only existing test uses the one form without the trailing dot.

Fix: do not let LOKATOR group 1 capture the year's own dot and re-emit it — make the substitution consume the locator's trailing period, add `\s*i\s*\d+`, and defensively collapse `..` before matching. Regression matrix over every form above.

Mitigation that keeps this at #4 rather than #2: the sentence-level check still prints the `- Čavlek / + Bartoluci` diff, so a human reading the output sees the swap.

### 5. Mandatory-section detector accepts ordinary prose as a section — a thesis with no Zaključak reports "0 fali"
`scripts/check_rules.py::provjeri_obavezne` (L556) plus the `kratki` collector at L872.

`main()` puts every non-heading paragraph under 80 characters into `kratki`, `provjeri_obavezne` merges those into `kandidati`, and matching is bare substring containment. A full EFZG seminar with no conclusion chapter, containing only the body line "Zaključak ove analize je jasan.", reports `obavezni dijelovi 13 → 11 nađeno, 0 fali, 2 za ručnu provjeru ⚠️`. Missing a Zaključak/Sažetak/Životopis is an automatic rejection; mode 6 exists to catch exactly this.

Fix: match mandatory parts against heading-styled paragraphs plus structurally heading-like paragraphs (short, standalone, no terminal period, bold/centred/all-caps). If short prose stays as a fallback, require a whole-token match anchored at the start of the candidate and downgrade a prose-only hit to "možda, provjeri ručno" instead of counting it found.

Calibration note: the reporter's escalation claim about the truncated `SINONIMI` stems ("analiz", "teorijsk") is wrong for EFZG — `razrada`-prefixed parts route to a separate `sredina` branch that reads only H1 text. The stems only bite on FPZG, which is a pilot profile. The Zaključak/Sažetak/Životopis path is real on production.

### 6. Strict evidence gate silently degrades to "no source verification" when `izvori.json` is absent, and prints a green EVIDENCE GATE
`scripts/verify_rewrite.py` L232-243 (`sources = candidate if os.path.isfile(candidate) else None`) with `scripts/evidence_gate.py::evaluate_files` L188 (`sources_required = sources_path is not None`).

With `izvori.json` marking a source `invalid`, `verify_rewrite … --evidence-gate` blocks correctly. Move the file aside and the identical command prints `EVIDENCE GATE: ✓ evidence gate PASS: 1 claim(s)` and proceeds — `_source_meta(None)` returns `blocking=False` for every source and the snapshot check is skipped, with no warning on either path. `SKILL.md:363` prescribes `--evidence-gate --require-snapshot` with **no** `--sources`, so the silently degrading auto-detect branch *is* the prescribed path.

Fix: under `policy='strict'`, treat a missing source snapshot as a precondition failure — emit a `preconditions` entry ("strict evidence gate bez source verification snapshota") and set `passed=False`. At minimum `run_evidence_gate` must print a loud degraded-mode line. Passing `--sources` to a nonexistent path is already safe (raises a structural error); only auto-detect degrades.

### 7. Chapter-scoped caption numbers collapse to the chapter digit, producing a false green on the mandatory "every display must be referenced" rule
`scripts/check_rules.py::NATPIS_RE` (L624) and the mention regex in `provjeri_prikaze`.

`natpis('Tablica 2.1. Kretanje noćenja')` → `('Tablica', '2')`. In a document with `Tablica 2.1.` (referenced) and `Tablica 2.2.` (referenced nowhere, no Izvor), the report says `prikaz spomenut u tekstu … 2/2 spomenuto ✅` because `\btablic\w*\s*2\b` matches inside "Tablici 2.1.", and the one finding that does fire names the wrong object ("bez retka „Izvor:\": Tablica 2."). Chapter-scoped numbering is standard in larger Croatian theses.

Fix: capture the full dotted number `(\d+(?:\.\d+)*)`, require the separator to be the period after the last component, and build the mention regex from the full escaped identifier with a non-digit lookahead.

Folded in here (same regex, lower severity, disclosed rather than silent): `Tablica 1: Naziv` and `Tablica 1 – Naziv` return `None`, which drops both display checks to a `⚠️` that explicitly says the captions were not recognised. Accept `.`/`:`/`–`/`-`/`—` as separator; add `Shema` to `VRSTE_PRIKAZA` (it is in `NATPIS_RE` but not the allowlist, so that alternative is dead) or drop it from the regex; and escalate to `❌` when zero captions are found but the document contains `w:tbl` elements or inline images.

### 8. Page-break-before check inspects only the heading paragraph, so the standard Ctrl+Enter encoding is invisible in both directions
`scripts/check_rules.py::ima_prijelom_prije` (L201) used by `provjeri_prijelome` (L515).

Word's Ctrl+Enter puts `<w:r><w:br w:type="page"/></w:r>` in the *preceding* paragraph or in an empty spacer — never in the heading. A document with a real break before every chapter reports `0/3 poglavlja ima prijelom ❌` under EFZG (student "fixes" it by adding `pageBreakBefore` to the heading style, producing a blank page before every chapter in print) and `0/3 … ✅` under the RFIR overlay that forbids breaks (student submits against the programme rule). Nothing else compensates.

Fix: scan backwards from the heading — `pageBreakBefore` on the heading, a page break in the heading's own runs before the first text run, a preceding paragraph ending with `w:br[@w:type='page']`, an empty spacer paragraph whose only content is the break, or an intervening `sectPr` with a page/odd-page start.

### 9. Legitimate Croatian journal articles are flagged conflict/blocking because Crossref stores the English title first
`scripts/verify_sources.py::provjeri_izvor` L614-632; similarity threshold 0.35 against `title[0]` only.

Verified against the live Crossref API on *Ekonomski pregled* — EFZG's own journal. `10.32910/ep.75.3.2` deposits `title = ['Carbon accounting', 'Računovodstvo ugljika']` (English first); `10.32910/ep.76.1.5` deposits Croatian first. Ordering is not stable. Feeding the real pairs into `V.slicnost` gives 0.368 and 0.33 — below threshold. A student citing that article in Croatian with the correct DOI, correct authors and correct year gets `🟠 conflict`, `quality class X`, `blocking=True`, exit 1 — and `blocking` propagates into `evidence_gate.py::_source_meta` (L62) to the hard block at L131, so every claim resting on that source is stopped dead and the message says their correct domestic source is contradicted.

Fix: compute similarity as `max()` over `title[*] + original-title + title⊕subtitle`, not `title[0]`. Only raise conflict when a corroborating signal (first-author surname or year) also disagrees; otherwise downgrade to `unverified` with "naslov se razlikuje, moguć prijevod". The reporter said the other-language title lands in `original-title`; in the deposits I checked it lands in `title[1]` — which makes the defect broader, since `crossref_doi_metadata` only ever reads `title[0]`.

### 10. Full init destroys an unreadable or future-version `stanje.json` without `--force` and without a backup, exiting 0
`scripts/stanje_init.py::main` L549-550 (`postojece = ucitaj(kat, tiho=True)`; guard tests `postojece is not None`) and `ucitaj()` L117-128.

`ucitaj()` returns `None` for *any* unreadable state — future schema version, truncated JSON, bad encoding — so `main()` reads that as "no project here", skips the `--force` guard, and overwrites. stderr prints the correct refusal ("migracija stanja odbijena … novije verzije sheme (3 > 2)"); stdout then prints `✅ zapisano`; exit 0. `.katedra/migrations/` stays empty — `migrate_file` never runs, so mentor, rok, tema, ogranicenja and `plan_odobren=true` are gone with no copy anywhere. This directly contradicts `references/stanje_schema.md` ("State s verzijom novijom od podržane se odbija bez mutacije") and PROMJENE.md AUD-034, and the guard's own message ("pun init bi tiho pregazio povijest odluka") describes precisely what happens. Worse, the recovery advice printed on the corrupt-JSON path steers the agent into this destructive command.

Fix: make `ucitaj()` distinguish "absent" from "present but unreadable" (sentinel or raise), or have `main()` check `os.path.isfile(put_stanja(kat))` before the init overwrite; refuse with exit 2 even with `--force` unless the raw bytes are first copied to `.katedra/migrations/stanje_unreadable_<sha12>.json`. Extend the AUD-034 future-version test to the full-init path and fix the corrupt-JSON hint.

Precondition is a state that is already future-version or corrupt (`spremi()`/`migrate_file()` write atomically, so a normal interrupted run cannot produce this) — which is why it sits at 10 and not 3. But the destruction is total and unlogged.

### 11. Engine crash plus a pre-existing `nalazi.json` reports a clean audit and exits 0
`scripts/engine.py::main`, `--json` branch L197-222.

`rc = pokreni(...)` is assigned and then never consulted inside `if a.json_out:`; the branch returns `1 if n_kriticno else 0`. The only staleness guard is `os.path.isfile` — no unlink-before-run, no mtime check, no rc check. With a leftover clean `nalazi.json` and an engine that exits 70, output is the crash on stderr followed by `[Katedra: kritično 0 · srednje 0 · kozmetičko 0]`, rc=0 — on a .docx that never existed. `references/audit.md` step 3 and `references/predaja.md:33` both prescribe the same reused `./.katedra/nalazi.json`, so re-running mode 4 after fixing a chapter is the normal case.

Fix: unlink or rename the target before invoking the engine; after the run refuse to interpret the file if `rc` is outside the engine's declared success codes or the file mtime predates the subprocess start; return 4 with "motor nije proizveo svjež DocumentAuditResult". Not silent (stderr shows the crash) and mode 4 independently runs `check_rules`/`check_argument`, which is why this is 11 rather than higher — but the machine verdict and exit code are wrong.

### 12. Paragraphs crossing a page break count the running header and page number as their own lines, always inflating upward
`scripts/check_paragraphs.py::izmjeri`.

The loop at L74-78 skips only empty pdftotext lines, contradicting the comment at L71-72 that claims page numbers and headers are skipped without counting. Verified on a purpose-built TNR12/1.5/2.54cm render with a running header and a PAGE field: shifting one genuinely 4-line paragraph across the page boundary one line at a time, non-straddling positions measure 4, straddling positions measure 5, with the inserted lines being exactly `['1', 'Sveučilište u Zagrebu — Ekonomski fakultet']`. End to end: the same text passes `--min 5` at one page position and fails at another. The error direction is always upward, i.e. always toward a false pass on the faculty's hard minimum, in the mode the tool advertises as "render, ne procjena".

Fix: in `izmjeri()`, skip lines that are pure digits/roman numerals, lines identical to a repeating header/footer string, and lines below ~25% of the median line length — do not add them to `buf` (they also terminate the scan one real line early) and do not count them. The comment already specifies the intended behaviour.

### 13. `pokrivenost()` derives the bibliography key from the display string, so two-author, `et al.` and `&` entries produce contradictory blocking findings
`scripts/verify_sources.py::pokrivenost` L688 (`prez = re.split(r"\s*,", iz["autor"])[0]`) plus `citation_dialects._first_author` L130.

*(Merged: `pokrivenost-two-author-entry-never-matches` [verify_sources_net], `katedra-two-author-coverage-false-positive` [student_journey], `pokrivenost-et-al-citations-lost` [verify_sources_net], `first-author-ampersand-etal` [hr_text]. One key-derivation defect, four reported shapes.)*

Croatian APA renders exactly two authors as "Ćorić, G. i Šimić, M.", which `rastavi` correctly parses to `autor='Ćorić i Šimić'` — no comma survives, so the key becomes the whole two-name string and can never match the in-text key `('ćorić','2020')`. Three-or-more authors keep a comma and work; one author works. Result at `predaja.md:57`, the mode-6 preflight: "na popisu, a nigdje citirano: Ćorić i Šimić 2020" **and** "citirano u tekstu, a nema ga na popisu: (Ćorić, 2020.)", exit 1. Obeying either message damages a correct bibliography. The same class: `_first_author` splits only on `,`, ` i `, ` te `, so `(Müller & Schmidt, 2020)` keys as `müller & schmidt` and `(Čavlek et al., 2011)` as `čavlek et al.`; the narrative `Čavlek et al. (2020.)` yields no key at all because the narrative regex requires an uppercase-initial token before the paren.

Fix: build the key from the structured list `rastavi()` already produces — `(iz.get('autori') or [iz['autor']])[0]` — and strip a trailing `et al.`/`i sur.`/`i dr.` in `_first_author`; extend the split alternation to `&`, ` and `; add `et al.` to the narrative co-author alternation alongside the already-special-cased `sur.`/`dr.`. Regression cases for 1/2/3/5-author entries in both narrative and parenthetical form — the only existing coverage test uses a single-author source.

One correction to the raw findings: `'Čavlek et al. (2011.) tvrde.'` returns `[]`, not `('čavlek','2011')` as reported, so the "same source yields two different keys everywhere fingerprints are used" claim does not hold. Blast radius is `pokrivenost` only; both sides produce the same malformed key inside `verify_rewrite`, so no safety gate is blinded by this one.

### 14. PLAN GATE: approval is a sticker, not a statement, and fails open on unreadable state
`scripts/plan_state.py::cmd_import` / `cmd_next`; `scripts/plan_state.py::stanje_tip` / `plan_gate.load_state`.

*(Merged: `plangate-approval-never-revoked` [plan_gate] and `katedra-plan-gate-survives-reimport` [student_journey] are the same defect; the fail-open half is `plangate-fail-open-on-missing-or-unreadable-stanje`.)*

`cmd_import` rewrites `plan['poglavlja']` wholesale and never touches `odobren`/`odobreno_datum`/`odobreno_od`; `cmd_next` reads those stale booleans and never calls `approval_is_valid`. Approve a good plan, re-import a bare outline with `--force`: `status` prints "Plan odobren  da (2026-08-08)" while `evaluate_plan_gate` returns `passed=False` with `['potpoglavlja bez opisa sadržaja: 7', '… izvora: 7']` and `approval_is_valid` returns `False`; `next` serves the ungated chapter, exit 0. Separately, `stanje_tip()` and `plan_gate.load_state()` swallow every error and return `None`, which is not in `BIG_WORKS`, so a corrupt `stanje.json` turns a diplomski into an ungated seminarski: the ZABRANA PISANJA block becomes "piše se na vlastitu odgovornost" and exit flips 1 → 0.

Fix: bind approval to content — store a canonical hash of the gate-relevant payload plus the project fingerprint on `odobri`, recompute in `approval_is_valid` and `cmd_next`, and have `cmd_import` explicitly reset `odobren=False` and print that approval is revoked. Make unknown work type fail closed: distinguish "no stanje.json" from "unreadable", and treat unreadable/absent state or a `tip` outside `TIPOVI` as blocking.

Ranked here rather than at the top because the system is partly self-correcting: `next` prints "Sadržaj ⚠️ nije definiran u planu" and "Izvori ⚠️ nema ih u planu", and the next `stanje_init --set` on any field re-runs `approval_is_valid` and refuses with exit 2, so no further state transition is possible. Two of the reporter's realism arguments do not survive: mis-cased/whitespace `tip` is unreachable (`validiraj` rejects `Diplomski`, `parsiraj_vrijednost` strips whitespace), and the "interrupted concurrent write" trigger is contradicted by the reporter's own tmp-collision finding.

### 15. `--require-snapshot` certifies "snapshot potvrđen" when the snapshot .docx has been deleted
`scripts/verify_rewrite.py::snapshot_status`.

It reads only `x.get("sha256")` from `verzije.json` and never stats `x.get("datoteka")`, although `diff_versions.popis()` does exactly that check and prints "⚠️ datoteka nedostaje". So `--popis` correctly reports the missing file while the gate that exists to guarantee a rollback exists says the precondition is met, exit 0. Realistic when `.katedra/verzije/` is pruned or when a project is re-uploaded to a fresh session and the small JSON travels but the binaries do not. Fix: require the entry's `datoteka` to exist under `kat` (ideally re-verify sha256) and fail with `popis()`'s wording; regression test that deletes the file and asserts exit 1.

---

## Part 2 — Quality

Real defects, but they produce visible false positives, noise, or missed advisory signals rather than a wrong submitted thesis.

**Q1. The AUD-014 EFZG fixes are exact-string allowlists and reopen the same false positives on ordinary Croatian headings.** `scripts/check_rules.py`: `BACK_MATTER_H1`/`je_back_matter_naslov` (L101-113) contains only literatura/bibliografija/izvori plus four popis variants, so a compliant EFZG paper with SAŽETAK, SUMMARY, POPIS KRATICA, PRILOZI and ŽIVOTOPIS reports `broj poglavlja 5–8 → nađeno 10 ❌` — while the *same run* credits those headings under "obavezni dijelovi" because `efzg.json` lists them as mandatory. `DISPLAY_LIST_H1` (L106) recognises five strings, so `POPIS TABLICA I SLIKA` and `POPIS PRIKAZA` make back-matter list entries count as real captions again ("2/4 ima izvor ❌") *and* add a bogus content chapter. `SINONIMI` (L538) matches nominative substrings, so `POPIS LITERATURE` — the commonest Croatian bibliography heading, and already in `BACK_MATTER_H1` — fails the mandatory part "popis izvora" ("nema naslova za: popis izvora"), i.e. the same heading is simultaneously back matter and not a bibliography. Fix all three with one shared normalised predicate: count content chapters between the first Uvod-like H1 and the first back-matter H1; replace the display-list set with `^(popis|kazalo)\s+(tablica|slika|grafikona|grafova|ilustracija|prikaza|shema)([,i\s]+\w+)*$`; stem-and-anchor the mandatory-part synonyms (`literatur`, `izvor`, `bibliograf`, `sazet`, `zakljuc`, `zivotopis`) or reuse `hr_text.NASLOV_LIT`. Add a parametrised fixture per variant — the existing fixture contains exactly the three strings already in the allowlist, so the test cannot fail for anything outside it.

**Q2. Body-text start detection is both too permissive and too restrictive, and it poisons three separate measurements.** `scripts/hr_text.py::_iz_docx` L68-72 and the identical regex in `check_rules.py::je_pocetak_glavnog_teksta` L120. *(Merged: `toc-contaminates-body` [hr_text], `broj-rijeci-counts-front-matter-and-bibliography` [check_rules], `aud014-font-fix-vezan-uz-arapsku-numeraciju-uvoda` [check_rules].)* Too permissive: the TOC entry "1. UVOD" satisfies the body-start regex, so the body is declared to start inside the SADRŽAJ and every subsequent TOC line ≥40 chars becomes a "paragraph". On a document with two fully compliant 4-sentence body paragraphs and a normal TOC, `provjeri_odlomke` with `min_recenica=3` gives "2 od 4 ispod minimuma (50 %) ❌" versus "0 od 2 (0 %) ✅" on the same body without the TOC — a fabricated hard failure on a compliant thesis, on practically every Croatian završni/diplomski. Too restrictive: `I. UVOD` and `UVOD U PROBLEMATIKU` do not match, so `provjeri_font` falls back to the whole document and reports the title page's 18 pt as "izvan propisa u glavnoj prozi ❌". Third symptom: `check_rules.py` L883 counts words over *all* top-level paragraphs, so title page, TOC and bibliography inflate `broj riječi` — a 2900-word body reports 3182 and clears the 3000 minimum. Fix the detector structurally (first Heading-1 whose normalised text starts with `uvod`, or first H1 after the last front-matter heading; skip `TOC*`-styled paragraphs and anything between SADRŽAJ/POPIS* and the next H1; accept roman numerals and `uvod…` prefixes), then have the word count use the corrected body scope and state the scope in `detalji`. Important: do **not** remove the whole-document font fallback — `test_aud_014_font_checker_without_body_marker_keeps_legacy_fallback` asserts it deliberately.

**Q3. Croatian language primitives are incomplete in ways that fire on ordinary academic prose.** Four separate items in `scripts/hr_text.py` and `check_argument.py`:
- *Sentence segmentation* (`recenice`, L114; `KRATICE`, L92): `dr. sc. Ivan Ivić` splits into three (`sc` not in KRATICE); a sentence closed with `”`/`“` never splits; a parenthetical sentence never splits; `Prema članku 5. Zakona…` splits into two. The closing-quote case is the highest-value fix — a genuine 3-sentence paragraph with one Croatian quotation segments as 2 and produces "1 od 1 ispod minimuma (100 %) ❌". Add `sc`, `ur`, `prev`, `mag`, `univ`, `spec`, `akad`, `vol` to KRATICE and allow an optional closing quote/bracket before the boundary. See Part 3 for the contradiction on the digit cases.
- *Collation* (`hr_kljuc`, L124-156): `_HR` implements `dž` but not `lj`/`nj`, so a correctly ordered bibliography reports `[('Lukić','Ljubić'), ('Novak','Njegovan')]` as errors while a genuinely misordered one passes clean. Unmapped foreign diacritics (`ę ą ż ò ř ů ș ō`) sort past `z`, so `Wałęsa`/`Walker` is flagged. Advisory print only, no exit-code effect. *(Merged from three dimensions: domain_truth, verify_sources_net, hr_text.)*
- *`đ` deletion* (`bez_dijakritika`, L159): U+0111 has no NFD decomposition, so it survives the combining-mark strip and the downstream `[^a-z0-9]+` substitution turns it into a space. `norm('među')='me u'`, so the STOP-word filter in `dim_zakljucak` never removes `među`/`između`/`također` — they enter the top-10 concept list and the student is told the concept "također" never appears in their conclusion. Also mangles `_norm` in `profile_rules.py` (mentor overlay `Đurđica Jurić` does not match the ASCII spelling — latent, no shipped overlay uses `đ`) and `_slug` in `export_bibliography.py` (`Đurić` → `uric`, cosmetic, dedup handles collisions). One shared pre-fold table fixes all three: `đ→d, Đ→D, ø→o, ł→l, ß→ss, æ→ae, œ→oe`. *(Merged from check_argument, hr_text, profile_resolver.)*
- *`korijen(rijec, n=6)`* in `check_argument.py` is the identity function for words ≤6 chars, so `porez/poreza`, `kriza/krize`, `zakon/zakona`, `model/modela` never match across cases. On a real intro/conclusion pair this printed "ne pojavljuju se u zaključku: zakon…" while the conclusion opens with "Izmjena Zakona o javnoj nabavi…", and counting that one term correctly moves 5/10 to 6/10, i.e. ⚠️ to ✅.

**Q4. `check_argument` heuristics that flip verdicts on vocabulary rather than content.** `ANALITICKI_SIGNALI` matching is left-anchored only (`f" {norm(v)}" in n`), so the three-character signal `dok` prefix-matches `dokument`/`dokumentacija`/`dokaz`/`doktrina` — a 100%-descriptive legal chapter scores `✅ 0 % bez analitičkog signala`, with all four paragraphs matching on that branch alone. Use one word-boundary regex per signal, built at import; if prefix matching is intentional for inflected forms, require length ≥5. Separately, `dim_proporcije` has no guard against `prvi_analiticki == 0`, so a theory chapter titled "Dosadašnja istraživanja" or "Analiza dosadašnjih istraživanja" makes `sadrzajna[:0]` empty, `theory_share` becomes 0.0, and the `theory_share_max` check for "a quantitative work that is 85% theory" never fires — while the JSON records `teorija_udio: 0.0`, a number that is affirmatively false. Treat index 0 as "no analytical section found" and omit the field rather than writing 0.0. And `dim_citati` is fed `sadrzajna`, which excludes the introduction, so "citata ukupno" and the per-1000-word density are work-level labels on a chapter-level subset, and a citation-free introduction can never be flagged.

**Q5. Cross-chapter consistency is blind to the two commonest Croatian negations and to the thousands separator.** `scripts/consistency_check.py::claim_anchor`/`_polarity`: `NEG_RE` deletes the whole token `nije`/`nisu` while the affirmative keeps its `je`/`su`, so the two sentences never group and `_polarity` is never compared — "Digitalizacija je povećala produktivnost" (ch. 3) versus "…nije povećala…" (ch. 5) gives `findings=0 blocking=0`, exit 0. Only the bare `ne + verb` form works, and that is exactly and only the form the frozen AUD-040 test exercises. Fix by normalising `nije`→`ne je` before anchoring (or stripping the copula set with the negation particles) and add je/nije, su/nisu cases to the test. Same file: `_numbers` normalises the decimal comma but treats the Croatian thousands dot as a decimal point, so `1.000 ispitanika` versus `1000 ispitanika` is a **blocking** `numeric_conflict`. Parse as Decimal with group-separator stripping.

**Q6. `check_ai_style` and `check_paragraphs` calibration and CLI contract.** `--po-poglavljima` is parsed and never referenced — output is byte-identical with and without it (the per-chapter route documented at `pisanje.md:218` is running the tool on the chapter file, which does work; implement the flag or delete it). `--json` returns 0 before the `greske` computation while the text run on the same input exits 1, and the sibling `check_paragraphs --json` does the opposite — compute `greske` before the branch. The one-connective-dominates rule has no count floor (`n/rijeci*1000 > 2.5`), so on any text under 400 words a single occurrence trips it; add `n >= 4`. `check_paragraphs`'s documented 84 chars/line fallback over-estimates in ~16 of 21 measurable paragraphs on a real LibreOffice render of natural Croatian prose at TNR12/1.5/2.54cm (measured median full line: 90 chars), always upward, i.e. always hiding too-short paragraphs — recalibrate to ~90-95 or derive from the profile's font/size/margins, and report a range at the boundary. And when `izmjeri()` matches nothing (wrong `--pdf` handed in), `main()` prints three green ticks before the `⚠ N odlomaka nije pronađeno` line and exits 0; move the warning first and add an `izmjereno_udio`/`nepronadeno` key to the JSON.

**Q7. `verify_sources` scope and robustness.** `crossref_naslov` requests `select=DOI,title` and `provjeri_izvor` reads only the title, so a source with the right title and the wrong authors and year is stamped `✅ verified` — the dominant shape of a fabricated or mis-copied citation. This is a documented scope boundary ("može li se ovo naći", quality class deliberately `None`), not wrong output, but the metadata is already in hand for the DOI path: compare `message['author'][*]['family']` and `issued.date-parts[0][0]`, and add author/issued to the title-search select. Separately, `source_semantics.is_discovery_service_entity` substring-matches `google scholar` over `autor+naslov+unos+url`, so Halevi et al. (2017, *Journal of Informetrics*) — a real, heavily-cited paper *about* Google Scholar — comes back `❌ invalid`, `quality E`, `blocking=True`, exit 1, unconditionally and independent of `--offline`; the `wikipedia` half sets quality class X without blocking. Restrict both to the URL host field. Minor: `crossref_doi_metadata` treats any parseable 200 as "DOI razriješen" (a non-dict `message` raises `AttributeError` and aborts the run mid-report) — add `isinstance` guards and wrap the per-source call in `main()`; and a soft 404 answering 200 reports `✅` with `scope='locator'`, which is defensible but the locator/identity distinction is invisible in the SAŽETAK tally.

**Q8. `extract_comments` loses detail from tracked changes.** All tracked changes by one author under one heading merge into a single zamjerka whose text is `skrati(' / '.join(...), 90)`, so a deletion flagging plagiarism can fall past character 89 and exist nowhere in `zamjerke.json`; closing that one item marks the whole group addressed. `w:moveFrom`/`w:moveTo` and `w:pPrChange`/`w:rPrChange` are not parsed at all — a document containing only move/format revisions prints "Nema komentara ni praćenih izmjena" and exits 0. Any group containing a deletion is hardcoded `tip="stil"`, bypassing `klasificiraj()`. A comment with no `w:t` is counted in the header but silently produces no row. A comment anchored *on* a heading is filed under the previous heading. Individually all cosmetic-to-low; collectively they are the reason #1 above went unnoticed. Fix the merge key first (#1), then emit one zamjerka per revision run keyed by `w:id`, store full text and truncate only in `ispis_zamjerki`.

**Q9. Faculty data.** FPZG (`references/fakulteti/fpzg.json`, `status: nepotvrdeno`) carries several values contradicted by the official upute, verified by fetching the PDF: `opseg.diplomski` is 18000–22000 words against an actual 10000–12000 (politologija) / 12000–15000 (novinarstvo); `citiranje.u_tekstu` is `(Lindblom, 1959, str. 81)` against the faculty's colon form `(Swanson i Mancini, 1996: 9)` and an APA-shaped `popis_primjer` against the faculty's `Prezime, Ime (Godina)` form; `obavezni_dijelovi` prescribes teorijski okvir/metodologija/analiza (the PDF says only "tijelo teksta") and omits the mandatory sažetak i ključne riječi; margins 2.5/2.5/3.0/2.5 and "prijelom pred poglavljem" are not in the upute at all; `odlomak.max_redaka` is 12 against a stated 5–15 and `min_recenica: 3` is invented. Every one of these is emitted under the NEPOTVRĐENO banner with `[za potvrdu]` on each row, and the profile's own napomena predicts the margins/opseg drift — so these are a content backlog, not silent failures, and `faculty_scale_gate --tier production` correctly refuses FPZG. Two of the raw findings overstated: `izjava o autorstvu` **is** already a `SINONIMI` alias and matches; Katedra never tells an FPZG student to write "i sur." (that string appears only in a `verify_sources` caveat and an EFZG note). EFZG's separate gap: `struktura.opseg` has only `zavrsni` and `seminarski`, so `--tip diplomski` on the production profile checks no length, source count or chapter count — disclosed as a `⚠️` row naming exactly what was skipped, with the undergraduate source document printed under every finding. Add the diplomski block or declare a `tipovi_radova` scope and refuse out-of-scope types at resolver level. Finally, `izvori_min` is declared in both profiles and read by no Python anywhere — it reaches the agent only via `resolved_profile.json`; wire it into `check_rules` against `izvori.json`, which already carries per-source type.

**Q10. `plan_state` UX that costs work.** `--teza` and `--budzet` exist only on the `init` subparser, `init` refuses without `--force`, and `init --force` resets `poglavlja` to `[]` and `odobren` to `False`. Two of the tool's own messages instruct exactly this (`plan_state.py:229` "Dopuni s: plan_state.py init --teza \"...\" --force" and `:666` "postavi ga s init --budzet N --force"), and the destructive run prints only `✅ kostur plana` with no statement of what it deleted, leaving `plan.odobren=False` while `stanje.plan_odobren=True`. Add a non-destructive `set --teza --budzet`, repoint both advisory strings at it, and have `init --force` enumerate what it is about to destroy. Related: the `plan_odobren` guard fires on the post-mutation value regardless of which field was edited, so `--set rok=...` is refused with a message about `plan_odobren` — a wording bug, escapable with `--set plan_odobren=false` in the same command. And `evaluate_plan_gate`'s content checks are pure `bool(str(x).strip())`, so `—`, `?`, `TBD`, `n/a` count as planned content and sources; add a placeholder-token filter so `import` prints its "bez sadržaja, bez izvora" warning for those cells the way it does for blank ones.

**Q11. Uncaught tracebacks on ordinary inputs.** `evidence_ingest.py::main` catches only `(OSError, ValueError, RuntimeError)` at L157, so a password-protected library PDF (`FileNotDecryptedError`) or a partially-downloaded one (`PdfStreamError`) produces a 20-line pypdf stack trace and exit 1 instead of the project's own exit-2 + Croatian guidance, which every other error path in that script gets right. Add `pypdf.errors.PdfError` to the except tuple with the two messages. Smaller: `stanje_init.validiraj` dereferences `fak.get("slug")` before the `isinstance(fak, dict)` check, making the authored "mora biti objekt" message provably unreachable and crashing `--validate` on precisely the malformed state it diagnoses; `engine.py:169` does `os.path.abspath(a.rad or a.audit)` with no guard, so `--faza A` without a document raises `TypeError` and exits 1 (the docstring reserves 2 for bad arguments); `parsiraj_vrijednost` coerces any unquoted numeric-looking value, so `--set tema=2026` dies with `AttributeError` on `.strip()` (nonsense input, no corruption, listed only for completeness).

**Q12. Documentation that does not match the code.** `references/audit.md` §B19's `reviewer_simulation.py` block fails twice verbatim: no documented command ever writes `.katedra/arg.json` (`check_argument` is invoked without `--json` at audit.md:73, :115, pisanje.md:219, predaja.md:34, and `arg.json` is absent from the `stanje_schema.md` file table), and `--mentor-feedback` is presented as part of the command though it is optional and most projects have no `zamjerke.json`. Add `--json ./.katedra/arg.json` to the two audit.md invocations, list the artifact, split the mentor-feedback example. `stanje_schema.md:146` documents `plan.json.prikazi` and `plan_state.py:541` reads it, but no subcommand writes it and `import` explicitly skips section-6 rows — either add a `prikaz` subcommand and teach `import` the table, or delete the field from both. `consistency_check.py` prints `SUMMARY chapters=1 … findings=0 blocking=0` without ever printing `coverage_status: insufficient` in the text branch (exit 2 does signal it, and `chapters=1 edges=0` is visible, so this is cosmetic), and `reviewer_simulation.simulate` reads only `findings`, so the artifact the producer refused to certify becomes lens status `clear`.

**Q13. `~/.katedra/profil.json` contains verbatim thesis fragments while five places promise it does not.** `user_profile.py::nalazi_iz_stila` records `check_ai_style` "početak rečenice" findings, which carry the first two words of a repeated sentence opening, so the file can contain a case-study organisation name and `brief` re-emits it into unrelated future sessions, directly under the line "sadrži samo nazive nalaza i brojače — nijednu rečenicu iz radova, nijedan osobni podatak". The reporting threshold (`isti_pocetak_max=3 × round(rijeci/3000)`) means a 15000-word diplomski needs 16+ identical two-word openings, so in practice this is stock connectives or an organisation name, not personal data — the defect is the documentation, not a leak. Either drop the quoted payload for open-vocabulary findings (the repeat signal does not need the words) or allowlist against the closed catalogues, and correct the promise. In the same area, `check_paragraphs.u_pdf` never removes its `tempfile.mkdtemp()` directory (0700, so hygiene not exposure — wrap in `TemporaryDirectory`), and `artifact_state._norm_path` plus `check_argument.py:629`/`check_rules.py:905`/`diff_versions.py:543` store absolute paths containing the OS username. The privacy test gap is real (`user_profile.py` has no unit file) but the test the finding blames, `test_author_profile_remains_global_cross_project_state`, is a globality contract test that never claimed to guard privacy.

**Q14. Atomic writes are single-writer and follow symlinks.** All twelve state writers use a fixed `<file>.tmp` plus `os.replace`. Two consequences: concurrent `--set` runs collide and the loser dies with a raw `FileNotFoundError` from `os.replace` and exit 1 (no corruption observed in 160 attempts — `os.replace` is atomic, so the file tears only in theory); and a pre-planted symlink at the `.tmp` path is followed, overwriting the target and leaving `stanje.json` itself a symlink outside the project for the rest of the thesis. The symlink case needs write access to the victim's own `.katedra/`, so it crosses no privilege boundary — it is hardening, not a vulnerability. One shared helper in `context.py` using `tempfile.mkstemp` in the same directory plus `O_CREAT|O_EXCL|O_NOFOLLOW`, refusing to replace onto a symlink, fixes both across all twelve sites.

**Q15. Profile composition has no way to express "unknown rule", and hand-written overrides are unvalidated.** `_deep_merge` replaces any scalar including `None`, and every consumer reads a missing rule as "no constraint", so a layer that nulls `format.prored`/`velicina_pt` flips three real violations to `✅ profil ne propisuje`; an out-of-enum `citiranje.stil` makes `provjeri_citate` bare-`return`, removing the citation row entirely. Both inputs are rejected by the project's own schemas and both are caught loudly by `check_argument` (exit 2, naming the field), which the audit protocol runs on the same resolved profile — so this is a missing "unknown" state, not a live hole. Same class: `profile_resolver --project-override` is merged with no validation at all (a `{"status":"potvrdeno"}` override erases all 13 `[za potvrdu]` markers on the FPZG pilot profile), and `faculty_bundle_paths` hashes only overlays whose `match.faculty` equals the slug, so a schema-legal faculty-less overlay changes an admitted production profile while the admission hash and `profile_registry --check` both report clean. None of these is a security boundary — the admission hash is self-attested and anyone who can write these files can re-attest it — but validating the override against a dedicated schema and widening the bundle hash to the whole overlay directory are both cheap. Related nit: `faculty_scale_gate` counts qualification-case *rows*, not asserted pointers, so cases with empty `expected` objects pass vacuously.

**Q16. `scripts/interaction_policy.py` is an eval oracle with no runtime caller, and it is narrower than the published contract.** `_ignore_project` substring-matches, so `lekta` inside `dijalekta`/`sociolekta`/`intelekta` plus the ordinary preposition `kod` or the noun `razvoj` returns `ignore` — and it runs *before* the explicit-katedra check, so a message literally beginning "katedra:" is discarded. `_contains_any` needs literal bigrams, so the dative clitic in "Poboljšaj **mi** tekst" (a phrase quoted verbatim in the SKILL.md frontmatter) breaks the trigger, and `napiši seminarski` without the word `rad` never activates. `_delegate_completed_audit` precedes the `state_exists` short-circuit. Only `eval_runner.py`, `benchmark_runner.py` and one test import `route_interaction`; real activation is the host model reading the frontmatter description, so no student is misrouted. What is real: the frozen gold set was curated from the matcher rather than from the description, so the lane is self-confirming, and `_legacy_v1_route` calls the live `route_interaction` with `wizard`/`first_action` overwritten — meaning the B18 benchmark's `regressions` field is pinned at 0 for any change to `detect_mode`/`_activation_signal`. That last one is documented intent and `eval_runner --lane all` does catch a broken `detect_mode` loudly (12/26), but generating the trigger cases from the quoted frontmatter phrases would make the two structurally agree.

**Q17. The certifying tests cannot fail for the reason they were written.** Proven by mutation, not inspection:
- Replacing `approved = bool(plan and plan.get("odobren"))` with `approved = True` in `plan_gate.py` leaves the entire 298-test suite green — `test_aud_004_state_true_cannot_bypass_unapproved_plan` never creates `plan.json`, so it is satisfied by the plan-missing branch, and none of the other five AUD-004 tests covers the approval branch either.
- Replacing the whole body of `export_bibliography.main()` with `return 0` leaves the suite green; `CLI_ENTRYPOINTS` lists 27 of the 31 `__main__` scripts and `export_bibliography.py` is invoked by no test at all. (The other three missing names *are* covered elsewhere — 13 tests fail when they are broken — so the census is a hand-maintained-literal problem plus one genuinely untested CLI.)
- `test_aud_017_theoretical_work_does_not_require_empirical_chapter` asserts the absence of a string the codebase no longer emits; setting `requires_analytical_section=True` **and** `theory_share_max=0.65` on the theoretical policy leaves all 12 tests in that file green, because the fixture's chapter titles make `theory_share` 0 (see Q4) and both assertions go vacuous.
- `test_aud_006_mentor_feedback_tracks_…` uses exactly one comment and closes it last with no subsequent re-import, which is why defect #1 shipped; the `w:ins`/`w:del` branch has zero coverage.
- The 44/44 release gate's only per-node check is `re.search(rf"^def\s+{name}\s*\(", text)`, so a mapped node can be `@pytest.mark.skip`-ed and the matrix still says `verified`.
- `test_b14_public_contract_places_perspective_map_before_outline` is six substring checks that all pass on a 200-character string asserting the opposite ordering (the runtime ordering *is* guarded, by `test_aud_024_big_work_outline_import_blocked_before_ready_perspective_map`).
- No test anywhere asserts on the `obavezni dijelovi`, `prijelom pred poglavljem`, `broj riječi` or `prikaz spomenut u tekstu` rows; no test calls `diff_versions.py <old> <new>`; `grep -rn 'izgubljen' tests/` returns nothing; `dim_teza`, `dim_zakljucak`, `dim_pitanje` and `dim_citati` have no direct tests; `page_label` has no test; `abecedni_red`/`hr_kljuc` have no test; `recenice()` has no test.

Fix direction: have the release gate parse a `--collect-only`/JUnit report from the same session and assert every mapped node was collected and *passed*; then add the specific behavioural cases named above. The pattern to avoid is the one that produced all of these — asserting on implementation strings rather than on the requirement.

**Q18. `legal-footnote` keys citations on the whole normalised paragraph, so any style reword of a law-mentioning paragraph blocks the rewrite.** `citation_dialects.parse_legal_text` L218 sets `key = f'{source_type}:{_norm(text)}'` over the entire input, and `citation_fingerprint_file` applies it to every body paragraph, not just footnotes. Rewording `i` to `te se` produces `✗ citati odstupaju`, exit 1, `NE primjenjuj prepisano` — in mode 3, whose entire purpose is rewording. Ordinary prose containing "zakon" is also counted as a legal citation by `check_argument`. Neither shipped profile uses this dialect (opt-in only per SKILL.md:319), which is why it is here and not in Part 1. Key on the extracted legal identifier (NN number, case number, act number) and emit legal refs only from footnote text.

**Q19. Assorted small correctness items worth batching.** `evidence_gate._human` sorts pages lexicographically (`pages=10,105,2,3,9`) and prints the physical PDF index under `pages=` while `page_label` — defined in `stanje_schema.md:272` as the printed label and present in the JSON report — is dropped from the human matrix; print `pages=1 (pdf 5)` and sort as ints. `evidence_ingest._text_pages` sets `page_label = str(i)` unconditionally for .txt/.md with no form feeds, inventing a printed page where the schema permits `null`. Re-ingesting a different file under an existing `--source-id` deletes the prior records with no count of what was removed (documented idempotent-refresh behaviour, but the CLI should say "N added, M replaced from `<old path>`" when `source_path` differs). `source_sha256` is written at ingest and read by nothing, so a source file swapped in place leaves the ledger and the strict gate fully green. `diff_versions.brojke` fuses `15, 20 i 25` into a phantom token `15,20` (real bug; the >2-digit threshold above it is documented behaviour and `verify_rewrite` does block flipped two-digit percentages, so the headline "every percentage under 100 can be flipped silently" is false). `snapshot()` forces a `.docx` extension on non-.docx sources, so `--vrati` hands back an ASCII file named `.docx` that the tool's own next suggested command rejects. `verify_rewrite` compares NFC against NFD without normalising, printing identical strings as both lost and added — fail-safe but undiagnosable. `claim_ledger.py` has no `--project-root`, ignores `KATEDRA_PROJECT_ROOT`, and prints `✅ claim ledger structurally valid: 0 claim(s)` with exit 0 from an empty directory, unlike its sibling `evidence_gate.py`. `check_rules.font_iz_rpr` reads only `w:ascii`, missing `w:hAnsi` — which is the slot that governs every Croatian diacritic — though the row lands on `⚠️`, not `✅`, and the split-font input has to be hand-crafted. `extract_comments` runs in preview mode without `--out` while computing the correct default for `--otvorene`. Docx readers call `z.read()` with no size cap (a hand-crafted bomb costs 2 GB RSS and 10 s, completing normally — worth a `ZipInfo.file_size` ceiling, nothing more).

---

## Part 3 — Contradictions

**Sentence segmentation is over-constrained and two findings cannot both be satisfied.** `ordinal-before-proper-noun-oversplit` demands that `Prema članku 5. Zakona…` *not* split; `segmentation-boundary-misses` and `hrtext-sentence-split-merges-digit-initial-sentences` demand that `2019. bila je rekordna godina.` and `45 % njih…` *do* split. No widening of the follower character class can satisfy both — the two cases are distinguished only by what precedes the dot. **I believe the boundary-misses finding and reject the proposed fix in the digit-initial one.** Add the missing abbreviations and allow a closing quote/bracket before the boundary (uncontroversial, and the quote case is the one I reproduced flipping a compliant paragraph to `❌`); handle the digit cases with left context — protect the dot when the preceding token is a known ordinal governor (`član`, `članak`, `stavak`, `točka`, `tablica`, `slika`, `poglavlje`, `br.`, `str.`) — rather than by adding digits to the follower class. Note also that the over-splitting direction can only mask violations (`provjeri_odlomke` enforces a minimum), so it is strictly the lower-priority half.

**"The correct body scope was already computed and then not used."** The word-count finding claims `provjeri_odlomke` already has the right scope. It does not — `H.ucitaj`'s body itself starts at a TOC line (Q2). **I believe the TOC verifier.** The consequence for sequencing: fix the body-start detector first; substituting the current body scope into the word count would trade one wrong number for another.

**The AUD-014 font fallback.** `aud014-font-fix-vezan-uz-arapsku-numeraciju-uvoda` frames the whole-document fallback as an oversight. It is a deliberate, tested decision (`test_aud_014_font_checker_without_body_marker_keeps_legacy_fallback`, plus an explicit code comment). **The fix is to widen the marker, not to remove the fallback.**

**`geometrija` blocking semantics.** `verify-rewrite-geometrija-not-blocking` reads `stil_pipeline.md:100-101` as promising a block on any changed sentence and calls the warning level a bug; `izgubljena-then-sadrzaj-ocuvan` was verified as overstated precisely because difflib at cutoff 0.75 cannot distinguish a deletion from a strong reword, so blocking on close matches would false-fire on the ordinary `stil` path. **Both are right about different halves.** Resolution: block on true losses (compute `razina` over the full `nestale` multiset — defect #3), keep IZMIJENJENA non-blocking, and correct `stil_pipeline.md:101` to say so. Also stop printing "sadržaj očuvan" on the same run that prints IZGUBLJENA — split the verdict line from the block counter.

**The PLAN GATE lockout escalation.** `plangate-fail-open-on-missing-or-unreadable-stanje` argues its realism partly from `plangate-state-lockout-and-misleading-error` ("the documented escape is closed, so the student hand-edits `stanje.json`, which reaches the fail-open bypass"). The lockout is escapable with one supported command (`--set plan_odobren=false --set rok=…`, verified working), so **that chain does not hold** and both items are correctly at medium/low. The lockout's wording bug is still worth the one-line fix.

**`engine-contract-v1-unimplemented`** claims Katedra discards a real audit when the installed `rad-audit` lacks a manifest. It does not — `rad_izvjestaj.md` and the legacy `nalazi.json` both survive on disk and the "kritično 1, srednje 7" line is printed; only the machine-trusted interpretation is withheld, which `references/audit.md` §3 documents as intended (exit 4). **I believe the verifier.** This is a rollout-coordination item for the separate `rad-audit` skill, not a defect in this package.

---

## Part 4 — Certified core versus advisory layer

**Almost everything actionable is in the certified v1.0.1 core**, i.e. requires your per-instance authorisation plus a regression test. Mapping the blocking list to AUD scope:

| Defect | File | AUD scope |
|---|---|---|
| #1 zamjerke merge | `mentor_feedback_state.py`, `extract_comments.py` | AUD-006 |
| #2, #3, #6, #15 | `verify_rewrite.py`, `hr_text.py`, `citation_dialects.py`, `evidence_gate.py` | AUD-005, AUD-023 |
| #4 locator | `citation_dialects.py` | AUD-019/020 |
| #5, #7, #8 | `check_rules.py` | AUD-014 |
| #9, #13 | `verify_sources.py` | AUD-021/025 |
| #10 init overwrite | `stanje_init.py` | AUD-034 |
| #11 engine stale JSON | `engine.py` | AUD-010/033 |
| #12 paragraph lines | `check_paragraphs.py` | AUD-029 |
| #14 PLAN GATE | `plan_state.py`, `plan_gate.py` | AUD-004/024 |

You have precedent for this path: `verify_sources.py` has already been core-patched three times under user authorisation (PROMJENE.md, rounds 2 and 3), and four of the blocking defects live in that file or its callers. Worth noting explicitly, since it affects how you plan the work: the release gate checks version strings and that each AUD row has a live `pytest_node` — it does **not** hash the certified scripts, so it cannot tell you a core file changed. Your only record of core patches is the changelog and git history.

**The v1.1 advisory layer** (`originality_check.py`, `originality_eval.py`, `export_bibliography.py`, `grill_me.py`, the CROSBI/CroRIS alias in `source_semantics.py`, and the two v1.1 schemas — no AUD number, `metadata.extensions` marker) contributes exactly two items in this whole report, both minor and both freely patchable:

1. `export_bibliography.py`'s CLI layer has zero test coverage — gutting `main()` leaves the suite green (part of Q17). Add subprocess tests for `--bibtex`/`--ris`, the missing-output exit 2, and the empty-export exit 1, and derive `CLI_ENTRYPOINTS` from the filesystem.
2. The BibTeX output renders `title = {{Poslovni procesi, 2}}` for `2. izd.` entries — but the root cause is in core `verify_sources._razdvoji_naslov_kandidate` (`_je_kratica_prije_tocke` looks at the word *before* the dot, and the Croatian ordinal form puts a bare digit there). The advisory script is a faithful adapter; the fix belongs in the core function, and per `v1_1_dodaci.md` the trailing-metadata leakage in `naslov` is a known accepted limitation of that field, so this is low priority either way.

Note that `is_discovery_service_entity` (Q7, the Google Scholar false-invalid) lives in `source_semantics.py` but is **core B12 code** — only the CROSBI alias in that file is advisory. Patching the discovery check needs core authorisation.

---

## Part 5 — Empty categories

No defect in this set exfiltrates data to a third party, executes attacker-controlled code, or crosses a privilege boundary. The three items filed under `security` all reduce to hardening: the URL checker fetching URLs the student wrote (documented purpose, `--offline` exists), untrusted mentor-comment text being displayed verbatim (the tool's entire function; nothing evaluates it), and the symlink-follow in atomic writes (requires write access to the victim's own project directory). Treat the whole security dimension as Q14 plus a fenced-untrusted-content convention, not as a vulnerability queue.

---

# Kritika samog audita

## What the sweep missed

### 1. Files assigned to nobody

I enumerated the package (43 scripts, 24 reference files, 42 test files) against the 20 dimensions. Files that appear in **zero** findings, i.e. no dimension owned them:

| File | Lines | Why it matters | Test coverage |
|---|---|---|---|
| `scripts/originality_check.py` | 267 | **Plagiarism-adjacent output, run at mod 4 and mod 6 (pre-Turnitin)** | 8 unit tests, all single-passage |
| `scripts/originality_eval.py` | 157 | the "0 tihog drifta" frozen benchmark for the above | 5 tests |
| `scripts/grill_me.py` + `references/grill_me.md` + `references/obrana.md` | 209 + 2 docs | **all of mod 5 (defence prep)** — mentioned only as "the already-closed grill_me traceback" | `test_grill_me.py` |
| `scripts/review_policy.py` | 56 | the mutation capability boundary (`mutation_snapshot_status`) that gates phase G document mutation | **zero tests, zero findings** |
| `scripts/provenance_report.py` | 72 | rule-provenance freshness reporting | 1 test |
| `scripts/mentor_feedback_state.py` | 127 | — it *was* hit, but only via the last finding; no dimension owned it | **zero direct tests** |
| `docs/v1_1_dodaci.md` | — | the whole v1.1 advisory layer spec | — |

`originality_check.py` is the worst gap: the dimension list has "the evidence chain" (which covered `evidence_ingest`/`evidence_gate`/`claim_ledger`) and "test forensics" (which read test files), and this script fell exactly between them. It is the only tool in the package whose output speaks to academic integrity, and `references/predaja.md:94-100` positions it as the last check before the thesis enters the real Turnitin round.

### 2. Cross-cutting concerns invisible from inside any single dimension

- **Passage granularity ↔ overlap arithmetic.** `evidence_ingest._passages()` decides how a source is chunked; `originality_check.analiziraj()` computes overlap *per chunk*. Neither is wrong alone. Together they produce the defect I reproduce below. No dimension spanned both.
- **Terminal artifacts.** `originality.json`, `provenance.json`, `reviewer_simulation.json` are written and read by nothing. `reviewer_simulation` has exactly four lenses (`argument`, `evidence`, `consistency`, `mentor`) — there is no originality lens, and `predaja.md`'s submission checklist (line 54 block) has no originality item; it is a loose paragraph at line 94. A high-overlap finding therefore never reaches any summary the student is told to clear.
- **Shared normalisation primitives with asymmetric consumers.** `hr_text.bez_dijakritika` is used by `check_argument.norm`, `check_rules.norm`, `export_bibliography._slug`, and `originality_check` — and its đ behaviour is *harmless* in three of them (both sides transformed alike) and *breaks* the fourth (see the secondary finding). The privacy dimension noticed the đ bug in `check_argument`; nobody carried it across the seam.
- **`.tmp` write pattern in 13 scripts** — the security dimension found the symlink issue in one, but the concurrency/ownership question (which scripts write the same `.katedra/*` file from different modes) was never asked as a whole.

### 3. Claims resting on something nobody verified

- Several findings cite `hr_text.ucitaj(samo_tijelo=True)` behaviour as background but only two dimensions actually exercised it; `originality_check` depends on it entirely and no one traced that dependency.
- The `matched_excerpt` "bug #11 fixed" claim in `docs/v1_1_dodaci.md:323` and `PROMJENE.md:87` is asserted by a test whose fixture contains no `đ`. It is false for `đ`-bearing Croatian (reproduced below).
- The `evals/quality/originality_cases.jsonl` "frozen gold-set / 0 tihog drifta" claim: 9 of 10 cases have exactly one evidence passage, and the tenth (`multi-evidence-09`) has two where one matches 100% and the other 0% — it tests *source selection*, not aggregation. It cannot fail for the defect below.

### 4. What the method structurally cannot catch

Read code → run on synthetic inputs → refute. That method is blind to:
- **Defects that only exist in the composition of two correct components** — you have to build a fixture that crosses a subsystem boundary, and each specialist built fixtures inside their own boundary. This is exactly how the defect below survived.
- **Missing outputs.** Twenty auditors asked "is this number wrong?" Nobody asked "is a number that should exist absent?" The union/total-coverage metric below is never computed anywhere, so no run of any script can show it wrong.
- **Corpus-dependent behaviour.** All fixtures are hand-written by auditors, so real-document statistics (how often a copied span straddles a PDF page break, how long real Croatian paragraphs are) were never sampled — the calibration base is `docs/v1_1_dodaci.md:80`: "izmjereno na tri stvarna odlomka".

---

## The work: `originality_check.py` reports ✅ čisto on a 100 % verbatim-copied paragraph

**Root cause.** `analiziraj()` (`/tmp/katedra_v11/katedra/scripts/originality_check.py`, lines ~120-150) keeps only the single best-matching evidence passage:

```python
omjer = len(presjek) / len(p_shingles)
if najbolji is None or omjer > najbolji["overlap_ratio"]:
    najbolji = {...}
if najbolji and najbolji["overlap_ratio"] >= prag:
```

The union of matched shingles across passages is never computed. Its own docstring specifies the opposite: *"Prijavljuje se odlomak čiji udio shingleova nađenih doslovno **u nekom izvoru** prelazi prag"* — "found verbatim in *some* source" is union semantics.

**Repro A — one source, split by a passage boundary.** Source `/tmp/orig/src.txt` (two Croatian paragraphs, 49 + 43 words) ingested normally:

```
$ python3 -W ignore scripts/evidence_ingest.py /tmp/orig/src.txt --source-id src_knjiga --out /tmp/orig/evidence.jsonl
[evidence → /tmp/orig/evidence.jsonl] 2 passage(s), source=src_knjiga
```

`/tmp/orig/rad_min.docx` has one body paragraph = both source paragraphs concatenated **verbatim, 92 words, no quotation marks, no citation**:

```
$ python3 -W ignore scripts/originality_check.py /tmp/orig/rad_min.docx --evidence /tmp/orig/evidence.jsonl --json /tmp/orig/o_min.json
odlomaka analizirano: 2 · evidence passagea: 2 · prag: 0.5

✅ nijedan odlomak ne prelazi prag preklapanja s ingestiranim izvorima
EXIT=0
JSON: {'odlomaka': 2, 'evidence_passagea': 2, 'prag': 0.5, 'nalazi': []}
```

Measured: per-passage `0.494` and `0.424`; **union `0.918`**. Control (`/tmp/orig/rad.docx`, same text copied from one passage only) → `preklapanje 100%`, flagged.

**Repro B — mosaic / patchwriting across three sources.** `/tmp/orig/rad_mozaik.docx`, one 61-word paragraph assembled verbatim from three ingested sources:

```
$ python3 -W ignore scripts/originality_check.py /tmp/orig/rad_mozaik.docx --evidence /tmp/orig/ev_moz.jsonl
odlomaka analizirano: 2 · evidence passagea: 3 · prag: 0.5

✅ nijedan odlomak ne prelazi prag preklapanja s ingestiranim izvorima
EXIT=0
   src_m1: 0.315 · src_m2: 0.204 · src_m3: 0.222 · UNIJA: 0.741
```

**Repro C — PDF page break.** Same mechanism with `_text_pages` (`\f`), which is exactly how `evidence_ingest` models PDF pages: `/tmp/orig/book.txt` splits one continuous passage across a page break; the thesis paragraph copying it verbatim is not reported at all, while a *different*, less-copied paragraph is.

**The arithmetic is not a threshold-tuning issue — it is provable.** For an `n`-word span split evenly across two passages, total shingles = `n−7`, each side contributes `n/2−7`, so the max ratio is

```
(n/2 − 7)/(n − 7) = 0.5 − 3.5/(n − 7)  <  0.5   for every n
```

An evenly split copied span **can never reach the default threshold at any length**. Measured, unique-token control:

```
 n riječi      k=1      k=2      k=3      k=4     (k = passages the source span is split into)
       30   1.00!!   0.35     0.13     0.09
       80   1.00!!   0.45     0.29     0.18
      200   1.00!!   0.48     0.32     0.22
      400   1.00!!   0.49     0.32     0.24
!! = prijavljeno; everything else is silent on 100 %-copied text
```

For `k ≥ 3` — mosaic plagiarism, the canonical patchwriting pattern, and any span crossing two page boundaries — it is silent for every realistic paragraph length.

**Why this survived a green suite.** Every `analiziraj()` assertion in `/tmp/katedra_v11/katedra/tests/unit/test_originality_check.py` uses 0 or 1 evidence records, so `najbolji` is always the only candidate and the aggregation branch is never exercised. The frozen gold set is as described in §3. `references/predaja.md:92` even tells the student *"Visok postotak na jednom izvoru je ozbiljniji nalaz od istog postotka raspršenog po dvadeset njih"* — the dispersed case is acknowledged as real, and the tool is structurally incapable of measuring it.

**Fix (one addition, no threshold change):** in `analiziraj()`, accumulate `unija |= presjek` across all passages, compare `len(unija)/len(p_shingles)` against `prag` for the flag decision, keep `najbolji` only to label the primary source, and emit both `overlap_ratio` (per-source, as today) and a new `total_coverage` in the JSON and in the console line. Gold cases needed: one span split 50/50 across two passages of one source, and one 3-source mosaic — both `expected_flagged: true`.

### Secondary, also reproduced (same file)

`_prozor_oko_shinglea` (line ~66) documents its correctness assumption as *"bez_dijakritika() je 1:1 duljinski očuvana"*. That holds, but `_normalizirane_rijeci` additionally deletes `đ` via `[^a-z0-9\s]+`, splitting "Međunarodna" into tokens `me` + `unarodna`. The window function then searches `me\W+unarodna` in text that still contains `međunarodna` — and `đ` is a Unicode word character, so `\W` cannot match it:

```
shingle: 'me unarodna razmjena usluga u hrvatskoj pokazuje trajno'
prozor:  'Uvodna preambula stranice. Uvodna preambula stranice. ...'
-> PAO NA FALLBACK (vrh passagea)
```

That is bug #11 (the "wrong excerpt shown to the human reviewer" bug, `docs/v1_1_dodaci.md:323`) fully reinstated for any Croatian text whose representative shingle contains `đ` — a set that includes *međunarodni, građa, događaj, proračun, poduzeće*. The regression test guarding bug #11 uses only `č/ž/ć`, so it cannot catch this.

Fixtures: `/tmp/orig/src.txt`, `/tmp/orig/evidence.jsonl`, `/tmp/orig/rad_min.docx`, `/tmp/orig/rad_mozaik.docx`, `/tmp/orig/ev_moz.jsonl`, `/tmp/orig/book.txt`. Nothing under `/tmp/katedra_v11/katedra` was modified.