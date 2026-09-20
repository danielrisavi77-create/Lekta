# Izmjereni izlazi Codex CLI-ja (`codex exec --json`)

Ove cetiri datoteke NISU sastavljene po shemi nego DOSLOVNO snimljene sa stroja, jer je gard
`no_tool_use` do 2026-09-20 presudjivao po obliku uspjesnog Codex izlaza koji nitko nije izmjerio
(jedini stvaran artefakt bio je log KVARA, `26ba9cf7`, koji po definiciji nema nijedno uspjesno
izvrsavanje). Nalaz je zapisan u opisu PR-a #93 kao drugi MAJOR.

## Kako su snimljene

Oba poziva, 2026-09-20, `codex-cli 0.154.0`, Windows 10, radna mapa `C:/Users/PC/Desktop/Lekta`,
prompt na stdinu, izlaz preusmjeren u datoteku:

    printf '<prompt>' | codex exec --sandbox read-only          --json - > no-tool-use.stdout.ndjson 2> no-tool-use.stderr.log
    printf '<prompt>' | codex exec --sandbox danger-full-access --json - > tool-use.stdout.ndjson    2> tool-use.stderr.log

Prompt je u oba slucaja trazio jednu naredbu ljuske koja ispisuje prva tri retka `AGENTS.md`, uz
izricitu zabranu izmjena. Oba poziva su zavrsila s izlaznim kodom 0.

## Sto je koja datoteka

- `codex-exec-json-tool-use-2026-09-20.*`: POZITIVAN oblik. Sandbox zaobidjen
  (`danger-full-access`), pa je Codex naredbu stvarno izvrsio: `item.completed` sa stavkom
  `command_execution`, `exit_code: 0`, `status: "completed"`. To je oblik po kojem
  `successful_tool_calls` broji. Uz njega se u istom toku pojavljuje i `item.started` za ISTU
  stavku, s `exit_code: null`; brojac ga ne smije brojati, inace jedan poziv alata broji dvaput.

- `codex-exec-json-no-tool-use-2026-09-20.*`: NEGATIVAN oblik, i to onaj zbog kojeg gard postoji.
  Uz `--sandbox read-only` je izvrsavanje odbijeno (`apply deny-read ACLs`, vidi stderr), ali je
  Codex svejedno poslao uredan `turn.completed` s izlaznim kodom 0, a model je u zavrsnoj poruci
  TVRDIO tocan prvi redak datoteke koju nikad nije procitao. Bez brojaca uspjesnih poziva to je
  `needs_verification`, dakle tocno lazno zeleno.

## Pravilo odrzavanja

Ne parafraziraj ove datoteke i ne "sredjuj" ih. Testovi
`RealCodexOutputShapeTest` u `test_worker.py` tvrde da fixture i dalje nosi kljuceve o kojima gard
ovisi; kad Codex promijeni oblik izlaza, ti testovi PADAJU, i to je njihova jedina svrha. Tada se
snimi nov artefakt istim receptom i doda uz stari, a ne umjesto njega.
