---
name: stroj-i-disk
description: Okida se kad gate javi ZAUZETO, disk ili RAM padne ispod praga, laptop je spor ili vlasnik pita kako osloboditi mjesto. Fiksni postupak dijagnoze stroja i sigurnog ciscenja worktreeova bez gubitka rada.
---

# Stroj i disk

Postupak za laptop i radnu stanicu kad teski posao ne moze krenuti ili stroj posustaje. Ponavlja
se (`lekta-protokol` stavke 11, 12, 17 i 25, T105, mjerenje 2026-10-08), pa se radi uvijek isto.

## 1. Izmjeri, ne pogadjaj

Iz korijena klona (ne iz `C:\Users\PC`):

```powershell
node scripts/gate-preflight.mjs --check-only
```

Presuda ZAUZETO navodi razlog: tudji vitest ili playwright, RAM ispod 1,5 GB, disk ispod 3 GB.
Tudji proces znaci cekaj (`docs/agents/ROUTING.md`, "Pravila za stroj"), nikad ga ne gasi.

Hardver laptopa (izmjereno 2026-10-08): i3-4100M, 2 jezgre i 4 niti, 16 GB RAM (2 x 8 GB DDR3-1600,
maksimum ploce), SATA SSD 128 GB. Procesor je glavno ogranicenje brzine; RAM se ne moze povecati.

## 2. Gdje je disk otisao

Mjerenje, nista se ne brise:

```powershell
$p = 'C:\Users\PC\.codex\worktrees','C:\Users\PC\lekta-wt','C:\Users\PC\Desktop','C:\Users\PC\AppData\Local\npm-cache','C:\Users\PC\AppData\Local\Temp'
foreach ($d in $p) { if (Test-Path $d) { $s=(Get-ChildItem $d -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum; "{0,8:N1} GB  {1}" -f ($s/1GB),$d } }
"hiberfil.sys: {0:N1} GB" -f ((Get-Item C:\hiberfil.sys -Force -ErrorAction SilentlyContinue).Length/1GB)
node scripts/worktree-gc.mjs
```

`worktree-gc` bez `--apply` je suhi rad: ispisuje svako stablo i razlog zadrzavanja.

## 3. Sigurno oslobadjanje, redom

1. `node_modules` u NEAKTIVNIM stablima (nista mijenjano zadnja 3 dana). Uvijek se vraca s `npm ci`,
   pa se rad ne gubi. Brisi samo po IZRICITOM popisu putanja, nikad po varijabli iz prethodnog
   izracuna, i `cmd /c rmdir /s /q`, ne `Remove-Item` (duboke putanje).
2. `node scripts/worktree-gc.mjs --apply` tek nakon suhog rada u kojem su kao UKLONJIV oznacena
   samo ocekivana stabla. Skripta svako stablo ponovno mjeri neposredno prije uklanjanja.
3. Hibernacija (`powercfg /h off`) oslobadja oko 40 posto RAM-a na disku. Odluka vlasnika.

## 4. Sto se nikad ne radi bez vlasnika

- Brisanje stabla s necommitanim promjenama ili granom koja nije spojena. Vlasnik za svako
  odlucuje: commit i push ili odbacivanje.
- Windows "Disk Cleanup" ili brisanje `AppData\Local\Temp`: u `Temp\claude` zive worktreeovi
  sesija, ponekad s necommitanim radom.
- Promjena Defender izuzetaka ili plana napajanja.
- Gasenje tudje sesije ili procesa radi RAM-a.

## 5. Izvjestaj

Navedi izmjerene brojeve prije i poslije (slobodno na C:, presuda preflighta), tocne naredbe i
sto je ostalo za vlasnika (popis stabala s necommitanim radom). Nepoznato nije zeleno.
