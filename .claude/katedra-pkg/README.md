# katedra-pkg

Jedan repo za cijeli paket alata za akademske radove. Skillovi u Cowork/claude.ai
nose samo tanki `SKILL.md` (router); sve što ima datoteke — skripte, reference,
profili fakulteta, sateliti — živi ovdje i dohvaća se jednim `git pull`.

```
katedra/            meta-skill za UČENJE (kvar → pravilo/zakrpa); ne kopilot
katedra-lite/       kopilot za radove (7 modova, .katedra/ stanje, gate, napredak)
rad-audit/          motor audita A–G (zove ga katedra-lite engine.py)
rad-docx/           motor izrade .docx-a iz rukopisa
fpzg-diplomski/     kućni stil FPZG-a (satelit rad-docx-a)
replikacija-pspp/   neovisna provjera brojki u PSPP-u
rad-orchestrator/   Workflow skripta: plan → pisanje → audit → predaja
bin/env.sh          izvozi KATEDRA_SKILL i <SLUG>_HOME za jedan bash poziv
bin/sync.sh         clone/pull (idempotentno, --ff-only)
VERSION             verzija paketa (semver); skillovi je ispisuju u §0
```

## Instalacija u sesiji (radi to SKILL.md §0 skilla, ne korisnik)

```bash
export KATEDRA_PKG_URL="https://<token>@github.com/<user>/katedra-pkg.git"
[ -d ~/.katedra-pkg/.git ] && git -C ~/.katedra-pkg pull -q --ff-only || git clone -q --depth 1 "$KATEDRA_PKG_URL" ~/.katedra-pkg
. ~/.katedra-pkg/bin/env.sh      # ili: bash ~/.katedra-pkg/bin/sync.sh && . ~/.katedra-pkg/bin/env.sh
```

Svaki bash poziv u Cowork sesiji kreće iz čiste ljuske → `. ~/.katedra-pkg/bin/env.sh`
ide na početak SVAKOG poziva koji zove skripte paketa.

## Push prvi put (s tvog računala)

```bash
git clone katedra-pkg.bundle katedra-pkg && cd katedra-pkg
git remote add origin git@github.com:<user>/katedra-pkg.git   # privatni repo
git push -u origin main
```

Za pristup iz Cowork sandboxa (nema ssh ključa): fine-grained GitHub token samo s
`Contents: read` na ovom repou, u URL-u `https://<token>@github.com/<user>/katedra-pkg.git`.
Token upisuješ jednom u SKILL.md katedra-lite §0.0 (varijabla `KATEDRA_PKG_URL`).
Ako egress sandboxa blokira github.com, `sync.sh` to kaže i skill radi iz synced kopije.

## Verzioniranje

`VERSION` je jedina istina. Svaka promjena koja mijenja ponašanje skripte diže patch;
novo pravilo u SKILL.md diže minor. `docs/PROMJENE.md` unutar `katedra-lite/` ostaje
povijest po nalazu.

## Odnos prema synced skillovima

SKILL.md u Cowork skillu je router i ostaje tanak. Kad repo nije dostupan, skill pada
na synced kopiju (`/root/.claude/skills/synced/*/katedra-lite`) i to kaže — pravilo 8.
Skripte u synced kopiji tada mogu biti starije od SKILL.md-a; pravila koja spominju
skriptu koje nema izgovaraju se, ne izmišljaju.
