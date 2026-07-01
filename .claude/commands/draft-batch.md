---
description: Procita discovery worklist batch i fan-outa rule-drafter subagent po fakultetu (samo draft, bez verifikacije).
argument-hint: "[opcionalno: facultyId za samo jedan fakultet]"
allowed-tools: Read, Glob, Grep, Task
---

Procitaj discovery/out/worklist.md i uzmi fakultete iz trenutnog batcha (sekcija "Ovaj batch").

Ako je zadan argument: $ARGUMENTS ogranici se SAMO na taj facultyId.

Za svaki fakultet iz batcha:
1. Provjeri postoje li snapshotirani izvori (npr. data/sources/<faculty>/ s PDF snapshotima i hashom). Ako fakultet NEMA snapshotiranih izvora, preskoci ga i zabiljezi u izvjestaj, njega prvo treba harvestati, ne draftati.
2. Za fakultete koji imaju snapshote, pokreni rule-drafter subagent, paralelno gdje je moguce, jedan po fakultetu. Svakom u zadatku predaj: facultyId i putanju do njegovih snapshotiranih izvora.

Tvrda pravila za ovaj korak:
- rule-drafter pise samo u data/profiles/<faculty>/drafts/ i NE verificira nista.
- Ne pokreci verifikaciju, ne mijenjaj status pravila (sve ostaje draft), ne postavljaj confirmed:true, ne diraj registre ni zajednicki kod.
- Ne spajaj draftove u profile i ne objavljuj nista.

Kad svi subagenti zavrse, daj mi jedan objedinjeni sazetak po fakultetu: koliko pravila draftano, koliko izostavljeno jer izvor ne pokriva, oznacena proturjecja, pravila sa sourcePage:null, i fakulteti preskoceni zbog nedostatka izvora. Verifikaciju radim ja, rucno, kroz verifikacijsku konzolu.
