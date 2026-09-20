# CLAUDE.md v2 rule inventory

Ovaj dokument dokazuje da refaktor root konteksta nije uklonio aktivna pravila.
Kanonske su samo lokacije u stupcu "Kanonsko odrediste". Arhiv v1 je povijesni
dokaz i ne smije se tumaciti kao drugi aktivni skup uputa.

| Izvorni blok ili tema | Kanonsko odrediste |
| --- | --- |
| Sto je Lekta i backend iznimke | `CLAUDE.md`, Projekt |
| Nikad ne generira ni prepravlja sadrzaj rada | `CLAUDE.md`, Granica proizvoda |
| Vidljivi tekst, dopustene iznimke i preporuke | `src/repair/CLAUDE.md` |
| Migracije samo kroz `supabase db push` | `supabase/CLAUDE.md` |
| Build gate, Deno i `master-ci` | `CLAUDE.md`, Tvrdi gate |
| Paralelizam kroz izolaciju | `CLAUDE.md`, Izolacija i Git |
| Bodovana vrijednost mora odgovarati verificiranoj tvrdnji | `CLAUDE.md`, Izvori istine |
| Option A, `ruleEntries`, hijerarhija i `sourcePage` | `docs/decisions/SOURCE_OF_TRUTH.md` |
| Privatni sloj ne ide u javni bundle | `CLAUDE.md`, Privatnost i klasifikacija |
| Mjera koja se popravi ne dokazuje mehanizam | `scripts/autonomy/CLAUDE.md` |
| Gard bez mutacije ne racuna se | `CLAUDE.md`, Verifikacijska disciplina |
| Parser i golden test | `src/docx/CLAUDE.md` i `src/citations/CLAUDE.md`, svaki za svoju domenu |
| Deterministicki repair i autoritet parametara | `src/repair/CLAUDE.md` |
| Tier 0, Tier 1, Tier 2 i Word oracle | `src/repair/CLAUDE.md` i `src/docx/CLAUDE.md` |
| Modalitet i opseg tvrdnje | `src/citations/CLAUDE.md` |
| Generated projections, CR, JSON i corpus nazivnik | `scripts/autonomy/CLAUDE.md` |
| Git commit disciplina i orphan scan | `CLAUDE.md`, Izolacija i Git |
| Konvencije koda i jezika | `CLAUDE.md`, Konvencije |
| Modeli za koordinaciju i drugo misljenje | `CLAUDE.md`, Koordinacija i drugo misljenje |
| Backlog | `docs/roadmap/PRODUCTION_BACKLOG.md` i issue tracker |
| Povijesni incidenti, commitovi i mjerenja | `docs/incidents/CLAUDE_V1_FULL_CONTEXT_2026-09-18.md` |

## Sedam izvornih blokova "Tvrdo pravilo"

1. Granica sadrzaja: root, detalji u repair vodiču.
2. Migracije: Supabase vodič.
3. Build gate: root.
4. Paralelizam i izolacija: root.
5. Vezanje bodovane vrijednosti uz tvrdnju: root i odluka o izvoru istine.
6. Privatni sloj i javni bundle: root.
7. Dokaz mehanizma i mutacijski gard: autonomy vodič i root verifikacijska disciplina.

Svaka promjena ovog popisa mora istodobno azurirati odredisni vodič i test
`tests/claude-context.test.ts` ako se mijenja obvezna ruta.
