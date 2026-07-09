# data/tools: citatni sadrzajni sloj

## citation-specs/ (vjerni per-fakultetski citatni formati)

Pipeline (isti duh kao VERIFICATION_PIPELINE.md, prilagodjen content sloju alata):

```
data/sources/<fac>/*.pdf  (snapshotirane sluzbene upute)
   | scripts/extract-citation-sections.mjs   (keyword isjecci + INDEX.json klasifikacija)
   v
citation-specs/extractions/<fac>.txt
   | draft (covjek ili agent; quoteRaw DOSLOVNO iz ekstrakcije, sourcePage, NE izmislja)
   v
citation-specs/drafts/<fac>.json             (status:"draft" — NIKAD ne izlazi u build)
   | scripts/citation-spec-dossier.mjs       (dosje: RENDER vs IZVOR diff, MATCH/DIFF)
   v
data/verification/citation-dossiers/<fac>.md (covjek pregleda + PDF#page link)
   | scripts/approve-citation-spec.mjs <fac> "Ime Prezime"   (SAMO COVJEK)
   v
citation-specs/verified/<fac>.json           (verified + verifiedHash + ledger zapisi)
   | scripts/generate-citation-tools.mjs     (gate: verified-only, hash freshness fail-closed)
   v
dist/alati/citati/*                          (javne stranice s provenijencijom)
```

Tvrda pravila:
- `verified` proglasava ISKLJUCIVO covjek, nakon pregleda dosjea (renderer mora
  reproducirati worked-example iz uputa; DIFF se rjesava prije approvea ili flagira).
- Build cita SAMO `verified/`; gate (generator + tests/citation-specs.test.ts) rusi build na:
  status != verified, flagirane predloske, orphan sourceId, verifiedHash != snapshotHash
  (izvor promijenjen nakon verifikacije -> reverifikacija, nista se ne osvjezava tiho).
- `quoteRaw` je DOSLOVAN tekst iz ekstrakcije (greppable; pdftotext gubi dijakritike pa
  usporedbe idu uz normalizaciju); `sourcePage` se nikad ne nagadja.
- Fakultet BEZ verificiranog speca zadrzava dosadasnje obiteljsko renderiranje s jasnim
  "opci oblik" caveatom; custom/bez tokena vodi na opci alat. Nista se ne pogorsava.

Shema speca: vidi tipove u `src/citations/citation-spec.ts` (CitationSpec). Template jezik:
`{placeholder}` + `[[...]]` opcionalne grupe (ispadaju kad su SVI placeholderi prazni);
interpunkcija doslovna; `authorFormat` opcije pokrivaju red, inicijale, separatore i et-al.

## Povijest

`citation-configs.json` (raniji rucni override hook, uvijek prazan) je uklonjen; zamijenio
ga je gornji citation-specs/ tok koji stil DERIVIRA iz sluzbenih izvora s verifikacijom,
umjesto rucnog autorstva predlozaka bez provenijencije.
