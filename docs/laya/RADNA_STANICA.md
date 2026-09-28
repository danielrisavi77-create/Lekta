# Laya na radnoj stanici

Laya se instalira samo na radnoj stanici (desktop), prema podjeli u `docs/agents/RADNE_STANICE.md`.
Na laptopu se ne instalira: težine su prema navodu upstreama oko 1,7 GB (nije neovisno
izmjereno), a runtime nije ovisnost projekta. Nijedan Laya paket ne ide u `dependencies` ni
`devDependencies`.

Izvor (provjereno 27. 9. 2026): paket `laya` na PyPI-ju (0.3.21, Python 3.10+, Apache 2.0), repozitorij
[github.com/NandhaKishorM/laya](https://github.com/NandhaKishorM/laya), model `convaiinnovations/laya` na
Hugging Faceu. Za hrvatski se koristi višejezični checkpoint (`subfolder="multilingual"`). Upstream
upozorava da su checkpointi isporučeni kao prepouzdani i da prag treba kalibrirati na vlastitim
podacima; zato prag dolazi samo iz Lektinog registra nakon evaluacije.

Runtime `scripts/laya/runtime/lekta_laya_runtime.py` omata `laya.load` i `agent.predict` i govori
`RUNTIME_PROTOCOL.md`. Testiran je s lažnim agentom istog oblika odgovora, ali **nije pokretan s pravim
modelom** (razvojna okolina nije imala pristup Hugging Faceu). Prvi pravi prolaz je na radnoj stanici.

## 1. Lekta na radnoj stanici

PowerShell, u mapi na disku s više mjesta:

```powershell
git clone https://github.com/danielrisavi77-create/Lekta.git
cd Lekta
npm ci
npm run check:laya
npm run test:laya
```

Oba zadnja koraka moraju biti zelena prije bilo čega s modelom. Mapa za Laya alate i težine je
izvan klona, npr. `D:\laya` (pravilo 2 iz `RADNE_STANICE.md`).

## 2. Laya upstream i runtime

Python 3.10 ili noviji, u zasebnom okruženju izvan klona:

```powershell
py -3.12 -m venv D:\laya\venv
D:\laya\venv\Scripts\Activate.ps1
python -m pip install laya
python -m unittest discover -s scripts\laya\runtime -p "test_*.py"
```

Paket povlači PyTorch, pa instalacija i prvo preuzimanje modela traju. Prvi `laya.load` sprema model
u Hugging Face predmemoriju (zadano `%USERPROFILE%\.cache\huggingface\hub`; na disk s više mjesta
preusmjeri je varijablom `HF_HOME`, npr. `D:\laya\hf`). Ispiši što je preuzeto:

```powershell
$env:HF_HOME = "D:\laya\hf"
python -c "import laya; laya.load('convaiinnovations/laya', subfolder='multilingual')"
Get-ChildItem -Recurse "$env:HF_HOME\hub\models--convaiinnovations--laya\snapshots" | Select-Object FullName, Length
```

Ime mape pod `snapshots` je commit modela (`--model-revision`). U podmapi `multilingual` odaberi
datoteku težina (najveća datoteka, obično `.safetensors`) i datoteku tokenizera (obično
`tokenizer.json`). Točna imena provjeri u ispisu, jer ih ovdje nismo mogli vidjeti.

Pokretanje runtimea (sluša samo na 127.0.0.1):

```powershell
python scripts\laya\runtime\lekta_laya_runtime.py `
  --model-revision <ime mape pod snapshots> `
  --weights-file <puna putanja datoteke tezina> `
  --tokenizer-file <puna putanja tokenizera> `
  --calibration-revision cal-2026-10-1 --precision fp32 --port 8765
```

Runtime pri pokretanju ispiše svoj manifest s hashovima. Taj ispis ide u registar (korak 3). Hash
možeš i neovisno provjeriti:

```powershell
(Get-FileHash -Algorithm SHA256 <putanja>).Hash.ToLower()
```

Preciznost u manifestu mora odgovarati stvarnom izvršavanju. Upstream na CUDA karticama s
compute capability 8+ koristi bf16; na CPU-u je fp32.

## 3. Unos modela u registar

U `scripts/laya/registry.json` dodaj unos bez praga i commitaj ga kroz PR:

```json
{ "key": "laya-multilingual-fp32-2026-10",
  "manifest": { "backend": "laya-python", "modelId": "<id>", "modelRevision": "<revizija>",
                "weightsSha256": "<mala slova>", "tokenizerSha256": "<mala slova>",
                "calibrationRevision": "cal-2026-10-1", "runtimeVersion": "<verzija>", "precision": "fp32" },
  "policy": null, "calibrationEvidence": null }
```

Težine nikad ne idu u Git, samo njihovi hashovi.

## 4. Evaluacija

Zlatni skup se priprema i označava prema `ZLATNI_SKUP.md`, a evaluira prema `EVALUATION_PROTOCOL.md`. Zlatni skup i izvještaji idu u `.artifacts/laya/`, koji je
gitignored. Objavljuje se samo izvještaj s brojevima.

```powershell
npm run laya:eval -- --gold .artifacts\laya\cal.json --endpoint http://127.0.0.1:8765 --model-key <kljuc> --calibrate --min-accuracy 0.9 --out .artifacts\laya\cal-izvjestaj.json
```

## Resursi

Prije preuzimanja modela provjeri slobodan disk na ciljnom disku (težine plus predmemorija
upstreama). RAM i trajanje inferencije mjeri eval (`latencyMs`). Stvarne brojke za ovaj stroj
upisuju se ovdje nakon prvog prolaza, ne unaprijed.
