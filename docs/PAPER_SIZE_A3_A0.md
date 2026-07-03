# Skica: strojna provjera formata stranice A3/A0 (projektni radovi)

Cilj: za projektne radove (arhitektura, dizajn) priznati A3/A0 kao ispravan format stranice,
umjesto da postojeca provjera zna samo A4. Bez izmisljanja pravila: format A0 (841x1188mm) i
knjizica A3 su doslovno propisani Pravilnikom o diplomskom radu AF 2013, cl. 16.

Status: kompajlerski sloj GOTOV (commit u src/profiles/rule-compiler.ts + test). Engine wiring
(src/ui/app.ts) i profil-podaci NISU primijenjeni jer je app.ts aktivni teritorij paralelne
sesije (zadnji dodir < 5 min). Primijeniti u JEDNOM atomarnom commitu kad app.ts bude miran.

## 1. Kompajler (VEC NAPRAVLJENO)

`src/profiles/rule-compiler.ts`, case 'paper-size':
- string 'A3' -> eff.paperSizes = ['A3']
- lista ['A3','A0'] -> eff.paperSizes = ['A3','A0']
- boolean true -> eff.requireA4 (naslijedeno, standardni A4 tekst)

Pokriveno u `tests/rule-compiler.test.ts`.

## 2. Engine (PATCH ZA app.ts, primijeniti kad je datoteka mirna)

Uz postojeci `requireA4` blok (funkcija analyzeDocx, ~linija 333), dodati opcu provjeru:

```js
// Tablica formata (cm): [kraca, duza]. Provjera je orijentacijski neovisna.
const PAPER_SIZES = { A4:[21,29.7], A3:[29.7,42], A2:[42,59.4], A1:[59.4,84.1], A0:[84.1,118.8] };
if (profile.paperSizes && profile.paperSizes.length) {
  const allowed = profile.paperSizes.map(n => PAPER_SIZES[n]).filter(Boolean);
  const fits = s => s.page && allowed.some(([w,h]) =>
    (near(s.page.w,w,.6) && near(s.page.h,h,.7)) || (near(s.page.h,w,.6) && near(s.page.w,h,.7)));
  const bad = sections.filter(s => s.page && !fits(s));
  const ok = !bad.length;
  const lbl = profile.paperSizes.join('/');
  checks.push(makeCheck('formatting', `Format stranice (${lbl})`, ok?'pass':'warn', ok?3:1, 3,
    ok ? `Sve ocitane sekcije koriste ${profile.paperSizes.join(' ili ')} ili velicina nije eksplicitno zapisana`
       : `${bad.length} sekcija nije u dopustenom formatu (${lbl})`,
    ok ? null : issue('warning','formatting','Format stranice',
      `Profil ocekuje ${profile.paperSizes.join(' ili ')}, a neke sekcije su druge velicine.`)));
}
```

Napomena: tolerancija je apsolutna u cm (kao postojeci A4 blok koji koristi .35); za velike formate
(.6/.7) dana je nesto veca rezerva. Provjera je warn (max 3), ne fail, kao i A4 (format nije tvrda
diskvalifikacija).

## 3. Profil-podaci (primijeniti zajedno s engine patchem)

`data/profiles/verified-profiles.json`, arh-diplomski.rules: dodati
```json
"paperSizes": ["A3", "A0"],
```
Time A3/A0 postaje strojna provjera (dosad advisory manualCheck). dizajn-diplomski se NE dira:
Pravilnik dizajn 2016 ne propisuje format stranice (elektronicka predaja), pa bi paperSizes bilo
izmisljanje.

## 4. Test (uz engine patch)

`tests/art-faculties-synthetic.test.ts`: docx-builder podrzava `pageCm`. Dodati:
- A3 dokument (pageCm {w:29.7,h:42}) za arh-diplomski -> 'Format stranice (A3/A0)' status 'pass'.
- A4 dokument -> status 'warn' (nije u dopustenom skupu).

## Granica (nepromijenjeno)
Font, velicina, prored, margine, citatni stil ostaju iskljuceni za projektne radove jer ih izvor
ne propisuje. Ovo dodaje samo ono sto Pravilnik doslovno navodi (A3/A0 format).
