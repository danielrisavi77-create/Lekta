# Handoff za Claude Code (paket v6, 2026-10-04)

1. Zamijeni `design/` u korijenu repoa ovim paketom (v6: 30 mapa predložaka, handoff Z1–Z40).
2. U Claude Code sesiji zalijepi:

   > Pročitaj design/README.md i design/handoff/ALIGNMENT.md. Gotovi su Z1–Z3, Z5–Z7 i Z15 (prvi krug). Novo u v6: Z38 (početna, traka, Kazalo, ladica profila, ladica Prikaz), Z39 (pribor kao kartoteka s jezičcima i pravni tekstovi kao modal) i Z40 (pregled živog lekta.hr, 17 točaka). Z32 je ZAMIJENJEN s Z38/Z39: iz njega vrijedi samo ponašanje `intake-controller.ts`. Predlošci `templates/intake/` i `templates/intake-live/` se NE implementiraju. Redoslijed: Z40 t. 17 (canonical na lekta.hr) → Z40 t. 7 (20 MB) → Z38 → Z39 → Z40 B → Z40 D → Z40 C → Z33–Z36 → Z37. Commit po zadatku. Nakon Z38 i nakon Z39 stani i javi snimke (360, 768, 1440 px, obje teme). Fontovi su Instrument Serif i Geist Mono. Copy iz predložaka prepiši doslovno. Podaci o fakultetima u predlošku su primjer: u kodu sve dolazi iz registra profila i `data/coverage/site-stats.json`. Ako nalog i kod proturječe, kod ne mijenjaj, nego zapiši pitanje u docs/agents/orchestrator-backlog.md.

3. Nakon commita u dizajnu klikni Sync. Usporedit ću stvarni kod s predlošcima i odstupanja vratiti kao nove Z-zadatke.

**Glavne reference v6**
- `templates/home/Home.dc.html`: početna (uvozi `HomeNav.dc.html` i `HomeDesk.dc.html`; pravni tekstovi su u `legal-docs.json`)
- `templates/home/Opcije pribora.html`: tri rasporeda pribora. **Odabran je B** (kartoteka s jezičcima). Okvir P je pravni modal.
- `handoff/ALIGNMENT.md`: Z38, Z39 i Z40 su na kraju datoteke.

**Otvorene odluke vlasnika** (ne implementirati prije potvrde):
- Pečat "PREGLEDANO / 526.370 radova": broj je `works` iz korpusa, ne broj korisničkih provjera.
- Brojilo "0 B" smije pokazivati samo izmjereni promet (Z39 t. 5).

Predlošci `design/templates/<slug>/<Slug>.dc.html` otvaraju se izravno u pregledniku. Tweaks panel prebacuje stanja (npr. `startProfile`, `works`). Stilovi su inline, copy je konačan.
