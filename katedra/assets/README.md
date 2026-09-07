# Fixtures

Najmanji dokumenti koji reproduciraju kvar. Jeftiniji su od cijelog rada i preživljavaju
kad rad ode korisniku.

| Datoteka | Reproducira | Očekivano |
|---|---|---|
| `fixture_sazetak_nesuglasan.md` | kvar 30 — sažetak tvrdi „šest poglavlja", rad ih ima 8 | `provjeri_sazetak.py` javlja nalaz „struktura", izlazni kod 1 |

Fixture se dodaje **kad se kvar prvi put reproducira**, ne poslije. Ako se u tom trenutku
ne da napraviti, kvar još nije shvaćen.
