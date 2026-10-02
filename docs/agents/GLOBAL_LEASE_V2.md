# Global agent lease v2

Globalni lease sloj koordinira Lektine implementatorske sesije koje rade na razlicitim strojevima.
Ne zamjenjuje `tasks.json`, Git, worktree izolaciju ni CI. Njegova jedina ovlast je runtime odgovor
na pitanje: **smije li ova sesija sada pisati u ovaj deklarirani scope?**

## Zasto postoji

Path scope v1 iz `docs/agents/PATH_SCOPE_V1.md` stiti pojedinu sesiju i detektira konflikte u
Git snapshotu, ali laptop, radna stanica i Claude cloud mogu istodobno imati razlicite checkoutove.
Lokalni lock zato nije dovoljan za write/write ekskluzivnost.

Claude Code Agent Teams ima vlastito zakljucavanje pri claimanju zadataka, ali to nije file-ownership
sloj za neovisne sesije na vise strojeva. Aktualna Claude Code dokumentacija dodatno upozorava da
paralelno uredjivanje iste datoteke moze dovesti do prepisivanja promjena. Lekta zato zadrzava svoj
provider-neutralni globalni lease iznad lokalnih Claude mehanizama.

Sluzbeni izvori provjereni 2026-10-02:

- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/cross-session-messaging

## Granice faza

### 2A - ugovor i klijent

Ovaj PR isporucuje samo:

- `scripts/agents/control-plane-client.mjs`
- `scripts/agents/control-plane-cli.mjs`
- `npm run agents:lease -- ...`
- strogo validiran claim payload i `scopeHash`
- HTTP ugovor verzije 1
- testove bez mreze i bez tajni

2A NE stvara bazu, ne deploya Edge Function i ne ukljucuje globalni enforcement u postojece
`Edit|Write` hookove. Bez konfiguriranog endpointa CLI namjerno pada.

### 2B - zaseban control-plane backend

Backend se stvara kao zaseban Supabase projekt, nikad u Lektinoj produkcijskoj ni staging bazi.
Sadrzi samo razvojnu koordinacijsku telemetriju, bez studentskih dokumenata, korisnickih podataka,
payment podataka ili produkcijskih tajni.

Planirani privatni model:

- `agent_sessions`: session name, stroj/okolina, uloga, zadnji heartbeat
- `agent_leases`: lease ID, task ID, session, base SHA, scope hash, expiry i lifecycle
- `agent_path_leases`: normalizirane read/write putanje vezane uz lease
- `agent_events`: append-only audit dogadjaja claima, renewa, expansiona, releasea i odbijanja

Tablice trebaju biti izvan izlozenog Data API-ja. Vanjski klijent razgovara samo s kontrolnom
Edge Function; mutacije moraju biti atomarne u jednoj Postgres transakciji.

### 2C - enforcement

Tek nakon sto 2B ima dokaz konkurentnih claimova:

1. Fable orkestrator radi globalni `claim` prije predaje implementacijskog zadatka.
2. Worker dobiva lease ID uz task brief.
3. Lokalni hook provjerava i `workScope` i aktivni globalni lease.
4. Scope expansion prvo mora atomarno proci na control planeu.
5. Zavrsetak, blokada ili isteka rada otpusta lease.
6. Nedostupan control plane blokira **novi write lease**; vec postojeci lease vrijedi samo do
   svojeg poznatog isteka.

## Autoriteti

Svaki sloj odgovara na drugo pitanje:

| sloj | autoritet |
| --- | --- |
| `tasks.json` | sto zadatak jest, dependencyji i deklarirani workScope |
| globalni control plane | tko trenutno ima aktivni write lease |
| Git/worktree | stvarne promjene i povijest |
| lokalni path guard | smije li konkretan Edit/Write u deklarirani scope |
| diff-level guard | je li stvarni rezultat ostao u scopeu |
| CI | prolazi li kandidat deterministicke gateove |
| orkestrator | prioritet, delegiranje, review i integracijski red |

Control plane ne smije sam oznacavati task `done`, mergeati PR ili mijenjati `tasks.json`.

## Semantika scopea

Koristi se isti `workScope` kao u v1. Podrzane su tocne putanje i zavrsni `/**`.

Za sada je **write lease ekskluzivan**, a read scope je opisni signal:

- READ + READ: dopusteno
- READ + WRITE: dopusteno
- WRITE + READ: dopusteno
- WRITE + WRITE s preklapanjem: odbijeno

To namjerno ne pretvara obicno citanje koda u globalni lock. Ako neki buduci zadatak zahtijeva
stabilan read snapshot, treba dobiti zasebnu vrstu exclusive leasea, ne mijenjati ovo pravilo potiho.

## Identitet i claim

Primjer:

