# Predlosci izjave o izvornosti (generator-content sloj)

Ovaj direktorij je AUTORSKI sadrzaj generatora izjave o izvornosti (alat izjava.html),
po uzoru na data/title-pages/. NIJE izvor bodovanih pravila i NIJE isto sto i
`declaration.terms` u profilima (required-sections-structure.ts) - taj kljuc provjerava
JE LI sekcija "Izjava o izvornosti" prisutna u PREDANOM radu (strukturni audit), ne kakav
OBRAZAC generator nudi. Te dvije stvari se nikad ne mijesaju niti automatski sinkroniziraju.

## Datoteke

- `declarations.json` - niz DeclarationTemplate zapisa (vidi
  src/declarations/declaration-schema.ts). Puni se ISKLJUCIVO stvarnim sadrzajem iz
  sluzbenih izvora. Prazan niz znaci da svi fakulteti dobivaju genericku formulaciju iz
  koda (statement.ts).

## Hijerarhija autoriteta

1. `official` - imamo doslovnu propisanu formulaciju (barem jedan sluzbeni izvor s pravim
   tekstom, `wording` polje popunjeno).
2. `guidance` - znamo da fakultet propisuje vlastitu formulaciju/obrazac (spomenuto u
   sluzbenim uputama), ali NEMAMO njen tocan tekst. `wording` OSTAJE prazan; korisniku se
   pokazuje napomena da provjeri obrazac na fakultetu prije predaje.
3. Odsutnost zapisa = `generic`. Genericki tekst NE postoji u podacima kao eksplicitna
   vrijednost: to je postojeca grana koda u `statement.ts` (regresijska sigurnost je
   strukturalna, isto pravilo kao title-pages).

Za razliku od naslovnice, OVDJE NEMA cross-level reuse-a: pogresna "sluzbena" formulacija
za krivu vrstu rada je losija od generickog teksta, pa `resolveDeclaration` staje na tocnoj
razini ili `level: null` zapisu, nikad ne preuzima drugu razinu istog fakulteta.

Test `tests/declaration-loader.test.ts` je validacijski gate: `status: 'official'` bez
`wording` ili `sourceIds` pada, i `status: 'guidance'` s popunjenim `wording` pada (sprijeceno
da "guidance" tiho postane neprovjereno "official").
