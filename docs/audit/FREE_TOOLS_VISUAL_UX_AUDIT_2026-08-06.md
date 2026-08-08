# Audit vizualnog i UX sloja besplatnih alata

Datum: 6. kolovoza 2026.

Obuhvat: `alati.html`, `citat.html`, `kartice.html`, `naslovnica.html`, `literatura.html` i `izjava.html`. Logika generiranja, analize, citiranja i izvoza nije mijenjana.

## Sažetak

Besplatni alati već imaju prepoznatljiv smjer Korektorskog stola, centralizirane tokene, lokalni rad, teme, fontove, ikone i reduced-motion podršku. Glavni problem nije nedostatak identiteta, nego neujednačen workspace između stranica i previše page-specific CSS-a koji je otežavao brze, sigurne vizualne promjene.

Prvi cilj je zato bio stabilizirati zajednički radni prostor, ne uvoditi novi framework ni novu estetiku.

## Nalazi prije promjene

| Prioritet | Nalaz | Dokaz | Utjecaj |
|---|---|---|---|
| P1 | Pet alata koristi sličan obrazac ulaz plus rezultat, ali ga je svaka stranica definirala vlastitim `.grid` pravilima. | `citat.html`, `kartice.html`, `naslovnica.html`, `literatura.html`, `izjava.html` | Promjene razmaka, širine i mobilnog prijeloma lako bi se razišle. |
| P1 | Touch targeti unutar workspacea nisu imali zajednički minimalni ugovor. | `src/shared/tool-page.css`, page-specific input i button pravila | Mobilni unos je bio funkcionalan, ali bez jedinstvenog ritma i veličine kontrole. |
| P1 | Rezultat i prazno stanje nisu imali zajednički vizualni okvir. | Različiti `.out-doc`, `.out-panel` i page-specific overridei | Korisnik mora ponovno učiti gdje se pojavljuje rezultat na svakom alatu. |
| P2 | Direktorij alata imao je kartice različite visine zbog duljine opisa. | `alati.html` `.tools-grid` i `.tool-card` | Slabija skenabilnost i neujednačen završetak kartica. |
| P2 | Nije postojao zaseban browser accessibility audit za svih šest stranica. | Postojeći Playwright suite nije imao axe integraciju | A11y zaštita se oslanjala uglavnom na statičke testove. |
| P2 | Dev browser runner je osjetljiv na Vite hook koji automatski pokreće generator citata. | Pri pokretanju dev servera esbuild dobiva `Access denied`; preview server radi | Za lokalni browser audit koristi se izgrađeni preview dok se dev hook zasebno ne razdvoji. |

## Provedene promjene

- Dodan je zajednički `.tool-workspace` ugovor na svih pet funkcionalnih alata.
- U `src/shared/tool-page.css` uvedeni su zajednički desktop omjer, `minmax` kolone, kontrolirani razmaci, `min-height: 44px` za interakcije, mobilni prijelom i stabilnije prazno stanje rezultata.
- Rezultatski papir sada ima dosljedan lijevi korektorski naglasak i unutarnji okvir bez promjene teksta ili ponašanja.
- Kartice u `alati.html` dobivaju ujednačenu minimalnu visinu i poravnanje izlazne poveznice.
- Dodan je `@axe-core/playwright` za budući browser audit.
- Dodani su statički Vitest ugovori i Playwright audit scenariji za svih šest stranica.

## Verifikacija

- TDD baseline: novi vizualni test prije promjene padao je sa 6/6 neispunjenih workspace očekivanja.
- Nakon promjene: `tests/free-tools-visual.test.ts`, 7/7 prolazi.
- `tsc --noEmit`, prolazi.
- `vite build`, prolazi.
- Puni Vitest suite nije završio unutar 5 minuta, bez rezultata. To je postojeći timeout/open-handle nalaz i treba zaseban debugging.
- Playwright browser audit nad preview buildom, 12/12 testova prolazi, uključujući axe provjeru svih šest stranica.

## Preostali koraci

1. Razdvojiti Vite dev hook koji automatski pokreće generator citatnih stranica od običnog browser smoke servera.
2. Dodati screenshot baseline za 390 px, 768 px i 1440 px nakon odluke o čuvanju vizualnih snapshota u repozitoriju.
3. Zasebno dijagnosticirati puni Vitest timeout prije nego se ovaj projektni gate proglasi zelenim.