```json
{
  "protocolVersion": 1,
  "operation": "claim",
  "payload": {
    "taskId": "T99",
    "sessionName": "lekta-03",
    "baseSha": "0123456789abcdef0123456789abcdef01234567",
    "scope": {
      "read": ["src/routes/**"],
      "write": ["src/ui/results/**"],
      "forbidden": ["supabase/**"]
    },
    "scopeHash": "<sha256>",
    "ttlSeconds": 900,
    "metadata": {
      "branch": "agent/t99",
      "environmentKind": "anthropic_cloud"
    }
  }
}
```

`scopeHash` se racuna nakon sortiranja normaliziranih read/write/forbidden nizova. Backend mora
ponovno validirati payload; hash nije autorizacija nego drift dokaz.

### Idempotencija i nepoznat ishod

Ako je za isti `sessionName + taskId` vec aktivan neistekli lease s jednakim `baseSha` i
`scopeHash`, ponovljeni `claim` mora vratiti taj isti lease ID, ne stvoriti drugi i ne prijaviti
samokonflikt. Ako ista sesija za isti task trazi drugaciji scope, koristi se iskljucivo `expand`.

Ako HTTP poziv pukne nakon slanja i nije poznato je li server mutaciju izvrsio, orkestrator ne
radi slijepi drugi claim. Kad se control plane vrati, prvo cita `snapshot`; tek ako nema aktivnog
odgovarajuceg leasea salje novi claim. `renew`, `expand` i `release` moraju biti idempotentni po
lease ID-u. Ovaj uvjet je dio 2B konkurencijskog testa.

## Operacije protokola v1

- `health`: kompatibilnost i dostupnost backenda
- `register`: registracija imenovane sesije, stroja i uloge
- `heartbeat`: osvjezavanje `last_seen_at` sesije
- `claim`: atomarni novi lease, idempotentni povrat postojeceg istog aktivnog leasea ili `lease_conflict`
- `renew`: produljenje postojeceg leasea
- `expand`: atomarna zamjena scopea istog leasea nakon SCOPE EXPANSION odluke
- `release`: eksplicitno zatvaranje leasea
- `snapshot`: read-only pregled aktivnih sesija i leaseova

Preporuceni pocetni TTL write leasea je 15 minuta, uz renew otprilike svakih 5 minuta dok
implementator aktivno radi. TTL nije dokaz napretka; to je samo granica nakon koje napusteni lease
vise ne smije blokirati druge.

## CLI

Primjeri nakon 2B:

```bash
npm run agents:lease -- health

npm run agents:lease -- register \
  --session lekta-03 \
  --machine laptop \
  --role implementer

npm run agents:lease -- claim T99 \
  --session lekta-03 \
  --base-sha 0123456789abcdef0123456789abcdef01234567 \
  --branch agent/t99

npm run agents:lease -- heartbeat --session lekta-03
npm run agents:lease -- renew --lease-id <id>
npm run agents:lease -- snapshot
npm run agents:lease -- release --lease-id <id> --reason completed
```

Za `expand` orkestrator prvo mijenja kanonski `workScope` zadatka, zatim salje novu
normaliziranu verziju:

```bash
npm run agents:lease -- expand T99 \
  --lease-id <id> \
  --session lekta-03 \
  --base-sha 0123456789abcdef0123456789abcdef01234567
```

## Tajne

2A ocekuje samo na stroju orkestratora:

- `LEKTA_CONTROL_PLANE_URL`
- `LEKTA_CONTROL_PLANE_ADMIN_TOKEN`

Token se ne commita, ne stavlja u `tasks.json`, prompt, PR opis ili result artifact. Workerima u
pocetnoj arhitekturi nije potreban admin token: Fable radi claim/renew/release i worker dobiva samo
lease ID i task brief. Time kompromitirana radna sesija ne dobiva ovlast preuzeti tudji scope.

HTTP je dopusten samo za localhost razvoj; udaljeni endpoint mora biti HTTPS. Klijent ima kratak
timeout i novi write claim je fail-closed kad control plane nije dostupan.

## Atomski backend uvjet za 2B

Backend ne smije raditi obrazac "SELECT pa kasnije INSERT" kroz dva odvojena zahtjeva. Provjera
isteka, presjeka svih aktivnih write putanja i upis leasea moraju biti jedna transakcija pod jednom
globalnom koordinacijskom bravom (npr. transakcijski Postgres advisory lock). S osam workera to je
namjerno jednostavnije i sigurnije od preuranjenog fine-grained locking sustava.

Kasnije se moze optimizirati po hash bucketingu tek ako mjerenje pokaze da je jedna kratka
transakcijska brava usko grlo.

## Sto jos nije dokazano u 2A

- nema udaljene baze ni Edge Functiona
- nema dokaza da dva stroja ne mogu istodobno claimati isti write scope
- nema automatskog renewa iz worker procesa
- nema hook provjere lease ID-a
- nema event-notification sloja prema Fableu
- nema integracijskog reda

Zato se 2A ne smije predstavljati kao aktivan globalni lock. Aktivni globalni lock pocinje tek nakon
2B konkurencijskog testa i 2C enforcementa.
